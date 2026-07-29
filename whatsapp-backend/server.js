const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let qrCode = null;
let isConnected = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    printQRInTerminal: false,
    auth: state,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      console.log('🔐 QR Code gerado! Escaneie com seu WhatsApp.');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Conexão fechada:', lastDisconnect.error?.output?.statusCode);
      isConnected = false;
      
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp conectado com sucesso!');
      isConnected = true;
      qrCode = null;
      
      // Listar grupos quando conectar
      setTimeout(async () => {
        try {
          const groups = await sock.groupFetchAllParticipating();
          console.log('\n📋 SEUS GRUPOS DO WHATSAPP:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          Object.values(groups).forEach(group => {
            console.log(`📌 Nome: ${group.subject}`);
            console.log(`🆔 ID: ${group.id}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          });
        } catch (error) {
          console.error('Erro ao listar grupos:', error);
        }
      }, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Endpoint para obter QR Code
app.get('/qr', (req, res) => {
  if (qrCode) {
    res.json({ qr: qrCode, connected: false });
  } else if (isConnected) {
    res.json({ qr: null, connected: true });
  } else {
    res.json({ qr: null, connected: false, message: 'Aguardando QR Code...' });
  }
});

// Endpoint para enviar mensagem para GRUPO DA STAFF
app.post('/send-to-staff', async (req, res) => {
  const { groupId, message } = req.body;

  if (!isConnected || !sock) {
    return res.status(400).json({ error: 'WhatsApp não conectado' });
  }

  if (!groupId) {
    return res.status(400).json({ error: 'ID do grupo não fornecido' });
  }

  try {
    // Envia APENAS para o grupo da staff
    await sock.sendMessage(groupId, { text: message });
    console.log(`✅ Mensagem enviada para o grupo: ${groupId}`);
    res.json({ success: true, message: 'Mensagem enviada para o grupo da staff!' });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obter status
app.get('/status', (req, res) => {
  res.json({ connected: isConnected });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Backend WhatsApp rodando na porta ${PORT}`);
  console.log(`📱 Conecte seu WhatsApp escaneando o QR Code abaixo:\n`);
  connectToWhatsApp();
});