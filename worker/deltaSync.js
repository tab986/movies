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

function eurToIqd(minEur) {
  if (minEur == null) return undefined;
  return Math.round(minEur * EUR_TO_IQD + IQD_MARKUP);
}

function computeDerived(up) {
  const inStock =
    (Number(up?.qty) || 0) > 0 ||
    (Array.isArray(up?.offers) &&
      up.offers.some((o) => (Number(o?.availableQty) || 0) > 0));

  const minEur = computeMinEUR(up);
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

async function runOnce({ overlapMinutes = 2 } = {}) {
  const openedHere = await ensureConnection();
  const t0 = Date.now();

  try {
    const profile = await SyncProfile.findOne({ name: "default" }).lean();
    const filters = profile?.filters || {};
    const fields = profile?.fields || [];

    const state = await SyncState.findOne({ key: "lastSync" }).lean();
    let lastSyncISO = state?.value;
    if (!lastSyncISO) {
      lastSyncISO = new Date(Date.now() - overlapMinutes * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
    }

    const head = await fetchPage(1, lastSyncISO, filters);
    const upstreamTotal = Number(head?.item_count || 0);
    const totalPages = Math.max(1, Math.ceil(upstreamTotal / PAGE_SIZE));

    console.log(
      `[deltaSync] since=${lastSyncISO}, upstream_total=${upstreamTotal}, pages=${totalPages}`
    );

    let fetched = 0,
      kept = 0;
    let skipName = 0,
      skipRegion = 0,
      skipPlatform = 0,
      skipMissingPlatform = 0,
      skipMissingGenres = 0,
      skipGenre = 0,
      skipBannedGenre = 0,
      skipNoPrice = 0;

    async function processResults(results, label) {
      if (!Array.isArray(results) || !results.length) return;
      fetched += results.length;

      const ops = [];
      for (const p of results) {
        // STRICT gates
        const nm = p?.name || "";
        if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
          skipName++;
          continue;
        }

        if (!ALLOWED_REGION_IDS.includes(Number(p?.regionId))) {
          skipRegion++;
          continue;
        }

        const genres = Array.isArray(p?.genres) ? p.genres : [];
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
        const platformCanonical = normalizePlatform(p.platform);
        if (!platformCanonical || !allowedPlatformMatch(platformCanonical)) {
          skipPlatform++;
          continue;
        }

        const minEur = computeMinEUR(p);
        if (minEur == null) {
          skipNoPrice++;
          continue;
        }

        const derived = computeDerived(p);
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
          platform: p.platform || null, // keep original label
          genres,
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          activationDetails: p.activationDetails || null,
          videos: p.videos || null,
          languages: Array.isArray(p.languages) ? p.languages : [],
          systemRequirements: p.systemRequirements || null,
          originalName: p.originalName || null,

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

    await processResults(head?.results || [], "page 1");

    let nextPage = 2;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - 1) },
      async () => {
        while (true) {
          const page = nextPage++;
          if (page > totalPages) break;
          const data = await fetchPage(page, lastSyncISO, filters);
          await processResults(data?.results || [], `page ${page}`);
        }
      }
    );

    await Promise.all(workers);

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
