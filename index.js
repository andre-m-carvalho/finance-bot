require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

const logs = [];

app.get('/logs', (req, res) => {
  res.json(logs);
});

app.post('/webhook', async (req, res) => {
  const body = req.body.Body?.trim();
  logs.push('Mensagem: ' + body);
  logs.push('ANTHROPIC_API_KEY: ' + (process.env.ANTHROPIC_API_KEY || 'VAZIA'));
  logs.push('TESTE: ' + (process.env.TESTE || 'VAZIA'));

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>Diagnóstico 3</Message></Response>`;
  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));