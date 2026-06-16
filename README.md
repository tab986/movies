# Movies

Full-stack movie browser: React + Vite frontend, Express API, TMDB catalog. No database required — **My List** is saved in the browser.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind, React Router |
| Backend | Node.js, Express |
| Movies data | [TMDB API](https://developer.themoviedb.org/) |
| My List | Browser `localStorage` (per device) |

## Local development

```bash
cp .env.example .env   # fill TMDB keys
npm install
npm install --prefix frontend
npm run dev:all        # API on :5000, Vite on :5173
```

Open **http://localhost:5173**

## Production (Docker / Coolify)

| Variable | Notes |
|----------|--------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` | TMDB credentials |

**Health check:** `GET /healthz` → `{"status":"ok"}`

See [deploy/COOLIFY.md](deploy/COOLIFY.md).

## API routes

| Method | Path |
|--------|------|
| GET | `/api/movies` |
| GET | `/api/movies/:id` |
| GET | `/api/search?q=` |
