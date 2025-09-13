# Game-Wise Backend Documentation

This document describes how the Kinguin-based caching and synchronization system works, how to configure it, and how to perform administrative tasks.

## Overview

The application maintains its own MongoDB copy of the Kinguin catalog. Instead of querying the Kinguin API directly from your frontend, the application uses background workers to **import** and **synchronize** products from Kinguin into a local collection (`KinguinProduct`). This allows you to:

* Filter products by allowed regions, platforms, and genres before they ever reach the database.
* Convert Euro prices to Iraqi dinars and apply a fixed markup. End‑users never see the original Euro price.
* Customise product names, descriptions and images without them being overwritten during sync (using `overrides`).
* Hide delisted items and out‑of‑stock items automatically.

The data model stores the raw Kinguin fields under `remote`, your edits under `overrides`, computed helpers (`derived`) and flags (`flags`) for visibility. See `models/KinguinProduct.js` for details.

## Key Concepts

### Allowed Regions, Platforms and Genres

To ensure only products that can be sold in Iraq are imported, the workers filter by:

* **Regions:** the list in `ALLOWED_REGION_IDS` (IDs 3, 21, 40, 30, 56, 58, 19, 24, 28, 80, 5, 34, 55). These correspond to "REGION FREE", "Middle East", "MENA", etc.
* **Platforms:** only products whose `platform` is one of the following are imported:
  - PC Epic Games, PC Battle.net, PC GOG, PC Mog Station, PC Digital Download, EA App, PC Rockstar Games, PC Steam, PC Ubisoft Connect, PC, Xbox 360, Xbox One, Xbox Series X|S.
* **Genres:** the full list is defined in `ALLOWED_GENRES` (Action, Adventure, Anime, Casual, Co‑op, FPS, Fighting, Hack and Slash, Hidden Object, Horror, Indie, Life Simulation, MMO, Open World, Platformer, Point & click, Puzzle, RPG, Racing, Simulation, Sport, Story rich, Strategy, Survival, Third‑Person Shooter, VR Games, Visual Novel).

These lists are hard‑coded in `worker/importAll.js` and `worker/deltaSync.js`. Only products passing all three filters are stored.

### Price Conversion

Prices returned by Kinguin are in euros. During import and delta sync the workers compute `derived.priceMin` in IQD as:

```
priceMinIQD = (minEuroPrice * 1535) + 5800
```

The `minEuroPrice` is the minimum among the product’s `price` field and all offer prices. The result is rounded to the nearest integer. The original Euro price is stored in `remote.price` for auditing but never exposed in public endpoints.

### Overrides

Your storefront queries always prefer values stored under `overrides` over those in `remote`. This means you can customise the product name, description and images without them being overwritten by sync. To update overrides, call the PATCH endpoint (see below).

## API Endpoints

### Public Catalog

* `GET /api/v1/products` – Returns a paginated list of products from the local cache. Supports filters:
  * `q` – search by name (case‑insensitive).
  * `regionId`, `tags` – narrow results further.
  * `priceFrom`/`priceTo` – filter by Iraqi price range.
  * `page`, `limit` – pagination.
  * `sortBy` (`priceMin`, `updatedAt`, `name`) and `sortType` (`asc`/`desc`).
  
  Hidden or out‑of‑stock products (`flags.hidden` or `derived.inStock` false) are automatically excluded.

* `GET /api/v1/products/:id` – Returns a single product. Uses overrides for name, description and images when present.

* `PATCH /api/v1/products/:id/overrides` – Update overrides (name, description, images). Passing `null` clears an override field.

### Sync Management

* `GET /api/v1/sync/profile` – View the current sync profile. The profile contains `filters` and `fields` keys. You can edit this to narrow what Kinguin data is fetched (e.g. restricting to tags, merchant names, etc.).

* `PUT /api/v1/sync/profile` – Set the sync profile. Example body:

  ```json
  {
    "filters": {
      "tags": "base",
      "merchantName": "Gamekeyz.net"
    },
    "fields": ["name", "images", "price", "qty", "offers", "regionId", "tags", "platform", "genres"]
  }
  ```

  - `filters` are passed directly to the Kinguin API. Do **not** set `regionId`, `regionIds`, `platforms`, or `genres` here – these are handled internally by the workers.
  - `fields` defines which fields to store under `remote.*`. Leaving it empty stores all.

* `POST /api/v1/sync/run` – Trigger a delta sync immediately. Normally you schedule `deltaSync.js` to run every minute via cron.

* `POST /api/v1/sync/import` – Run a full import (paginated with limit=100) to seed the database. Use this after setting a new profile or when first deploying.

* `POST /api/v1/sync/reconcile` – Reconcile the catalog. Performs a full fetch of the Kinguin catalog and hides any local products whose IDs no longer appear upstream.

### Webhooks (Optional)

If you configure webhooks in the Kinguin integration dashboard, you can point them to your server:

* `POST /webhooks/kinguin/product-update` – Triggers a delta sync when Kinguin notifies of catalog changes.
* `POST /webhooks/kinguin/order-complete` – Called when an order is completed. Implement to deliver keys or mark orders as fulfilled.
* `POST /webhooks/kinguin/order-status` – Called on order status changes (reserve, cancel, out-of-stock).

Set a secret in your `.env` (`WEBHOOK_SECRET`) and the dashboard so you can verify requests.

## Running the Workers

* **Initial import:**

  ```bash
  node worker/importAll.js
  ```

  This imports all products matching the profile filters, the allowed region/platform/genre lists, and stores them in `KinguinProduct`. It uses `limit=100` per page.

* **Delta sync:**

  ```bash
  node worker/deltaSync.js
  ```

  Run this every minute via cron or Render background worker. It fetches only products updated since the last sync, using `updatedSince` and `limit=100`. It applies the same region/platform/genre filters and recomputes derived prices.

* **Reconcile:**

  ```bash
  node worker/reconcile.js
  ```

  Run this weekly or nightly to hide delisted products. It fetches the entire catalog (using `limit=100`) and flags missing IDs as hidden. Hidden products no longer appear in search or home pages.

## Considerations

1. **Performance:** The delta sync updates only changed items, making the system efficient even if thousands of products change per hour. Import and reconcile jobs may take longer since they fetch all pages.
2. **Consistency:** Products imported via the full import will be filtered by region, platform and genre. If you later change the allowed lists, re-run the import to refresh the database.
3. **Fallback price check:** Because the catalog is synced periodically, there is a possibility that a price has changed just before a user checks out. To avoid selling at outdated prices or stock, optionally call the Kinguin product endpoint directly before confirming an order.
4. **Secrets:** Do not commit real API keys or database credentials to your repository. Use `.env` for configuration and rotate keys regularly.

## Summary

This system decouples your storefront from Kinguin’s API by maintaining a local, filtered cache of products. It enforces region/platform/genre restrictions appropriate for Iraq, converts Euro prices to IQD with markup, and gives you full control over product presentation. Background workers keep the cache up-to-date via incremental updates and reconciliation jobs.