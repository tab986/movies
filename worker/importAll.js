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
  ALLOWED_PLATFORMS.map((p) => normalizePlatform(p)),
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
  BLACKLIST_GENRES.map(normalizeGenre),
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

// Optional: keep these near other pricing constants
const CARD_FIXED_FEE_IQD = 800;
const CARD_PERCENT_FEE = 0.03;

function eurToIqd(minEur, { isCard = false } = {}) {
  if (minEur == null) return undefined;

  const baseIqd = minEur * EUR_TO_IQD;

  if (isCard) {
    const cardFee = CARD_FIXED_FEE_IQD + baseIqd * CARD_PERCENT_FEE; // 800 + 3% of base
    return Math.round(baseIqd + cardFee);
  }

  return Math.round(baseIqd + IQD_MARKUP);
}

function computeDerived(up) {
  const inStock =
    (Number(up?.qty) || 0) > 0 ||
    (Array.isArray(up?.offers) &&
      up.offers.some((o) => (Number(o?.availableQty) || 0) > 0));

  const minEur = computeMinEUR(up); // STRICT: must exist (checked gate)
  const isCard = !!up?.remote?.isCard; // set earlier by your whitelist
  const priceMin = eurToIqd(minEur, { isCard });

  return { inStock, priceMin };
}

// ------------------------------ HTTP retry --------------------------------
async function getWithRetry(
  url,
  config,
  { attempts = 5, baseDelayMs = 400 } = {},
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
    `[importAll] upstream_total=${upstreamTotal}, pages=${totalPages}, concurrency=${CONCURRENCY}`,
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
      // --- Helper: normalize titles for robust matching ---
      function normalizeTitle(s) {
        return String(s)
          .toLowerCase()
          .replace(/[’‘]/g, "'")
          .replace(/[–—]/g, "-")
          .replace(/\s+/g, " ")
          .trim();
      }

      // --- Card title allowlist (exact title match, case/whitespace/quote tolerant) ---
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

        "iTunes $100 US Card",
        "iTunes $10 US Card",
        "iTunes $75 US Card",
        "iTunes $20 US Card",
        "iTunes $25 US Card",
        "iTunes $50 US Card",
        "iTunes $5 US Card",
        "iTunes $40 US Card",
        "iTunes $52 US Card",
        "iTunes $7 US Card",
        "iTunes $15 US Card",
        "iTunes $200 US Card",
        "iTunes $60 US Card",

        "Overwatch 2 - 500 Coins US Battle.net CD Key",
        "Overwatch 2 - 1000 Coins US Battle.net CD Key",
        "Overwatch 2 - 200 Coins US Battle.net CD Key",
        "Overwatch 2 - 1000 Coins DLC US XBOX One / Xbox Series X|S CD Key",
        "Overwatch 2 - 10000 (+1600 Bonus) Coins DLC US XBOX One / Xbox Series X|S CD Key",
        "Overwatch 2 - 5000 (+700 Bonus) Coins DLC US XBOX One / Xbox Series X|S CD Key",
        "Overwatch 2 - 2000 (+200 Bonus) Coins DLC US XBOX One / Xbox Series X|S CD Key",

        "Google Play USD 35 Gift Card US",
        "Google Play USD 8 Gift Card US",
        "Google Play USD 9 Gift Card US",
        "Google Play USD 6 Gift Card US",
        "Google Play USD 7 Gift Card US",
        "Google Play USD 65 Gift Card US",
        "Google Play USD 150 Gift Card US",
        "Google Play USD 90 Gift Card US",
        "Google Play USD 55 Gift Card US",
        "Google Play USD 70 Gift Card US",
        "Google Play USD 80 Gift Card US",
        "Google Play USD 60 Gift Card US",
        "Google Play USD 45 Gift Card US",

        "Xbox Game Pass Ultimate - 1 Month Subscription Card US",
        "Xbox Game Pass Ultimate - 1 Month Subscription Card US (NON-STACKABLE)",
        "XBOX Game Pass Essential - 3 Month Subscription Card US",
        "XBOX Game Pass Essential - 12 Month Subscription Card US",
        "Xbox Game Pass Ultimate - 3 Month Subscription Card US",
        "XBOX Game Pass Essential - 6 Month Subscription Card US",

        "PlayStation Network Card $5 US",
        "PlayStation Network Card $35 US",
        "PlayStation Network Card $4 US",
        "PlayStation Network Card $1 US",
        "PlayStation Network Card $60 US",
        "PlayStation Network Card $150 US",
        "PlayStation Network Card $125 US",
        "PlayStation Network Card $2 US",
        "PlayStation Network Card $250 US",
        "PlayStation Network Card $11 US",
        "PlayStation Network Card $45 US",
        "PlayStation Network Card $6 US",
        "Spotify 12-month Premium Account",
      ];

      // Precompute normalized set for O(1) lookups
      const CARD_TITLE_SET = new Set(CARD_TITLE_WHITELIST.map(normalizeTitle));
      function isWhitelistedCard(name) {
        return CARD_TITLE_SET.has(normalizeTitle(name));
      }

      // --- Banned merchants are kept (applied globally) ---
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

      // --- Optional: keep your brand list if used elsewhere ---

      // --- Inside your processing loop ---

      const lower = nm.toLowerCase();

      // 🚫 Skip banned merchants
      if (BANNED_SOURCES.some((bad) => lower.includes(bad.toLowerCase()))) {
        skipName++;
        continue;
      }

      // ✅ Decide if this item is a "card" purely by title match
      const isCard = isWhitelistedCard(nm);

      // 🔎 Name filters apply to non-card items only
      if (!isCard) {
        if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
          skipName++;
          continue;
        }
      }
      if (!isCard) {
        const regionOk = ALLOWED_REGION_IDS.includes(Number(p?.regionId));
        if (!regionOk) {
          skipRegion++;
          continue;
        }
      }

      // 🏷️ Mark as card for downstream queries/UI (no reliance on tags/prepaid)
      p.remote = p.remote || {};
      if (isCard) {
        p.remote.isCard = true;
      } else {
        // optional: ensure it's not incorrectly flagged
        if (p.remote.isCard === true) delete p.remote.isCard;
      }

      const genres = Array.isArray(p?.genres) ? p.genres : [];
      const platformCanonical = normalizePlatform(p.platform);
      const minEur = computeMinEUR(p);

      // Genres (blacklist then allow-list)
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

        // Platform required + normalize to canonical
        const hasPlatform = !!p?.platform;
        if (!hasPlatform) {
          skipMissingPlatform++;
          continue;
        }

        if (!platformCanonical || !allowedPlatformMatch(platformCanonical)) {
          skipPlatform++;
          continue;
        }

        // Price required
        if (minEur == null || minEur >= 130) {
          skipNoPrice++;
          continue;
        }
      }

      // ---- SHAPE & UPSERT ----
      const derived = computeDerived(p); // uses minEur inside
      const remote = {
        name: p.name,
        countryLimitation: p.countryLimitation,
        regionalLimitations: p.regionalLimitations,
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
        isCard: isCard,
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
        `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`,
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
            } kept=${kept}`,
          );
        }
      }
    },
  );

  await Promise.all(workers);

  logger.log(
    `[importAll] DONE upstream_total=${upstreamTotal}, fetched=${fetched}, kept=${kept}, ` +
      `skipped={name:${skipName}, region:${skipRegion}, missingPlatform:${skipMissingPlatform}, platform:${skipPlatform}, ` +
      `missingGenres:${skipMissingGenres}, bannedGenre:${skipBannedGenre}, genre:${skipGenre}, noPrice:${skipNoPrice}}`,
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
    },
  );
}
