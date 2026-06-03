const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const montarPrompt = require('./prompt');
const app = express();
app.use(express.urlencoded({ extended: false }));

const USUARIOS = {
  [process.env.SEU_NUMERO]: 'Andre',
  [process.env.NUMERO_ESPOSA]: 'Mariana'
};

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function lerAba(aba) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: aba + '!A:F'
  });
  return res.data.values || [];
}

async function gravarNoSheets(aba, linha) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: aba + '!A:F',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [linha] }
  });
}

async function interpretarMensagem(mensagem, quem) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: montarPrompt(mensagem, quem) }]
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    }
  );
  const texto = response.data.content[0].text
    .trim()
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(texto);
}

app.get('/login', (req, res) => {
  const erro = req.query.erro;
  res.send('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Financas Familia</title><style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; } .card { background: white; border-radius: 16px; padding: 32px 24px; width: 100%; max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); } .icone { font-size: 36px; text-align: center; margin-bottom: 8px; } h1 { text-align: center; font-size: 20px; font-weight: 700; color: #18181b; } p { text-align: center; font-size: 13px; color: #71717a; margin-top: 4px; margin-bottom: 24px; } label { font-size: 12px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; display: block; } input { width: 100%; padding: 12px 14px; border: 1.5px solid #e4e4e7; border-radius: 8px; font-size: 16px; margin-top: 6px; margin-bottom: 16px; outline: none; } button { width: 100%; padding: 13px; background: #18181b; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; } .erro { background: #fef2f2; color: #dc2626; font-size: 13px; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; text-align: center; }</style></head><body><div class="card"><div class="icone">&#x1F4B0;</div><h1>Financas Familia</h1><p>Entre com a senha para acessar</p>' + (erro ? '<div class="erro">Senha incorreta. Tenta de novo.</div>' : '') + '<label>Senha</label><input type="password" id="senha" placeholder="********"/><button onclick="entrar()">Entrar</button></div><script>document.getElementById("senha").addEventListener("keypress",function(e){if(e.key==="Enter")entrar();});function entrar(){var s=document.getElementById("senha").value;window.location.href="/dashboard?token="+encodeURIComponent(s);}</script></body></html>');
});

app.get('/dashboard', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.DASHBOARD_SENHA) {
    return res.redirect('/login');
  }
  try {
    const gastos = await lerAba('Gastos');
    const contasFixas = await lerAba('Contas Fixas');
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    const gastosMes = gastos.slice(1).filter(function(row) {
      if (!row[0]) return false;
      var partes = row[0].split('/');
      if (partes.length < 3) return false;
      return parseInt(partes[1]) - 1 === mesAtual && parseInt(partes[2]) === anoAtual;
    });

    function toFloat(val) {
      return parseFloat((val || '0').toString().replace(',', '.')) || 0;
    }

    const totalMes = gastosMes.reduce(function(sum, row) {
      return sum + toFloat(row[2]);
    }, 0);

    const porCategoria = {};
    gastosMes.forEach(function(row) {
      var cat = row[4] || 'Outros';
      porCategoria[cat] = (porCategoria[cat] || 0) + toFloat(row[2]);
    });

    const ultimos = gastosMes.slice(-5).reverse();
    const contas = contasFixas.slice(1).filter(function(r) { return r[0]; });
    const pagas = contas.filter(function(r) { return (r[3] || '').toLowerCase() === 'pago'; }).length;
    const pendentes = contas.length - pagas;
    const nomeMes = agora.toLocaleString('pt-BR', { month: 'long' });
    const categorias = Object.keys(porCategoria);
    const valores = Object.values(porCategoria);
    const cores = ['#f97316','#3b82f6','#22c55e','#a855f7','#ef4444','#eab308','#06b6d4'];

    const ultimosHtml = ultimos.length === 0
      ? '<p style="color:#71717a;font-size:13px;margin-top:8px">Nenhum gasto registrado ainda</p>'
      : ultimos.map(function(r) {
          return '<div class="lista-item"><div class="info"><span class="local">' + (r[3] || '-') + '</span><span class="detalhe">' + (r[4] || '') + ' · ' + (r[1] || '') + ' · ' + (r[0] || '') + '</span></div><span class="gasto-valor">R$ ' + toFloat(r[2]).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span></div>';
        }).join('');

    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Financas Familia</title><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"><\/script><style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f4f5; color: #18181b; min-height: 100vh; } .header { background: #18181b; color: white; padding: 20px 24px; } .header h1 { font-size: 18px; font-weight: 600; } .header p { font-size: 13px; color: #a1a1aa; margin-top: 2px; text-transform: capitalize; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; } .card { background: white; border-radius: 12px; padding: 16px; } .card.full { grid-column: 1 / -1; } .card label { font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; display: block; } .valor { font-size: 28px; font-weight: 700; margin-top: 4px; } .vermelho { color: #ef4444; } .contas-row { display: flex; gap: 8px; margin-top: 10px; } .conta-badge { flex: 1; text-align: center; padding: 10px; border-radius: 8px; } .conta-badge.paga { background: #f0fdf4; color: #16a34a; } .conta-badge.pendente { background: #fef2f2; color: #dc2626; } .conta-badge span { display: block; font-size: 22px; font-weight: 700; } .conta-badge small { font-size: 11px; font-weight: 600; } .lista { margin-top: 12px; } .lista-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f4f4f5; } .lista-item:last-child { border-bottom: none; } .info { display: flex; flex-direction: column; } .local { font-size: 14px; font-weight: 500; } .detalhe { font-size: 11px; color: #71717a; margin-top: 2px; } .gasto-valor { font-size: 14px; font-weight: 600; color: #ef4444; } .chart-wrap { position: relative; height: 200px; margin-top: 12px; } .atualizado { text-align: center; font-size: 11px; color: #a1a1aa; padding: 12px; }</style></head><body>'
      + '<div class="header"><h1>&#x1F4B0; Financas Familia</h1><p>' + nomeMes + ' de ' + anoAtual + '</p></div>'
      + '<div class="grid">'
      + '<div class="card full"><label>Total gasto no mes</label><div class="valor vermelho">R$ ' + totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>'
      + '<div class="card full"><label>Contas fixas</label><div class="contas-row"><div class="conta-badge paga"><span>' + pagas + '</span><small>Pagas</small></div><div class="conta-badge pendente"><span>' + pendentes + '</span><small>Pendentes</small></div></div></div>'
      + '<div class="card full"><label>Gastos por categoria</label><div class="chart-wrap"><canvas id="pizza"></canvas></div></div>'
      + '<div class="card full"><label>Ultimos gastos</label><div class="lista">' + ultimosHtml + '</div></div>'
      + '</div>'
      + '<p class="atualizado">Atualizado agora · <a href="/dashboard?token=' + token + '" style="color:#71717a">Recarregar</a></p>'
      + '<script>var ctx=document.getElementById("pizza").getContext("2d");new Chart(ctx,{type:"doughnut",data:{labels:' + JSON.stringify(categorias) + ',datasets:[{data:' + JSON.stringify(valores) + ',backgroundColor:' + JSON.stringify(cores.slice(0, categorias.length)) + ',borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{font:{size:11},padding:12}}}}});<\/script>'
      + '</body></html>';

    res.send(html);
  } catch (err) {
    console.error('Erro no dashboard:', err.message);
    res.status(500).send('Erro ao carregar dashboard.');
  }
});

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body ? req.body.Body.trim() : '';
  const quem = USUARIOS[from] || 'Desconhecido';
  const hoje = new Date().toLocaleDateString('pt-BR');
  let resposta = '';

  try {
    const resultado = await interpretarMensagem(body, quem);
    if (resultado.tipo === 'gasto') {
      await gravarNoSheets('Gastos', [hoje, quem, resultado.valor, resultado.local, resultado.categoria, resultado.observacao]);
      resposta = 'Gasto registrado!\nLocal: ' + resultado.local + '\nValor: R$ ' + resultado.valor.toFixed(2) + '\nCategoria: ' + resultado.categoria;
    } else if (resultado.tipo === 'renda') {
      await gravarNoSheets('Receitas', [hoje, quem, resultado.valor, resultado.fonte, resultado.observacao]);
      resposta = 'Renda registrada!\nValor: R$ ' + resultado.valor.toFixed(2) + '\nFonte: ' + resultado.fonte;
    } else {
      resposta = 'Nao entendi. Tenta assim:\nGasto: "Padaria 28" ou "Mercado 150"\nRenda: "Recebi 3200" ou "Freela 800"';
    }
  } catch (err) {
    console.error('ERRO:', err.response ? err.response.data : err.message);
    resposta = 'Erro ao processar. Tenta de novo em instantes.';
  }

  const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + resposta + '</Message></Response>';
  res.type('text/xml').send(twiml);
});

app.listen(3000, function() { console.log('Bot rodando na porta 3000'); });