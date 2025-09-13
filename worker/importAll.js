// Initial full import script for Kinguin products.
// Fetches all products from the Kinguin ESA API, applying any filters
// defined in the SyncProfile, and upserts them into the local
// database. This should be run once when seeding the catalog or
// after changing import filters/fields.

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const { client, withRetry } = require('../lib/kinguinClient');
const KinguinProduct = require('../models/KinguinProduct');
const { SyncProfile } = require('../models/SyncState');

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);

// Allowed region IDs for Iraq and global regions. Only products with regionId in this list
// will be imported. These values are derived from regoins.txt and discussions.
const ALLOWED_REGION_IDS = [3, 21, 40, 30, 56, 58, 19, 24, 28, 80, 5, 34, 55];

// Allowed platform names. Only products whose platform matches one of these will be imported.
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

// Allowed genres. Only products whose genres array intersects this list will be imported.
const ALLOWED_GENRES = [
  'Action',
  'Adventure',
  'Anime',
  'Casual',
  'Co-op',
  'FPS',
  'Fighting',
  'Hack and Slash',
  'Hidden Object',
  'Horror',
  'Indie',
  'Life Simulation',
  'MMO',
  'Open World',
  'Platformer',
  'Point & click',
  'Puzzle',
  'RPG',
  'Racing',
  'Simulation',
  'Sport',
  'Story rich',
  'Strategy',
  'Survival',
  'Third-Person Shooter',
  'VR Games',
  'Visual Novel'
];

// Compute derived fields (inStock, priceMinIQD) from the remote payload
// priceMinIQD converts euro price to Iraqi dinar using exchange rate (1 EUR = 1535 IQD)
// and applies a fixed markup of 5800 IQD. The user should not see the original euro price.
function computeDerived(remote) {
  // Determine if the product is in stock (qty > 0 or any offer available)
  const inStock = (remote?.qty || 0) > 0 ||
    (Array.isArray(remote?.offers) && remote.offers.some((o) => (o?.availableQty || 0) > 0));
  // Build a list of euro prices: remote.price and offer prices
  const pricesEur = [];
  if (Number.isFinite(remote?.price)) pricesEur.push(remote.price);
  if (Array.isArray(remote?.offers)) {
    for (const offer of remote.offers) {
      if (Number.isFinite(offer?.price) && offer.price > 0) {
        pricesEur.push(offer.price);
      }
    }
  }
  // Compute minimum euro price
  const minEur = pricesEur.length ? Math.min(...pricesEur) : Infinity;
  // Convert euro to IQD and add markup: priceIQD = eur * 1535 + 5800
  let priceMin;
  if (isFinite(minEur)) {
    priceMin = minEur * 1535 + 5800;
    // Round to nearest integer IQD (optional). Without rounding, it might include decimals.
    priceMin = Math.round(priceMin);
  }
  return { inStock, priceMin: priceMin };
}

// Pick only the fields specified in profile.fields. If fields list is
// empty or undefined, include everything the API returns. Always include
// platform and genres because we filter on them.
function pickRemote(p, fields) {
  const remote = {};
  // If no fields specified, copy all known properties from product
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
  // Otherwise, pick only requested fields but ensure price, qty, offers,
  // platform, and genres are always present for filtering and computation
  for (const f of fields) {
    if (f in p) remote[f] = p[f];
  }
  // Always include these fields if missing
  if (remote.price === undefined) remote.price = p.price;
  if (remote.qty === undefined) remote.qty = p.qty;
  if (remote.offers === undefined) remote.offers = p.offers;
  if (remote.platform === undefined) remote.platform = p.platform;
  if (remote.genres === undefined) remote.genres = p.genres;
  if (remote.regionId === undefined) remote.regionId = p.regionId;
  if (remote.tags === undefined) remote.tags = p.tags;
  return remote;
}

async function fetchPage(page, filters) {
  return withRetry(async () => {
    const { data } = await client.get('/v1/products', {
      params: { ...filters, page, limit: PAGE_SIZE, withText: 'yes' },
    });
    return data;
  });
}

async function run() {
  const DB = process.env.MONGODB_URI;
  await mongoose.connect(DB);

  const profile = await SyncProfile.findOne({ name: 'default' });
  const filters = profile?.filters || {};
  const fields = profile?.fields || [];

  const head = await fetchPage(1, filters);
  const total = head?.item_count || 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`[importAll] total=${total}, pages=${pages}`);

  const processResults = async (results) => {
    const ops = [];
    for (const p of results) {
      // Apply region, platform, and genre filters. Skip products that do not match.
      const regionOk = ALLOWED_REGION_IDS.includes(p.regionId);
      // Platform may be missing; treat undefined as not allowed
      const platformOk = p.platform && ALLOWED_PLATFORMS.includes(p.platform);
      // Genres may be undefined; treat undefined as false. Ensure at least one genre matches
      let genreOk = false;
      if (Array.isArray(p.genres) && p.genres.length > 0) {
        for (const g of p.genres) {
          if (ALLOWED_GENRES.includes(g)) {
            genreOk = true;
            break;
          }
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
  };

  // Process first page
  await processResults(head?.results || []);

  // Process remaining pages concurrently
  const queue = [];
  for (let page = 2; page <= pages; page++) queue.push(page);
  let active = 0;
  let processed = 1;
  await new Promise((resolve, reject) => {
    const next = () => {
      if (!queue.length && active === 0) return resolve();
      while (active < CONCURRENCY && queue.length) {
        const page = queue.shift();
        active++;
        fetchPage(page, filters)
          .then((data) => processResults(data?.results || []).then(() => {
            processed++;
            active--;
            next();
          }))
          .catch((err) => {
            active--;
            reject(err);
          });
      }
    };
    next();
  });

  console.log(`[importAll] completed ${processed}/${pages} pages`);
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };