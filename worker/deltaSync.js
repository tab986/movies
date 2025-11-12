// worker/deltaSync.js
// Incremental sync using ESA `updatedSince`, STRICT rules identical to importAll:
//  - Name must include "CD Key" and NOT include "Account"
//  - Region allow-list
//  - Platform required + normalized to canonical; must be in allow-list
//  - Genres required + allow-list; blacklist enforced
//  - Price required (min of product.price and offers[].price)
//  - IQD price = round(EUR*EUR_TO_IQD + IQD_MARKUP)
// Fast: concurrency, HTTP keep-alive, retry/backoff, bulkWrite per page.

require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });

const https = require("https");
const axiosRaw = require("axios");
const mongoose = require("mongoose");
const KinguinProduct = require("../models/KinguinProduct");
const { SyncState, SyncProfile } = require("../models/SyncState");

// ------------------------------- HTTP client -------------------------------
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
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

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);

const EUR_TO_IQD = Number(process.env.EUR_TO_IQD || 1535);
const IQD_MARKUP = Number(process.env.IQD_MARKUP || 5800);

// ----------------------------- Strict Business -----------------------------
const ALLOWED_REGION_IDS = [3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80];

// Platforms allow-list (canonical names).  See importAll.js for full list.
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

const NAME_REQUIRE_RE = /\bcd\s*key\b/i;
const NAME_EXCLUDE_RE = /\baccount\b/i;

// ----------------------------- Additional gates (cards & bans) -----------------------------
// List of merchants whose listings should be dropped entirely.  Matches are
// case-insensitive and partial (substring).
const BANNED_SOURCES = [
  "RBLXReaper",
  "SteamLevelU",
  "RustEasy",
  "GGHeaven",
  "ROCheap",
  "AliveAI",
  "Earnweb",
  "BeastUnbox",
];

// Card title allowlist (exact title match, case/whitespace/quote tolerant).
// These are products considered "cards" and thus skip certain strict gates.
const CARD_TITLE_WHITELIST = [
  "Discord Nitro - 1 Year Subscription Code",
  "Discord Nitro - 1 Month Subscription Code",
  "Discord Server - 14x Boost - 3 Months",
  "Discord Server - 14x Boost - 1 Month",
  "Discord Server - 14x Boost - 1 Week",
  "Discord Server - 1000 Offline User Boost - 1 Month",
  "Discord Server - 1000 Online User Boost - 1 Month",
  "Discord Server - 14x Boost - 12 Months",
  "Discord Server - 14x Boost - 2 Months",
  "Discord Server - 7x Boost - 1 Month",
  "Discord Server - 7x Boost - 3 Months",

  "Crunchyroll - 1 Month Fan Subscription",
  "Crunchyroll - 3 Months Fan Subscription",
  "Crunchyroll - 12 Months Fan Subscription",
  "Crunchyroll Premium Mega Fan Plan 1 Year Subscription",

  "EA Play - 1 Month Subscription XBOX One / Xbox Series X|S CD Key",
  "EA Play 12 Months Subscription XBOX One / Xbox Series X|S CD Key",
  "EA Play - 6 Months Subscription XBOX One / Xbox Series X|S CD Key",
  "EA Play Pro - 3 Month Subscription Key",

  "Civitai.com 10k Buzz Gift Card",
  "Civitai.com 25k Buzz Gift Card",
  "Civitai.com 50k Buzz Gift Card",
  "Civitai.com 3-month Bronze Membership Gift Card",
  "Civitai.com 6-month Bronze Membership Gift Card",
  "Civitai.com 12-month Bronze Membership Gift Card",
  "Civitai.com 3-month Silver Membership Gift Card",
  "Civitai.com 6-month Silver Membership Gift Card",
  "Civitai.com 12-month Silver Membership Gift Card",
  "Civitai.com 3-month Gold Membership Gift Card",
  "Civitai.com 6-month Gold Membership Gift Card",
  "Civitai.com 12-month Gold Membership Gift Card",

  "Roblox Game eCard $10",
  "Roblox Game eCard $25",
  "Roblox Game eCard $15",
  "Roblox Game eCard $20",
  "Roblox Game eCard $50",
  "Roblox Game eCard $5",
  "Roblox Game eCard $1.5",

  "Razer Gold USD 5 Global",
  "Razer Gold USD 20 Global",
  "Razer Gold USD 50 Global",
  "Razer Gold USD 100 Global",
  "Razer Gold USD 300 Global",
  "Razer Gold USD 200 Global",
  "Razer Gold USD 25 Global",
  "Razer Gold $1 Global",
  "Razer Gold $2 Global",
  "Razer Gold USD 30 Global",
  "Razer Gold USD 10 Global",
  "Razer Gold USD 13 Global",
  "Razer Gold USD 16 Global",

  "EA SPORTS FC 26 - 1050 FC Points PC EA App CD Key",
  "EA SPORTS FC 26 - 2800 FC Points PC EA App CD Key",
  "EA SPORTS FC 26 - 5900 FC Points PC EA App CD Key",
  "EA SPORTS FC 26 - 1050 FC Points XBOX One / Xbox Series X|S CD Key",
  "EA SPORTS FC 26 - 2800 FC Points XBOX One / Xbox Series X|S CD Key",
  "EA SPORTS FC 26 - 5900 FC Points XBOX One / Xbox Series X|S CD Key",
  "EA SPORTS FC 26 - 12000 FC Points XBOX One / Xbox Series X|S CD Key",
  "EA SPORTS FC 26 - 18500 FC Points XBOX One / Xbox Series X|S CD Key",

  "Steam Gift Card $50 Global Activation Code",
  "Steam Gift Card $20 Global Activation Code",
  "Steam Gift Card $5 Global Activation Code",
  "Steam Gift Card $10 Global Activation Code",
  "Steam Gift Card $2 Global Activation Code",
  "Steam Gift Card $100 Global Activation Code",
  "Steam Gift Card $1 Global Activation Code",
  "Steam Gift Card $30 Global Activation Code",
  "Steam Gift Card $15 Global Activation Code",
  "Steam Gift Card $12 Global Activation Code",
  "Steam Gift Card $4 Global Activation Code",
  "Steam Gift Card $6 Global Activation Code",
  "Steam Gift Card $16 Global Activation Code",
  "Steam Gift Card $26 Global Activation Code",
  "Steam Gift Card $33 Global Activation Code",
  "Steam Gift Card $40 Global Activation Code",
  "Steam Gift Card $110 Global Activation Code",
  "Steam Gift Card $9 Global Activation Code",
  "Steam Gift Card $115 Global Activation Code",
  "Steam Gift Card $45 Global Activation Code",

  "Minecraft Minecoins Pack - 3500 Coins CD Key",
  "Minecraft Minecoins Pack - 330 Coins CD Key",
  "Minecraft Minecoins Pack - 1000 Coins CD Key",
  "Minecraft Minecoins Pack - 500 Coins CD Key",

  "XBOX Live 800 Points",

  "Garena Free Fire - 100 + 10 Diamonds CD Key",
  "Garena Free Fire - 1080 + 108 Diamonds CD Key",
  "Garena Free Fire - 210 + 21 Diamonds CD Key",
  "Garena Free Fire - 530 + 53 Diamonds CD Key",
  "Garena Free Fire - 2200 + 220 Diamonds CD Key",
  "Garena Free Fire - 2200 + 220 Diamonds Reidos Voucher",
  "Garena Free Fire - 1080 + 108 Diamonds Reidos Voucher",
  "Garena Free Fire - 530 + 53 Diamonds Reidos Voucher",
  "Garena Free Fire - 210 + 21 Diamonds Reidos Voucher",
  "Garena Free Fire - 100 + 10 Diamonds Reidos Voucher",

  "PUBG Mobile - 600 + 60 UC CD Key",
  "PUBG Mobile - 1500 + 300 UC CD Key",
  "PUBG Mobile - 3000 + 850 UC CD Key",
  "PUBG Mobile - 300 + 25 UC CD Key",
  "PUBG Mobile - 60 UC CD Key",
  "PUBG Mobile - 6000 + 2100 UC CD Key",
  "PUBG Mobile - 12000 + 4200 UC CD Key",
  "PUBG Mobile - 18000 + 6300 UC CD Key",
  "PUBG Mobile - 24000 + 8400 UC CD Key",
  "PUBG Mobile - 30000 + 10500 UC CD Key",
  "PUBG Mobile - 10 UC CD Key",

  "Fortnite USD 15 PC Epic Games Gift Card",
  "Fortnite USD 30 PC Epic Games Gift Card",
  "Fortnite USD 50 PC Epic Games Gift Card",
  "Fortnite USD 100 PC Epic Games Gift Card",
  "Fortnite USD 25 PC Epic Games Gift Card",
  "Fortnite USD 75 PC Epic Games Gift Card",

  "Grand Theft Auto Online - $10,000,000 Megalodon Shark Cash Card PC Activation Code",

  "Apex Legends - 4350 Apex Coins EA App CD Key",
  "Apex Legends - 1000 Apex Coins XBOX One CD Key",
  "Apex Legends - 1000 Apex Coins EA App CD Key",

  "CSGO-Skins $10 Gift Card",
  "CSGO-Skins $2 Gift Card",
  "CSGO-Skins $5 Gift Card",

  "Tom Clancy's Rainbow Six Siege - 2670 Credits Pack XBOX One CD Key",
];

// Normalize card titles for robust matching.
function normalizeTitle(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Precompute normalized set for O(1) lookups
const CARD_TITLE_SET = new Set(CARD_TITLE_WHITELIST.map(normalizeTitle));

function isWhitelistedCard(name) {
  return CARD_TITLE_SET.has(normalizeTitle(name));
}

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

  // Mog Station
  ["mog station", "pc mog station"],

  // Generic PC
  ["pc", "pc"],

  // Xbox
  ["xbox one", "xbox one"],
  ["xbox series x|s", "xbox series x|s"],
  ["xbox series x", "xbox series x|s"],
  ["xbox series s", "xbox series x|s"],
  ["xbox 360", "xbox 360"],
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
]);

function normalizePlatform(upstreamPlatform) {
  const n = normStr(upstreamPlatform);
  if (!n) return "";

  if (PLATFORM_SYNONYMS.has(n)) return PLATFORM_SYNONYMS.get(n);

  if (/(^|\s)pc(\s|$)/.test(n) && /(steam)/.test(n)) return "pc steam";
  if (/(^|\s)pc(\s|$)/.test(n) && /(uplay|ubisoft)/.test(n))
    return "pc ubisoft connect";
  if (/(origin|ea\s*app)/.test(n)) return "ea app";
  if (/(battle\.?net|battlenet|blizzard)/.test(n)) return "pc battle.net";
  if (/epic/.test(n)) return "pc epic games";
  if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
  if (/gog/.test(n)) return "pc gog";
  if (/mog station/.test(n)) return "pc mog station";

  if (/xbox series (x|s)|xbox series x\|s/.test(n)) return "xbox series x|s";
  if (/xbox one/.test(n)) return "xbox one";
  if (/xbox 360/.test(n)) return "xbox 360";

  if (n === "pc") return "pc";

  return n;
}

const ALLOWED_PLATFORMS_NORMALIZED = new Set(
  ALLOWED_PLATFORMS.map((p) => normalizePlatform(p))
);

function allowedPlatformMatch(upstreamPlatform) {
  const canonical = normalizePlatform(upstreamPlatform);
  return !!canonical && ALLOWED_PLATFORMS_NORMALIZED.has(canonical);
}

function normalizeGenre(g) {
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

// Card pricing constants
const CARD_FIXED_FEE_IQD = 800;
const CARD_PERCENT_FEE = 0.03;

// Convert EUR to IQD with optional card fees.  For normal games, applies a
// fixed markup (IQD_MARKUP).  For card products, applies a fixed fee plus
// a percentage of the base amount (see importAll.js).
function eurToIqd(minEur, { isCard = false } = {}) {
  if (minEur == null) return undefined;
  const baseIqd = minEur * EUR_TO_IQD;
  if (isCard) {
    const cardFee = CARD_FIXED_FEE_IQD + baseIqd * CARD_PERCENT_FEE;
    return Math.round(baseIqd + cardFee);
  }
  return Math.round(baseIqd + IQD_MARKUP);
}

function computeDerived(up, { isCard = false } = {}) {
  const inStock =
    (Number(up?.qty) || 0) > 0 ||
    (Array.isArray(up?.offers) &&
      up.offers.some((o) => (Number(o?.availableQty) || 0) > 0));

  const minEur = computeMinEUR(up);
  const priceMin = eurToIqd(minEur, { isCard });

  return { inStock, priceMin };
}

// -----------------------------------------------------------------------------
// Reprice all documents in the collection using current FX and fee settings.
//
// This helper walks through every stored KinguinProduct and recomputes
// `derived.inStock` and `derived.priceMin` using the existing `remote`
// information.  Without contacting the upstream API, this ensures that
// adjustments to EUR_TO_IQD, IQD_MARKUP, CARD_FIXED_FEE_IQD or
// CARD_PERCENT_FEE propagate to existing records.  It also applies the
// banned merchant filter to each product's offers.  By running this after
// every incremental sync, we guarantee that price fields stay consistent
// regardless of whether upstream items change or FX and fee parameters change.
async function repriceAll() {
  // Use a cursor to avoid loading the entire collection into memory at once
  const cursor = KinguinProduct.find({}, { _id: 1, remote: 1, derived: 1 })
    .lean()
    .cursor();

  const bannedMerchants = BANNED_SOURCES.map((s) => s.toLowerCase());
  const ops = [];
  let processed = 0;
  for await (const doc of cursor) {
    processed++;
    const remote = doc.remote || {};
    const isCard = !!remote.isCard;

    // Filter offers to exclude banned merchants when recomputing price
    const offers = Array.isArray(remote.offers) ? remote.offers : [];
    const filteredOffers = offers.filter((o) => {
      const m = String(o?.merchantName || "").toLowerCase();
      return !bannedMerchants.some((bad) => m.includes(bad));
    });
    // Rebuild a simplified upstream-like object for pricing
    const up = {
      price: remote.price,
      qty: remote.qty,
      offers: filteredOffers,
    };
    const derived = computeDerived(up, { isCard });
    // Only update if values differ to minimize writes
    const updates = {};
    if (
      doc.derived?.inStock !== derived.inStock ||
      doc.derived?.priceMin !== derived.priceMin
    ) {
      updates["derived.inStock"] = derived.inStock;
      updates["derived.priceMin"] = derived.priceMin;
    }
    if (Object.keys(updates).length) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: updates },
        },
      });
    }

    // Flush operations in batches to avoid memory buildup
    if (ops.length >= 1000) {
      await KinguinProduct.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length) {
    await KinguinProduct.bulkWrite(ops, { ordered: false });
  }
  console.log(`[repriceAll] processed=${processed}`);
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
async function fetchPage(page, updatedSince, filters) {
  const url = `${KINGUIN_BASE}/v1/products`;
  const baseParams = { ...filters, updatedSince, limit: PAGE_SIZE, page };

  // ESA quirk: withText only accepts "yes", else omit; try fast path without it
  try {
    const { data } = await getWithRetry(url, {
      headers: { "X-Api-Key": KINGUIN_KEY },
      params: baseParams,
    });
    if (!data || !Array.isArray(data.results))
      throw new Error("Unexpected ESA response shape");
    return data;
  } catch (err) {
    const detail = err?.response?.data?.detail || "";
    const prop = err?.response?.data?.propertyPath || "";
    if (prop === "withText" || /withText/i.test(detail)) {
      const { data } = await getWithRetry(url, {
        headers: { "X-Api-Key": KINGUIN_KEY },
        params: { ...baseParams, withText: "yes" },
      });
      if (!data || !Array.isArray(data.results))
        throw new Error("Unexpected ESA response shape (fallback)");
      return data;
    }
    throw err;
  }
}

// ------------------------------ Main runner --------------------------------
async function ensureConnection() {
  if (mongoose.connection.readyState === 1) return false;
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB,
    maxPoolSize: 50,
  });
  return true;
}

function isoNowZ() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function runOnce({
  // Allow callers or env to override overlap; default to 5 minutes
  overlapMinutes = Number(process.env.SYNC_OVERLAP_MINUTES || 5),
} = {}) {
  // Always ensure we have a DB connection; track whether we opened it here
  const openedHere = await ensureConnection();
  const t0 = Date.now();

  try {
    const profile = await SyncProfile.findOne({ name: "default" }).lean();
    const filters = profile?.filters || {};
    const fields = profile?.fields || [];

    // Determine the last sync time from DB; if missing, create a window based on overlap
    const state = await SyncState.findOne({ key: "lastSync" }).lean();
    let sinceISO;
    if (!state?.value) {
      // First run or missing state: back off by overlap to avoid missing items
      sinceISO = new Date(Date.now() - overlapMinutes * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
    } else {
      // Always subtract overlap on every run; ESA API uses strict comparison and clocks may drift
      const last = new Date(state.value);
      sinceISO = new Date(last.getTime() - overlapMinutes * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
    }

    const head = await fetchPage(1, sinceISO, filters);
    const upstreamTotal = Number(head?.item_count || 0);
    const totalPages = Math.max(1, Math.ceil(upstreamTotal / PAGE_SIZE));

    console.log(
      `[deltaSync] since=${sinceISO}, upstream_total=${upstreamTotal}, pages=${totalPages}`
    );

    let fetched = 0;
    let kept = 0;
    let skipName = 0,
      skipRegion = 0,
      skipPlatform = 0,
      skipMissingPlatform = 0,
      skipMissingGenres = 0,
      skipGenre = 0,
      skipBannedGenre = 0,
      skipNoPrice = 0;

    // Precompute a lower-case list of banned merchant substrings for filtering offers
    const bannedMerchants = BANNED_SOURCES.map((s) => s.toLowerCase());

    async function processResults(results, label) {
      if (!Array.isArray(results) || !results.length) return;
      fetched += results.length;

      const ops = [];
      for (const p of results) {
        // STRICT gates
        // Name gates and determination of card status
        const nm = p?.name || "";

        // Determine if whitelisted card; name filters only apply to non-card items
        const isCard = isWhitelistedCard(nm);

        if (!isCard) {
          // Only enforce CD Key/Account filters on non-card products
          if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
            skipName++;
            continue;
          }
        }

        // Region must be allowed
        if (!ALLOWED_REGION_IDS.includes(Number(p?.regionId))) {
          skipRegion++;
          continue;
        }

        const genres = Array.isArray(p?.genres) ? p.genres : [];
        const platformCanonical = normalizePlatform(p.platform);

        // For non-card items, apply genre/platform/price gates
        if (!isCard) {
          if (!genres.length) {
            skipMissingGenres++;
            continue;
          }
          if (bannedGenrePresent(genres)) {
            skipBannedGenre++;
            continue;
          }
          if (!allowedGenreMatch(genres)) {
            skipGenre++;
            continue;
          }

          const hasPlatform = !!p?.platform;
          if (!hasPlatform) {
            skipMissingPlatform++;
            continue;
          }
          if (!platformCanonical || !allowedPlatformMatch(platformCanonical)) {
            skipPlatform++;
            continue;
          }
        }

        // Prepare offers, filtering out banned merchants
        const allOffers = Array.isArray(p.offers) ? p.offers : [];
        const filteredOffers = allOffers.filter((o) => {
          const m = String(o?.merchantName || "").toLowerCase();
          return !bannedMerchants.some((bad) => m.includes(bad));
        });

        // Compute minimum EUR price considering only allowed offers
        const minEur = computeMinEUR({
          price: p.price,
          offers: filteredOffers,
        });

        // For non-card items, price is required and must be below threshold
        if (!isCard) {
          if (minEur == null || minEur >= 130) {
            skipNoPrice++;
            continue;
          }
        }

        // Compute derived values (inStock, priceMin) using filtered offers
        const derived = computeDerived(
          { price: p.price, qty: p.qty, offers: filteredOffers },
          { isCard }
        );

        // Build remote shape; include isCard flag for downstream UI/queries
        const remote = {
          name: p.name,
          description: p.description,
          images: p.images,
          price: Number(p.price) || null,
          qty: Number(p.qty) || 0,
          offers: filteredOffers.map((o) => ({
            offerId: o.offerId,
            price: Number(o.price) || null,
            availableQty: Number(o.availableQty) || 0,
            merchantName: o.merchantName || null,
          })),
          regionId: Number(p.regionId) || null,
          tags: Array.isArray(p.tags) ? p.tags : [],
          // Mark as card for downstream queries/UI
          isCard: isCard,
          platform: p.platform || null, // keep original label
          genres,
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          activationDetails: p.activationDetails || null,
          videos: p.videos || null,
          languages: Array.isArray(p.languages) ? p.languages : [],
          systemRequirements: p.systemRequirements || null,
          originalName: p.originalName || null,
          publishers: Array.isArray(p.publishers) ? p.publishers : [],
          developers: Array.isArray(p.developers) ? p.developers : [],
          releaseDate: p.releaseDate || null,
          metacriticScore: Number.isFinite(p.metacriticScore)
            ? Number(p.metacriticScore)
            : null,
        };

        ops.push({
          updateOne: {
            filter: { _id: Number(p.kinguinId) },
            update: {
              $set: {
                remote,
                "derived.inStock": derived.inStock,
                "derived.priceMin": derived.priceMin,
                "derived.platformCanonical": platformCanonical,
                "flags.hidden": false,
              },
              $setOnInsert: { createdAt: new Date() },
            },
            upsert: true,
          },
        });
      }

      if (ops.length) {
        await KinguinProduct.bulkWrite(ops, { ordered: false });
        kept += ops.length;
      }

      console.log(
        `[deltaSync] ${label}: fetched=${results.length}, kept_now=${ops.length}, ` +
          `skipped={name:${skipName}, region:${skipRegion}, missingPlatform:${skipMissingPlatform}, platform:${skipPlatform}, ` +
          `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`
      );
    }

    // Process the first page synchronously
    await processResults(head?.results || [], "page 1");

    // Process remaining pages concurrently
    let nextPage = 2;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - 1) },
      async () => {
        while (true) {
          const page = nextPage++;
          if (page > totalPages) break;
          const data = await fetchPage(page, sinceISO, filters);
          await processResults(data?.results || [], `page ${page}`);
        }
      }
    );

    await Promise.all(workers);

    // Write sync state with current timestamp to avoid skipping updates
    await SyncState.updateOne(
      { key: "lastSync" },
      { $set: { value: isoNowZ() } },
      { upsert: true }
    );

    const ms = Date.now() - t0;
    console.log(
      `[deltaSync] DONE pages=${totalPages} in ${ms}ms; fetched=${fetched}, kept=${kept}, ` +
        `skipped={name:${skipName}, region:${skipRegion}, missingPlatform:${skipMissingPlatform}, platform:${skipPlatform}, ` +
        `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`
    );

    // After syncing new items, recompute pricing for all existing documents to
    // reflect current FX rates and card fees.  This ensures that changes in
    // EUR_TO_IQD, IQD_MARKUP or card fee constants propagate immediately.
    // await repriceAll();

    return { updated: kept };
  } finally {
    if (openedHere) await mongoose.disconnect();
  }
}

if (require.main === module) {
  runOnce().then(
    (r) => {
      console.log("[deltaSync] summary:", r);
      process.exit(0);
    },
    (err) => {
      console.error("deltaSync failed:", err);
      process.exit(1);
    }
  );
}

module.exports = { runOnce };
