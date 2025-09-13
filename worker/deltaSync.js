// Delta sync worker. Runs frequently (e.g. every minute) to pull all
// products updated since the last successful sync. Only affected
// products are fetched, making this efficient for real-time updates.

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const { client, withRetry, isoNowZ } = require('../lib/kinguinClient');
const KinguinProduct = require('../models/KinguinProduct');
const { SyncState, SyncProfile } = require('../models/SyncState');

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);

// Allowed region IDs for Iraq and global regions.
const ALLOWED_REGION_IDS = [3, 21, 40, 30, 56, 58, 19, 24, 28, 80, 5, 34, 55];
// Allowed platform names
const ALLOWED_PLATFORMS = [
  'PC Epic Games',
  'PC Battle.net',
  'PC GOG',
  'PC Mog Station',
  'PC Digital Download',
  'EA App',
  'PC Rockstar Games',
  'PC Steam',
  'PC Ubisoft Connect',
  'PC',
  'Xbox 360',
  'Xbox One',
  'Xbox Series X|S'
];
// Allowed genres
const ALLOWED_GENRES = [
  'Action', 'Adventure', 'Anime', 'Casual', 'Co-op', 'FPS', 'Fighting', 'Hack and Slash',
  'Hidden Object', 'Horror', 'Indie', 'Life Simulation', 'MMO', 'Open World', 'Platformer',
  'Point & click', 'Puzzle', 'RPG', 'Racing', 'Simulation', 'Sport', 'Story rich', 'Strategy',
  'Survival', 'Third-Person Shooter', 'VR Games', 'Visual Novel'
];

function computeDerived(remote) {
  // Determine stock state
  const inStock = (remote?.qty || 0) > 0 ||
    (Array.isArray(remote?.offers) && remote.offers.some((o) => (o?.availableQty || 0) > 0));
  // Collect euro prices
  const pricesEur = [];
  if (Number.isFinite(remote?.price)) pricesEur.push(remote.price);
  if (Array.isArray(remote?.offers)) {
    for (const offer of remote.offers) {
      if (Number.isFinite(offer?.price) && offer.price > 0) pricesEur.push(offer.price);
    }
  }
  const minEur = pricesEur.length ? Math.min(...pricesEur) : Infinity;
  let priceMin;
  if (isFinite(minEur)) {
    priceMin = minEur * 1535 + 5800;
    priceMin = Math.round(priceMin);
  }
  return { inStock, priceMin };
}

function pickRemote(p, fields) {
  const remote = {};
  if (!Array.isArray(fields) || fields.length === 0) {
    remote.name = p.name;
    remote.description = p.description;
    remote.images = p.images;
    remote.price = p.price;
    remote.qty = p.qty;
    remote.offers = p.offers;
    remote.regionId = p.regionId;
    remote.tags = p.tags;
    remote.platform = p.platform;
    remote.genres = p.genres;
    return remote;
  }
  for (const f of fields) {
    if (f in p) remote[f] = p[f];
  }
  if (remote.price === undefined) remote.price = p.price;
  if (remote.qty === undefined) remote.qty = p.qty;
  if (remote.offers === undefined) remote.offers = p.offers;
  if (remote.platform === undefined) remote.platform = p.platform;
  if (remote.genres === undefined) remote.genres = p.genres;
  if (remote.regionId === undefined) remote.regionId = p.regionId;
  if (remote.tags === undefined) remote.tags = p.tags;
  return remote;
}

async function fetchPage(page, updatedSince, filters) {
  return withRetry(async () => {
    const params = { ...filters, updatedSince, page, limit: PAGE_SIZE, withText: 'yes' };
    const { data } = await client.get('/v1/products', { params });
    return data;
  });
}

// Runs a single delta sync. Optionally accepts an overlap to ensure no
// updates are missed if the sync cycle length varies. Returns the
// number of documents updated.
async function runOnce({ overlapMinutes = 2 } = {}) {
  const DB = process.env.MONGODB_URI;
  await mongoose.connect(DB);

  const profile = await SyncProfile.findOne({ name: 'default' });
  const filters = profile?.filters || {};
  const fields = profile?.fields || [];

  const state = await SyncState.findOne({ key: 'lastSync' });
  let lastSyncISO;
  if (state?.value) {
    lastSyncISO = state.value;
  } else {
    // If no state is stored yet, sync the last few minutes
    lastSyncISO = new Date(Date.now() - overlapMinutes * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  const head = await fetchPage(1, lastSyncISO, filters);
  const count = head?.item_count || 0;
  if (!count) {
    await SyncState.updateOne({ key: 'lastSync' }, { $set: { value: isoNowZ() } }, { upsert: true });
    await mongoose.disconnect();
    return { updated: 0 };
  }

  const pages = Math.ceil(count / PAGE_SIZE);
  const all = head?.results || [];

  // gather rest concurrently
  const queue = [];
  for (let page = 2; page <= pages; page++) queue.push(page);
  let active = 0;
  await new Promise((resolve, reject) => {
    const next = () => {
      if (!queue.length && active === 0) return resolve();
      while (active < CONCURRENCY && queue.length) {
        const page = queue.shift();
        active++;
        fetchPage(page, lastSyncISO, filters)
          .then((data) => {
            all.push(...(data?.results || []));
            active--;
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

  // Upsert each changed product after filtering by region, platform, and genres
  const ops = [];
  for (const p of all) {
    const regionOk = ALLOWED_REGION_IDS.includes(p.regionId);
    const platformOk = p.platform && ALLOWED_PLATFORMS.includes(p.platform);
    let genreOk = false;
    if (Array.isArray(p.genres) && p.genres.length > 0) {
      for (const g of p.genres) {
        if (ALLOWED_GENRES.includes(g)) { genreOk = true; break; }
      }
    }
    if (!regionOk || !platformOk || !genreOk) continue;
    const remote = pickRemote(p, fields);
    remote.updatedAt = new Date();
    const derived = computeDerived(remote);
    ops.push({
      updateOne: {
        filter: { _id: p.kinguinId },
        update: {
          $set: {
            remote,
            'derived.inStock': derived.inStock,
            'derived.priceMin': derived.priceMin,
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await KinguinProduct.bulkWrite(ops, { ordered: false });

  await SyncState.updateOne({ key: 'lastSync' }, { $set: { value: isoNowZ() } }, { upsert: true });
  const updated = ops.length;
  await mongoose.disconnect();
  return { updated };
}

if (require.main === module) {
  runOnce().then((r) => {
    console.log('[deltaSync]', r);
    process.exit(0);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runOnce };