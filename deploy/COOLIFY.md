# Deploy Movies on Coolify

Builds from the root **Dockerfile** (frontend + backend in one container).

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
| `DATABASE_URL` | Your Coolify Postgres connection string (use the **internal** hostname from Coolify, not `localhost`) |
| `JWT_SECRET` | Long random string for auth tokens |
| `TMDB_READ_ACCESS_TOKEN` | Your TMDB read token |
| `TMDB_API_KEY` | Your TMDB API key (optional if token set) |

Do not commit `.env` to git.

## 3. Health check

| Setting | Value |
|---------|--------|
| Path | `/healthz` |
| Port | `5000` |

## 4. After deploy

1. Open your Coolify URL — Movies home page with login/sign up in the navbar.
2. **Sign up** creates a user in Postgres.
3. **My List** requires login; favorites are stored per user in the database.

If movies fail to load, check `TMDB_*` env vars. If login fails, check `DATABASE_URL` and `JWT_SECRET`.

**DATABASE_URL tips:** URL-encode special characters in the password (`@` → `%40`, `!` → `%21`). Example: `postgresql://postgres:Postgres%402026%21Pass@your-postgres-host:5432/movies`. If Postgres requires SSL, append `?sslmode=require`.
