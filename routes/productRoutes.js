const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const { auth, isAdmin } = require('../middleware/auth');

/**
 * Admin create product
 * POST /admin/products  (we'll mount admin product endpoints under /admin for clarity)
 * Body: { title, description, images: [url1,url2], price, category }
 */
router.post('/admin/products', auth, isAdmin, async (req, res) => {
  try {
    const { title, description, images, price, category } = req.body;
    if (!title || !description || !images || !price || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const product = await Product.create({ title, description, images, price, category });
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * Admin delete product
 * DELETE /admin/products/:id
 */
router.delete('/admin/products/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted', product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Public: GET products by category and/or name search
 * GET /products?category=electronics&q=phone
 * - category: exact match (case-insensitive)
 * - q: partial match on title (case-insensitive)
 */
router.get('/', async (req, res) => {
  try {
    const { category, q, limit = 50, skip = 0 } = req.query;
    const filter = {};

    if (category) {
      filter.category = { $regex: `^${escapeRegex(category) }$`, $options: 'i' }; // exact category, case-insensitive
    }

    if (q) {
      filter.title = { $regex: escapeRegex(q), $options: 'i' }; // partial match on title
    }

    const products = await Product.find(filter).limit(Number(limit)).skip(Number(skip)).exec();
    res.json({ count: products.length, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Optional: get product by id
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
