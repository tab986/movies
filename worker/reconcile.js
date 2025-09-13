// Reconciliation script. Fetches the entire catalog from Kinguin and
// flags local documents not present in the remote catalog as hidden.
// Should be run periodically (e.g. nightly or weekly) to hide
// delisted items that won’t appear in delta updates. This script
// assumes the catalog isn’t too large to fetch in a reasonable time.

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const { client, withRetry } = require('../lib/kinguinClient');
const KinguinProduct = require('../models/KinguinProduct');

const PAGE_SIZE = Number(process.env.SYNC_PAGE_SIZE || 100);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 10);

async function fetchPage(page) {
  return withRetry(async () => {
    const { data } = await client.get('/v1/products', {
      params: { page, limit: PAGE_SIZE, withText: 'no' },
    });
    return data;
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const head = await fetchPage(1);
  const total = head?.item_count || 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  const seen = new Set((head?.results || []).map((r) => r.kinguinId));
  const queue = [];
  for (let p = 2; p <= pages; p++) queue.push(p);
  let active = 0;
  await new Promise((resolve, reject) => {
    const next = () => {
      if (!queue.length && active === 0) return resolve();
      while (active < CONCURRENCY && queue.length) {
        const page = queue.shift();
        active++;
        fetchPage(page)
          .then((data) => {
            (data?.results || []).forEach((r) => seen.add(r.kinguinId));
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

  // Determine which local products need to be hidden
  const localIds = await KinguinProduct.find({}, { _id: 1 }).lean();
  const toHide = localIds
    .filter((d) => !seen.has(d._id))
    .map((d) => d._id);
  if (toHide.length) {
    await KinguinProduct.updateMany(
      { _id: { $in: toHide } },
      { $set: { 'flags.hidden': true, 'flags.removedAt': new Date() } }
    );
  }
  console.log(`[reconcile] total=${total}, hidden=${toHide.length}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };