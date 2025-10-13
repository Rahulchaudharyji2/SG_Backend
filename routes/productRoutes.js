// const express = require('express');
// const router = express.Router();

// const Product = require('../models/Product');
// const { auth, isAdmin } = require('../middleware/auth');

// /**
//  * Admin create product
//  * POST /admin/products  (we'll mount admin product endpoints under /admin for clarity)
//  * Body: { title, description, images: [url1,url2], price, category }
//  */
// router.post('/admin/products', auth, isAdmin, async (req, res) => {
//   try {
//     const { title, description, images, price, category,rating } = req.body;
//     if (!title || !description || !images || !price || !category || !rating) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }
//     const product = await Product.create({ title, description, images, price, category,rating });
//     res.status(201).json(product);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });

// /**
//  * Admin delete product
//  * DELETE /admin/products/:id
//  */
// router.delete('/admin/products/:id', auth, isAdmin, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await Product.findByIdAndDelete(id);
//     if (!product) return res.status(404).json({ message: 'Product not found' });
//     res.json({ message: 'Product deleted', product });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// /**
//  * Public: GET products by category and/or name search
//  * GET /products?category=electronics&q=phone
//  * - category: exact match (case-insensitive)
//  * - q: partial match on title (case-insensitive)
//  */
// router.get('/', async (req, res) => {
//   try {
//     const { category, q, limit = 50, skip = 0 } = req.query;
//     const filter = {};

//     if (category) {
//       filter.category = { $regex: `^${escapeRegex(category) }$`, $options: 'i' }; // exact category, case-insensitive
//     }

//     if (q) {
//       filter.title = { $regex: escapeRegex(q), $options: 'i' }; // partial match on title
//     }

//     const products = await Product.find(filter).limit(Number(limit)).skip(Number(skip)).exec();
//     res.json({ count: products.length, products });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// /**
//  * Optional: get product by id
//  */
// router.get('/:id', async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) return res.status(404).json({ message: 'Not found' });
//     res.json(product);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// function escapeRegex(text) {
//   return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }

// module.exports = router;
const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const { auth, isAdmin } = require('../middleware/auth');

/**
 * Admin create product
 * POST /admin/products (mounted at /products, so full path is /products/admin/products)
 * Body: { title, description, images: [url1,url2], price, category, rating }
 */
router.post('/admin/products', auth, isAdmin, async (req, res) => {
  try {
    const { title, description, images, price, category, rating } = req.body;
    if (!title || !description || !images || !price || !category || rating === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const product = await Product.create({ title, description, images, price, category, rating });
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
 * Public: GET products (supports category and/or name search)
 * GET /products?category=electronics&q=phone&limit=50&skip=0&sort=-createdAt
 * - category: exact match (case-insensitive)
 * - q: partial match on title (case-insensitive)
 * - sort: any mongoose sort string (e.g., "-createdAt", "price", "-price", "rating")
 */
router.get('/', async (req, res) => {
  try {
    const { category, q, limit = 50, skip = 0, sort = '-createdAt' } = req.query;
    const filter = {};

    if (category) {
      filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' }; // exact category, case-insensitive
    }

    if (q) {
      filter.title = { $regex: escapeRegex(q), $options: 'i' }; // partial match on title
    }

    const products = await Product.find(filter)
      .sort(sort)
      .limit(Number(limit))
      .skip(Number(skip))
      .lean()
      .exec();

    res.json({ count: products.length, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Public: GET products by category (dedicated endpoint)
 * GET /products/category/:category?q=phone&limit=50&skip=0&sort=-createdAt
 * - category in path is matched exactly (case-insensitive)
 * - q optional partial title match
 */
router.get('/category/:category', async (req, res) => {
  try {
    const raw = req.params.category || '';
    const { q, limit = 50, skip = 0, sort = '-createdAt' } = req.query;

    const filter = {
      category: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' },
    };

    if (q) {
      filter.title = { $regex: escapeRegex(q), $options: 'i' };
    }

    const products = await Product.find(filter)
      .sort(sort)
      .limit(Number(limit))
      .skip(Number(skip))
      .lean()
      .exec();

    res.json({ count: products.length, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Public: GET distinct categories (optionally with counts)
 * - GET /products/categories           => { categories: ["Necklace","Rings", ...] }
 * - GET /products/categories?withCounts=true
 *      => { categories: [{ name, key, count }, ...] }
 *      Groups case-insensitively and returns a stable display name.
 */
router.get('/categories', async (req, res) => {
  try {
    const withCounts = String(req.query.withCounts || '').toLowerCase() === 'true';

    if (withCounts) {
      const categories = await Product.aggregate([
        { $sort: { category: 1 } }, // stabilize $first selection
        {
          $group: {
            _id: { $toLower: '$category' },
            name: { $first: '$category' },
            count: { $sum: 1 },
          },
        },
        { $sort: { name: 1 } },
      ]);

      return res.json({
        categories: categories.map((c) => ({
          name: c.name,
          key: c._id, // lowercased key
          count: c.count,
        })),
      });
    }

    const categories = await Product.distinct('category');
    categories.sort((a, b) => String(a).localeCompare(String(b)));
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Public: get product by id
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean().exec();
    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;