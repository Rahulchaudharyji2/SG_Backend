const crypto = require('crypto');
const Razorpay = require('razorpay');
const axios = require('axios');

const Product = require('../models/Product');
const Order = require('../models/Order');
const {sendEmail} = require('../services/notificationServices');

const { sendOrderConfirmation } = require('../services/notificationServices');

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  GOOGLE_MAPS_API_KEY,
  RAZORPAY_WEBHOOK_SECRET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
} = process.env;

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Helper: compute order items and amount (server-side)
async function computeItemsAndAmount(items) {
  // items: [{ productId, quantity }]
  const ids = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  let total = 0;
  const enriched = items.map((it) => {
    const p = byId.get(String(it.productId));
    if (!p) throw new Error(`Product not found: ${it.productId}`);
    const qty = Number(it.quantity) || 1;
    total += p.price * qty;
    return {
      product: p._id,
      title: p.title,
      quantity: qty,
      price: p.price,
    };
  });
  return { items: enriched, amount: total };
}

// Optional address validation using Google Geocoding
async function geocodeAddress(rawAddress) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const encoded = encodeURIComponent(rawAddress);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_MAPS_API_KEY}`;
  const resp = await axios.get(url);
  if (resp.data.status !== 'OK' || !resp.data.results || resp.data.results.length === 0) {
    return null;
  }
  const r = resp.data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
  };
}

// POST /orders/buy-now
exports.buyNow = async (req, res) => {
  try {
    const { items: rawItems, delivery, paymentMethod, verifyAddress = false, verifyPhone = false } = req.body;

    if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ message: 'Items required' });
    }
    if (!delivery || !delivery.name || !delivery.phone || !delivery.addressLine1 || !delivery.city || !delivery.pincode) {
      return res.status(400).json({ message: 'Delivery information incomplete' });
    }
    if (!['razorpay', 'cod'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    // compute items and total on server
    const { items, amount } = await computeItemsAndAmount(rawItems);

    // Optional address verification
    if (verifyAddress) {
      const rawAddress = `${delivery.addressLine1} ${delivery.addressLine2 || ''} ${delivery.city} ${delivery.state || ''} ${delivery.pincode} ${delivery.country || ''}`;
      const geo = await geocodeAddress(rawAddress);
      if (!geo) {
        return res.status(400).json({ message: 'Unable to verify address. Please check address details.' });
      }
      delivery.geo = geo;
    }

    const order = await Order.create({
      user: req.user ? req.user._id : undefined,
      items,
      amount,
      paymentMethod,
      delivery,
      contactVerified: !verifyPhone, // if verifyPhone true mark false until OTP is verified
      status: paymentMethod === 'cod' ? 'created' : 'created',
    });

    // If payment is razorpay we need to create a Razorpay order and return its details for client checkout
    if (paymentMethod === 'razorpay') {
      // Razorpay amount is paise
      const rOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `order_rcpt_${order._id}`,
        payment_capture: 1, // auto capture
      });
      order.razorpayOrderId = rOrder.id;
      await order.save();

      return res.status(201).json({
        orderId: order._id,
        amount: order.amount,
        razorpay: {
          key: RAZORPAY_KEY_ID,
          orderId: rOrder.id,
          amount: rOrder.amount,
          currency: rOrder.currency,
        },
      });
    }

    // If COD: we can mark as pending/confirmed and send confirmation immediately (if phone not required to be verified)
    if (paymentMethod === 'cod') {
      // If verifyPhone requested, client should call sendOtp -> verifyOtp before we confirm
      if (!verifyPhone) {
        order.status = 'confirmed';
        await order.save();
        // send confirmation via WhatsApp/email
        try {
          await sendOrderConfirmation({ toPhone: delivery.phone, toEmail: delivery.email, order });
        } catch (err) {
          console.error('Notification error for COD order', err.message);
        }
      } else {
        // keep order.status created and wait for OTP verification to confirm
        await order.save();
      }

      return res.status(201).json({ orderId: order._id, amount: order.amount, message: verifyPhone ? 'OTP verification required' : 'Order placed (COD)' });
    }

    // fallback
    res.status(201).json({ order });
  } catch (err) {
    console.error('buyNow error', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /orders/send-otp
// exports.sendOtp = async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     if (!orderId) return res.status(400).json({ message: 'orderId required' });

//     const order = await Order.findById(orderId);
//     if (!order) return res.status(404).json({ message: 'Order not found' });

//     const otp = ('' + Math.floor(100000 + Math.random() * 900000));
//     order.otp = otp;
//     order.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
//     await order.save();

//     // send OTP via SMS/WhatsApp using Twilio if configured
//     if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
//       const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
//       const to = order.delivery.phone;
//       // Send SMS
//       try {
//         await twilioClient.messages.create({
//           body: `Your verification code is ${otp}. It expires in 5 minutes.`,
//           from: process.env.TWILIO_SMS_FROM || process.env.TWILIO_WHATSAPP_FROM,
//           to,
//         });
//       } catch (err) {
//         console.error('Twilio send failed', err.message);
//       }
//     } else {
//       // Otherwise, in dev, return OTP in response (not for prod)
//       console.log('OTP (dev):', otp);
//     }

//     res.json({ message: 'OTP sent' });
//   } catch (err) {
//     console.error('sendOtp error', err);
//     res.status(500).json({ message: err.message });
//   }
// };

// exports.sendOtp = async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     if (!orderId) return res.status(400).json({ message: 'orderId required' });

//     const order = await Order.findById(orderId);
//     if (!order) return res.status(404).json({ message: 'Order not found' });

//     // generate 6-digit OTP as string
//     const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
//     order.otp = otp;
//     order.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
//     await order.save();

//     const recipientEmail = order.delivery?.email;

//     // If email available and transporter configured, send OTP by email
//     if (recipientEmail) {
//       try {
//         const subject = `Your verification code for order ${order._id}`;
//         const html = `
//           <p>Hi ${order.delivery?.name || ''},</p>
//           <p>Your verification code for order <strong>${order._id}</strong> is:</p>
//           <h2 style="letter-spacing:4px">${otp}</h2>
//           <p>This code will expire in 5 minutes.</p>
//         `;
//         await sendEmail(recipientEmail, subject, html);
//         return res.json({ ok: true, message: 'OTP sent to email' });
//       } catch (emailErr) {
//         console.error('sendOtp: email send failed', emailErr && emailErr.message ? emailErr.message : emailErr);
//         // fallthrough to dev fallback if allowed
//       }
//     }

//     // If email not configured OR send failed and we are in development -> print OTP to console (dev only)
//     if (process.env.NODE_ENV !== 'production') {
//       console.log('OTP (dev):', otp);
//       return res.json({ ok: true, message: 'OTP sent (dev fallback)' });
//     }

//     // otherwise return error if we could not deliver OTP
//     return res.status(500).json({ message: 'Failed to deliver OTP. Configure EMAIL_SMTP_* env vars.' });
//   } catch (err) {
//     console.error('sendOtp error', err);
//     return res.status(500).json({ message: err.message || 'Server error' });
//   }
// };


exports.sendOtp = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId required' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    order.otp = otp;
    order.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await order.save();

    const recipientEmail = order.delivery?.email;

    if (recipientEmail) {
      try {
        const subject = `Your verification code for order ${order._id}`;
        const html = `
          <p>Hi ${order.delivery?.name || ''},</p>
          <p>Your verification code for order <strong>${order._id}</strong> is:</p>
          <h2 style="letter-spacing:5px">${otp}</h2>
          <p>This code will expire in 5 minutes.</p>
        `;
        await sendEmail(recipientEmail, subject, html);
        return res.json({ ok: true, message: 'OTP sent to email' });
      } catch (emailErr) {
        console.error('sendOtp: email send failed', emailErr && emailErr.message ? emailErr.message : emailErr);
        // fall through to dev fallback below
      }
    }

    // Dev fallback: console log only when not production
    if (process.env.NODE_ENV !== 'production') {
      console.log('OTP (dev):', otp);
      return res.json({ ok: true, message: 'OTP sent (dev fallback)' });
    }

    return res.status(500).json({ message: 'Failed to deliver OTP. Configure EMAIL_SMTP_* env vars.' });
  } catch (err) {
    console.error('sendOtp error', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};
// POST /orders/verify-otp
exports.verifyOtp = async (req, res) => {
  try {
    const { orderId, otp } = req.body;
    if (!orderId || !otp) return res.status(400).json({ message: 'orderId and otp required' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!order.otp || !order.otpExpiresAt || order.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired or not sent' });
    }

    if (String(order.otp) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // mark verified and clear otp
    order.contactVerified = true;
    order.otp = undefined;
    order.otpExpiresAt = undefined;

    // decide order confirmation logic:
    if (order.paymentMethod === 'cod') {
      order.status = 'confirmed';
    } else if (order.paymentMethod === 'upi' || order.paymentMethod === 'razorpay') {
      if (order.paymentStatus === 'paid') order.status = 'confirmed';
    }

    await order.save();

    // Attempt to send confirmation email — log any error
    try {
      if (order.delivery?.email) {
        await sendOrderConfirmation({ toEmail: order.delivery.email, order });
        console.log(`Order confirmation email sent for order ${order._id} to ${order.delivery.email}`);
      } else {
        console.log(`No delivery email for order ${order._id}; skipping confirmation email`);
      }
    } catch (emailErr) {
      console.error('sendOrderConfirmation failed for order', order._id, emailErr && emailErr.stack ? emailErr.stack : emailErr);
    }

    // Return the confirmed order object so frontend has amount/details
    // If your Order.items store product references and you want populated products, uncomment populate line below.
    // const fullOrder = await Order.findById(order._id).populate('items.productId').lean();
    const fullOrder = await Order.findById(order._id).lean();

    return res.json({
      ok: true,
      message: 'Phone verified and order confirmed',
      orderId: order._id,
      order: fullOrder,
    });
  } catch (err) {
    console.error('verifyOtp error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

// Razorpay webhook - validate signature and mark order paid
exports.razorpayWebhook = async (req, res) => {
  try {
    // IMPORTANT: This route MUST receive raw body (not JSON-parsed), see integration notes
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'];
    if (!RAZORPAY_WEBHOOK_SECRET || !signature) {
      return res.status(400).send('Missing signature or webhook secret');
    }
    const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    if (expected !== signature) {
      console.warn('Invalid razorpay signature', expected, signature);
      return res.status(400).send('invalid signature');
    }

    const payload = req.body;
    // Typical event: payment.captured
    const event = payload.event;
    if (event === 'payment.captured' || event === 'payment.authorized') {
      const payment = payload.payload.payment.entity;
      // payment.order_id contains razorpay order id created earlier
      const rOrderId = payment.order_id;
      const rPaymentId = payment.id;

      const order = await Order.findOne({ razorpayOrderId: rOrderId });
      if (!order) {
        console.warn('Order not found for razorpayOrderId', rOrderId);
        return res.status(200).json({ ok: true });
      }

      order.paymentStatus = 'paid';
      order.razorpayPaymentId = rPaymentId;
      order.razorpaySignature = signature;
      order.status = 'confirmed';
      await order.save();

      // Send order confirmation notifications
      try {
        await sendOrderConfirmation({ toPhone: order.delivery.phone, toEmail: order.delivery.email, order });
      } catch (err) {
        console.error('Error sending confirmation after payment', err.message);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('razorpayWebhook error', err);
    res.status(500).json({ message: err.message });
  }
};
exports.confirmPayment = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification fields' });
    }

    // verify signature: expected = hmac_sha256(order_id + '|' + payment_id, RAZORPAY_KEY_SECRET)
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expected = hmac.digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    // find order by razorpayOrderId or by our orderId
    const order = await Order.findOne({ _id: orderId, razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.status = 'confirmed';
    await order.save();

    // (optional) send confirmation notifications here
    // const { sendOrderConfirmation } = require('../services/notificationService');
    // await sendOrderConfirmation({ toPhone: order.delivery.phone, toEmail: order.delivery.email, order });

    res.json({ ok: true, message: 'Payment verified and order confirmed', orderId: order._id });
  } catch (err) {
    console.error('confirmPayment error', err);
    res.status(500).json({ message: err.message });
  }
};



exports.confirmPayment = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification fields' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('RAZORPAY_KEY_SECRET not set');
      return res.status(500).json({ message: 'Server misconfiguration' });
    }

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expected = hmac.digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const order = await Order.findOne({ _id: orderId, razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.status = 'confirmed';
    await order.save();

    // Optionally send confirmation email here

    return res.json({ ok: true, message: 'Payment verified and order confirmed', orderId: order._id });
  } catch (err) {
    console.error('confirmPayment error', err);
    return res.status(500).json({ message: err.message });
  }
};

// Add this export to controllers/orderController.js
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'order id required' });
    // populate if needed: .populate('items.productId')
    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json({ ok: true, order });
  } catch (err) {
    console.error('getOrderById error', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};