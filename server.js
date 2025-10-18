require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
 const orderRoutes = require('./routes/orderRoutes');

const app = express();

/**
 * CORS: allow localhost + deployed frontends
 * - FRONTEND_URLS: comma-separated exact origins
 *   e.g., FRONTEND_URLS=http://localhost:5173,https://your-frontend.vercel.app
 * - FRONTEND_ORIGIN_SUFFIXES: comma-separated suffixes allowed (optional)
 *   e.g., FRONTEND_ORIGIN_SUFFIXES=.vercel.app
 */
const exactOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Always include localhost dev origin
if (!exactOrigins.includes('http://localhost:5173')) {
  exactOrigins.push('http://localhost:5173');
}

const suffixOrigins = (process.env.FRONTEND_ORIGIN_SUFFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Allow non-browser or same-origin requests (no Origin header)
    if (!origin) return cb(null, true);

    const isExact = exactOrigins.includes(origin);
    const isSuffix =
      suffixOrigins.length > 0 && suffixOrigins.some((suf) => origin.endsWith(suf));

    if (isExact || isSuffix) return cb(null, true);
    return cb(new Error(`CORS: Origin ${origin} is not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error', err));

// Routes
app.post(
  '/orders/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // attach rawBody string (used by the controller to compute HMAC)
    req.rawBody = req.body.toString();
    try {
      // attempt to parse JSON so controller can read payload easily as req.body
      req.body = JSON.parse(req.rawBody);
    } catch (e) {
      req.body = {};
    }
    // call the controller handler (ensure controllers/orderController.js exports razorpayWebhook)
    require('./controllers/orderController').razorpayWebhook(req, res);
  }
);

app.use('/admin', adminRoutes);     // admin signup/login and admin product actions
app.use('/products', productRoutes); // public product get/search
app.use('/orders', orderRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    allowedExactOrigins: exactOrigins,
    allowedSuffixes: suffixOrigins,
  });
});

// Basic error handler (also surfaces CORS origin message nicely)
app.use((err, req, res, next) => {
  console.error(err);
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS:')) {
    return res.status(403).json({ message: err.message });
  }
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));