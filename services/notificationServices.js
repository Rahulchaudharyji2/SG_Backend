// // const axios = require('axios');
// // const nodemailer = require('nodemailer');
// // const twilio = require('twilio');

// // const {
// //   TWILIO_ACCOUNT_SID,
// //   TWILIO_AUTH_TOKEN,
// //   TWILIO_WHATSAPP_FROM,
// //   WHATSAPP_PHONE_NUMBER_ID,
// //   WHATSAPP_CLOUD_TOKEN,
// //   EMAIL_SMTP_HOST,
// //   EMAIL_SMTP_PORT,
// //   EMAIL_USER,
// //   EMAIL_PASS,
// // } = process.env;

// // // Twilio client (optional)
// // let twilioClient = null;
// // if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
// //   twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
// // }

// // // send WhatsApp via Twilio (sandbox or production)
// // async function sendWhatsAppTwilio(toPhone, message) {
// //   if (!twilioClient || !TWILIO_WHATSAPP_FROM) {
// //     throw new Error('Twilio WhatsApp not configured');
// //   }
// //   // toPhone should be in form "+91XXXXXXXXXX"
// //   return twilioClient.messages.create({
// //     body: message,
// //     from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
// //     to: `whatsapp:${toPhone}`,
// //   });
// // }

// // // send WhatsApp via Meta Cloud API (requires template or business approval)
// // async function sendWhatsAppMeta(toPhone, message) {
// //   if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_CLOUD_TOKEN) {
// //     throw new Error('WhatsApp Cloud API not configured');
// //   }
// //   const url = `https://graph.facebook.com/v16.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
// //   // This example sends a simple text message (may require business templates for some recipients)
// //   return axios.post(url, {
// //     messaging_product: 'whatsapp',
// //     to: toPhone.replace(/^\+/, ''), // Meta expects number without plus
// //     type: 'text',
// //     text: { body: message },
// //   }, {
// //     headers: {
// //       Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}`,
// //       'Content-Type': 'application/json',
// //     },
// //   });
// // }

// // // Email via nodemailer
// // let transporter = null;
// // if (EMAIL_SMTP_HOST && EMAIL_USER && EMAIL_PASS) {
// //   transporter = nodemailer.createTransport({
// //     host: EMAIL_SMTP_HOST,
// //     port: EMAIL_SMTP_PORT ? Number(EMAIL_SMTP_PORT) : 587,
// //     secure: false,
// //     auth: {
// //       user: EMAIL_USER,
// //       pass: EMAIL_PASS,
// //     },
// //   });
// // }

// // async function sendEmail(to, subject, html) {
// //   if (!transporter) throw new Error('Email transporter not configured');
// //   return transporter.sendMail({
// //     from: EMAIL_USER,
// //     to,
// //     subject,
// //     html,
// //   });
// // }

// // // unified send confirmation (tries WhatsApp Twilio, then Meta, then email)
// // async function sendOrderConfirmation({ toPhone, toEmail, order }) {
// //   const message = `Thank you! Your order (${order._id}) has been received.\nTotal: ₹${order.amount}\nDelivery to: ${order.delivery.name}, ${order.delivery.addressLine1}, ${order.delivery.city}\nWe will contact you soon with tracking details.`;
// //   const results = { whatsapp: null, email: null };

// //   // Try Twilio WhatsApp first
// //   if (toPhone && twilioClient && TWILIO_WHATSAPP_FROM) {
// //     try {
// //       results.whatsapp = await sendWhatsAppTwilio(toPhone, message);
// //     } catch (err) {
// //       console.error('Twilio WhatsApp failed', err.message);
// //     }
// //   }

// //   // If Meta is configured and whatsapp not sent, try Meta
// //   if (toPhone && !results.whatsapp && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_CLOUD_TOKEN) {
// //     try {
// //       results.whatsapp = await sendWhatsAppMeta(toPhone, message);
// //     } catch (err) {
// //       console.error('Meta WhatsApp failed', err.message);
// //     }
// //   }

// //   // Send email if email provided
// //   if (toEmail && transporter) {
// //     try {
// //       results.email = await sendEmail(toEmail, 'Order Confirmation', `<p>${message.replace(/\n/g, '<br/>')}</p>`);
// //     } catch (err) {
// //       console.error('Email send failed', err.message);
// //     }
// //   }

// //   return results;
// // }

// // module.exports = {
// //   sendOrderConfirmation,
// //   sendWhatsAppTwilio,
// //   sendWhatsAppMeta,
// //   sendEmail,
// // };

// // services/notificationService.js
// const nodemailer = require('nodemailer');

// const {
//   EMAIL_SMTP_HOST,
//   EMAIL_SMTP_PORT,
//   EMAIL_USER,
//   EMAIL_PASS,
//   EMAIL_FROM,
// } = process.env;

// let transporter = null;

// if (EMAIL_SMTP_HOST && EMAIL_USER && EMAIL_PASS) {
//   transporter = nodemailer.createTransport({
//     host: EMAIL_SMTP_HOST,
//     port: Number(EMAIL_SMTP_PORT) || 587,
//     secure: Number(EMAIL_SMTP_PORT) === 465, // true for 465, false for 587
//     auth: {
//       user: EMAIL_USER,
//       pass: EMAIL_PASS,
//     },
//   });
// }

// /**
//  * Send an email. Throws if transporter not configured or send fails.
//  * to: recipient email
//  * subject: string
//  * html: html body string
//  */
// async function sendEmail(to, subject, html) {
//   if (!transporter) {
//     throw new Error('Email transporter not configured. Set EMAIL_SMTP_HOST/EMAIL_USER/EMAIL_PASS');
//   }
//   const from = EMAIL_FROM || EMAIL_USER;
//   const info = await transporter.sendMail({
//     from,
//     to,
//     subject,
//     html,
//   });
//   return info;
// }

// module.exports = {
//   sendEmail,
//   transporter, // exported for possible verify() use
// };



const nodemailer = require('nodemailer');

const {
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PORT,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
} = process.env;

let transporter = null;

if (EMAIL_SMTP_HOST && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port: Number(EMAIL_SMTP_PORT) || 587,
    secure: Number(EMAIL_SMTP_PORT) === 465, // true for 465, false for 587
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

async function verifyTransporter() {
  if (!transporter) throw new Error('Email transporter not configured (missing env vars).');
  return transporter.verify();
}
async function sendOrderConfirmation({ toEmail, order }) {
  if (!toEmail) throw new Error('sendOrderConfirmation: toEmail required');

  const subject = `Order confirmed — ${order._id}`;
  const total = order.total || order.amount || order.items?.reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  const delivery = order.delivery || {};

  const html = `
    <p>Hi ${delivery.name || ''},</p>
    <p>Thank you! Your order (<strong>${order._id}</strong>) has been received and confirmed.</p>
    <p><strong>Total:</strong> ₹${Number(total).toFixed(2)}</p>
    <p><strong>Delivery to:</strong> ${delivery.name || ''}, ${delivery.addressLine1 || ''} ${delivery.city || ''}</p>
    <h4>Order details</h4>
    <ul>
      ${(order.items || []).map(it => `<li>${it.title || it.name || it.productId} — qty ${it.quantity} — ₹${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</li>`).join('')}
    </ul>
    <p>We will contact you with tracking details soon.</p>
  `;

  return sendEmail(toEmail, subject, html);
}


/**
 * sendEmail(to, subject, html)
 * throws on failure
 */
async function sendEmail(to, subject, html) {
  if (!transporter) {
    throw new Error('Email transporter not configured. Set EMAIL_SMTP_HOST/EMAIL_USER/EMAIL_PASS');
  }
  const from = EMAIL_FROM || EMAIL_USER;
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
  return info;
}

module.exports = {
  transporter,
  verifyTransporter,
  sendEmail,
    sendOrderConfirmation,
};