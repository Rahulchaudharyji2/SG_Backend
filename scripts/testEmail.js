// run this from project root: NODE_ENV=development node scripts/testEmail.js
require('dotenv').config();
const { verifyTransporter } = require('../services/notificationService');

async function run() {
  try {
    await verifyTransporter();
    console.log('SMTP verify OK — transporter configured correctly.');
  } catch (err) {
    console.error('SMTP verify failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();