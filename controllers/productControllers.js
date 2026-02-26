// controllers/localProductsController.js
const { KinguinProduct, Sequelize } = require("../post-models"); // local mirror schema
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
const { convertFromIQD } = require("../utils/currency");
const { Op } = require("sequelize");
const {
  buildSearchDescriptor,
  buildSearchPipelines,
} = require("../utils/searchRanking");

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
const NOT_HIDDEN_SQL = `"flags"->>'hidden' IS DISTINCT FROM 'true'`;
const IN_STOCK_SQL = `"derived"->'inStock' = 'true'::jsonb`;

function toJsonbArrayLiteral(values) {
  return `'${JSON.stringify(values).replace(/'/g, "''")}'::jsonb`;
}

function toTextArrayLiteral(values) {
  const escaped = values.map((v) => `'${String(v).replace(/'/g, "''")}'`);
  return `ARRAY[${escaped.join(", ")}]::text[]`;
}

function buildListQuery(qs) {
  const where = {
    "flags.hidden": { $ne: true },
    "derived.inStock": true,
  };
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
  // const wantCards = String(qs.isCard).toLowerCase() === "true";
  // where["remote.isCard"] = wantCards ? true : { $ne: true };
  // Region
  if (qs.regionId) {
    and.push(Sequelize.where(Sequelize.json("remote.regionId"), Number(qs.regionId)));
  }

  // -------- Release date (stored as "YYYY-MM-DD" string) --------
  // If you store as Date in Mongo, swap the assignments to new Date("...T00:00:00Z")
  const releaseField = "remote.releaseDate";
  const ymd = (v) => String(v).slice(0, 10); // if you're storing as "YYYY-MM-DD" strings

  if (qs.releaseDateFrom || qs.releaseDateTo || qs.releaseDate) {
    const cond = {};
    if (qs.releaseDate) {
      cond[Op.eq] = ymd(qs.releaseDate); // exact day
    } else {
      if (qs.releaseDateFrom) cond[Op.gte] = ymd(qs.releaseDateFrom);
      if (qs.releaseDateTo) cond[Op.lte] = ymd(qs.releaseDateTo);
    }
    and.push(Sequelize.where(Sequelize.json(releaseField), cond));
  }

  // Publishers (any-of)
  if (qs.publishers) {
    const list = String(qs.publishers)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      and.push(Sequelize.where(Sequelize.json("remote.publishers"), {
        [Op.contains]: [list[0]],
      }));
    } else if (list.length > 1) {
      and.push(Sequelize.where(Sequelize.json("remote.publishers"), {
        [Op.overlap]: list,
      }));
    }
  }

  // Developers (any-of)
  if (qs.developers) {
    const list = String(qs.developers)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) {
      and.push(Sequelize.where(Sequelize.json("remote.developers"), {
        [Op.contains]: [list[0]],
      }));
    } else if (list.length > 1) {
      and.push(Sequelize.where(Sequelize.json("remote.developers"), {
        [Op.overlap]: list,
      }));
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
    }
  }

  // -------- Sorting --------
  const sortFieldMap = {
    priceMin: "derived.priceMin",
    updatedAt: "updatedAt",
    name: ["overrides.name", "remote.name"],
    releaseDate: releaseField,
    metacriticScore: "remote.metacriticScore",
  };

  const sortByKey = [
    "priceMin",
    "updatedAt",
    "name",
    "releaseDate",
    "metacriticScore",
  ].includes(qs.sortBy)
    ? qs.sortBy
    : "priceMin";

  const dir = String(qs.sortType || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  let order;
  if (sortByKey === "name") {
    order = [
      [Sequelize.literal(`"overrides"->>'name'`), dir],
      [Sequelize.literal(`"remote"->>'name'`), dir],
    ];
  } else if (sortByKey === "priceMin") {
    order = [[Sequelize.literal(PRICE_MIN_NUMERIC_SQL), dir]];
  } else if (sortByKey === "metacriticScore") {
    order = [[Sequelize.literal(METACRITIC_NUMERIC_SQL), dir]];
  } else {
    const field = sortFieldMap[sortByKey];
    order = Array.isArray(field)
      ? field.map((f) => [Sequelize.literal(`"${f.split(".")[0]}"->>'${f.split(".")[1]}'`), dir])
      : field.includes(".")
      ? [[Sequelize.literal(`"${field.split(".")[0]}"->>'${field.split(".")[1]}'`), dir]]
      : [[field, dir]];
  }

  return { where, page, limit, sort, search };
}

const {
  lookupGameIdsByTitle,
  getPricesByGameIds,
} = require("../utils/itadClient");
// const { getShopIdsForPlatform } = require("../utils/platforms"); // if you ever need shops

exports.listProducts = catchAsyncErrors(async (req, res, next) => {
  const { where, page, limit, sort, search } = buildListQuery(req.query);
  const skip = (page - 1) * limit;
  let items;
  let pageCount;

  if (search) {
    const { dataPipeline, countPipeline } = buildSearchPipelines({
      where,
      searchDescriptor: search,
      sort,
      skip,
      limit,
    });

    const [paged, countRows] = await Promise.all([
      KinguinProduct.aggregate(dataPipeline),
      KinguinProduct.aggregate(countPipeline),
    ]);

    items = paged;
    const totalMatched = countRows?.[0]?.count || 0;
    pageCount = Math.ceil(totalMatched / limit);
  } else {
    let counted = await KinguinProduct.find(where).sort(sort).clone().countDocuments();
    pageCount = Math.ceil(counted / limit);
    items = await KinguinProduct.find(where).sort(sort).skip(skip).limit(limit).lean();
  }

  const count = await KinguinProduct.countDocuments();

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
  const country =
    (req.user && req.user.countryCode) ||
    process.env.ITAD_DEFAULT_COUNTRY ||
    "US";

  // ---------- Batch ITAD refresh for items on this page ----------

  // 1) pick candidates that need refresh (missing or stale officialStore)
  const candidates = items.filter((p) => {
    const os = p.officialStore;
    if (!os || !os.regularAmount || !os.lastUpdatedAt) return true;
    const age = now - new Date(os.lastUpdatedAt).getTime();
    return age > REFRESH_INTERVAL_MS;
  });

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
            // country: officialForResponse.country,
            // currency: officialForResponse.currency,
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
    };
  });

  res.status(200).json({
    status: "success",
    meta: { pageCount, page, limit, item_count: totalFilteredCount },
    results,
  });
});

const { getOfficialDealForTitle } = require("../utils/itadClient");
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
    const country =
      (req.user && req.user.countryCode) ||
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
          // country: deal.country,
          // currency: deal.currency,
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

  // We only compute when currencies match; otherwise leave null
  // if (
  //   officialStore &&
  //   typeof priceConverted === "number" &&
  //   typeof officialStore.regularAmount === "number" &&
  //   officialStore.regularAmount > 0 &&
  //   officialStore.currency === currency
  // ) {
  //   const ratio = 1 - priceConverted / officialStore.regularAmount;
  //   discountVsOfficial = Math.max(0, Math.round(ratio * 100));
  // }
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
