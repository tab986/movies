# Movies

Full-stack movie browser: React + Vite frontend, Express API, TMDB catalog, Supabase Auth + Postgres favorites.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind, React Router |
| Backend | Node.js, Express |
| Movies data | [TMDB API](https://developer.themoviedb.org/) |
| Auth & favorites DB | Supabase (Postgres + Auth) |

## Local development

```bash
cp .env.example .env   # fill DATABASE_URL, TMDB keys, Supabase vars
npm install
npm install --prefix frontend
npm run dev:all        # API on :5000, Vite on :5173
```

Open **http://localhost:5173** — Vite proxies `/api` to the backend.

## Production (Docker / Coolify)

The Dockerfile builds the frontend and serves it from the same container as the API.

**Required env vars:**

| Variable | Notes |
|----------|--------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT Secret |
| `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` | TMDB credentials |
| `VITE_SUPABASE_URL` | Build-time — Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Build-time — Supabase anon key |

**Health check:** `GET /healthz` → `{"status":"ok"}`

See [deploy/COOLIFY.md](deploy/COOLIFY.md) for Coolify setup.

## API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/movies` | Public |
| GET | `/api/movies/:id` | Public |
| GET | `/api/search?q=` | Public |
| GET | `/api/my-list` | Supabase JWT |
| POST | `/api/my-list` | Supabase JWT |
| GET | `/api/my-list/:movieId/status` | Supabase JWT |
