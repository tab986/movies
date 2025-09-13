// Public read endpoints for your local Kinguin cache. These routes
// return products from your MongoDB using your override logic and
// exclude delisted or out-of-stock products by default.

const router = require('express').Router();
const KinguinProduct = require('../models/KinguinProduct');

// GET /api/v1/catalog?query params
// Supports pagination, text search, region, tags, price range, and sorting.
router.get('/', async (req, res) => {
  const {
    page = 1,
    limit = 24,
    q,
    regionId,
    tags,
    priceFrom,
    priceTo,
    sortBy = 'priceMin',
    sortType = 'asc',
  } = req.query;

  const where = {
    'flags.hidden': { $ne: true },
    'derived.inStock': true,
  };
  if (regionId) where['remote.regionId'] = Number(regionId);
  if (tags) {
    const arr = String(tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length) where['remote.tags'] = { $all: arr };
  }
  if (priceFrom || priceTo) {
    where['derived.priceMin'] = {};
    if (priceFrom) where['derived.priceMin'].$gte = Number(priceFrom);
    if (priceTo) where['derived.priceMin'].$lte = Number(priceTo);
  }
  if (q) {
    const regex = new RegExp(q, 'i');
    where.$or = [
      { 'overrides.name': regex },
      { 'remote.name': regex },
    ];
  }

  const sortDir = sortType === 'desc' ? -1 : 1;
  const sort = { [sortBy]: sortDir };
  const skip = (Number(page) - 1) * Number(limit);
  const [items, count] = await Promise.all([
    KinguinProduct.find(where)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    KinguinProduct.countDocuments(where),
  ]);
  const results = items.map((p) => ({
    kinguinId: p._id,
    name: p.overrides?.name || p.remote?.name,
    priceMin: p.derived?.priceMin,
    inStock: p.derived?.inStock,
    image: p.overrides?.images?.cover || p.remote?.images?.cover?.url,
    regionId: p.remote?.regionId,
    tags: p.remote?.tags,
  }));
  res.json({
    status: 'success',
    meta: { page: Number(page), limit: Number(limit), item_count: count },
    results,
  });
});

// GET /api/v1/catalog/:kinguinId – return a merged view for a single product
router.get('/:kinguinId', async (req, res) => {
  const id = Number(req.params.kinguinId);
  const p = await KinguinProduct.findById(id).lean();
  if (!p) return res.status(404).json({ status: 'not_found' });
  res.json({
    status: 'success',
    data: {
      kinguinId: p._id,
      name: p.overrides?.name || p.remote?.name,
      description: p.overrides?.description || p.remote?.description,
      images: p.overrides?.images || p.remote?.images,
      priceMin: p.derived?.priceMin,
      inStock: p.derived?.inStock,
      remote: p.remote,
    },
  });
});

module.exports = router;