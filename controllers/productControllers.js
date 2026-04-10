// controllers/localProductsController.js
const { KinguinProduct, Sequelize } = require("../post-models"); // local mirror schema
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
const { convertFromIQD, fixedPricingConfig } = require("../utils/currency");
const { Op } = require("sequelize");
const {
  buildSearchDescriptor,
  buildSearchFilterSql,
  buildSearchRankSql,
} = require("../utils/searchRanking");
const {
  buildProductSeoDetail,
  buildProductSeoListItem,
} = require("../utils/productSeo");

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

const PRICE_MIN_NUMERIC_SQL = `NULLIF("derived"->>'priceMin', '')::double precision`;
const METACRITIC_NUMERIC_SQL = `NULLIF("remote"->>'metacriticScore', '')::double precision`;
const OFFICIAL_REGULAR_NUMERIC_SQL =
  `NULLIF("officialStore"->>'regularAmount', '')::double precision`;
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

function buildListQuery(qs) {
  const and = [
    Sequelize.literal(NOT_HIDDEN_SQL),
    Sequelize.literal(IN_STOCK_SQL),
  ];
  let search = null;

  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.max(1, Math.min(200, Number(qs.limit) || 24));

  // Platform (canonical)
  if (qs.platform) {
    const canon = normalizePlatform(qs.platform);
    if (canon) {
      and.push(Sequelize.where(Sequelize.json("derived.platformCanonical"), canon));
    }
  }
  // Region
  if (qs.regionId) {
    and.push(Sequelize.where(Sequelize.json("remote.regionId"), Number(qs.regionId)));
  }

  // -------- Release date (stored as "YYYY-MM-DD" string) --------
  // If you store as Date in Mongo, swap the assignments to new Date("...T00:00:00Z")
  const ymd = (v) => String(v).slice(0, 10); // if you're storing as "YYYY-MM-DD" strings

  if (qs.releaseDateFrom || qs.releaseDateTo || qs.releaseDate) {
    const cond = {};
    if (qs.releaseDate) {
      cond[Op.eq] = ymd(qs.releaseDate); // exact day
    } else {
      if (qs.releaseDateFrom) cond[Op.gte] = ymd(qs.releaseDateFrom);
      if (qs.releaseDateTo) cond[Op.lte] = ymd(qs.releaseDateTo);
    }
    and.push(Sequelize.where(Sequelize.literal(`"remote"->>'releaseDate'`), cond));
  }

  // Publishers (any-of)
  if (qs.publishers) {
    const list = String(qs.publishers)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'publishers') @> ${toJsonbArrayLiteral([list[0]])}`
        )
      );
    } else if (list.length > 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'publishers') ?| ${toTextArrayLiteral(list)}`
        )
      );
    }
  }

  // Developers (any-of)
  if (qs.developers) {
    const list = String(qs.developers)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'developers') @> ${toJsonbArrayLiteral([list[0]])}`
        )
      );
    } else if (list.length > 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'developers') ?| ${toTextArrayLiteral(list)}`
        )
      );
    }
  }

  // Genres
  if (qs.genres) {
    const list = String(qs.genres)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'genres') @> ${toJsonbArrayLiteral([list[0]])}`
        )
      );
    } else if (list.length > 1) {
      and.push(
        Sequelize.literal(
          `("remote"->'genres') ?| ${toTextArrayLiteral(list)}`
        )
      );
    }
  }

  // Tags (must include all)
  if (qs.tags) {
    const list = String(qs.tags)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) {
      and.push(
        Sequelize.literal(`("remote"->'tags') @> ${toJsonbArrayLiteral(list)}`)
      );
    }
  }

  // Price range
  if (qs.priceFrom || qs.priceTo) {
    const range = {};
    if (qs.priceFrom) range[Op.gte] = Number(qs.priceFrom);
    if (qs.priceTo) range[Op.lte] = Number(qs.priceTo);
    and.push(
      Sequelize.where(
        Sequelize.literal(PRICE_MIN_NUMERIC_SQL),
        range
      )
    );
  }
  if (qs.isAd) {
    and.push(Sequelize.where(Sequelize.json("overrides.isAd"), true));
  }

  if (String(qs.isCard).toLowerCase() === "true") {
    and.push(Sequelize.literal(`("remote"->'isCard') = 'true'::jsonb`));
  }

  // -------- Metacritic score range --------
  // Assuming stored at remote.metacriticScore (change path if different)
  if (qs.metacriticScoreFrom || qs.metacriticScoreTo) {
    const range = {};
    if (qs.metacriticScoreFrom) range[Op.gte] = Number(qs.metacriticScoreFrom);
    if (qs.metacriticScoreTo) range[Op.lte] = Number(qs.metacriticScoreTo);
    and.push(
      Sequelize.where(
        Sequelize.literal(METACRITIC_NUMERIC_SQL),
        range
      )
    );
  } else if (qs.metacriticScore) {
    and.push(
      Sequelize.where(
        Sequelize.literal(METACRITIC_NUMERIC_SQL),
        Number(qs.metacriticScore)
      )
    );
  }

  // Search
  if (qs.q) {
    const searchText = String(qs.q).trim();
    if (searchText) {
      search = buildSearchDescriptor(searchText);
      and.push(Sequelize.literal(buildSearchFilterSql(search, SEARCH_NAME_SQL)));
    }
  }

  // -------- Sorting --------
  const sortByKey = [
    "priceMin",
    "updatedAt",
    "name",
    "releaseDate",
    "metacriticScore",
  ].includes(qs.sortBy)
    ? qs.sortBy
    : "priceMin";
  const sortDir =
    String(qs.sortType || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const sortableExprMap = {
    priceMin: Sequelize.literal(PRICE_MIN_NUMERIC_SQL),
    metacriticScore: Sequelize.literal(METACRITIC_NUMERIC_SQL),
    releaseDate: Sequelize.literal(`"remote"->>'releaseDate'`),
    name: Sequelize.literal(SEARCH_NAME_SQL),
  };

  const primaryOrder =
    sortByKey === "updatedAt"
      ? [["updatedAt", sortDir]]
      : [[sortableExprMap[sortByKey], sortDir]];
  const order = [...primaryOrder, ["id", "ASC"]];
  if (search) {
    const { containsExpr, initialsExpr, popularityExpr } = buildSearchRankSql(
      search,
      SEARCH_NAME_SQL
    );
    order.unshift([Sequelize.literal(popularityExpr), "DESC"]);
    order.unshift([Sequelize.literal(initialsExpr), "DESC"]);
    order.unshift([Sequelize.literal(containsExpr), "DESC"]);
  }

  return { where: { [Op.and]: and }, page, limit, order, search };
}

const {
  lookupGameIdsByTitle,
  getPricesByGameIds,
  getMostPopularGames,
  getOfficialDealForTitle,
} = require("../utils/itadClient");
// const { getShopIdsForPlatform } = require("../utils/platforms"); // if you ever need shops

/** Lists catalog items where `remote.isCard` is true (gift cards / prepaid), same query params as GET / */
exports.listGiftCards = catchAsyncErrors(async (req, res, next) => {
  req.query = { ...req.query, isCard: "true" };
  return exports.listProducts(req, res, next);
});

exports.listBestDeals = catchAsyncErrors(async (req, res, next) => {
  const minDiscountPercent = Number(req.body?.minDiscountPercent);
  if (
    !Number.isFinite(minDiscountPercent) ||
    minDiscountPercent < 0 ||
    minDiscountPercent > 100
  ) {
    return next(
      new appError(
        "Body field 'minDiscountPercent' is required and must be between 0 and 100",
        400
      )
    );
  }

  const requestedLimit = req.body?.limit;
  const parsedLimit =
    requestedLimit === undefined ? 20 : Number.parseInt(requestedLimit, 10);
  if (!Number.isInteger(parsedLimit)) {
    return next(
      new appError("Body field 'limit' must be an integer when provided", 400)
    );
  }
  const limit = Math.max(1, Math.min(100, parsedLimit));

  const savingsPercentSql = `(((${OFFICIAL_REGULAR_NUMERIC_SQL}) - (${PRICE_MIN_NUMERIC_SQL})) / (${OFFICIAL_REGULAR_NUMERIC_SQL})) * 100`;
  const where = {
    [Op.and]: [
      Sequelize.literal(NOT_HIDDEN_SQL),
      Sequelize.literal(IN_STOCK_SQL),
      Sequelize.where(Sequelize.literal(OFFICIAL_REGULAR_NUMERIC_SQL), {
        [Op.gt]: 0,
      }),
      Sequelize.where(Sequelize.literal(PRICE_MIN_NUMERIC_SQL), { [Op.gt]: 0 }),
      Sequelize.where(Sequelize.literal(METACRITIC_NUMERIC_SQL), {
        [Op.gte]: 0,
      }),
      Sequelize.where(Sequelize.literal(savingsPercentSql), {
        [Op.gte]: minDiscountPercent,
      }),
    ],
  };

  const items = await KinguinProduct.findAll({
    where,
    attributes: [
      "id",
      "derived",
      "overrides",
      "remote",
      [Sequelize.literal(OFFICIAL_REGULAR_NUMERIC_SQL), "originalPrice"],
      [Sequelize.literal(METACRITIC_NUMERIC_SQL), "metacriticScoreNumeric"],
      [Sequelize.literal(savingsPercentSql), "savingsPercent"],
    ],
    order: [
      [Sequelize.literal(METACRITIC_NUMERIC_SQL), "DESC"],
      [Sequelize.literal(savingsPercentSql), "DESC"],
      ["id", "ASC"],
    ],
    limit,
    raw: true,
  });

  const results = items.map((p) => {
    const cover = p.overrides?.coverImage || p.remote?.images?.cover;
    const image =
      (cover && typeof cover === "object" ? cover.url : null) ||
      (typeof cover === "string" ? cover : null) ||
      null;

    return {
      kinguinId: p.id,
      name: p.overrides?.name || p.remote?.name || p.remote?.originalName || null,
      image,
      priceMin: p.derived?.priceMin ?? null,
      originalPrice: Number(p.originalPrice),
      metacriticScore: Number(p.metacriticScoreNumeric),
      savingsPercent: Number(p.savingsPercent),
      seo: buildProductSeoListItem({ productRow: p, kinguinId: p.id }),
    };
  });

  res.status(200).json({
    status: "success",
    meta: {
      minDiscountPercent,
      requestedLimit: requestedLimit === undefined ? 20 : requestedLimit,
      limit,
      item_count: results.length,
      sorting: ["metacriticScore DESC", "savingsPercent DESC", "id ASC"],
      exclusions: [
        "hidden products",
        "out of stock products",
        "missing/invalid officialStore.regularAmount",
        "missing/invalid derived.priceMin",
        "missing/invalid remote.metacriticScore",
      ],
    },
    results,
  });
});

exports.listProducts = catchAsyncErrors(async (req, res, next) => {
  const requestStartMs = Date.now();
  const { where, page, limit, order, search } = buildListQuery(req.query);
  const skip = (page - 1) * limit;
  const isSearchRequest = Boolean(search);
  const countModeRaw = String(req.query.countMode || "").trim().toLowerCase();
  const forceExactCount =
    countModeRaw === "exact" ||
    countModeRaw === "true" ||
    countModeRaw === "1" ||
    countModeRaw === "yes";
  const useExactCount = !isSearchRequest || forceExactCount;
  let items;
  let pageCount;
  let totalFilteredCount;
  let hasMore = false;
  const dbStartMs = Date.now();
  if (useExactCount) {
    const [countValue, pagedItems] = await Promise.all([
      KinguinProduct.count({ where }),
      KinguinProduct.findAll({
        where,
        order,
        offset: skip,
        limit,
        raw: true,
      }),
    ]);
    totalFilteredCount = countValue;
    items = pagedItems;
    pageCount = Math.ceil(totalFilteredCount / limit);
    hasMore = page < pageCount;
  } else {
    const pagedItemsPlusOne = await KinguinProduct.findAll({
      where,
      order,
      offset: skip,
      limit: limit + 1,
      raw: true,
    });
    hasMore = pagedItemsPlusOne.length > limit;
    items = hasMore ? pagedItemsPlusOne.slice(0, limit) : pagedItemsPlusOne;
    totalFilteredCount = skip + items.length + (hasMore ? 1 : 0);
    pageCount = hasMore ? page + 1 : page;
  }
  const dbDurationMs = Date.now() - dbStartMs;

  // helpers (inline)
  const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;

  const safeFormat = (amount, currency) => {
    if (amount == null) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  // before mapping, get a single FX rate for this request
  const fx1 = await convertFromIQD(req, 1); // 1 IQD → X
  const rate = fx1.fxFallback ? 1 : fx1.rate; // multiplier from IQD
  const currency = fx1.fxFallback ? "IQD" : fx1.currency; // target currency (or IQD fallback)

  const now = Date.now();
  const REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48h
  const pricingCfg = fixedPricingConfig();
  const country = pricingCfg.forcedPricing
    ? pricingCfg.forcedCountryCode
    : (req.user && req.user.countryCode) ||
      process.env.ITAD_DEFAULT_COUNTRY ||
      "US";

  // ---------- Batch ITAD refresh for items on this page ----------
  // Search requests should stay fast and never block on external price sync.
  const shouldRefreshOfficialStore = !search;
  const refreshStartMs = Date.now();

  // 1) pick candidates that need refresh (missing or stale officialStore)
  const candidates = shouldRefreshOfficialStore
    ? items.filter((p) => {
    const os = p.officialStore;
    if (!os || !os.regularAmount || !os.lastUpdatedAt) return true;
    const age = now - new Date(os.lastUpdatedAt).getTime();
    return age > REFRESH_INTERVAL_MS;
      })
    : [];

  const updatedOfficialById = {}; // id (string) -> officialStore object

  if (candidates.length > 0) {
    // 2) build title -> [productIds] map
    const titleMap = new Map(); // key = lowercased title, value = { title, productIds: [] }

    for (const p of candidates) {
      const title =
        p.remote?.originalName || p.overrides?.name || p.remote?.name || null;
      if (!title) continue;

      const key = title.toLowerCase();
      let entry = titleMap.get(key);
      if (!entry) {
        entry = { title, productIds: [] };
        titleMap.set(key, entry);
      }
      entry.productIds.push(String(p.id));
    }

    const titles = Array.from(titleMap.values()).map((e) => e.title);

    if (titles.length > 0) {
      try {
        // 3) lookup ITAD gameIds for all titles in one shot
        const lookupResp = await lookupGameIdsByTitle(titles);
        // lookupResp: { [title]: gameId | null }

        // 4) build gameId -> productIds map
        const gameIdToProductIds = new Map();

        for (const entry of titleMap.values()) {
          const gameId = lookupResp[entry.title];
          if (!gameId) continue;
          let arr = gameIdToProductIds.get(gameId);
          if (!arr) {
            arr = [];
            gameIdToProductIds.set(gameId, arr);
          }
          arr.push(...entry.productIds);
        }

        const gameIds = Array.from(gameIdToProductIds.keys());

        if (gameIds.length > 0) {
          // 5) fetch prices for all these gameIds in one API call
          const pricesResp = await getPricesByGameIds(gameIds, { country });

          // 6) prepare SQL updates
          const updateTasks = [];

          for (const entry of pricesResp) {
            // ✅ use `id`, not `gameId`
            const gameId = entry.id;
            const deals = entry.deals;
            if (!Array.isArray(deals) || deals.length === 0) continue;

            // choose the cheapest deal as "official reference"
            deals.sort((a, b) => a.price.amount - b.price.amount);
            const best = deals[0];

            if (!best.price || !best.regular) continue;

            // ✅ match getProduct logic: store in IQD directly (amount * 1310)
            const officialStore = {
              itadGameId: gameId,
              shopId: best.shop.id,
              shopName: best.shop.name,
              url: best.url,
              // country,      // same as you did in getProduct (commented if you want)
              // currency: best.price.currency,
              priceAmount: best.price.amount * 1310.0, // IQD
              regularAmount: best.regular.amount * 1310.0, // IQD
              cut: best.cut,
              lastUpdatedAt: new Date(),
            };

            const productIds = gameIdToProductIds.get(gameId) || [];
            for (const pid of productIds) {
              updatedOfficialById[pid] = officialStore;
              updateTasks.push(
                KinguinProduct.update(
                  { officialStore },
                  { where: { id: Number(pid) } }
                )
              );
            }
          }

          if (updateTasks.length > 0) {
            await Promise.all(updateTasks);
          }
        }
      } catch (err) {
        console.error("ITAD sync in listProducts failed:", err.message);
      }
    }
  }
  const refreshDurationMs = Date.now() - refreshStartMs;

  // ---------- Build response with discount tags ----------

  const results = items.map((p) => {
    const priceIQD = p.derived?.priceMin ?? null;
    const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;

    const idStr = String(p.id);

    // use freshly-fetched officialStore if we just updated it in this request
    let officialForResponse =
      updatedOfficialById[idStr] || p.officialStore || null;

    console.log(`updatedOfficialById ::${{ ...updatedOfficialById }}`);
    console.log(updatedOfficialById);

    // // same logic as getProduct:
    // // if our minimum IQD price is > official IQD price, hide official block
    // if (
    //   officialForResponse &&
    //   typeof priceIQD === "number" &&
    //   typeof officialForResponse.priceAmount === "number" &&
    //   priceIQD > officialForResponse.priceAmount
    // ) {
    //   officialForResponse = null;
    // }

    const discountVsOfficial = null; // keeping as-is, you commented this out in getProduct

    return {
      kinguinId: p.id,
      name: p.overrides?.name || p.remote?.name,
      images: p.remote?.images,

      // prices & currency
      currency, // e.g., 'EUR'
      priceMinIQD: priceIQD, // original in IQD (kept for debugging)
      priceMin: priceConverted, // converted, truncated to 2 decimals
      priceMinFormatted: safeFormat(priceConverted, currency),

      // ITAD / official store info for the card
      officialStore: officialForResponse
        ? {
            shopId: officialForResponse.shopId,
            shopName: officialForResponse.shopName,
            url: officialForResponse.url,
            priceAmount: officialForResponse.priceAmount, // already in IQD
            regularAmount: officialForResponse.regularAmount, // already in IQD
            cut: officialForResponse.cut,
            lastUpdatedAt: officialForResponse.lastUpdatedAt,
          }
        : null,

      // "Save X% vs official" – left null like in your getProduct
      // discountVsOfficial,

      inStock: p.derived?.inStock,
      regionId: p.remote?.regionId,
      regionalLimitations: p.remote?.regionalLimitations,
      countryLimitation: p.remote?.countryLimitation,
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
      publishers: p.remote?.publishers,
      developers: p.remote?.developers,
      releaseDate: p.remote?.releaseDate,
      description: p.overrides?.description || p.remote?.description,
      remote: p.remote, // keep for admin/debug
      seo: buildProductSeoListItem({ productRow: p, kinguinId: p.id }),
    };
  });

  res.status(200).json({
    status: "success",
    meta: {
      pageCount,
      page,
      limit,
      item_count: totalFilteredCount,
      hasMore,
      exactCount: useExactCount,
    },
    results,
  });
  const totalDurationMs = Date.now() - requestStartMs;
  if (search) {
    console.log(
      `[perf] listProducts search q="${String(req.query.q || "")}" countMode=${useExactCount ? "exact" : "fast"} dbMs=${dbDurationMs} refreshMs=${refreshDurationMs} totalMs=${totalDurationMs} totalFiltered=${totalFilteredCount} page=${page} limit=${limit}`
    );
  } else {
    console.log(
      `[perf] listProducts countMode=exact dbMs=${dbDurationMs} refreshMs=${refreshDurationMs} totalMs=${totalDurationMs} totalFiltered=${totalFilteredCount} page=${page} limit=${limit}`
    );
  }
});

/** Compact list by genre(s): name, price, genres, image, flags. Same filters as listProducts except `genres` is required. */
exports.listGanraGames = catchAsyncErrors(async (req, res, next) => {
  const genresRaw = String(req.query.genres || "").trim();
  if (!genresRaw) {
    return next(new appError("Query parameter 'genres' is required", 400));
  }

  const { where, page, limit, order } = buildListQuery(req.query);
  const skip = (page - 1) * limit;

  const [totalFilteredCount, items] = await Promise.all([
    KinguinProduct.count({ where }),
    KinguinProduct.findAll({
      where,
      order,
      offset: skip,
      limit,
      raw: true,
    }),
  ]);

  const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
  const safeFormat = (amount, currency) => {
    if (amount == null) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  const fx1 = await convertFromIQD(req, 1);
  const rate = fx1.fxFallback ? 1 : fx1.rate;
  const currency = fx1.fxFallback ? "IQD" : fx1.currency;

  const results = items.map((p) => {
    const priceIQD = p.derived?.priceMin ?? null;
    const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;
    const cover = p.remote?.images?.cover;
    const image =
      p.overrides?.images?.cover ||
      (cover && typeof cover === "object" ? cover.url : null) ||
      (typeof cover === "string" ? cover : null) ||
      null;

    return {
      kinguinId: p.id,
      name: p.overrides?.name || p.remote?.name,
      genres: Array.isArray(p.remote?.genres) ? p.remote.genres : [],
      image,
      currency,
      priceMinIQD: priceIQD,
      price: priceConverted,
      priceFormatted: safeFormat(priceConverted, currency),
      flags: p.flags && typeof p.flags === "object" ? p.flags : {},
      seo: buildProductSeoListItem({ productRow: p, kinguinId: p.id }),
    };
  });

  const pageCount = Math.ceil(totalFilteredCount / limit) || 1;
  const hasMore = page < pageCount;

  res.status(200).json({
    status: "success",
    route: "ganraGames",
    meta: {
      page,
      limit,
      item_count: totalFilteredCount,
      pageCount,
      hasMore,
    },
    results,
  });
});

exports.listNewGames = catchAsyncErrors(async (req, res, next) => {
  const now = new Date();
  const releaseDateFromDate = new Date(
    now.getFullYear() - 8,
    now.getMonth(),
    now.getDate()
  );
  const pad2 = (value) => String(value).padStart(2, "0");
  const releaseDateFromDefault = `${releaseDateFromDate.getFullYear()}-${pad2(
    releaseDateFromDate.getMonth() + 1
  )}-${pad2(releaseDateFromDate.getDate())}`;

  const mergedQuery = {
    ...req.query,
    sortBy: req.query.sortBy || "releaseDate",
    sortType: req.query.sortType || "desc",
    releaseDateFrom: req.query.releaseDateFrom || releaseDateFromDefault,
  };

  req.query = mergedQuery;
  return exports.listProducts(req, res, next);
});

exports.listPopularGames = catchAsyncErrors(async (req, res, next) => {
  const { offset, limit, results } = await getMostPopularGames({
    offset: req.query.offset,
    limit: req.query.limit,
  });

  const normalizedResults = results
    .filter((item) => String(item?.type || "").toLowerCase() === "game")
    .map((item) => ({
      position: Number(item?.position) || null,
      id: item?.id || null,
      slug: item?.slug || null,
      title: item?.title || null,
      type: item?.type || null,
      mature: Boolean(item?.mature),
      count: Number(item?.count) || 0,
    }));

  res.status(200).json({
    status: "success",
    source: "itad",
    metric: "popular",
    meta: {
      offset,
      limit,
      item_count: normalizedResults.length,
    },
    results: normalizedResults,
  });
});

exports.suggestProducts = catchAsyncErrors(async (req, res, next) => {
  const searchText = String(req.query.q || "").trim();
  if (!searchText) {
    return next(new appError("Query parameter 'q' is required", 400));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const search = buildSearchDescriptor(searchText);
  if (!search) {
    return next(new appError("Query parameter 'q' is required", 400));
  }

  const { containsExpr, initialsExpr, popularityExpr } = buildSearchRankSql(
    search,
    SEARCH_NAME_SQL
  );
  const suggestionsPlusOne = await KinguinProduct.findAll({
    where: {
      [Op.and]: [
        Sequelize.literal(NOT_HIDDEN_SQL),
        Sequelize.literal(IN_STOCK_SQL),
        Sequelize.literal(buildSearchFilterSql(search, SEARCH_NAME_SQL)),
      ],
    },
    attributes: [
      "id",
      [
        Sequelize.literal(
          `COALESCE("overrides"->>'name', "remote"->>'name', "remote"->>'originalName', '')`
        ),
        "name",
      ],
      [
        Sequelize.literal(
          `COALESCE(
            NULLIF(BTRIM("overrides"->>'coverImage'), ''),
            CASE
              WHEN jsonb_typeof("remote"->'images'->'cover') = 'object'
                THEN NULLIF(BTRIM("remote"->'images'->'cover'->>'url'), '')
              WHEN jsonb_typeof("remote"->'images'->'cover') = 'string'
                THEN NULLIF(BTRIM("remote"->'images'->>'cover'), '')
              ELSE NULL
            END
          )`
        ),
        "thumbnail",
      ],
      [
        Sequelize.literal(`COALESCE("overrides"->'images', "remote"->'images')`),
        "image",
      ],
      [
        Sequelize.literal(
          `COALESCE("derived"->>'platformCanonical', "remote"->>'platform', '')`
        ),
        "platform",
      ],
      [Sequelize.literal(PRICE_MIN_NUMERIC_SQL), "priceMin"],
    ],
    order: [
      [Sequelize.literal(containsExpr), "DESC"],
      [Sequelize.literal(initialsExpr), "DESC"],
      [Sequelize.literal(popularityExpr), "DESC"],
      ["id", "ASC"],
    ],
    offset: skip,
    limit: limit + 1,
    raw: true,
  });

  const hasMore = suggestionsPlusOne.length > limit;
  const suggestions = hasMore
    ? suggestionsPlusOne.slice(0, limit)
    : suggestionsPlusOne;

  res.status(200).json({
    status: "success",
    meta: {
      page,
      limit,
      hasMore,
    },
    results: suggestions.map((item) => ({
      kinguinId: item.id,
      name: item.name,
      thumbnail: item.thumbnail,
      image: item.image,
      platform: item.platform,
      priceMin: item.priceMin,
    })),
  });
});

const { getShopIdsForPlatform } = require("../utils/platforms");

exports.getProduct = catchAsyncErrors(async (req, res, next) => {
  const kinguinId = Number(req.params.kinguinId);
  if (!kinguinId) return next(new appError("kinguinId must be a number", 400));

  // Lean for perf
  let p = await KinguinProduct.findByPk(kinguinId, { raw: true });
  if (!p || p.flags?.hidden === true) {
    return res.status(404).json({ status: "not_found" });
  }

  const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;

  // FX for our own price (IQD → user currency)
  const fx = await convertFromIQD(req, 1);
  const rate = fx.fxFallback ? 1 : fx.rate;
  const currency = fx.fxFallback ? "IQD" : fx.currency;

  const priceIQD = p.derived?.priceMin ?? null;
  const priceConverted = priceIQD != null ? truncate2(priceIQD * rate) : null;

  // ---------- Official/original price (ITAD) with 24h cache ----------

  const now = Date.now();
  const TWENTY_FOUR_HOURS = 48 * 60 * 60 * 1000;

  let officialStore = p.officialStore || null;

  const needsRefresh =
    !officialStore ||
    !officialStore.regularAmount ||
    !officialStore.lastUpdatedAt ||
    now - new Date(officialStore.lastUpdatedAt).getTime() > TWENTY_FOUR_HOURS;

  if (needsRefresh) {
    const title = p.remote?.originalName;

    const shopIds = getShopIdsForPlatform(p.remote?.platform);
    const pricingCfg = fixedPricingConfig();
    const country = pricingCfg.forcedPricing
      ? pricingCfg.forcedCountryCode
      : (req.user && req.user.countryCode) ||
        process.env.ITAD_DEFAULT_COUNTRY ||
        "US";
    try {
      const deal = await getOfficialDealForTitle(title, {
        country,
        shopIds,
      });

      if (deal) {
        officialStore = {
          itadGameId: deal.itadGameId,
          shopId: deal.shopId,
          shopName: deal.shopName,
          url: deal.url,
          priceAmount: deal.priceAmount * 1310.0,
          regularAmount: deal.regularAmount * 1310.0,
          cut: deal.cut,
          lastUpdatedAt: new Date(),
        };

        await KinguinProduct.update({ officialStore }, { where: { id: kinguinId } });
        p = await KinguinProduct.findByPk(kinguinId, { raw: true });
      }
    } catch (e) {
      console.error("ITAD price fetch failed", {
        kinguinId,
        error: e.message,
      });
    }
  }

  // ---------- Discount tag for the card ----------

  let discountVsOfficial = null;

  if (officialStore && priceIQD > officialStore?.priceAmount)
    officialStore = null;

  res.status(200).json({
    status: "success",
    data: {
      kinguinId: p.id,
      name: p.overrides?.name || p.remote?.name,
      description: p.overrides?.description || p.remote?.description,
      images: p.overrides?.images || p.remote?.images,

      // our store price
      currency,
      priceMinIQD: priceIQD,
      priceMin: priceConverted,

      inStock: p.derived?.inStock,
      regionId: p.remote?.regionId,
      platform: p.remote?.platform,
      regionalLimitations: p.remote?.regionalLimitations,
      countryLimitation: p.remote?.countryLimitation,
      qty: p.remote?.qty,
      updatedAt: p.remote?.updatedAt,
      activationDetails: p.remote?.activationDetails,
      videos: p.remote?.videos,
      languages: p.remote?.languages,
      systemRequirements: p.remote?.systemRequirements,
      originalName: p.remote?.originalName,
      metacriticScore: p.remote?.metacriticScore,
      genres: p.remote?.genres,
      publishers: p.remote?.publishers,
      developers: p.remote?.developers,
      releaseDate: p.remote?.releaseDate,
      tags: p.remote?.tags,

      // ITAD / official store info
      officialStore: officialStore
        ? {
            shopId: officialStore.shopId,
            shopName: officialStore.shopName,
            url: officialStore.url,
            country: officialStore.country,
            currency: officialStore.currency,
            priceAmount: officialStore.priceAmount,
            regularAmount: officialStore.regularAmount,
            cut: officialStore.cut, // store’s own discount vs its regular price
            lastUpdatedAt: officialStore.lastUpdatedAt,
          }
        : null,

      // // discount tag you can slap on the card:
      // // "Save X% vs official" — this is OUR price vs official regular price.
      // discountVsOfficial,

      remote: p.remote,

      seo: buildProductSeoDetail({ productRow: p, kinguinId: p.id }),
    },
  });
});

exports.patchOverrides = catchAsyncErrors(async (req, res, next) => {
  const id = Number(req.params.kinguinId);
  if (!id) return next(new appError("kinguinId must be a number", 400));

  const allowed = {};
  if (req.body?.name !== undefined)
    allowed["overrides.name"] = String(req.body.name);
  if (req.body?.overrides !== undefined)
    allowed["overrides.isAd"] = String(req.body.isAd);
  if (req.body?.description !== undefined)
    allowed["overrides.description"] = String(req.body.description);
  if (req.body?.images !== undefined)
    allowed["overrides.images"] = req.body.images;
  if (req.body?.coverImage !== undefined)
    allowed["overrides.coverImage"] = req.body.coverImage;
  if (!Object.keys(allowed).length)
    return next(new appError("No override fields provided", 400));

  const existing = await KinguinProduct.findByPk(id);
  if (!existing) {
    return next(new appError("product not found", 404));
  }
  const overrides = { ...(existing.overrides || {}) };
  if (allowed["overrides.name"] !== undefined)
    overrides.name = allowed["overrides.name"];
  if (allowed["overrides.isAd"] !== undefined)
    overrides.isAd = allowed["overrides.isAd"];
  if (allowed["overrides.description"] !== undefined)
    overrides.description = allowed["overrides.description"];
  if (allowed["overrides.images"] !== undefined)
    overrides.images = allowed["overrides.images"];
  if (allowed["overrides.coverImage"] !== undefined)
    overrides.coverImage = allowed["overrides.coverImage"];
  await existing.update({ overrides });
  const updated = existing.get({ plain: true });

  res.status(200).json({
    status: "success",
    data: {
      kinguinId: updated.id,
      name: updated.overrides?.name || updated.remote?.name,
      images: updated.overrides?.images || updated.remote?.images,
      description:
        updated.overrides?.description || updated.remote?.description,
    },
  });
});
