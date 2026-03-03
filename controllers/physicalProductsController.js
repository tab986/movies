// const catchAsyncErrors = require("../utils/catchAsyncErrors");
// const AppError = require("../utils/appError");
// const { convertFromIQD } = require("../utils/currency");

// function normStr(s) {
//   return String(s || "")
//     .toLowerCase()
//     .replace(/[_\-]+/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function normalizePlatform(p) {
//   const n = normStr(p);
//   if (!n) return "";
//   if (/(pc.*steam|steam.*pc)/.test(n)) return "pc steam";
//   if (/^(uplay|ubisoft|ubisoft connect)|pc.*(uplay|ubisoft)/.test(n))
//     return "pc ubisoft connect";
//   if (/(origin|ea app)/.test(n)) return "ea app";
//   if (/(battle\.?net|battlenet|blizzard)/.test(n)) return "pc battle.net";
//   if (/epic/.test(n)) return "pc epic games";
//   if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
//   if (/gog/.test(n)) return "pc gog";
//   if (/mog station/.test(n)) return "pc mog station";
//   if (n === "pc") return "pc";
//   if (/^xbox series (x|s)|xbox series x\|s/.test(n)) return "xbox series x|s";
//   if (/xbox one/.test(n)) return "xbox one";
//   if (/xbox 360/.test(n)) return "xbox 360";
//   return n;
// }

// function buildPhysicalListQuery(qs, sellerId) {
//   const where = {
//     "flags.hidden": { $ne: true },
//     "derived.inStock": true,
//   };
//   if (sellerId) {
//     where.seller = sellerId;
//   }

//   const page = Math.max(1, Number(qs.page) || 1);
//   const limit = Math.max(1, Math.min(200, Number(qs.limit) || 24));

//   // Platform filter uses canonical form
//   if (qs.platform) {
//     const canon = normalizePlatform(qs.platform);
//     if (canon) where["derived.platformCanonical"] = canon;
//   }
//   // Region
//   if (qs.regionId) where["remote.regionId"] = Number(qs.regionId);

//   // Release date (string stored as YYYY-MM-DD)
//   const releaseField = "remote.releaseDate";
//   const ymd = (v) => String(v).slice(0, 10);
//   if (qs.releaseDateFrom || qs.releaseDateTo || qs.releaseDate) {
//     const cond = { $exists: true, $ne: null };
//     if (qs.releaseDate) {
//       cond.$eq = ymd(qs.releaseDate);
//     } else {
//       if (qs.releaseDateFrom) cond.$gte = ymd(qs.releaseDateFrom);
//       if (qs.releaseDateTo) cond.$lte = ymd(qs.releaseDateTo);
//     }
//     where[releaseField] = cond;
//   }

//   // Publishers (any-of)
//   if (qs.publishers) {
//     const list = String(qs.publishers)
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     if (list.length === 1) {
//       where["remote.publishers"] = list[0];
//     } else if (list.length > 1) {
//       where["remote.publishers"] = { $in: list };
//     }
//   }

//   // Developers (any-of)
//   if (qs.developers) {
//     const list = String(qs.developers)
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     if (list.length === 1) {
//       where["remote.developers"] = list[0];
//     } else if (list.length > 1) {
//       where["remote.developers"] = { $in: list };
//     }
//   }

//   // Genres
//   if (qs.genres) {
//     const list = String(qs.genres)
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     if (list.length === 1) where["remote.genres"] = list[0];
//     else if (list.length > 1) where["remote.genres"] = { $in: list };
//   }

//   // Tags (must include all)
//   if (qs.tags) {
//     const list = String(qs.tags)
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     if (list.length) where["remote.tags"] = { $all: list };
//   }

//   // Price range (min price stored in derived.priceMin)
//   if (qs.priceFrom || qs.priceTo) {
//     const range = {};
//     if (qs.priceFrom) range.$gte = Number(qs.priceFrom);
//     if (qs.priceTo) range.$lte = Number(qs.priceTo);
//     where["derived.priceMin"] = range;
//   }
//   // isAd filter (using overrides.isAd flag)
//   if (qs.isAd) {
//     where["overrides.isAd"] = true;
//   }

//   // Metacritic score range
//   if (qs.metacriticScoreFrom || qs.metacriticScoreTo) {
//     const range = {};
//     if (qs.metacriticScoreFrom) range.$gte = Number(qs.metacriticScoreFrom);
//     if (qs.metacriticScoreTo) range.$lte = Number(qs.metacriticScoreTo);
//     where["remote.metacriticScore"] = range;
//   } else if (qs.metacriticScore) {
//     where["remote.metacriticScore"] = Number(qs.metacriticScore);
//   }

//   // Text search on name (overrides or remote)
//   if (qs.q) {
//     const rx = new RegExp(String(qs.q), "i");
//     where.$or = [{ "overrides.name": rx }, { "remote.name": rx }];
//   }

//   // Sorting
//   const sortFieldMap = {
//     priceMin: "derived.priceMin",
//     updatedAt: "updatedAt",
//     name: ["overrides.name", "remote.name"],
//     releaseDate: releaseField,
//     metacriticScore: "remote.metacriticScore",
//   };
//   const sortByKey = [
//     "priceMin",
//     "updatedAt",
//     "name",
//     "releaseDate",
//     "metacriticScore",
//   ].includes(qs.sortBy)
//     ? qs.sortBy
//     : "priceMin";
//   const dir = String(qs.sortType || "asc").toLowerCase() === "desc" ? -1 : 1;
//   let sort;
//   if (sortByKey === "name") {
//     sort = { "overrides.name": dir, "remote.name": dir };
//   } else {
//     const field = sortFieldMap[sortByKey];
//     sort = Array.isArray(field)
//       ? { [field[0]]: dir, [field[1]]: dir }
//       : { [field]: dir };
//   }

//   return { where, page, limit, sort };
// }

// exports.createPhysicalProduct = catchAsyncErrors(async (req, res, next) => {
//   const currentUser = req.user;
//   let sellerId = currentUser._id;
//   if (currentUser.role === "admin" && req.body.seller) {
//     sellerId = req.body.seller;
//   }
//   const { name, price, qty } = req.body;
//   if (!name || price == null) {
//     return next(
//       new AppError("name and price are required for a physical product", 400)
//     );
//   }
//   const remote = {
//     name: name,
//     description: req.body.description || undefined,
//     images: req.body.images || {},
//     price: Number(price),
//     qty: Number(qty) || 0,
//     regionId: req.body.regionId || undefined,
//     tags: Array.isArray(req.body.tags)
//       ? req.body.tags
//       : req.body.tags
//       ? String(req.body.tags)
//           .split(",")
//           .map((t) => t.trim())
//           .filter(Boolean)
//       : undefined,
//     isCard: !!req.body.isCard,
//     updatedAt: new Date(),
//     activationDetails: req.body.activationDetails || undefined,
//     videos: req.body.videos || undefined,
//     languages: Array.isArray(req.body.languages)
//       ? req.body.languages
//       : req.body.languages
//       ? String(req.body.languages)
//           .split(",")
//           .map((l) => l.trim())
//           .filter(Boolean)
//       : undefined,
//     currency: "IQD",
//     systemRequirements: req.body.systemRequirements || undefined,
//     originalName: req.body.originalName || undefined,
//     metacriticScore:
//       req.body.metacriticScore != null
//         ? Number(req.body.metacriticScore)
//         : undefined,
//     releaseDate: req.body.releaseDate || undefined,
//     publishers: Array.isArray(req.body.publishers)
//       ? req.body.publishers
//       : req.body.publishers
//       ? String(req.body.publishers)
//           .split(",")
//           .map((p) => p.trim())
//           .filter(Boolean)
//       : undefined,
//     developers: Array.isArray(req.body.developers)
//       ? req.body.developers
//       : req.body.developers
//       ? String(req.body.developers)
//           .split(",")
//           .map((d) => d.trim())
//           .filter(Boolean)
//       : undefined,
//     platform: req.body.platform || undefined,
//     genres: Array.isArray(req.body.genres)
//       ? req.body.genres
//       : req.body.genres
//       ? String(req.body.genres)
//           .split(",")
//           .map((g) => g.trim())
//           .filter(Boolean)
//       : undefined,
//   };
//   // Seller overrides

//   const product = await PhysicalProduct.create({
//     seller: sellerId,
//     remote,
//   });
//   res.status(201).json({ status: "success", data: { product } });
// });

// exports.getSellerProducts = catchAsyncErrors(async (req, res, next) => {
//   const sellerId = req.user._id;
//   const { where, page, limit, sort } = buildPhysicalListQuery(
//     req.query,
//     sellerId
//   );
//   const skip = (page - 1) * limit;
//   // Count documents matching the filter for pagination
//   let pageCount = await PhysicalProduct.find(where)
//     .sort(sort)
//     .clone()
//     .countDocuments();
//   pageCount = Math.ceil(pageCount / limit);
//   const [items, totalCount] = await Promise.all([
//     PhysicalProduct.find(where).sort(sort).skip(skip).limit(limit).lean(),
//     PhysicalProduct.countDocuments({ seller: sellerId }),
//   ]);
//   // Currency conversion helpers
//   const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
//   const safeFormat = (amount, currency) => {
//     if (amount == null) return null;
//     try {
//       return new Intl.NumberFormat(undefined, {
//         style: "currency",
//         currency,
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//       }).format(amount);
//     } catch {
//       return `${amount.toFixed(2)} ${currency}`;
//     }
//   };
//   const fx1 = await convertFromIQD(req, 1);
//   const rate = fx1.fxFallback ? 1 : fx1.rate;
//   const currency = fx1.fxFallback ? "IQD" : fx1.currency;
//   const results = items.map((p) => {
//     const priceIQD = p.derived?.priceMin ?? null;
//     const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;
//     return {
//       _id: p._id,
//       seller: p.seller,
//       name: p.overrides?.name || p.remote?.name,
//       images: p.overrides?.images || p.remote?.images,
//       currency,
//       priceMinIQD: priceIQD,
//       priceMin: priceConverted,
//       priceMinFormatted: safeFormat(priceConverted, currency),
//       inStock: p.derived?.inStock,
//       regionId: p.remote?.regionId,
//       platform: p.remote?.platform,
//       qty: p.remote?.qty,
//       updatedAt: p.remote?.updatedAt,
//       activationDetails: p.remote?.activationDetails,
//       languages: p.remote?.languages,
//       systemRequirements: p.remote?.systemRequirements,
//       originalName: p.remote?.originalName,
//       metacriticScore: p.remote?.metacriticScore,
//       releaseDate: p.remote?.releaseDate,
//       genres: p.remote?.genres,
//       publishers: p.remote?.publishers,
//       developers: p.remote?.developers,
//       tags: p.remote?.tags,
//       description: p.overrides?.description || p.remote?.description,
//       remote: p.remote,
//     };
//   });
//   res.status(200).json({
//     status: "success",
//     meta: { pageCount, page, limit, item_count: totalCount },
//     results,
//   });
// });

// /**
//  * Retrieve a single physical product owned by the seller. Sellers may view
//  * their own items; admins may view any product.
//  */
// exports.getPhysicalProductSeller = catchAsyncErrors(async (req, res, next) => {
//   const id = req.params.id;
//   const product = await PhysicalProduct.findById(id).lean();
//   if (!product || product.flags?.hidden) {
//     return next(new AppError("Physical product not found", 404));
//   }
//   // Authorize: seller owns product or admin
//   if (!product.seller.equals(req.user._id) && req.user.role !== "admin") {
//     return next(
//       new AppError("You do not have permission to view this product", 403)
//     );
//   }
//   // Convert currency
//   const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
//   const fx = await convertFromIQD(req, 1);
//   const rate = fx.fxFallback ? 1 : fx.rate;
//   const currency = fx.fxFallback ? "IQD" : fx.currency;
//   const priceIQD = product.derived?.priceMin ?? null;
//   const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;
//   const data = {
//     physicalId: product._id,
//     seller: product.seller,
//     name: product.overrides?.name || product.remote?.name,
//     description: product.overrides?.description || product.remote?.description,
//     images: product.overrides?.images || product.remote?.images,
//     currency,
//     priceMinIQD: priceIQD,
//     priceMin: priceConverted,
//     inStock: product.derived?.inStock,
//     regionId: product.remote?.regionId,
//     platform: product.remote?.platform,
//     qty: product.remote?.qty,
//     updatedAt: product.remote?.updatedAt,
//     activationDetails: product.remote?.activationDetails,
//     languages: product.remote?.languages,
//     systemRequirements: product.remote?.systemRequirements,
//     originalName: product.remote?.originalName,
//     metacriticScore: product.remote?.metacriticScore,
//     releaseDate: product.remote?.releaseDate,
//     genres: product.remote?.genres,
//     publishers: product.remote?.publishers,
//     developers: product.remote?.developers,
//     tags: product.remote?.tags,
//     remote: product.remote,
//   };
//   res.status(200).json({ status: "success", data });
// });

// exports.updatePhysicalProductSeller = catchAsyncErrors(
//   async (req, res, next) => {
//     const id = req.params.id;
//     const product = await PhysicalProduct.findById(id);
//     if (!product || product.flags?.hidden) {
//       return next(new AppError("Physical product not found", 404));
//     }
//     if (!product.seller.equals(req.user._id) && req.user.role !== "admin") {
//       return next(
//         new AppError("You do not have permission to update this product", 403)
//       );
//     }

//     // Update remote fields
//     const r = product.remote || {};
//     const fields = [
//       "name",
//       "description",
//       "images",
//       "price",
//       "qty",
//       "regionId",
//       "tags",
//       "isCard",
//       "activationDetails",
//       "videos",
//       "languages",
//       "systemRequirements",
//       "originalName",
//       "metacriticScore",
//       "releaseDate",
//       "publishers",
//       "developers",
//       "platform",
//       "genres",
//     ];
//     fields.forEach((key) => {
//       if (req.body[key] !== undefined) {
//         if (key === "price" || key === "qty" || key === "metacriticScore") {
//           r[key] = Number(req.body[key]);
//         } else if (
//           key === "tags" ||
//           key === "languages" ||
//           key === "publishers" ||
//           key === "developers" ||
//           key === "genres"
//         ) {
//           if (Array.isArray(req.body[key])) {
//             r[key] = req.body[key];
//           } else {
//             r[key] = String(req.body[key])
//               .split(",")
//               .map((v) => v.trim())
//               .filter(Boolean);
//           }
//         } else if (key === "images") {
//           r.images = req.body.images;
//         } else if (key === "isCard") {
//           r.isCard = !!req.body.isCard;
//         } else {
//           r[key] = req.body[key];
//         }
//       }
//     });
//     product.remote = r;

//     await product.save();
//     res.status(200).json({ status: "success", data: { product } });
//   }
// );

// /**
//  * Soft delete a physical product. Sets the hidden flag and records removedAt.
//  * Sellers may delete their own products; admins may delete any product.
//  */
// exports.deletePhysicalProductSeller = catchAsyncErrors(
//   async (req, res, next) => {
//     const id = req.params.id;
//     const product = await PhysicalProduct.findById(id);
//     if (!product || product.flags?.hidden) {
//       return next(new AppError("Physical product not found", 404));
//     }
//     if (!product.seller.equals(req.user._id) && req.user.role !== "admin") {
//       return next(
//         new AppError("You do not have permission to delete this product", 403)
//       );
//     }
//     product.flags = product.flags || {};
//     product.flags.hidden = true;
//     product.flags.removedAt = new Date();
//     await product.save();
//     res.status(204).json({ status: "success", message: "Product deleted" });
//   }
// );

// /**
//  * List all physical products (admin). Optionally filter by seller via
//  * `req.query.sellerId`. Otherwise returns all visible physical products.
//  */
// exports.getPhysicalProductsAdmin = catchAsyncErrors(async (req, res, next) => {
//   // Only admins should reach this controller via middleware. But double check
//   if (req.user.role !== "admin") {
//     return next(
//       new AppError("Only admins may view all physical products", 403)
//     );
//   }
//   const sellerId = req.query.sellerId || undefined;
//   const { where, page, limit, sort } = buildPhysicalListQuery(
//     req.query,
//     sellerId
//   );
//   const skip = (page - 1) * limit;
//   let pageCount = await PhysicalProduct.find(where)
//     .sort(sort)
//     .clone()
//     .countDocuments();
//   pageCount = Math.ceil(pageCount / limit);
//   const [items, totalCount] = await Promise.all([
//     PhysicalProduct.find(where).sort(sort).skip(skip).limit(limit).lean(),
//     PhysicalProduct.countDocuments(),
//   ]);
//   // Currency conversion
//   const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
//   const safeFormat = (amount, currency) => {
//     if (amount == null) return null;
//     try {
//       return new Intl.NumberFormat(undefined, {
//         style: "currency",
//         currency,
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//       }).format(amount);
//     } catch {
//       return `${amount.toFixed(2)} ${currency}`;
//     }
//   };
//   const fx1 = await convertFromIQD(req, 1);
//   const rate = fx1.fxFallback ? 1 : fx1.rate;
//   const currency = fx1.fxFallback ? "IQD" : fx1.currency;
//   const results = items.map((p) => {
//     const priceIQD = p.derived?.priceMin ?? null;
//     const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;
//     return {
//       physicalId: p._id,
//       sku: p.sku,
//       seller: p.seller,
//       name: p.overrides?.name || p.remote?.name,
//       images: p.overrides?.images || p.remote?.images,
//       currency,
//       priceMinIQD: priceIQD,
//       priceMin: priceConverted,
//       priceMinFormatted: safeFormat(priceConverted, currency),
//       inStock: p.derived?.inStock,
//       regionId: p.remote?.regionId,
//       platform: p.remote?.platform,
//       qty: p.remote?.qty,
//       updatedAt: p.remote?.updatedAt,
//       activationDetails: p.remote?.activationDetails,
//       languages: p.remote?.languages,
//       systemRequirements: p.remote?.systemRequirements,
//       originalName: p.remote?.originalName,
//       metacriticScore: p.remote?.metacriticScore,
//       releaseDate: p.remote?.releaseDate,
//       genres: p.remote?.genres,
//       publishers: p.remote?.publishers,
//       developers: p.remote?.developers,
//       tags: p.remote?.tags,
//       description: p.overrides?.description || p.remote?.description,
//       remote: p.remote,
//     };
//   });
//   res.status(200).json({
//     status: "success",
//     meta: { pageCount, page, limit, item_count: totalCount },
//     results,
//   });
// });

// /**
//  * Retrieve a physical product by ID (admin). Does not restrict to seller.
//  */
// exports.getPhysicalProductAdmin = catchAsyncErrors(async (req, res, next) => {
//   const id = req.params.id;
//   const product = await PhysicalProduct.findById(id).lean();
//   if (!product || product.flags?.hidden) {
//     return next(new AppError("Physical product not found", 404));
//   }
//   // Convert currency
//   const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
//   const fx = await convertFromIQD(req, 1);
//   const rate = fx.fxFallback ? 1 : fx.rate;
//   const currency = fx.fxFallback ? "IQD" : fx.currency;
//   const priceIQD = product.derived?.priceMin ?? null;
//   const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;
//   const data = {
//     physicalId: product._id,
//     sku: product.sku,
//     seller: product.seller,
//     name: product.overrides?.name || product.remote?.name,
//     description: product.overrides?.description || product.remote?.description,
//     images: product.overrides?.images || product.remote?.images,
//     currency,
//     priceMinIQD: priceIQD,
//     priceMin: priceConverted,
//     inStock: product.derived?.inStock,
//     regionId: product.remote?.regionId,
//     platform: product.remote?.platform,
//     qty: product.remote?.qty,
//     updatedAt: product.remote?.updatedAt,
//     activationDetails: product.remote?.activationDetails,
//     languages: product.remote?.languages,
//     systemRequirements: product.remote?.systemRequirements,
//     originalName: product.remote?.originalName,
//     metacriticScore: product.remote?.metacriticScore,
//     releaseDate: product.remote?.releaseDate,
//     genres: product.remote?.genres,
//     publishers: product.remote?.publishers,
//     developers: product.remote?.developers,
//     tags: product.remote?.tags,
//     remote: product.remote,
//   };
//   res.status(200).json({ status: "success", data });
// });

// /**
//  * Update a physical product (admin). Admins can edit any field and may
//  * change ownership by specifying a new seller.
//  */
// exports.updatePhysicalProductAdmin = catchAsyncErrors(
//   async (req, res, next) => {
//     if (req.user.role !== "admin") {
//       return next(
//         new AppError("Only admins may update physical products", 403)
//       );
//     }
//     const id = req.params.id;
//     const product = await PhysicalProduct.findById(id);
//     if (!product || product.flags?.hidden) {
//       return next(new AppError("Physical product not found", 404));
//     }
//     // Admin may reassign seller
//     if (req.body.seller) {
//       product.seller = req.body.seller;
//     }
//     // Delegating to seller update logic for all other fields
//     req.user = { ...req.user, role: "admin" }; // ensure admin privileges
//     req.params.id = id;
//     // We reuse updatePhysicalProductSeller by calling it directly
//     return exports.updatePhysicalProductSeller(req, res, next);
//   }
// );

// /**
//  * Delete a physical product (admin). Performs a soft delete.
//  */
// exports.deletePhysicalProductAdmin = catchAsyncErrors(
//   async (req, res, next) => {
//     if (req.user.role !== "admin") {
//       return next(
//         new AppError("Only admins may delete physical products", 403)
//       );
//     }
//     req.params.id = req.params.id;
//     req.user = { ...req.user, role: "admin" };
//     return exports.deletePhysicalProductSeller(req, res, next);
//   }
// );
