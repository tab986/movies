# Deploy Movies on Coolify

Builds from the root **Dockerfile** (frontend + backend in one container). **No database** required.

## 1. Create the service

1. **Application** → repo `tab986/movies`, branch **`main`**
2. **Build pack:** Dockerfile
3. **Port:** `5000`
4. **Is it a static site?** No

## 2. Environment variables

| Variable | Value |
|----------|--------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://postgres:Postgres%402026%21Pass@<postgres-host>:5432/movies` |
| `TMDB_READ_ACCESS_TOKEN` | Your TMDB read token |
| `TMDB_API_KEY` | Your TMDB API key (optional if token set) |

Do not commit `.env` to git.

## 3. Health check

| Setting | Value |
|---------|--------|
| Path | `/healthz` |
| Port | `5000` |

## 4. After deploy

Open your Coolify URL — you should see the Movies home page. My List works in the browser without login.

If movies fail to load, check `TMDB_*` env vars and redeploy.
