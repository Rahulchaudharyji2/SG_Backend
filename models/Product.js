const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  images: {
    type: [String],
    validate: {
      validator: function(arr) {
        // allow exactly 2 image URLs (you can relax this if you want)
        return Array.isArray(arr) && arr.length === 2;
      },
      message: 'Exactly two image URLs are required.'
    },
    required: true
  },
  price: { type: Number, required: true },
  category: { type: String, required: true, index: true },
  rating: { type: Number, default: 0, min: 0, max: 5 },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
