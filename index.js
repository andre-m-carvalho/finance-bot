require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.urlencoded({ extended: false }));

const logs = [];
console.log('ENV TEST:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('SHEET')));

app.get('/logs', (req, res) => {
  res.json(logs);
});

app.post('/webhook', async (req, res) => {
  const body = req.body.Body?.trim();
  logs.push('Mensagem recebida: ' + body);
  logs.push('temAnthropicKey: ' + !!process.env.ANTHROPIC_API_KEY);
  logs.push('temSheetId: ' + !!process.env.SPREADSHEET_ID);
  logs.push('temGoogleCreds: ' + !!process.env.GOOGLE_CREDENTIALS);

  try {
    logs.push('Chamando Claude...');
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'responda apenas: ok' }]
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );
    logs.push('Claude respondeu: ' + response.data.content[0].text);
  } catch (err) {
    logs.push('ERRO CLAUDE: ' + JSON.stringify(err.response?.data || err.message));
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>Diagnóstico enviado</Message></Response>`;
  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));