# Deploy Movies on Coolify

Builds from the root **Dockerfile** (frontend + backend in one container).

## 1. Create the service

1. **Application** → connect repo `tab986/movies`, branch **`main`**
2. **Build pack:** Dockerfile (path: `Dockerfile`)
3. **Port:** `5000`
4. **Is it a static site?** No

## 2. Environment variables

Add in Coolify → **Environment** (mark build-time vars if Coolify offers that option):

| Variable | Runtime | Build |
|----------|---------|-------|
| `PORT` | `5000` | |
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | Supabase Postgres URI | |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase API settings | |
| `TMDB_READ_ACCESS_TOKEN` | TMDB read token | |
| `TMDB_API_KEY` | TMDB API key (optional if token set) | |
| `VITE_SUPABASE_URL` | | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | | Supabase anon / publishable key |

Do not commit `.env` to git.

## 3. Health check

| Setting | Value |
|---------|--------|
| Path | `/healthz` |
| Port | `5000` |

## 4. After deploy

Open your Coolify URL — you should see the **Movies** home page (not JSON).

If the UI loads but movies fail, check `TMDB_*` vars. If login/My List fails, check `DATABASE_URL` and `SUPABASE_JWT_SECRET`.
