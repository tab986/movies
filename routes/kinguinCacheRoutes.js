// Public read endpoints for your local Kinguin cache. These routes
// return products from your MongoDB using your override logic and
// exclude delisted or out-of-stock products by default.

const router = require('express').Router();
const KinguinProduct = require('../models/KinguinProduct');
const {
  buildSearchDescriptor,
  buildSearchPipelines,
} = require("../utils/searchRanking");

// GET /api/v1/catalog?query params
// Supports pagination, text search, region, tags, price range, and sorting.
router.get('/', async (req, res) => {
  const {
    page = 1,
    limit = 24,
    q,
    regionId,
    genres,
    tags,
    priceFrom,
    priceTo,
    sortBy = 'priceMin',
    sortType = 'asc',
  } = req.query;

  const and = [
    Sequelize.literal(NOT_HIDDEN_SQL),
    Sequelize.literal(IN_STOCK_SQL),
  ];
  if (regionId) and.push(Sequelize.where(Sequelize.json("remote.regionId"), Number(regionId)));
  if (genres) {
    const arr = String(genres)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length === 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'genres') @> ${toJsonbArrayLiteral([arr[0]])}`
        )
      );
    } else if (arr.length > 1) {
      and.push(
        Sequelize.literal(`("remote"->'genres') ?| ${toTextArrayLiteral(arr)}`)
      );
    }
  }
  if (tags) {
    const arr = String(tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length) {
      and.push(
        Sequelize.literal(`("remote"->'tags') @> ${toJsonbArrayLiteral(arr)}`)
      );
    }
  }
  if (priceFrom || priceTo) {
    const range = {};
    if (priceFrom) range[Op.gte] = Number(priceFrom);
    if (priceTo) range[Op.lte] = Number(priceTo);
    and.push(
      Sequelize.where(
        Sequelize.literal(PRICE_MIN_NUMERIC_SQL),
        range
      )
    );
  }
  const sortDir = sortType === "desc" ? -1 : 1;
  const sortFieldMap = {
    priceMin: "derived.priceMin",
    updatedAt: "updatedAt",
    name: ["overrides.name", "remote.name"],
    releaseDate: "remote.releaseDate",
    metacriticScore: "remote.metacriticScore",
  };
  const mappedField = sortFieldMap[sortBy] || "derived.priceMin";
  const sort = Array.isArray(mappedField)
    ? { [mappedField[0]]: sortDir, [mappedField[1]]: sortDir }
    : { [mappedField]: sortDir };
  const skip = (Number(page) - 1) * Number(limit);

  const searchDescriptor = buildSearchDescriptor(q);
  let items;
  let count;

  if (searchDescriptor) {
    const { dataPipeline, countPipeline } = buildSearchPipelines({
      where,
      searchDescriptor,
      sort,
      skip,
      limit: Number(limit),
    });

    const [searchedItems, countRows] = await Promise.all([
      KinguinProduct.aggregate(dataPipeline),
      KinguinProduct.aggregate(countPipeline),
    ]);
    items = searchedItems;
    count = countRows?.[0]?.count || 0;
  } else {
    [items, count] = await Promise.all([
      KinguinProduct.find(where)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      KinguinProduct.countDocuments(where),
    ]);
  }
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