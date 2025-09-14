// controllers/localProductsController.js
const mongoose = require("mongoose");
const KinguinProduct = require("../models/KinguinProduct"); // local mirror schema
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");

/**
 * Build Mongo filters for listing visible, sellable products from local DB.
 * Baseline: flags.hidden != true AND derived.inStock == true
 * Supports: q (text), regionId, tags (comma list), priceFrom/priceTo,
 * sortBy (priceMin|updatedAt|name), sortType (asc|desc), page, limit
 */
function buildListQuery(qs) {
  const where = {
    "flags.hidden": { $ne: true },
    "derived.inStock": true,
  };

  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.max(1, Math.min(200, Number(qs.limit) || 24)); // UI page size

  if (qs.regionId) where["remote.regionId"] = Number(qs.regionId);

  if (qs.tags) {
    const list = String(qs.tags)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) where["remote.tags"] = { $all: list };
  }

  if (qs.priceFrom || qs.priceTo) {
    where["derived.priceMin"] = {};
    if (qs.priceFrom) where["derived.priceMin"].$gte = Number(qs.priceFrom);
    if (qs.priceTo) where["derived.priceMin"].$lte = Number(qs.priceTo);
  }

  if (qs.q) {
    const rx = new RegExp(String(qs.q), "i");
    where.$or = [{ "overrides.name": rx }, { "remote.name": rx }];
  }

  // Sorting
  const sortBy = ["priceMin", "updatedAt", "name"].includes(qs.sortBy)
    ? qs.sortBy
    : "priceMin";
  const sortType =
    String(qs.sortType || "asc").toLowerCase() === "desc" ? -1 : 1;

  const sort =
    sortBy === "name"
      ? { "overrides.name": sortType, "remote.name": sortType }
      : sortBy === "updatedAt"
      ? { updatedAt: sortType } // local doc timestamps
      : { "derived.priceMin": sortType }; // default

  return { where, page, limit, sort };
}

/**
 * GET /api/v1/products
 * Read from local cache ONLY (no Kinguin calls).
 */
exports.listProducts = catchAsyncErrors(async (req, res, next) => {
  const { where, page, limit, sort } = buildListQuery(req.query);
  const skip = (page - 1) * limit;

  const [items, count] = await Promise.all([
    KinguinProduct.find(where).sort(sort).skip(skip).limit(limit).lean(),
    KinguinProduct.countDocuments(),
  ]);

  const results = items.map((p) => ({
    kinguinId: p._id,
    name: p.overrides?.name || p.remote?.name,
    image: p.overrides?.images?.cover || p.remote?.images?.cover?.url,
    priceMin: p.derived?.priceMin,
    inStock: p.derived?.inStock,
    regionId: p.remote?.regionId,
    tags: p.remote?.tags,
  }));

  res.status(200).json({
    status: "success",
    meta: { page, limit, item_count: count },
    results,
  });
});

/**
 * GET /api/v1/products/:kinguinId
 * Return merged view from local DB.
 */
exports.getProduct = catchAsyncErrors(async (req, res, next) => {
  const id = Number(req.params.kinguinId);
  if (!id) return next(new appError("kinguinId must be a number", 400));

  const p = await KinguinProduct.findById(id).lean();
  if (!p || p.flags?.hidden === true)
    return res.status(404).json({ status: "not_found" });

  res.status(200).json({
    status: "success",
    data: {
      kinguinId: p._id,
      name: p.overrides?.name || p.remote?.name,
      description: p.overrides?.description || p.remote?.description,
      images: p.overrides?.images || p.remote?.images,
      priceMin: p.derived?.priceMin,
      inStock: p.derived?.inStock,
      regionId: p.remote?.regionId,
      tags: p.remote?.tags,
      remote: p.remote, // keep for admin/debug
    },
  });
});

/**
 * PATCH /api/v1/products/:kinguinId/overrides
 * Write ONLY to overrides.* (never touched by sync).
 */
exports.patchOverrides = catchAsyncErrors(async (req, res, next) => {
  const id = Number(req.params.kinguinId);
  if (!id) return next(new appError("kinguinId must be a number", 400));

  const allowed = {};
  if (req.body?.name !== undefined)
    allowed["overrides.name"] = String(req.body.name);
  if (req.body?.description !== undefined)
    allowed["overrides.description"] = String(req.body.description);
  if (req.body?.images !== undefined)
    allowed["overrides.images"] = req.body.images;

  if (!Object.keys(allowed).length)
    return next(new appError("No override fields provided", 400));

  const updated = await KinguinProduct.findOneAndUpdate(
    { _id: id },
    { $set: allowed },
    { new: true, upsert: true }
  ).lean();

  res.status(200).json({
    status: "success",
    data: {
      kinguinId: updated._id,
      name: updated.overrides?.name || updated.remote?.name,
      images: updated.overrides?.images || updated.remote?.images,
      description:
        updated.overrides?.description || updated.remote?.description,
    },
  });
});
