// Public read endpoints for your local Kinguin cache.
const router = require("express").Router();
const { KinguinProduct, Sequelize } = require("../post-models");
const { Op } = require("sequelize");
const { buildSearchDescriptor } = require("../utils/searchRanking");

const PRICE_MIN_NUMERIC_SQL = `NULLIF("derived"->>'priceMin', '')::double precision`;
const NOT_HIDDEN_SQL = `"flags"->>'hidden' IS DISTINCT FROM 'true'`;
const IN_STOCK_SQL = `"derived"->'inStock' = 'true'::jsonb`;
const SEARCH_NAME_SQL =
  `LOWER(COALESCE("overrides"->>'name', "remote"->>'name', "remote"->>'originalName', ''))`;

function toJsonbArrayLiteral(values) {
  return `'${JSON.stringify(values).replace(/'/g, "''")}'::jsonb`;
}

function toTextArrayLiteral(values) {
  const escaped = values.map((v) => `'${String(v).replace(/'/g, "''")}'`);
  return `ARRAY[${escaped.join(", ")}]::text[]`;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function addSearchPredicate(and, query) {
  const searchDescriptor = buildSearchDescriptor(query);
  if (!searchDescriptor || !searchDescriptor.tokens.length) return;

  for (const token of searchDescriptor.tokens) {
    and.push(
      Sequelize.where(Sequelize.literal(SEARCH_NAME_SQL), {
        [Op.like]: `%${String(token).toLowerCase()}%`,
      })
    );
  }
}

function buildCatalogWhere(qs) {
  const and = [
    Sequelize.literal(NOT_HIDDEN_SQL),
    Sequelize.literal(IN_STOCK_SQL),
  ];

  if (qs.regionId) {
    const region = Number(qs.regionId);
    if (Number.isFinite(region)) {
      and.push(Sequelize.where(Sequelize.json("remote.regionId"), region));
    }
  }

  const genres = parseCsv(qs.genres);
  if (genres.length === 1) {
    and.push(
      Sequelize.literal(
        `("remote"->'genres') @> ${toJsonbArrayLiteral([genres[0]])}`
      )
    );
  } else if (genres.length > 1) {
    and.push(
      Sequelize.literal(`("remote"->'genres') ?| ${toTextArrayLiteral(genres)}`)
    );
  }

  const tags = parseCsv(qs.tags);
  if (tags.length) {
    and.push(
      Sequelize.literal(`("remote"->'tags') @> ${toJsonbArrayLiteral(tags)}`)
    );
  }

  const range = {};
  if (qs.priceFrom !== undefined) {
    const from = Number(qs.priceFrom);
    if (Number.isFinite(from)) range[Op.gte] = from;
  }
  if (qs.priceTo !== undefined) {
    const to = Number(qs.priceTo);
    if (Number.isFinite(to)) range[Op.lte] = to;
  }
  if (Object.keys(range).length) {
    and.push(Sequelize.where(Sequelize.literal(PRICE_MIN_NUMERIC_SQL), range));
  }

  addSearchPredicate(and, qs.q);
  return { [Op.and]: and };
}

function buildCatalogOrder(sortBy, sortType) {
  const dir = String(sortType || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const sortKey = String(sortBy || "priceMin");

  if (sortKey === "name") {
    return [
      [Sequelize.literal(`"overrides"->>'name'`), dir],
      [Sequelize.literal(`"remote"->>'name'`), dir],
    ];
  }
  if (sortKey === "priceMin") {
    return [[Sequelize.literal(PRICE_MIN_NUMERIC_SQL), dir]];
  }
  if (sortKey === "releaseDate") {
    return [[Sequelize.literal(`"remote"->>'releaseDate'`), dir]];
  }
  if (sortKey === "metacriticScore") {
    return [
      [
        Sequelize.literal(`NULLIF("remote"->>'metacriticScore', '')::double precision`),
        dir,
      ],
    ];
  }
  if (sortKey === "updatedAt") {
    return [["updatedAt", dir]];
  }
  return [[Sequelize.literal(PRICE_MIN_NUMERIC_SQL), dir]];
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

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(200, Number(limit) || 24));
  const skip = (pageNum - 1) * limitNum;
  const where = buildCatalogWhere({
    q,
    regionId,
    genres,
    tags,
    priceFrom,
    priceTo,
  });
  const order = buildCatalogOrder(sortBy, sortType);

  const [items, count] = await Promise.all([
    KinguinProduct.findAll({
      where,
      order,
      offset: skip,
      limit: limitNum,
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
    meta: { page: pageNum, limit: limitNum, item_count: count },
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