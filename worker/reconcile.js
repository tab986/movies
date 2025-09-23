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

// ------------------------ Normalizers & helpers ----------------------------
function normStr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) return false;

      if (!ALLOWED_REGION_IDS.includes(Number(p?.regionId))) return false;

      const genres = Array.isArray(p?.genres) ? p.genres : [];
      if (!genres.length) return false;
      if (bannedGenrePresent(genres)) return false;
      if (!allowedGenreMatch(genres)) return false;

      const hasPlatform = !!p?.platform;
      if (!hasPlatform) return false;
      const platformCanonical = normalizePlatform(p.platform);
      if (!platformCanonical || !allowedPlatformMatch(platformCanonical))
        return false;

      // Must have any EUR price (product or offers)
      const hasPrice =
        Number(p?.price) > 0 ||
        (Array.isArray(p?.offers) &&
          p.offers.some((o) => Number(o?.price) > 0));
      if (!hasPrice) return false;

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
