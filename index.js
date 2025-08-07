const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const SHEET_ID = '1ewXpk13b-ZQw4EgtOZ82ik-ivwKbT18wFf68cwh685I';

app.use(bodyParser.json());

const userSessions = {};

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

// Main webhook for WhatsApp messages
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object) {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const sender = message?.from;
    const text = message?.text?.body?.trim();

    if (sender && text) {
      console.log(`📩 Message from ${sender}: ${text}`);
      await handleMessage(sender, text);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Handle message logic
async function handleMessage(sender, text) {
  const phone = sender;

  // STEP 0: Check if phone is known
  if (!userSessions[phone]) {
    const isRegistered = await checkIfClientExists(phone);

    if (isRegistered) {
      userSessions[phone] = { step: 'registered_menu' };
      return sendMessage(phone, "Welcome back to RK Globals! 📁\nWhat document would you like to receive?\n\nReply with:\n1. PAN\n2. Aadhar\n3. KYC Summary");
    } else {
      return sendMessage(phone, "❌ You are not registered with RK Globals.\nPlease create an account here: https://rkglobals.com");
    }
  }

  const session = userSessions[phone];

  // Handle document request for registered clients
  if (session.step === 'registered_menu') {
    const choice = text.trim().toLowerCase();
    let document = null;

    if (choice === '1' || choice.includes('pan')) document = 'pan';
    else if (choice === '2' || choice.includes('aadhar')) document = 'aadhar';
    else if (choice === '3' || choice.includes('kyc')) document = 'kyc_summary';

    if (document) {
      await notifyBackOffice(phone, document);
      delete userSessions[phone];
      return sendMessage(phone, `📤 Your request for *${document.toUpperCase()}* has been sent.\nYou’ll receive it shortly from our team.`);
    } else {
      return sendMessage(phone, "❓ Invalid choice. Please reply with:\n1. PAN\n2. Aadhar\n3. KYC Summary");
    }
  }
}

// Mock client database check — replace with DB/API call
async function checkIfClientExists(phone) {
  const registeredClients = {
    "919876543210": true,
    "918888888888": true,
  };

  return registeredClients[phone] || false;
}

// Notify back office to send document
async function notifyBackOffice(phone, document) {
  try {
    await axios.post('https://rkglobals.com/api/send-document', {
      phone,
      document,
    });
    console.log(`📨 Notified back office to send ${document} to ${phone}`);
  } catch (err) {
    console.error("❌ Failed to notify back office:", err.message);
  }
}

// Send WhatsApp message
function sendMessage(to, message) {
  return axios.post(
    'https://graph.facebook.com/v19.0/742259758960108/messages',
    {
      messaging_product: "whatsapp",
      to,
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  ).then(() => {
    console.log("📤 Message sent");
  }).catch(err => {
    console.error("❌ Error sending message:", err.response?.data || err.message);
  });
}

// Google Sheet KYC function (kept in case you need it later)
async function addToGoogleSheet(data) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:D',
    valueInputOption: 'RAW',
    requestBody: {
      values: [data], // [phone, PAN, Aadhar, DOB]
    },
  });

  console.log("✅ KYC data stored in Google Sheets");
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running at http://localhost:${PORT}`);
});
