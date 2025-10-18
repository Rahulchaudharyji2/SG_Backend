const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true }, // price per unit at the time of order
});

const deliverySchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  addressLine1: { type: String, required: true },
  addressLine2: { type: String },
  city: { type: String, required: true },
  state: { type: String },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' },
  geo: {
    lat: Number,
    lng: Number,
    formattedAddress: String,
  },
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional for guest checkout
  items: [orderItemSchema],
  amount: { type: Number, required: true }, // total amount in INR (rupees)
  paymentMethod: { type: String, enum: ['razorpay', 'cod'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  status: { type: String, enum: ['created', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'created' },
  delivery: deliverySchema,
  contactVerified: { type: Boolean, default: false },
  otp: { type: String }, // store hashed otp or plain for short-lived use (recommend hashing in prod)
  otpExpiresAt: { type: Date },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);