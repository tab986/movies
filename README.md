# Movies

Full-stack movie browser: React + Vite frontend, Express API, TMDB catalog, email/password auth, and Postgres favorites.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind, React Router |
| Backend | Node.js, Express, JWT + bcrypt |
| Movies data | [TMDB API](https://developer.themoviedb.org/) |
| Auth & favorites | Postgres (`users`, `favorites`) |

## Local development

```bash
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, TMDB keys
npm install
npm install --prefix frontend
docker compose up -d postgres   # optional local DB
npm run dev:all                 # API on :5000, Vite on :5173
```

Open **http://localhost:5173**

## Production (Docker / Coolify)

| Variable | Notes |
|----------|--------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Random secret for JWT signing |
| `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` | TMDB credentials |

**Health check:** `GET /healthz` → `{"status":"ok"}`

See [deploy/COOLIFY.md](deploy/COOLIFY.md).

## API routes

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/movies` | Public |
| GET | `/api/movies/:id` | Public |
| GET | `/api/search?q=` | Public |
| GET | `/api/my-list` | JWT |
| POST | `/api/my-list` | JWT |
| GET | `/api/my-list/:movieId/status` | JWT |
