const path = require("path");
const express = require("express");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { ensureSchema } = require("./db");
const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes");

function hasTmdbConfig() {
  return Boolean(
    (process.env.TMDB_READ_ACCESS_TOKEN && process.env.TMDB_READ_ACCESS_TOKEN.trim()) ||
      (process.env.TMDB_API_KEY && process.env.TMDB_API_KEY.trim())
  );
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api", movieRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err);
  const status = Number(err.status || err.statusCode) || 500;
  res.status(status).json({ error: err.message || "Server error." });
});

const fs = require("fs");
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
const shouldServeFrontend =
  process.env.NODE_ENV === "production" || fs.existsSync(path.join(frontendDist, "index.html"));

if (shouldServeFrontend) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    if (!hasTmdbConfig()) {
      console.error(
        "[startup] Missing TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY — /api/movies will fail until you set one in Coolify Environment."
      );
    }
    if (!process.env.JWT_SECRET?.trim()) {
      console.error("[startup] Missing JWT_SECRET — auth and My List will fail.");
    }
    console.log(`Movies app listening on http://0.0.0.0:${PORT}`);
  });

  if (process.env.DATABASE_URL?.trim()) {
    ensureSchema().catch((err) => {
      console.error("[startup] Database connection failed:", err.message || err);
    });
  }
}

start();
