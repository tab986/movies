const axios = require("axios");
const appError = require("../utils/appError");
const catchAsyncErrors = require("../utils/catchAsyncErrors");

const KINGUIN_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_KEY = process.env.KINGUIN_API_KEY;

const ALLOWED_QUERY = new Set([
  "page",
  "limit",
  "name",
  "sortBy",
  "sortType", // asc | desc
  "priceFrom",
  "priceTo",
  "platform",
  "genre",
  "kinguinId", // comma separated IDs
  "productId", // comma separated IDs
  "languages",
  "isPreorder", // yes | no
  "activePreorder", // yes
  "regionId",
  "tags", // comma list
  "updatedSince", // date/time
  "updatedTo", // date/time
  "withText", // yes
  "merchantName",
]);

function buildQuery(reqQuery) {
  const out = {};
  for (const key of Object.keys(reqQuery)) {
    if (!ALLOWED_QUERY.has(key)) continue;
    const v = reqQuery[key];
    if (v === undefined || v === null || v === "") continue;

    // Light normalization
    if (key === "page" || key === "limit" || key === "regionId") {
      const num = Number(v);
      if (!Number.isNaN(num)) out[key] = num;
      continue;
    }
    if (key === "sortType") {
      const val = String(v).toLowerCase();
      if (val === "asc" || val === "desc") out[key] = val;
      continue;
    }
    if (key === "sortBy") {
      const val = String(v);
      // Per docs: kinguinId | updatedAt
      if (val === "kinguinId" || val === "updatedAt") out[key] = val;
      continue;
    }
    // dates and comma lists are passed as-is
    out[key] = String(v);
  }
  // Reasonable defaults
  if (!out.page) out.page = 1;
  if (!out.limit) out.limit = 25;
  return out;
}

exports.listProducts = catchAsyncErrors(async (req, res, next) => {
  if (!KINGUIN_KEY) return next(new appError("Kinguin API key missing", 500));

  const params = buildQuery(req.query);

  const url = `${KINGUIN_BASE}/v1/products`;
  const { data } = await axios.get(url, {
    headers: { "X-Api-Key": KINGUIN_KEY },
    params,
  });

  res.status(200).json({
    status: "success",
    meta: {
      page: Number(params.page),
      limit: Number(params.limit),
      item_count: data?.item_count ?? 0,
    },
    results: data?.results ?? [],
  });
});

exports.getProduct = catchAsyncErrors(async (req, res, next) => {
  if (!KINGUIN_KEY) return next(new appError("Kinguin API key missing", 500));
  const kinguinId = Number(req.params.kinguinId);
  if (!kinguinId) return next(new appError("kinguinId must be a number", 400));

  const url = `${KINGUIN_BASE}/v1/products/${kinguinId}`;
  const { data } = await axios.get(url, {
    headers: { "X-Api-Key": KINGUIN_KEY },
  });

  res.status(200).json({ status: "success", data });
});
