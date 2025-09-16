// worker/importAll.js
// Full catalog import from Kinguin ESA -> Mongo cache (one-time / manual run)
//
// Filters:
// - Name MUST match /cd\s*key/i and MUST NOT contain /account/i
// - Region, Platform (with synonyms), Genres allow-list
// - Banned genres blacklist (drop even if other genres exist)
// - Optional REQUIRE_PLATFORM / REQUIRE_GENRES env toggles
//
// Price: priceIQD = round(minEUR * EUR_TO_IQD + IQD_MARKUP)
//
// Logging: upstream_total, fetched, kept, and per-reason skips (region/platform/genre/missing/name/bannedGenre)
//
// Safe Mongo handling: only disconnects if this script opened it.

require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const { client, withRetry } = require("../lib/kinguinClient");
const KinguinProduct = require("../models/KinguinProduct");
const { SyncProfile } = require("../models/SyncState");

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);

const EUR_TO_IQD = Number(process.env.EUR_TO_IQD || 1535);
const IQD_MARKUP = Number(process.env.IQD_MARKUP || 5800);

const REQUIRE_PLATFORM = String(process.env.REQUIRE_PLATFORM || "0") === "1";
const REQUIRE_GENRES = String(process.env.REQUIRE_GENRES || "0") === "1";

// Regions allowed (Iraq/global)
const ALLOWED_REGION_IDS = [3, 21, 40, 30, 56, 58, 19, 24, 28, 80, 5, 34, 55];

// Platforms allow-list
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

// Genres allow-list
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

// Genres blacklist (reject if ANY is present)
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

// ---------------- Normalizers & synonyms ----------------

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
  ["origin", "ea app"],
  ["ea app", "ea app"],
  ["battle.net", "pc battle.net"],
  ["battlenet", "pc battle.net"],
  ["Rockstar Games", "Rockstar Games"],
  ["epic", "pc epic games"],
  ["epic games", "pc epic games"],
  ["gog", "pc gog"],
  ["rockstar", "pc rockstar games"],
  ["rockstar games", "pc rockstar games"],
  ["social club", "pc rockstar games"],
  ["mog station", "pc mog station"],
  ["pc", "pc"],
  ["xbox one", "xbox one"],
  ["xbox series x|s", "xbox series x|s"],
  ["xbox 360", "xbox 360"],
]);

function normalizePlatform(p) {
  const n = normStr(p);
  if (!n) return "";
  if (PLATFORM_SYNONYMS.has(n)) return PLATFORM_SYNONYMS.get(n);
  if (/pc.*steam|steam.*pc/.test(n)) return "pc steam";
  if (/pc.*uplay|uplay.*pc|pc.*ubisoft|ubisoft.*pc/.test(n))
    return "pc ubisoft connect";
  if (/epic/.test(n)) return "pc epic games";
  if (/(battle\.?net|blizzard)/.test(n)) return "pc battle.net";
  if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
  if (/gog/.test(n)) return "pc gog";
  return n;
}

const ALLOWED_PLATFORMS_NORMALIZED = new Set(
  ALLOWED_PLATFORMS.map(normalizePlatform)
);

function allowedPlatformMatch(upstreamPlatform) {
  const normalized = normalizePlatform(upstreamPlatform);
  return !!normalized && ALLOWED_PLATFORMS_NORMALIZED.has(normalized);
}

function normalizeGenre(g) {
  return normStr(g)
    .replace("third person shooter", "third-person shooter")
    .replace("point click", "point & click")
    .replace("story rich", "story rich");
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

// ---------------- Price & derived ----------------

function eurToIqdWithMarkup(minEur) {
  if (!Number.isFinite(minEur)) return undefined;
  return Math.round(minEur * EUR_TO_IQD + IQD_MARKUP);
}

function computeDerivedFromRaw(p) {
  const inStock =
    (p?.qty || 0) > 0 ||
    (Array.isArray(p?.offers) &&
      p.offers.some((o) => (o?.availableQty || 0) > 0));

  const prices = [];
  if (Number.isFinite(p?.price) && p.price > 0) prices.push(p.price);
  if (Array.isArray(p?.offers))
    for (const o of p.offers)
      if (Number.isFinite(o?.price) && o.price > 0) prices.push(o.price);

  const minEur = prices.length ? Math.min(...prices) : Infinity;
  const priceMin = eurToIqdWithMarkup(minEur);
  return { inStock, priceMin };
}

// ---------------- Shaping ----------------

function pickRemote(p, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return {
      name: p.name,
      description: p.description,
      images: p.images,
      price: p.price,
      qty: p.qty,
      offers: p.offers,
      regionId: p.regionId,
      tags: p.tags,
      platform: p.platform,
      genres: p.genres,
    };
  }
  const out = {};
  for (const f of fields) if (f in p) out[f] = p[f];
  if (out.price === undefined) out.price = p.price;
  if (out.qty === undefined) out.qty = p.qty;
  if (out.offers === undefined) out.offers = p.offers;
  if (out.regionId === undefined) out.regionId = p.regionId;
  if (out.tags === undefined) out.tags = p.tags;
  if (out.platform === undefined) out.platform = p.platform;
  if (out.genres === undefined) out.genres = p.genres;
  if (out.name === undefined) out.name = p.name;
  if (out.description === undefined) out.description = p.description;
  if (out.images === undefined) out.images = p.images;
  return out;
}

// ---------------- Connectivity ----------------

async function ensureConnection() {
  if (mongoose.connection.readyState === 1) return false;
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB,
  });
  return true;
}

async function fetchPage(page, filters) {
  return withRetry(async () => {
    const { data } = await client.get("/v1/products", {
      params: { ...filters, page, limit: PAGE_SIZE, withText: "yes" },
    });
    return data;
  });
}

// ---------------- Main ----------------

async function run() {
  const openedHere = await ensureConnection();
  const t0 = Date.now();

  try {
    const profile = await SyncProfile.findOne({ name: "default" }).lean();
    const baseFilters = { ...(profile?.filters || {}) };
    const fields = profile?.fields || [];

    const head = await fetchPage(1, baseFilters);
    const upstreamTotal = head?.item_count || 0;
    const pages = Math.ceil(upstreamTotal / PAGE_SIZE) || 0;

    console.log(
      `[importAll] upstream_total=${upstreamTotal}, pages=${pages}, REQUIRE_PLATFORM=${REQUIRE_PLATFORM}, REQUIRE_GENRES=${REQUIRE_GENRES}`
    );

    // Counters
    let fetched = 0,
      kept = 0;
    let skipRegion = 0,
      skipPlatform = 0,
      skipGenre = 0,
      skipMissingPlatform = 0,
      skipMissingGenres = 0;
    let skipName = 0,
      skipBannedGenre = 0;

    const processResults = async (results, label) => {
      if (!Array.isArray(results) || results.length === 0) return;

      fetched += results.length;
      const ops = [];

      for (const p of results) {
        // Name rules first
        const nm = p?.name || "";
        if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
          skipName++;
          continue;
        }

        // Regions
        if (!ALLOWED_REGION_IDS.includes(p.regionId)) {
          skipRegion++;
          continue;
        }

        // Banned genres
        if (bannedGenrePresent(p.genres)) {
          skipBannedGenre++;
          continue;
        }

        // Platform
        const hasPlatform = !!p.platform;
        const platformOk = hasPlatform
          ? allowedPlatformMatch(p.platform)
          : !REQUIRE_PLATFORM;
        if (!hasPlatform && REQUIRE_PLATFORM) {
          skipMissingPlatform++;
          continue;
        }
        if (hasPlatform && !platformOk) {
          skipPlatform++;
          continue;
        }

        // Genres allow-list
        const hasGenres = Array.isArray(p.genres) && p.genres.length > 0;
        const genresOk = hasGenres
          ? allowedGenreMatch(p.genres)
          : !REQUIRE_GENRES;
        if (!hasGenres && REQUIRE_GENRES) {
          skipMissingGenres++;
          continue;
        }
        if (hasGenres && !genresOk) {
          skipGenre++;
          continue;
        }

        const remote = pickRemote(p, fields);
        remote.updatedAt = new Date();
        const derived = computeDerivedFromRaw(p);

        ops.push({
          updateOne: {
            filter: { _id: p.kinguinId },
            update: {
              $set: {
                remote,
                "derived.inStock": derived.inStock,
                "derived.priceMin": derived.priceMin,
              },
              $setOnInsert: { createdAt: new Date() },
            },
            upsert: true,
          },
        });
      }

      if (ops.length) await KinguinProduct.bulkWrite(ops, { ordered: false });
      kept += ops.length;

      console.log(
        `[importAll] ${label}: fetched=${results.length}, kept_now=${ops.length}, ` +
          `skipped={name:${skipName}, bannedGenre:${skipBannedGenre}, region:${skipRegion}, ` +
          `platform:${skipPlatform}, genre:${skipGenre}, missingPlatform:${skipMissingPlatform}, ` +
          `missingGenres:${skipMissingGenres}}`
      );
    };

    await processResults(head?.results || [], "page 1");

    const queue = [];
    for (let page = 2; page <= pages; page++) queue.push(page);

    let active = 0,
      done = Math.min(1, pages);
    await new Promise((resolve, reject) => {
      const next = () => {
        if (!queue.length && active === 0) return resolve();
        while (active < CONCURRENCY && queue.length) {
          const page = queue.shift();
          active++;
          fetchPage(page, baseFilters)
            .then((data) => processResults(data?.results || [], `page ${page}`))
            .then(() => {
              active--;
              done++;
              next();
            })
            .catch((err) => {
              active--;
              reject(err);
            });
        }
      };
      next();
    });

    const ms = Date.now() - t0;
    console.log(
      `[importAll] completed ${done}/${pages} in ${ms}ms; upstream_total=${upstreamTotal}, fetched=${fetched}, kept=${kept}, ` +
        `skipped={name:${skipName}, bannedGenre:${skipBannedGenre}, region:${skipRegion}, platform:${skipPlatform}, ` +
        `genre:${skipGenre}, missingPlatform:${skipMissingPlatform}, missingGenres:${skipMissingGenres}}`
    );
  } finally {
    if (openedHere) await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
