# GameWise (movies repo) — Project Overview

Backend API and tooling for **GameWise**, an Iraqi digital storefront for game keys, gift cards, and subscriptions. The service integrates **Kinguin** for catalog and fulfillment, **Wayl** for payments, and exposes REST endpoints for storefronts, admin dashboards, and webhooks.

## Stack

| Layer | Technology |
|--------|------------|
| Runtime | Node.js, Express |
| Primary data | MongoDB (Mongoose) — users, orders, Kinguin cache, coupons, CMS |
| Articles / blog | PostgreSQL via Sequelize (`post-models/`) — Supabase or any Postgres URL |
| Storage | S3-compatible (e.g. Cloudflare R2) for uploads |
| Frontend (optional) | Vite build under `frontend/`; static assets in `public/` |
| Deploy | Docker, [Render](render.yaml), cron sync jobs |

## Quick start

```bash
npm install
cp .env.example .env   # if present; otherwise configure env vars (see below)
npm start              # runs server.js
```

The HTTP server binds to `PORT` (default from env). Startup validates Kinguin connectivity and database readiness before accepting traffic.

## API surface (prefix `/api/v1`)

| Area | Base path | Notes |
|------|-----------|--------|
| Products & catalog | `/products` | Includes `GET /products/ganraGames` (genre-grouped games), listings, SEO helpers |
| Users & auth | `/users` | Registration, login, profiles |
| Orders | `/orders` | Digital key orders, status |
| Dashboard | `/dashboard` | Admin stats and management |
| Coupons | `/coupon` | Discount codes |
| Sync | `/sync` | Kinguin import / delta sync triggers |
| Catalog cache | `/catalog` | Kinguin cache utilities |
| Merchant / seller | `/merchant`, seller routes | Partner flows |
| Articles | `/articles` | Blog/content (Postgres) |
| Webhooks | `/webhooks` | Payment and external callbacks |

Rate limiting, Helmet, XSS/mongo sanitization, and CORS are applied in `app.js`.

## Background workers

Under `worker/`: scheduled **import**, **delta sync**, and **reconcile** jobs keep Kinguin products and inventory aligned with the database.

## Configuration

Use environment variables (never commit `.env`). Typical groups:

- **MongoDB** — main application database
- **Postgres** — `POSTGRES_URI` / `DATABASE_URL` for articles (SSL supported via `POSTGRES_SSL`)
- **Kinguin** — API credentials for ESA
- **Wayl** — payment integration
- **JWT / cookies** — session and auth
- **AWS/R2** — object storage for images

Local SQLite files (`*.db`) are ignored by git and are not used in production paths.

## Repository layout

```
app.js, server.js     Express app and bootstrap
controllers/          Route handlers
routes/               API routers
post-models/          Sequelize models (Postgres)
worker/               Sync and maintenance jobs
frontend/             Storefront or admin UI source
deploy/               Host operator checklists
```

## Documentation

The long-form file reference and endpoint notes live in [README.md](./README.md).

## License / origin

Evolved from the GameWise backend codebase; this remote (`tab986/movies`) hosts the consolidated API and deploy artifacts for the GameWise product catalog.
