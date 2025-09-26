// controllers/localProductsController.js
const mongoose = require("mongoose");
const KinguinProduct = require("../models/KinguinProduct"); // local mirror schema
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
// controllers/localProductsController.js (excerpt)

// --- same normalizer you used in the worker ---
function normStr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlatform(p) {
  const n = normStr(p);
  if (!n) return "";

  // synonyms + regex catch-alls
  if (/(pc.*steam|steam.*pc)/.test(n)) return "pc steam";
  if (/^(uplay|ubisoft|ubisoft connect)|pc.*(uplay|ubisoft)/.test(n))
    return "pc ubisoft connect";
  if (/(origin|ea app)/.test(n)) return "ea app";
  if (/(battle\.?net|battlenet|blizzard)/.test(n)) return "pc battle.net";
  if (/epic/.test(n)) return "pc epic games";
  if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
  if (/gog/.test(n)) return "pc gog";
  if (/mog station/.test(n)) return "pc mog station";
  if (n === "pc") return "pc";
  if (/^xbox series (x|s)|xbox series x\|s/.test(n)) return "xbox series x|s";
  if (/xbox one/.test(n)) return "xbox one";
  if (/xbox 360/.test(n)) return "xbox 360";
  return n;
}

function buildListQuery(qs) {
  const where = {
    "flags.hidden": { $ne: true },
    "derived.inStock": true,
  };

  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.max(1, Math.min(200, Number(qs.limit) || 24));

  // ✅ Platform: ONLY filter on canonical
  if (qs.platform) {
    const canon = normalizePlatform(qs.platform);
    if (canon) where["derived.platformCanonical"] = canon;
  }

  // Region / genres / tags / price
  if (qs.regionId) where["remote.regionId"] = Number(qs.regionId);

  if (qs.genres) {
    // support both "genres=Action" and "genres=Action,Adventure"
    const list = String(qs.genres)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      where["remote.genres"] = list[0];
    } else if (list.length > 1) {
      where["remote.genres"] = { $in: list };
    }
  }

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
  const dir = String(qs.sortType || "asc").toLowerCase() === "desc" ? -1 : 1;

  const sort =
    sortBy === "name"
      ? { "overrides.name": dir, "remote.name": dir }
      : sortBy === "updatedAt"
      ? { updatedAt: dir }
      : { "derived.priceMin": dir };

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
    platform: p.remote?.platform,
    qty: p.remote?.qty,
    updatedAt: p.remote?.updatedAt,
    activationDetails: p.remote?.activationDetails,
    videos: p.remote?.videos,
    languages: p.remote?.languages,
    systemRequirements: p.remote?.systemRequirements,
    originalName: p.remote?.originalName,
    metacriticScore: p.remote?.metacriticScore,
    genres: p.remote?.genres,
    description: p.overrides?.description || p.remote?.description,
    remote: p.remote, // keep for admin/debug
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
      // remote: p.remote, // keep for admin/debug
    },
  });
});

/**
 * PATCH /api/v1/products/:kinguinId/overrides
 * Write ONLY to overrides.* (never touched by sync)..
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
  if (req.body?.coverImage !== undefined)
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
