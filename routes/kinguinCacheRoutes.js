// Public read endpoints for your local Kinguin cache. These routes
// return products from your MongoDB using your override logic and
// exclude delisted or out-of-stock products by default.

const router = require('express').Router();
const { KinguinProduct } = require("../post-models");
const { Op, Sequelize } = require("sequelize");

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

  const and = [
    Sequelize.where(Sequelize.json("flags.hidden"), { [Op.not]: true }),
    Sequelize.where(Sequelize.json("derived.inStock"), true),
  ];
  if (regionId) and.push(Sequelize.where(Sequelize.json("remote.regionId"), Number(regionId)));
  if (tags) {
    const arr = String(tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length) {
      and.push(Sequelize.where(Sequelize.json("remote.tags"), { [Op.contains]: arr }));
    }
  }
  if (priceFrom || priceTo) {
    const range = {};
    if (priceFrom) range[Op.gte] = Number(priceFrom);
    if (priceTo) range[Op.lte] = Number(priceTo);
    and.push(
      Sequelize.where(
        Sequelize.cast(Sequelize.json("derived.priceMin"), "double precision"),
        range
      )
    );
  }
  if (q) {
    const search = `%${String(q).trim()}%`;
    and.push({
      [Op.or]: [
        Sequelize.where(Sequelize.cast(Sequelize.json("overrides.name"), "text"), { [Op.iLike]: search }),
        Sequelize.where(Sequelize.cast(Sequelize.json("remote.name"), "text"), { [Op.iLike]: search }),
      ],
    });
  }
  const where = { [Op.and]: and };

  const sortDir = sortType === 'desc' ? -1 : 1;
  const sort = [[sortBy, sortDir === -1 ? "DESC" : "ASC"]];
  const skip = (Number(page) - 1) * Number(limit);
  const [items, count] = await Promise.all([
    KinguinProduct.findAll({
      where,
      order: sort,
      offset: skip,
      limit: Number(limit),
      raw: true,
    }),
    KinguinProduct.count({ where }),
  ]);
  const results = items.map((p) => ({
    kinguinId: p.id,
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
  const p = await KinguinProduct.findByPk(id, { raw: true });
  if (!p) return res.status(404).json({ status: 'not_found' });
  res.json({
    status: 'success',
    data: {
      kinguinId: p.id,
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