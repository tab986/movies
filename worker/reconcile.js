// worker/reconcile.js
// Reconcile: builds the "seen" set from ESA using the SAME strict rules and
// canonical platform normalization, then soft-hides locals not seen; unhides
// ones that reappear.

require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });

const https = require("https");
const axiosRaw = require("axios");
const mongoose = require("mongoose");
const KinguinProduct = require("../models/KinguinProduct");

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

// ----------------------------- Strict Business -----------------------------
const ALLOWED_REGION_IDS = [3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80];

// Platforms allow-list (canonical names).  Matches importAll.js
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
// Merchants to skip entirely (case-insensitive substring match)
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

// Card title allowlist (exact title match, case/whitespace/quote tolerant).  If a
// product's name is found in this set, it's treated as a card and many strict
// gates (name, genre, platform, price) are relaxed.  Keep this list in
// sync with importAll.js.
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

function normalizeTitle(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
const CARD_TITLE_SET = new Set(CARD_TITLE_WHITELIST.map(normalizeTitle));
function isWhitelistedCard(name) {
  return CARD_TITLE_SET.has(normalizeTitle(name));
}

// ------------------------ Normalizers & helpers ----------------------------
function normStr(s) {
  return (
    String(s || "")
      .toLowerCase()
      // Treat underscores, hyphens and plus signs as separators so that
      // labels like "PC+Steam" normalize correctly.
      .replace(/[_\-+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const PLATFORM_SYNONYMS = new Map([
  ["steam", "pc steam"],
  ["pc steam", "pc steam"],

  ["uplay", "pc ubisoft connect"],
  ["ubisoft", "pc ubisoft connect"],
  ["ubisoft connect", "pc ubisoft connect"],
  ["uplay pc", "pc ubisoft connect"],
  ["ubisoft connect pc", "pc ubisoft connect"],

  ["origin", "ea app"],
  ["ea app", "ea app"],

  ["battle.net", "pc battle.net"],
  ["battlenet", "pc battle.net"],
  ["battle net", "pc battle.net"],
  ["blizzard", "pc battle.net"],

  ["epic", "pc epic games"],
  ["epic games", "pc epic games"],
  ["epicgames", "pc epic games"],

  ["gog", "pc gog"],

  ["rockstar", "pc rockstar games"],
  ["rockstar games", "pc rockstar games"],
  ["rockstar launcher", "pc rockstar games"],
  ["social club", "pc rockstar games"],
  ["rockstar social club", "pc rockstar games"],

  ["mog station", "pc mog station"],

  ["pc", "pc"],

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

// ----------------------------- Pricing helpers ----------------------------
// Compute the minimum EUR price available for a product, considering both
// product.price and any offer prices.  Returns null if none are valid.
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
  const url = `${KINGUIN_BASE}/v1/products`;
  const params = { limit: PAGE_SIZE, page };
  try {
    const { data } = await getWithRetry(url, {
      headers: { "X-Api-Key": KINGUIN_KEY },
      params, // no withText (fast path)
    });
    if (!data || !Array.isArray(data.results))
      throw new Error("Unexpected ESA response shape");
    return data;
  } catch (err) {
    // ESA "withText" quirk (rare on reconcile path, but safe to handle)
    const detail = err?.response?.data?.detail || "";
    const prop = err?.response?.data?.propertyPath || "";
    if (prop === "withText" || /withText/i.test(detail)) {
      const { data } = await getWithRetry(url, {
        headers: { "X-Api-Key": KINGUIN_KEY },
        params: { ...params, withText: "yes" },
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

async function run() {
  const openedHere = await ensureConnection();
  const t0 = Date.now();

  try {
    const head = await fetchPage(1);
    const upstreamTotal = Number(head?.item_count || 0);
    const totalPages = Math.max(1, Math.ceil(upstreamTotal / PAGE_SIZE));
    console.log(
      `[reconcile] upstream_total=${upstreamTotal}, pages=${totalPages}`
    );

    const seen = new Set();

    const includeIfAllowed = (p) => {
      const nm = p?.name || "";
      const lower = nm.toLowerCase();

      // 🚫 Skip banned merchants
      if (
        BANNED_SOURCES.some((bad) => lower.includes(bad.toLowerCase()))
      ) {
        return false;
      }

      // Decide if this product is a card via whitelist
      const isCard = isWhitelistedCard(nm);

      // Name rules apply only to non-card items
      if (!isCard) {
        if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
          return false;
        }
      }

      // Region must be allowed
      if (!ALLOWED_REGION_IDS.includes(Number(p?.regionId))) {
        return false;
      }

      const genres = Array.isArray(p?.genres) ? p.genres : [];
      const platformCanonical = normalizePlatform(p.platform);
      const minEur = computeMinEUR(p);

      // For non-card items, require genres, platform and price threshold
      if (!isCard) {
        if (!genres.length) return false;
        if (bannedGenrePresent(genres)) return false;
        if (!allowedGenreMatch(genres)) return false;

        const hasPlatform = !!p?.platform;
        if (!hasPlatform) return false;
        if (!platformCanonical || !allowedPlatformMatch(platformCanonical))
          return false;

        // Price must exist and be below threshold for non-cards
        if (minEur == null || minEur >= 130) return false;
      }
      // For card items we relax genre/platform/price gates (already skipped above)
      return true;
    };

    (head?.results || []).forEach((r) => {
      if (includeIfAllowed(r)) seen.add(Number(r.kinguinId));
    });

    let nextPage = 2;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - 1) },
      async () => {
        while (true) {
          const page = nextPage++;
          if (page > totalPages) break;
          const data = await fetchPage(page);
          (data?.results || []).forEach((r) => {
            if (includeIfAllowed(r)) seen.add(Number(r.kinguinId));
          });
        }
      }
    );

    await Promise.all(workers);

    // Compare with local DB
    const locals = await KinguinProduct.find(
      {},
      { _id: 1, "flags.hidden": 1 }
    ).lean();
    const toHide = [];
    const toUnhide = [];
    for (const doc of locals) {
      if (!seen.has(doc._id)) {
        if (!doc.flags?.hidden) toHide.push(doc._id);
      } else {
        if (doc.flags?.hidden) toUnhide.push(doc._id);
      }
    }

    if (toHide.length) {
      await KinguinProduct.updateMany(
        { _id: { $in: toHide } },
        { $set: { "flags.hidden": true, "flags.removedAt": new Date() } }
      );
    }
    if (toUnhide.length) {
      await KinguinProduct.updateMany(
        { _id: { $in: toUnhide } },
        { $set: { "flags.hidden": false }, $unset: { "flags.removedAt": 1 } }
      );
    }

    const ms = Date.now() - t0;
    console.log(
      `[reconcile] DONE in ${ms}ms; toHide=${toHide.length}, toUnhide=${toUnhide.length}, seen=${seen.size}`
    );

    return {
      hidden: toHide.length,
      unhidden: toUnhide.length,
      seen: seen.size,
    };
  } finally {
    if (openedHere) await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().then(
    (r) => {
      console.log("[reconcile] summary:", r);
      process.exit(0);
    },
    (err) => {
      console.error("reconcile failed:", err);
      process.exit(1);
    }
  );
}

module.exports = { run };
