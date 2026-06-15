# Deploy on Coolify

Coolify builds and runs this repo from the root **Dockerfile**. No custom build command is required.

## 1. Create the service

1. In Coolify, add a **new resource** → **Application** (or Docker deploy from Git).
2. Connect repository: `https://github.com/tab986/movies.git`, branch **`main`**.
3. Set **Build pack** to **Dockerfile** and path **`Dockerfile`** (repo root).
4. Set **Port** to match `PORT` in your env (default in `.env.example` is **5000**).

## 2. Environment variables

In Coolify → **Environment**, add variables from [`.env.example`](../.env.example). Minimum for production:

| Variable | Notes |
|----------|--------|
| `PORT` | Must match Coolify port mapping (e.g. `5000`) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase or linked Postgres connection string (`?sslmode=require` for managed DB) |
| `DB_INIT_ON_STARTUP` | `true` once on a fresh database, then `false` |
| `JWT_SECRET` | Long random string |
| `KINGUIN_API_KEY` | Kinguin ESA key |
| `WAYL_*` | Payment gateway keys and callback URL |
| `R2_*` | Cloudflare R2 for uploads (if used) |

Do **not** paste `.env` from your laptop into git; use Coolify's secret UI only.

## 3. Database

- **Recommended:** external Postgres (e.g. Supabase). Set `DATABASE_URL` only.
- **Alternative:** deploy a Postgres service in Coolify and set `DATABASE_URL` to the internal URL Coolify provides.

## 4. Health check

| Setting | Value |
|---------|--------|
| Path | `/healthz` |
| Expected | HTTP 200, body `{"status":"ok"}` |
| Port | Same as `PORT` |

Catalog routes may return `503` until Postgres finishes startup; `/healthz` stays `200` for liveness.

## 5. First deploy checklist

1. Push to `main` (or let Coolify pull latest).
2. Set `DB_INIT_ON_STARTUP=true`, deploy once, confirm logs show `ready`.
3. Set `DB_INIT_ON_STARTUP=false`, redeploy.
4. Point your API domain (DNS) to Coolify's proxy / generated URL.
5. Set `CORS_ALLOWED_ORIGINS` and `WAYL_WEBHOOK_URL` to the public API URL.

## 6. Optional cron

For delta sync without the in-process scheduler, use Coolify scheduled tasks or an external cron hitting:

- `POST /api/v1/sync/run`
- `POST /api/v1/sync/reconcile` (daily)

See [HOST_CHECKLIST.txt](./HOST_CHECKLIST.txt) for mirror/build troubleshooting.
