const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', (req, res) => {
  const from = req.body.From;    // número de quem mandou
  const body = req.body.Body;    // texto da mensagem
  const media = req.body.MediaUrl0; // foto, se houver

  console.log(`Mensagem de ${from}: ${body}`);

  // Resposta de teste
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>✅ Recebi: "${body}" — em breve isso vai pro Sheets!</Message>
    </Response>`;

  res.type('text/xml').send(twiml);
});

app.listen(3000, () => console.log('Bot rodando na porta 3000'));