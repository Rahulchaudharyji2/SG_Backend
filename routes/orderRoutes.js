const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { auth } = require('../middleware/auth');

// Buy now (guest or logged in): validate, optionally verify address/OTP, create order and return Razorpay order info if online payment
router.post('/buy-now', orderController.buyNow);

// Endpoint for client to request OTP to verify phone (optional)
router.post('/send-otp', orderController.sendOtp);
router.post('/verify-otp', orderController.verifyOtp);

// Razorpay webhook (must use raw body middleware when mounting - see integration notes)
router.post('/razorpay/webhook', orderController.razorpayWebhook);
router.post('/confirm-payment', orderController.confirmPayment);
// Add (or ensure) this route in routes/orderRoutes.js
// at top: const orderController = require('../controllers/orderController');
router.get('/:id', orderController.getOrderById);

module.exports = router;