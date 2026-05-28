
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

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const quem = USUARIOS[from] || 'Desconhecido';
  const hoje = new Date().toLocaleDateString('pt-BR');

  let resposta = '';

  try {
    const resultado = await interpretarMensagem(body, quem);

    if (resultado.tipo === 'gasto') {
      await gravarNoSheets('Gastos', [
        hoje,
        quem,
        resultado.valor,
        resultado.local,
        resultado.categoria,
        resultado.observacao
      ]);
      resposta = `✅ *Gasto registrado!*\n📍 ${resultado.local}\n💸 R$ ${resultado.valor.toFixed(2)}\n🏷️ ${resultado.categoria}`;

    } else if (resultado.tipo === 'renda') {
      await gravarNoSheets('Receitas', [
        hoje,
        quem,
        resultado.valor,
        resultado.fonte,
        resultado.observacao
      ]);
      resposta = `✅ *Renda registrada!*\n💰 R$ ${resultado.valor.toFixed(2)}\n📌 ${resultado.fonte}`;

    } else {
      resposta = `🤔 Não entendi. Tenta assim:\n\n*Gasto:* "Padaria 28" ou "Mercado 150"\n*Renda:* "Recebi 3200" ou "Freela 800"`;
    }

  } catch (err) {
    console.error('ERRO:', err.response?.data || err.message);
    resposta = '⚠️ Erro ao processar. Tenta de novo em instantes.';
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${resposta}</Message>
    </Response>`;

  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));