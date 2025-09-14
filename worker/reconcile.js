// worker/reconcile.js
// Reconcile local docs with the upstream filtered view (name + region + platform + genres + banned genres)

require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const { client, withRetry } = require("../lib/kinguinClient");
const KinguinProduct = require("../models/KinguinProduct");
const { SyncProfile } = require("../models/SyncState");

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);
const REQUIRE_PLATFORM = String(process.env.REQUIRE_PLATFORM || "0") === "1";
const REQUIRE_GENRES = String(process.env.REQUIRE_GENRES || "0") === "1";

const ALLOWED_REGION_IDS = [3, 21, 40, 30, 56, 58, 19, 24, 28, 80, 5, 34, 55];
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

// --- Normalizers/synonyms ---
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
  ["blizzard", "pc battle.net"],
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
function allowedPlatformMatch(p) {
  const n = normalizePlatform(p);
  return !!n && ALLOWED_PLATFORMS_NORMALIZED.has(n);
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
function allowedGenreMatch(a) {
  if (!Array.isArray(a) || !a.length) return false;
  return a.some((g) => ALLOWED_GENRES_NORMALIZED.has(normalizeGenre(g)));
}
function bannedGenrePresent(a) {
  if (!Array.isArray(a) || !a.length) return false;
  return a.some((g) => BLACKLIST_GENRES_NORMALIZED.has(normalizeGenre(g)));
}

// --- Connectivity/fetch ---
async function ensureConnection() {
  if (mongoose.connection.readyState === 1) return false;
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB,
  });
  return true;
}
async function fetchPage(page, baseFilters) {
  return withRetry(async () => {
    const { data } = await client.get("/v1/products", {
      params: { ...baseFilters, page, limit: PAGE_SIZE, withText: "no" },
    });
    return data;
  });
}

// --- Main ---
async function run() {
  const openedHere = await ensureConnection();
  const t0 = Date.now();

  try {
    const profile = await SyncProfile.findOne({ name: "default" }).lean();
    const baseFilters = profile?.filters || {};

    const head = await fetchPage(1, baseFilters);
    const upstreamTotal = head?.item_count || 0;
    const pages = Math.ceil(upstreamTotal / PAGE_SIZE) || 0;
    console.log(`[reconcile] upstream_total=${upstreamTotal}, pages=${pages}`);

    const seen = new Set();

    const includeIfAllowed = (p) => {
      const nm = p?.name || "";
      if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) return false;

      if (!ALLOWED_REGION_IDS.includes(p.regionId)) return false;

      if (bannedGenrePresent(p.genres)) return false;

      const hasPlatform = !!p.platform;
      const platformOk = hasPlatform
        ? allowedPlatformMatch(p.platform)
        : !REQUIRE_PLATFORM;
      if (!hasPlatform && REQUIRE_PLATFORM) return false;
      if (hasPlatform && !platformOk) return false;

      const hasGenres = Array.isArray(p.genres) && p.genres.length > 0;
      const genresOk = hasGenres
        ? allowedGenreMatch(p.genres)
        : !REQUIRE_GENRES;
      if (!hasGenres && REQUIRE_GENRES) return false;
      if (hasGenres && !genresOk) return false;

      return true;
    };

    (head?.results || []).forEach((r) => {
      if (includeIfAllowed(r)) seen.add(r.kinguinId);
    });

    const queue = [];
    for (let p = 2; p <= pages; p++) queue.push(p);
    let active = 0;
    await new Promise((resolve, reject) => {
      const next = () => {
        if (!queue.length && active === 0) return resolve();
        while (active < CONCURRENCY && queue.length) {
          const page = queue.shift();
          active++;
          fetchPage(page, baseFilters)
            .then((d) => {
              (d?.results || []).forEach((r) => {
                if (includeIfAllowed(r)) seen.add(r.kinguinId);
              });
              active--;
              next();
            })
            .catch((e) => {
              active--;
              reject(e);
            });
        }
      };
      next();
    });

    const locals = await KinguinProduct.find(
      {},
      { _id: 1, "flags.hidden": 1 }
    ).lean();
    const toHide = [],
      toUnhide = [];
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
      `[reconcile] done in ${ms}ms; toHide=${toHide.length}, toUnhide=${toUnhide.length}, seen=${seen.size}`
    );
  } finally {
    if (openedHere) await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };
