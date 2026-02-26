// Public read endpoints for your local Kinguin cache. These routes
// return products from your MongoDB using your override logic and
// exclude delisted or out-of-stock products by default.

const router = require('express').Router();
const { KinguinProduct } = require("../post-models");
const { Op, Sequelize } = require("sequelize");

const PRICE_MIN_NUMERIC_SQL = `NULLIF("derived"->>'priceMin', '')::double precision`;
const NOT_HIDDEN_SQL = `"flags"->>'hidden' IS DISTINCT FROM 'true'`;
const IN_STOCK_SQL = `"derived"->'inStock' = 'true'::jsonb`;

function toJsonbArrayLiteral(values) {
  return `'${JSON.stringify(values).replace(/'/g, "''")}'::jsonb`;
}

function toTextArrayLiteral(values) {
  const escaped = values.map((v) => `'${String(v).replace(/'/g, "''")}'`);
  return `ARRAY[${escaped.join(", ")}]::text[]`;
}

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

  const dir = String(sortType).toLowerCase() === "desc" ? "DESC" : "ASC";
  const sortByKey = String(sortBy);
  let sort;
  if (sortByKey === "priceMin") {
    sort = [[Sequelize.literal(PRICE_MIN_NUMERIC_SQL), dir]];
  } else if (sortByKey === "name") {
    sort = [
      [Sequelize.literal(`"overrides"->>'name'`), dir],
      [Sequelize.literal(`"remote"->>'name'`), dir],
    ];
  } else {
    sort = [[sortByKey, dir]];
  }
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