const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const app = express();
app.use(express.urlencoded({ extended: false }));

const USUARIOS = {
  [process.env.SEU_NUMERO]: 'André',
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
    range: `${aba}!A:F`
  });
  return res.data.values || [];
}

async function gravarNoSheets(aba, linha) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${aba}!A:F`,
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
      messages: [{
        role: 'user',
        content: `Você é um assistente de finanças pessoais. Interprete a mensagem abaixo e retorne APENAS um JSON.

Mensagem: "${mensagem}"
Enviada por: ${quem}

Regras:
- Se for um GASTO, retorne: {"tipo":"gasto","valor":0.00,"local":"nome do lugar","categoria":"Alimentação|Transporte|Moradia|Saúde|Lazer|Vestuário|Outros","observacao":""}
- Se for uma RENDA, retorne: {"tipo":"renda","valor":0.00,"fonte":"descrição","observacao":""}
- Se não entender, retorne: {"tipo":"duvida"}

Categorias: padaria/mercado/restaurante = Alimentação, uber/gasolina = Transporte, farmácia = Saúde, shopping/roupa = Vestuário.

Retorne APENAS o JSON, sem explicações.`
      }]
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

// ─── DASHBOARD ───────────────────────────────────────────────
app.get('/dashboard', async (req, res) => {
      const senha = req.query.senha;
  if (senha !== process.env.DASHBOARD_SENHA) {
    return res.status(401).send('Acesso negado.');
  }
  try {
    const gastos = await lerAba('Gastos');
    const contasFixas = await lerAba('Contas Fixas');

    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    // Filtra gastos do mês atual (coluna A = data no formato dd/mm/aaaa)
    const gastosMes = gastos.slice(1).filter(row => {
      if (!row[0]) return false;
      const partes = row[0].split('/');
      if (partes.length < 3) return false;
      const mes = parseInt(partes[1]) - 1;
      const ano = parseInt(partes[2]);
      return mes === mesAtual && ano === anoAtual;
    });

    // Total gasto no mês
    const totalMes = gastosMes.reduce((sum, row) => sum + (parseFloat(row[2]) || 0), 0);

    // Gastos por categoria
    const porCategoria = {};
    gastosMes.forEach(row => {
      const cat = row[4] || 'Outros';
      porCategoria[cat] = (porCategoria[cat] || 0) + (parseFloat(row[2]) || 0);
    });

    // Últimos 5 gastos
    const ultimos = gastosMes.slice(-5).reverse();

    // Contas fixas (ignora cabeçalho)
    const contas = contasFixas.slice(1).filter(r => r[0]);
    const pagas = contas.filter(r => (r[3] || '').toLowerCase() === 'pago').length;
    const pendentes = contas.length - pagas;

    const nomeMes = agora.toLocaleString('pt-BR', { month: 'long' });
    const categorias = Object.keys(porCategoria);
    const valores = Object.values(porCategoria);
    const cores = ['#f97316','#3b82f6','#22c55e','#a855f7','#ef4444','#eab308','#06b6d4'];

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Finanças Família</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; color: #18181b; min-height: 100vh; }
    .header { background: #18181b; color: white; padding: 20px 24px; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header p { font-size: 13px; color: #a1a1aa; margin-top: 2px; text-transform: capitalize; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
    .card { background: white; border-radius: 12px; padding: 16px; }
    .card.full { grid-column: 1 / -1; }
    .card label { font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .valor { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .card .valor.vermelho { color: #ef4444; }
    .card .valor.verde { color: #22c55e; }
    .contas-row { display: flex; justify-content: space-between; margin-top: 10px; gap: 8px; }
    .conta-badge { flex: 1; text-align: center; padding: 10px; border-radius: 8px; }
    .conta-badge.paga { background: #f0fdf4; color: #16a34a; }
    .conta-badge.pendente { background: #fef2f2; color: #dc2626; }
    .conta-badge span { display: block; font-size: 22px; font-weight: 700; }
    .conta-badge small { font-size: 11px; font-weight: 600; }
    .lista { margin-top: 12px; }
    .lista-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f4f4f5; }
    .lista-item:last-child { border-bottom: none; }
    .lista-item .info { display: flex; flex-direction: column; }
    .lista-item .local { font-size: 14px; font-weight: 500; }
    .lista-item .detalhe { font-size: 11px; color: #71717a; margin-top: 2px; }
    .lista-item .gasto-valor { font-size: 14px; font-weight: 600; color: #ef4444; }
    .chart-wrap { position: relative; height: 200px; margin-top: 12px; }
    .atualizado { text-align: center; font-size: 11px; color: #a1a1aa; padding: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💰 Finanças Família</h1>
    <p>${nomeMes} de ${anoAtual}</p>
  </div>

  <div class="grid">
    <div class="card full">
      <label>Total gasto no mês</label>
      <div class="valor vermelho">R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
    </div>

    <div class="card full">
      <label>Contas fixas</label>
      <div class="contas-row">
        <div class="conta-badge paga">
          <span>${pagas}</span>
          <small>✅ Pagas</small>
        </div>
        <div class="conta-badge pendente">
          <span>${pendentes}</span>
          <small>⚠️ Pendentes</small>
        </div>
      </div>
    </div>

    <div class="card full">
      <label>Gastos por categoria</label>
      <div class="chart-wrap">
        <canvas id="pizza"></canvas>
      </div>
    </div>

    <div class="card full">
      <label>Últimos gastos</label>
      <div class="lista">
        ${ultimos.length === 0 ? '<p style="color:#71717a;font-size:13px;margin-top:8px">Nenhum gasto registrado ainda</p>' :
          ultimos.map(r => `
          <div class="lista-item">
            <div class="info">
              <span class="local">${r[3] || '-'}</span>
              <span class="detalhe">${r[4] || ''} · ${r[1] || ''} · ${r[0] || ''}</span>
            </div>
            <span class="gasto-valor">R$ ${parseFloat(r[2] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>

  <p class="atualizado">Atualizado agora · <a href="/dashboard" style="color:#71717a">Recarregar</a></p>

  <script>
    const ctx = document.getElementById('pizza').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(categorias)},
        datasets: [{
          data: ${JSON.stringify(valores)},
          backgroundColor: ${JSON.stringify(cores.slice(0, categorias.length))},
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
        }
      }
    });
  </script>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error('Erro no dashboard:', err.message);
    res.status(500).send('Erro ao carregar dashboard. Verifique os logs.');
  }
});

// ─── WEBHOOK ─────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const quem = USUARIOS[from] || 'Desconhecido';
  const hoje = new Date().toLocaleDateString('pt-BR');

  let resposta = '';

  try {
    const resultado = await interpretarMensagem(body, quem);

    if (resultado.tipo === 'gasto') {
      await gravarNoSheets('Gastos', [hoje, quem, resultado.valor, resultado.local, resultado.categoria, resultado.observacao]);
      resposta = `✅ *Gasto registrado!*\n📍 ${resultado.local}\n💸 R$ ${resultado.valor.toFixed(2)}\n🏷️ ${resultado.categoria}`;
    } else if (resultado.tipo === 'renda') {
      await gravarNoSheets('Receitas', [hoje, quem, resultado.valor, resultado.fonte, resultado.observacao]);
      resposta = `✅ *Renda registrada!*\n💰 R$ ${resultado.valor.toFixed(2)}\n📌 ${resultado.fonte}`;
    } else {
      resposta = `🤔 Não entendi. Tenta assim:\n\n*Gasto:* "Padaria 28" ou "Mercado 150"\n*Renda:* "Recebi 3200" ou "Freela 800"\n*Dashboard:* https://finance-bot-powp.onrender.com/dashboard`;
    }
  } catch (err) {
    console.error('ERRO:', err.response?.data || err.message);
    resposta = '⚠️ Erro ao processar. Tenta de novo em instantes.';
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>${resposta}</Message></Response>`;
  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));