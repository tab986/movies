// worker/importAll.js
// Full catalog import from Kinguin ESA -> Mongo cache (manual/one-time).
// STRICT MODE (as requested):
//  - Name MUST include "CD Key" and MUST NOT include "Account"
//  - Region must be in allow-list
//  - Platform required: normalize via synonyms/regex, must match allow-list
//  - Genres required: must match allow-list; blacklist enforced
//  - Price required: must have product.price or any offers[].price
//  - IQD price: priceIQD = round(minEUR * EUR_TO_IQD + IQD_MARKUP)
// FAST:
//  - Concurrency (default 10), HTTP keep-alive agent, retry/backoff, per-page bulkWrite
//
// Exports: runImportAll()
// CLI:    node worker/importAll.js

require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });

const https = require("https");
const axiosRaw = require("axios");
const mongoose = require("mongoose");
const KinguinProduct = require("../models/KinguinProduct");

// ------------------------------- HTTP client -------------------------------
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32, // tune if ESA rate-limits; try 16/12/8 if needed
  maxFreeSockets: 8,
  keepAliveMsecs: 10_000,
});

const axios = axiosRaw.create({
  timeout: 30_000,
  httpsAgent,
});

// --------------------------------- Config ---------------------------------
const KINGUIN_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_KEY = process.env.KINGUIN_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100); // ESA max = 100
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10); // 8–12 is a good range

const EUR_TO_IQD = Number(process.env.EUR_TO_IQD || 1535);
const IQD_MARKUP = Number(process.env.IQD_MARKUP || 5800);

// ESA quirk: withText accepts only "yes"; we omit it for speed unless you set env.
const WITH_TEXT =
  (process.env.WITH_TEXT || "").toLowerCase() === "yes" ? "yes" : "";

// ----------------------------- Strict Business -----------------------------
// Regions allowed (Iraq + common global-friendly)
const ALLOWED_REGION_IDS = [3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80];

// Platforms allow-list (canonical names)
const ALLOWED_PLATFORMS = [
  "PC Epic Games",
  "PC Battle.net",
  "PC GOG",
  "PC Mog Station",
  "PC Digital Download",
  "EA App",
  "PC Rockstar Games",
  "PC Steam",
  "PC Ubisoft Connect",
  "PC",
  "Xbox 360",
  "Xbox One",
  "Xbox Series X|S",

  // Card & console platforms (global cards)
  "PlayStation",
  "Nintendo",
  "Android",
  "Other",
];

// Genres allow-list (canonical)
const ALLOWED_GENRES = [
  "Action",
  "Adventure",
  "Anime",
  "Casual",
  "Co-op",
  "FPS",
  "Fighting",
  "Hack and Slash",
  "Hidden Object",
  "Horror",
  "Indie",
  "Life Simulation",
  "MMO",
  "Open World",
  "Platformer",
  "Point & click",
  "Puzzle",
  "RPG",
  "Racing",
  "Simulation",
  "Sport",
  "Story rich",
  "Strategy",
  "Survival",
  "Third-Person Shooter",
  "VR Games",
  "Visual Novel",
];

// Blacklist (drop if ANY present)
const BLACKLIST_GENRES = [
  "Adult Games",
  "Dating Simulator",
  "Music / Soundtrack",
  "PSN Card",
  "Online Courses",
  "Random Keys",
  "Software",
  "Subscription",
  "XBOX LIVE Gold Card",
];

// Name rules
const NAME_REQUIRE_RE = /\bcd\s*key\b/i;
const NAME_EXCLUDE_RE = /\baccount\b/i;

// ------------------------ Normalizers & helpers ----------------------------
function normStr(s) {
  return (
    String(s || "")
      .toLowerCase()
      // Treat underscores, hyphens and plus signs as separators.  When
      // Kinguin labels come through or user queries include plus signs (e.g.
      // "PC+Steam"), we want to normalize them to spaces so canonical
      // matching works correctly.
      .replace(/[_\-+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Platform synonyms map (wide)
const PLATFORM_SYNONYMS = new Map([
  ["steam", "pc steam"],
  ["pc steam", "pc steam"],

  // Ubisoft
  ["uplay", "pc ubisoft connect"],
  ["ubisoft", "pc ubisoft connect"],
  ["ubisoft connect", "pc ubisoft connect"],
  ["uplay pc", "pc ubisoft connect"],
  ["ubisoft connect pc", "pc ubisoft connect"],

  // EA
  ["origin", "ea app"],
  ["ea app", "ea app"],
  ["eaapp", "ea app"],

  // Battle.net
  ["battle.net", "pc battle.net"],
  ["battlenet", "pc battle.net"],
  ["battle net", "pc battle.net"],
  ["blizzard", "pc battle.net"],

  // Epic
  ["epic", "pc epic games"],
  ["epic games", "pc epic games"],
  ["epicgames", "pc epic games"],

  // GOG
  ["gog", "pc gog"],

  // Rockstar
  ["rockstar", "pc rockstar games"],
  ["rockstar games", "pc rockstar games"],
  ["rockstar launcher", "pc rockstar games"],
  ["social club", "pc rockstar games"],
  ["rockstar social club", "pc rockstar games"],

  // Mog Station (FFXIV)
  ["mog station", "pc mog station"],

  // Generic PC
  ["pc", "pc"],

  // PlayStation family
  ["playstation", "playstation"],
  ["playstation 4", "playstation"],
  ["playstation 3", "playstation"],
  ["ps", "playstation"],
  ["ps4", "playstation"],
  ["ps3", "playstation"],
  ["playstation network", "playstation"],
  ["psn", "playstation"],

  // Nintendo / eShop
  ["nintendo", "nintendo"],
  ["nintendo switch", "nintendo"],
  ["nintendo eshop", "nintendo"],
  ["eshop", "nintendo"],
  ["switch", "nintendo"],

  // Mobile & digital stores
  ["android", "android"],
  ["google play", "android"],
  ["play", "android"],
  ["play store", "android"],
  ["ios", "itunes"],
  ["itunes", "itunes"],
  ["itunes card", "itunes"],
  ["app store", "itunes"],
  ["app store & itunes", "itunes"],
  ["apple", "itunes"],

  // Misc / fallback
  ["other", "other"],

  // Xbox
  ["xbox one", "xbox one"],
  ["xbox series x|s", "xbox series x|s"],
  ["xbox series x", "xbox series x|s"],
  ["xbox series s", "xbox series x|s"],
  ["xbox 360", "xbox 360"],
]);

// Canonicalize platform from upstream label (and fallback to regex catch-alls)
function normalizePlatform(upstreamPlatform) {
  const n = normStr(upstreamPlatform);
  if (!n) return "";

  if (PLATFORM_SYNONYMS.has(n)) return PLATFORM_SYNONYMS.get(n);

  // Regex-based catch-alls (order matters; keep PC first)
  if (/(^|\s)pc(\s|$)/.test(n) && /(steam)/.test(n)) return "pc steam";
  if (/(^|\s)pc(\s|$)/.test(n) && /(uplay|ubisoft)/.test(n))
    return "pc ubisoft connect";
  if (/(origin|ea\s*app)/.test(n)) return "ea app";
  if (/(battle\.?net|battlenet|blizzard)/.test(n)) return "pc battle.net";
  if (/epic/.test(n)) return "pc epic games";
  if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
  if (/gog/.test(n)) return "pc gog";
  if (/mog station/.test(n)) return "pc mog station";

  // Xbox family
  if (/xbox series (x|s)|xbox series x\|s/.test(n)) return "xbox series x|s";
  if (/xbox one/.test(n)) return "xbox one";
  if (/xbox 360/.test(n)) return "xbox 360";

  // Fallback: if it's literally "pc"
  if (n === "pc") return "pc";

  return n; // return as-is; will be checked against allow-list canonical set
}

const ALLOWED_PLATFORMS_NORMALIZED = new Set(
  ALLOWED_PLATFORMS.map((p) => normalizePlatform(p))
);

function allowedPlatformMatch(upstreamPlatform) {
  const canonical = normalizePlatform(upstreamPlatform);
  return !!canonical && ALLOWED_PLATFORMS_NORMALIZED.has(canonical);
}

function normalizeGenre(g) {
  // Canonical tweaks (e.g., "third person shooter" → "third-person shooter")
  return normStr(g)
    .replace(/third person shooter/g, "third-person shooter")
    .replace(/point (and|&) click/g, "point & click")
    .replace(/story\s+rich/g, "story rich");
}

const ALLOWED_GENRES_NORMALIZED = new Set(ALLOWED_GENRES.map(normalizeGenre));
const BLACKLIST_GENRES_NORMALIZED = new Set(
  BLACKLIST_GENRES.map(normalizeGenre)
);

function allowedGenreMatch(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((g) => ALLOWED_GENRES_NORMALIZED.has(normalizeGenre(g)));
}
function bannedGenrePresent(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((g) => BLACKLIST_GENRES_NORMALIZED.has(normalizeGenre(g)));
}

// -------------------------------------------------------------------------
// Card helper
//
// Kinguin uses the "prepaid" tag on gift cards and wallet codes.  When a
// product has this tag we treat it as a card rather than a traditional game.
// Historically the importer would completely bypass region checks for cards,
// which meant that region‑locked cards (e.g. US‑only, EU‑only) would slip
// through into the catalog.  To avoid stocking region‑restricted cards in
// markets where they cannot be redeemed we now explicitly filter prepaid
// products by looking for "global" indicators.  A card is considered global
// if either its name contains the word "global" or its regionalLimitations
// field contains "region free" or "global".  See README for details.

function isGlobalCard(p) {
  // Only makes sense for prepaid items
  if (!p?.tags || !Array.isArray(p.tags) || !p.tags.includes("prepaid")) {
    return false;
  }
  const nm = String(p.name || "").toLowerCase();
  // Many global cards explicitly include "Global Activation Code" in the name
  if (/global/.test(nm)) return true;
  const regional = String(p.regionalLimitations || "").toLowerCase();
  // "REGION FREE" or any mention of global in regionalLimitations also counts
  if (/region\s*free/.test(regional) || /global/.test(regional)) return true;
  return false;
}

// ----------------------------- Derived helpers ----------------------------
function computeMinEUR(up) {
  const pool = [];
  const p = Number(up?.price);
  if (Number.isFinite(p) && p > 0) pool.push(p);
  if (Array.isArray(up?.offers)) {
    for (const o of up.offers) {
      const op = Number(o?.price);
      if (Number.isFinite(op) && op > 0) pool.push(op);
    }
  }
  return pool.length ? Math.min(...pool) : null;
}

function eurToIqd(minEur) {
  if (minEur == null) return undefined;
  return Math.round(minEur * EUR_TO_IQD + IQD_MARKUP);
}

function computeDerived(up) {
  const inStock =
    (Number(up?.qty) || 0) > 0 ||
    (Array.isArray(up?.offers) &&
      up.offers.some((o) => (Number(o?.availableQty) || 0) > 0));

  const minEur = computeMinEUR(up); // STRICT: must exist (checked gate)
  const priceMin = eurToIqd(minEur);

  return { inStock, priceMin };
}

// ------------------------------ HTTP retry --------------------------------
async function getWithRetry(
  url,
  config,
  { attempts = 5, baseDelayMs = 400 } = {}
) {
  let tryNum = 0;
  for (;;) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      const status = err?.response?.status;
      const retriable =
        status === 429 ||
        (status >= 500 && status < 600) ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT";
      tryNum++;
      if (!retriable || tryNum >= attempts) throw err;
      const jitter = Math.random() * 100;
      const delay =
        Math.min(5000, baseDelayMs * Math.pow(2, tryNum - 1)) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ------------------------------- ESA fetch --------------------------------
async function fetchPage(page) {
  const params = { limit: PAGE_SIZE, page };
  if (WITH_TEXT) params.withText = "yes"; // only valid option, else omit
  const url = `${KINGUIN_BASE}/v1/products`;

  try {
    const { data } = await getWithRetry(url, {
      headers: { "X-Api-Key": KINGUIN_KEY },
      params,
    });
    if (!data || !Array.isArray(data.results))
      throw new Error("Unexpected ESA response shape");
    return data;
  } catch (err) {
    // ESA sometimes rejects withText; retry without it once
    const detail = err?.response?.data?.detail || "";
    const prop = err?.response?.data?.propertyPath || "";
    if (prop === "withText" || /withText/i.test(detail)) {
      const { data } = await getWithRetry(url, {
        headers: { "X-Api-Key": KINGUIN_KEY },
        params: { limit: PAGE_SIZE, page },
      });
      if (!data || !Array.isArray(data.results))
        throw new Error("Unexpected ESA response shape (fallback)");
      return data;
    }
    throw err;
  }
}

// ------------------------------ Main runner --------------------------------
async function runImportAll({ logger = console } = {}) {
  if (!KINGUIN_KEY) throw new Error("KINGUIN_API_KEY missing");
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");

  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, maxPoolSize: 50 });
  logger.log("DB connected");

  // Head to get item_count
  const head = await fetchPage(1);
  const upstreamTotal = Number(head?.item_count || 0);
  const totalPages = Math.max(1, Math.ceil(upstreamTotal / PAGE_SIZE));
  logger.log(
    `[importAll] upstream_total=${upstreamTotal}, pages=${totalPages}, concurrency=${CONCURRENCY}`
  );

  // Counters
  let fetched = 0,
    kept = 0,
    pagesDone = 0;
  let skipName = 0,
    skipRegion = 0,
    skipPlatform = 0,
    skipMissingPlatform = 0;
  let skipMissingGenres = 0,
    skipGenre = 0,
    skipBannedGenre = 0,
    skipNoPrice = 0;

  async function processResults(results, label) {
    if (!Array.isArray(results) || results.length === 0) return;
    fetched += results.length;

    const ops = [];
    for (const p of results) {
      // ---- STRICT GATES ----
      // Name
      // For non-card products, we require that the name include the phrase
      // "CD Key" and that it does not include "account".  For prepaid
      // products we relax the rules: we do not require "CD Key" in the
      // name, but we still skip items whose name contains "account" to
      // avoid account resale listings.
      const nm = p?.name || "";
      const isCardItem = Array.isArray(p?.tags) && p.tags.includes("prepaid");
      if (!isCardItem) {
        if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
          skipName++;
          continue;
        }
      } else {
        // For cards: only exclude names that include "account"
        if (NAME_EXCLUDE_RE.test(nm)) {
          skipName++;
          continue;
        }
      }

      // --- Whitelisted brands ---
      const ALLOWED_BRANDS = [
        "game pass",
        "playstation",
        "discord nitro",
        "discord server boost",
        "crunchyroll",
        "steam",
        "nintendo",
        "ea",
        "apple",
        "google play",
        "civitai",
        "roblox",
        "world of warcraft",
        "iTunes",
        "spotify",
        "blizzard",
        "razer gold",
        "ea sports fc 25 points",
        "black ops 6 cod points",
        "play cabal",
        "minecraft minecoins",
        "youtube premium",
        "xbox live",
        "league of legends",
        "free fire",
        "pubg mobile",
        "fortnite",
        "marvel rivals",
        "overwatch",
        "call of duty mobile",
        "grand theft auto online shark card",
        "destiny 2 silver",
        "apex legends apex coins",
        "red dead redemption 2 online gold bars",
        "rainbow six siege credits pack",
      ];

      // --- Helper functions ---
      function isSteamName(name) {
        return /\bSteam\b/i.test(name);
      }

      function mentionsUS(name) {
        return /\bUS\b|\bU\.S\.A?\.?\b|\$\b|\bUnited States\b/i.test(name);
      }

      function mentionsARS(name) {
        return /\bARS\b/i.test(name);
      }

      // Match any other country (UK, EU, FR, etc.)
      function mentionsOtherCountry(name) {
        // Basic pattern for any 2–3 letter region or common region words
        const OTHER_COUNTRY_RE =
          /\b(EU|UK|FR|DE|CA|LATAM|BR|MEX|RU|CN|SEA|AUS|NZ|JP|KR|TR|PL|ES|IT|IN|AFRICA|MENA|ASIA|EUROPE)\b/i;
        return OTHER_COUNTRY_RE.test(name) && !mentionsUS(name);
      }

      // Should skip if Steam non-US or ARS or other country
      function shouldSkipForSteamNonUS(name) {
        return (
          (isSteamName(name) && !mentionsUS(name)) ||
          mentionsARS(name) ||
          mentionsOtherCountry(name)
        );
      }
      function isAllowedBrand(name) {
        const n = name.toLowerCase();
        return ALLOWED_BRANDS.some((b) => n.includes(b));
      }
      // Check if product name contains an allowed brand
      if (isCardItem) {
        // --- Inside your processResults() loop ---

        // ✅ Brand whitelist filter
        if (!isAllowedBrand(nm) & nm.includes("BeastUnbox")) {
          if (!nm.toLowerCase().includes("iTunes".toLowerCase())) {
            skipName++;
            continue;
          }
        }

        // 🚫 Skip if non-US region mentioned
        if (shouldSkipForSteamNonUS(nm)) {
          skipRegion++;
          continue;
        }
      }

      // continue saving or updating ops as before

      if (isCardItem && shouldSkipForSteamNonUS(nm)) {
        skipName++;
        continue;
      }
      // Region
      // Region enforcement: by default we allow only products whose regionId
      // is in the ALLOWED_REGION_IDS list.  Previously, prepaid items were
      // exempt from this check which allowed region‑locked gift cards (e.g.
      // "US Activation Code", "EUROPE - all countries") into the catalog.
      // To limit cards to globally redeemable codes we still perform a
      // region check for prepaid products: cards must be flagged as global
      // via isGlobalCard().  If neither condition is met the product is
      // skipped and counted as a region skip.
      {
        const regionOk = ALLOWED_REGION_IDS.includes(Number(p?.regionId));
        const isCard = Array.isArray(p?.tags) && p.tags.includes("prepaid");
        if (isCard) {
          // For cards: always enforce global/reg‑free requirement.  Even if the
          // regionId is in the allowed list, we don't want EU/US/region‑locked
          // gift cards.  If not global, skip.
          if (!isGlobalCard(p)) {
            skipRegion++;
            continue;
          }
        } else {
          // Non‑card products must be in the allowed region list
          if (!regionOk) {
            skipRegion++;
            continue;
          }
        }
      }

      // Genres (blacklist then allow-list)
      const genres = Array.isArray(p?.genres) ? p.genres : [];
      if (!genres.length && !p.tags?.includes("prepaid")) {
        skipMissingGenres++;
        continue;
      }
      if (bannedGenrePresent(genres) && !p.tags?.includes("prepaid")) {
        skipBannedGenre++;
        continue;
      }
      if (!allowedGenreMatch(genres) && !p.tags?.includes("prepaid")) {
        skipGenre++;
        continue;
      }

      // Platform required + normalize to canonical
      const hasPlatform = !!p?.platform;
      if (!hasPlatform && !p.tags?.includes("prepaid")) {
        skipMissingPlatform++;
        continue;
      }

      const platformCanonical = normalizePlatform(p.platform);
      if (
        !platformCanonical ||
        (!allowedPlatformMatch(platformCanonical) &&
          !p.tags?.includes("prepaid"))
      ) {
        skipPlatform++;
        continue;
      }

      // Price required
      const minEur = computeMinEUR(p);
      if (minEur == null || minEur >= 130) {
        skipNoPrice++;
        continue;
      }

      // ---- SHAPE & UPSERT ----
      const derived = computeDerived(p); // uses minEur inside
      const remote = {
        name: p.name,
        description: p.description,
        images: p.images,
        price: Number(p.price) || null,
        qty: Number(p.qty) || 0,
        offers: Array.isArray(p.offers)
          ? p.offers.map((o) => ({
              offerId: o.offerId,
              price: Number(o.price) || null,
              availableQty: Number(o.availableQty) || 0,
              merchantName: o.merchantName || null,
            }))
          : [],
        regionId: Number(p.regionId) || null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        isCard: p.tags?.includes("prepaid"),
        platform: p.platform || null, // keep original label
        genres: genres,
        activationDetails: p.activationDetails || null,
        languages: Array.isArray(p.languages) ? p.languages : [],
        systemRequirements: p.systemRequirements || null,
        originalName: p.originalName || null,
        releaseDate: p.releaseDate || null,
        publishers: Array.isArray(p.publishers) ? p.publishers : [],
        developers: Array.isArray(p.developers) ? p.developers : [],
        metacriticScore: Number.isFinite(p.metacriticScore)
          ? Number(p.metacriticScore)
          : null,
        videos: p.videos || null,
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      };

      ops.push({
        updateOne: {
          filter: { _id: Number(p.kinguinId) },
          update: {
            $set: {
              remote,
              "derived.inStock": derived.inStock,
              "derived.priceMin": derived.priceMin, // IQD final
              "derived.platformCanonical": platformCanonical, // canonical for filters
              "flags.hidden": false,
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      });
    }

    if (ops.length) {
      try {
        await KinguinProduct.bulkWrite(ops, { ordered: false });
      } catch (e) {
        logger.error(`[importAll] bulkWrite error ${label}: ${e.message}`);
      }
      kept += ops.length;
    }

    logger.log(
      `[importAll] ${label}: fetched=${results.length}, kept_now=${ops.length}, ` +
        `skipped={name:${skipName}, region:${skipRegion}, missingPlatform:${skipMissingPlatform}, platform:${skipPlatform}, ` +
        `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`
    );
  }

  // Process page 1
  await processResults(head?.results || [], "page 1");

  // Queue remaining pages with bounded parallelism
  let nextPage = 2;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, totalPages - 1) },
    async () => {
      while (true) {
        const page = nextPage++;
        if (page > totalPages) break;
        const data = await fetchPage(page);
        await processResults(data?.results || [], `page ${page}`);
        pagesDone++;
        if (pagesDone % 10 === 0 || page === totalPages) {
          logger.log(
            `[importAll] progress pagesDone=${pagesDone}/${
              totalPages - 1
            } kept=${kept}`
          );
        }
      }
    }
  );

  await Promise.all(workers);

  logger.log(
    `[importAll] DONE upstream_total=${upstreamTotal}, fetched=${fetched}, kept=${kept}, ` +
      `skipped={name:${skipName}, region:${skipRegion}, missingPlatform:${skipMissingPlatform}, platform:${skipPlatform}, ` +
      `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`
  );

  // await mongoose.disconnect();
  // logger.log("DB disconnected");

  return {
    processed: fetched,
    kept,
    skipped: {
      name: skipName,
      region: skipRegion,
      missingPlatform: skipMissingPlatform,
      platform: skipPlatform,
      missingGenres: skipMissingGenres,
      bannedGenre: skipBannedGenre,
      genre: skipGenre,
      noPrice: skipNoPrice,
    },
  };
}

module.exports = { runImportAll };

// CLI
if (require.main === module) {
  runImportAll().then(
    () => process.exit(0),
    (err) => {
      console.error("importAll failed:", err);
      process.exit(1);
    }
  );
}
