const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const body = req.body.Body?.trim();
  console.log('Mensagem recebida:', body);
  console.log('Variáveis:', {
    temAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    temSheetId: !!process.env.SPREADSHEET_ID,
    temGoogleCreds: !!process.env.GOOGLE_CREDENTIALS,
  });

  try {
    console.log('Chamando Claude...');
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
    console.log('Claude respondeu:', response.data.content[0].text);
  } catch (err) {
    console.error('ERRO CLAUDE:', err.response?.data || err.message);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>Diagnóstico enviado — veja os logs</Message></Response>`;
  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));