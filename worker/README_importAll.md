# runImportAll() - Detailed Workflow Explanation

## Overview
`runImportAll()` is a **full catalog import function** that fetches all products from the Kinguin ESA (E-commerce Solutions API) and syncs them into your MongoDB database with strict validation rules.

**Key Features:**
- Imports thousands of products efficiently
- Applies strict business rules to filter valid products
- Uses concurrent workers to speed up processing
- Handles API retries and errors gracefully
- Tracks detailed statistics on what was kept vs skipped

---

## High-Level Flow

```
1. Connect to MongoDB
2. Fetch first page (get total count)
3. Process page 1 results
4. Spawn concurrent workers for remaining pages
5. Each worker fetches & processes pages in parallel
6. All results are upserted to MongoDB
7. Return summary statistics
```

---

## Step-by-Step Breakdown

### 1. Connection & Configuration

```javascript
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, maxPoolSize: 50 });
logger.log("DB connected");
```
- Connects to MongoDB with up to 50 concurrent connections (needed for bulk operations)

```javascript
const head = await fetchPage(1);
const upstreamTotal = Number(head?.item_count || 0);
const totalPages = Math.ceil(upstreamTotal / PAGE_SIZE);
```
- Fetches the first page to determine total product count
- Calculates how many pages need to be fetched
- Default page size: 100 products per page

### 2. Initialize Counters

```javascript
let fetched = 0, kept = 0, pagesDone = 0;
let skipName = 0, skipRegion = 0, skipPlatform = 0, skipMissingPlatform = 0;
let skipMissingGenres = 0, skipGenre = 0, skipBannedGenre = 0, skipNoPrice = 0;
```
- Tracks how many products were processed and how many were skipped for each reason
- These counters are incremented as products fail validation gates

### 3. Process Results Function

The core logic is in `processResults(results, label)`, which:

#### Step 3a: Iterate through products and apply validation gates

For each product from the API:

**Gate 1: Check for Banned Merchants**
```javascript
const BANNED_SOURCES = [
  "RBLXReaper", "SteamLevelU", "RustEasy", "GGHeaven", "ROCheap",
  "AliveAI", "Earnweb", "BeastUnbox",
];

if (BANNED_SOURCES.some((bad) => lower.includes(bad.toLowerCase()))) {
  skipName++;
  continue; // Skip this product
}
```
- Prevents importing products from known bad merchants
- Increments skip counter and moves to next product

**Gate 2: Card Product Detection**
```javascript
const isWhitelistedCard = isWhitelistedCard(nm);
```
- Checks if product name matches the card whitelist (Discord Nitro, Steam Gift Cards, iTunes, etc.)
- Cards have **relaxed rules** — they don't need genres or platform validation

**Gate 3: Name Validation (Non-Card Products Only)**
```javascript
if (!isCard) {
  if (!NAME_REQUIRE_RE.test(nm) || NAME_EXCLUDE_RE.test(nm)) {
    skipName++;
    continue;
  }
}
```
- **Must contain:** "CD Key" (case-insensitive)
- **Must NOT contain:** "Account"
- Example: ✅ "Windows 11 Pro CD Key" | ❌ "Fortnite Account" | ❌ "Game"

**Gate 4: Region Check (Non-Card Products Only)**
```javascript
if (!isCard) {
  const regionOk = ALLOWED_REGION_IDS.includes(Number(p?.regionId));
  if (!regionOk) {
    skipRegion++;
    continue;
  }
}
```
- Product must be from an allowed region
- Allowed regions: `[3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80]` (includes Iraq + global-friendly regions)

**Gate 5: Genre Validation (Non-Card Products Only)**
```javascript
const genres = Array.isArray(p?.genres) ? p.genres : [];

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
}
```
- **Required:** At least one genre
- **Banned genres:** Adult Games, Dating Simulator, Music/Soundtrack, PSN Card, Software, Subscription, etc.
- **Allowed genres:** Action, Adventure, RPG, Strategy, Racing, FPS, Horror, etc. (full list at top of code)
- All genres are normalized (case-insensitive, standardized names)

**Gate 6: Platform Validation (Non-Card Products Only)**
```javascript
const hasPlatform = !!p?.platform;
if (!hasPlatform) {
  skipMissingPlatform++;
  continue;
}

if (!allowedPlatformMatch(platformCanonical)) {
  skipPlatform++;
  continue;
}
```
- **Required:** Product must have a platform specified
- **Normalization:** Platform names are normalized using a large synonyms map
  - `"steam"` → `"pc steam"`
  - `"uplay"` → `"pc ubisoft connect"`
  - `"battle.net"` → `"pc battle.net"`
  - etc.
- **Allowed platforms:** PC (Steam, Epic, GOG, Ubisoft, Battle.net, etc.), Xbox (360, One, Series X|S), PlayStation, Nintendo, Android, iOS, etc.

**Gate 7: Price Validation (Non-Card Products Only)**
```javascript
const minEur = computeMinEUR(p);
if (minEur == null || minEur >= 130) {
  skipNoPrice++;
  continue;
}
```
- **Required:** Product must have a price in EUR
- **Max price:** 130 EUR (filters out very expensive items)
- Price is taken from either `product.price` or the lowest `offers[].price`

#### Step 3b: Mark Card/DLC Properties

```javascript
p.remote = p.remote || {};
if (isCard) {
  p.remote.isCard = true;
}
if (isDLC) {
  p.remote.isDLC = true;
}
```
- Marks the product so downstream code knows it's a card or DLC
- Used for pricing calculations (cards get special fee handling)

#### Step 3c: Compute Derived Data

```javascript
const derived = computeDerived(p);
```
- **inStock:** Checks if `qty > 0` or any offer has `availableQty > 0`
- **priceMin:** Converts EUR to IQD with markup/fees:
  ```
  baseIQD = minEUR × EUR_TO_IQD (1535)
  
  For cards/DLC:
    priceIQD = baseIQD + 800 + (baseIQD × 0.03)
  
  For regular products:
    priceIQD = baseIQD + IQD_MARKUP (5800)
  ```

#### Step 3d: Shape Remote Data

```javascript
const remote = {
  name: p.name,
  description: p.description,
  images: p.images,
  price: Number(p.price) || null,
  offers: [...], // Array of offers with prices and merchant info
  regionId: Number(p.regionId),
  tags: p.tags,
  isCard: isCard,
  platform: p.platform,
  genres: genres,
  // ... plus 15+ other fields
  updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
};
```
- Extracts and normalizes data from the API response
- Creates a clean structure for MongoDB storage

#### Step 3e: Prepare Database Operation

```javascript
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
```
- **$set:** Updates remote data and derived fields
- **$setOnInsert:** Sets `createdAt` only when creating new documents
- **upsert:** Inserts if product doesn't exist, updates if it does

#### Step 3f: Bulk Write to Database

```javascript
if (ops.length) {
  await KinguinProduct.bulkWrite(ops, { ordered: false });
  kept += ops.length;
}
```
- Sends all 50-100 operations to MongoDB in a single batch
- `{ ordered: false }` means if one fails, others still execute
- Increments `kept` counter by number of operations

---

### 4. Process Page 1

```javascript
await processResults(head?.results || [], "page 1");
```
- Processes the first page's results synchronously
- Gets at least the first batch of products into the database

### 5. Spawn Concurrent Workers for Remaining Pages

```javascript
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
        logger.log(`[importAll] progress pagesDone=${pagesDone}/${totalPages - 1} kept=${kept}`);
      }
    }
  },
);

await Promise.all(workers);
```

**How it works:**
1. Creates N concurrent workers (default N=10, configurable via `CONCURRENCY`)
2. Each worker has its own event loop that:
   - Increments `nextPage` (shared counter with atomic increment)
   - Checks if there are more pages to fetch
   - Fetches the page from Kinguin API
   - Processes the results
   - Increments progress counter
   - Repeats until all pages are done
3. Workers operate in parallel, so if one worker is waiting for API response, others can process pages

**Example with 1000 pages and 10 workers:**
```
Worker 1: fetches page 2 → processes → fetches page 12 → processes → ...
Worker 2: fetches page 3 → processes → fetches page 13 → processes → ...
Worker 3: fetches page 4 → processes → fetches page 14 → processes → ...
...
Worker 10: fetches page 11 → processes → fetches page 21 → processes → ...
```

### 6. Return Summary

```javascript
return {
  processed: fetched,      // Total products fetched from API
  kept,                    // Total products inserted/updated in DB
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
```

Example output:
```
{
  processed: 50000,
  kept: 12500,
  skipped: {
    name: 15000,
    region: 8000,
    missingPlatform: 2000,
    platform: 3000,
    missingGenres: 4000,
    bannedGenre: 1000,
    genre: 3000,
    noPrice: 1500
  }
}
```
- Out of 50,000 products: 12,500 were valid, 37,500 skipped

---

## Key Validation Rules Summary

### Regular Products (Non-Cards)
| Rule | Requirement |
|------|-------------|
| **Merchant** | Must not be from banned list |
| **Name** | Must include "CD Key" AND must NOT include "Account" |
| **Region** | Must be in `ALLOWED_REGION_IDS` |
| **Platform** | Required + must match allowed platforms after normalization |
| **Genre** | Required + must match allowed genres + must not contain banned genres |
| **Price** | Required + must be < 130 EUR |

### Card Products
| Rule | Requirement |
|------|-------------|
| **Name** | Must match the card whitelist (exact match, case/whitespace tolerant) |
| **All other rules** | ✅ SKIPPED (relaxed) |

---

## Performance Optimizations

1. **HTTP Keep-Alive:** Reuses TCP connections to Kinguin API
   ```javascript
   const httpsAgent = new https.Agent({
     keepAlive: true,
     maxSockets: 32,
     maxFreeSockets: 8,
   });
   ```

2. **Concurrent Workers:** Fetches multiple pages in parallel instead of sequential
   ```javascript
   CONCURRENCY = 10 (default)
   ```

3. **Batch Database Operations:** Uses `bulkWrite` instead of individual inserts
   ```javascript
   KinguinProduct.bulkWrite(ops, { ordered: false })
   // All 100 products upserted in 1 operation instead of 100 separate operations
   ```

4. **Retry Logic with Backoff:** Handles API rate limits and transient errors
   ```javascript
   // Retries up to 5 times with exponential backoff
   // Base delay: 400ms → 800ms → 1600ms → 3200ms → 5000ms
   ```

5. **Normalized Genre/Platform Matching:** Uses `Set` for O(1) lookups
   ```javascript
   const ALLOWED_GENRES_NORMALIZED = new Set(...)
   // Checking if genre exists: O(1) instead of O(n)
   ```

---

## CLI Usage

```bash
node worker/importAll.js
```

Requires environment variables:
- `KINGUIN_API_KEY` - API key for Kinguin ESA
- `KINGUIN_API_BASE` - ESA endpoint (default: `https://gateway.kinguin.net/esa/api`)
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB` - Database name
- `EUR_TO_IQD` - Exchange rate (default: 1535)
- `IQD_MARKUP` - Markup in IQD for regular products (default: 5800)
- `SYNC_PAGE_SIZE` - Items per page (default: 100, max: 100)
- `SYNC_CONCURRENCY` - Concurrent workers (default: 10)

---

## Typical Execution Flow Example

```
Step 1: Connect to MongoDB
Step 2: Fetch page 1 → 100 products → item_count = 5000 → totalPages = 50

Step 3: Process page 1 results
  - Product 1: "Windows 11 CD Key" ✅ → kept
  - Product 2: "Steam Account" ❌ → skipped (name rule)
  - Product 3: "Fortnite CD Key" ✅ → kept
  - ...
  - Result: Inserted 85 products, skipped 15

Step 4: Spawn 10 workers
  - Worker 1 fetches page 2, processes, then fetches page 12, processes, ...
  - Worker 2 fetches page 3, processes, then fetches page 13, processes, ...
  - ... (all 10 workers run in parallel)

Step 5: Continue until page 50 is processed

Step 6: Return summary
  {
    processed: 5000,
    kept: 4200,
    skipped: {
      name: 400,
      region: 150,
      platform: 100,
      ...
    }
  }
```

---

## Summary

`runImportAll()` is a **sophisticated ETL (Extract-Transform-Load) worker** that:
1. **Extracts:** Fetches all products from Kinguin ESA API
2. **Transforms:** Validates and normalizes data according to strict business rules
3. **Loads:** Upserts clean data into MongoDB
4. Uses **concurrency and batching** for performance
5. Provides **detailed statistics** on what was processed and why items were skipped
