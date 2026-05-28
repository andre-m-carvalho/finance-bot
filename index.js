require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.urlencoded({ extended: false }));

const logs = [];

// Testa as variáveis na inicialização
const apiKey = process.env.ANTHROPIC_API_KEY;
console.log('API KEY existe?', !!apiKey);
console.log('API KEY primeiros chars:', apiKey ? apiKey.substring(0, 10) : 'VAZIA');

app.get('/logs', (req, res) => {
  res.json(logs);
});

app.post('/webhook', async (req, res) => {
  const body = req.body.Body?.trim();
  logs.push('Mensagem: ' + body);
  logs.push('API KEY: ' + (process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...' : 'VAZIA'));

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>Diagnóstico 2</Message></Response>`;
  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));