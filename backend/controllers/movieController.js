const { pool } = require("../db");
const tmdb = require("../services/tmdb");

function queryProvided(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "";
}

function dbUnavailable(res) {
  return res.status(503).json({
    error: "Database is not configured. Set DATABASE_URL on the server.",
  });
}

async function getAllMovies(req, res) {
  try {
    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;

    if (!queryProvided(rawLimit) && !queryProvided(rawOffset)) {
      const rows = await tmdb.fetchMoviesCatalog();
      return res.json(rows);
    }

    const limit = Number.parseInt(String(rawLimit ?? "100"), 10);
    const offset = Number.parseInt(String(rawOffset ?? "0"), 10);
    const rows = await tmdb.fetchDiscoverPaginated(limit, offset);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(502).json({
      error: err.message || "Could not load movies from TMDB.",
    });
  }
}

async function getMovieById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid movie id." });
    }
    const movie = await tmdb.fetchMovieById(id);
    if (!movie) {
      return res.status(404).json({ error: "Movie not found." });
    }
    return res.json(movie);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: err.message || "Could not load movie." });
  }
}

async function searchMovies(req, res) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      return res.json([]);
    }
    const rows = await tmdb.searchMovies(q);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: err.message || "Search failed." });
  }
}

async function getMyList(req, res) {
  if (!pool) return dbUnavailable(res);
  try {
    const result = await pool.query(
      `SELECT movie_id FROM favorites WHERE client_id = $1 ORDER BY created_at DESC`,
      [req.clientId]
    );
    const ids = result.rows.map((r) => r.movie_id);
    const movies = await tmdb.fetchMoviesByIds(ids);
    return res.json(movies);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not load list." });
  }
}

async function toggleMyList(req, res) {
  if (!pool) return dbUnavailable(res);
  try {
    const movieId = Number(req.body?.movieId);
    if (!Number.isInteger(movieId) || movieId < 1) {
      return res.status(400).json({ error: "Valid movieId is required." });
    }
    const existsOnTmdb = await tmdb.movieExists(movieId);
    if (!existsOnTmdb) {
      return res.status(404).json({ error: "Movie not found on TMDB." });
    }

    const existsRes = await pool.query(
      `SELECT 1 FROM favorites WHERE client_id = $1 AND movie_id = $2`,
      [req.clientId, movieId]
    );
    if (existsRes.rows.length > 0) {
      await pool.query(`DELETE FROM favorites WHERE client_id = $1 AND movie_id = $2`, [
        req.clientId,
        movieId,
      ]);
      return res.json({ inList: false, movieId });
    }
    await pool.query(`INSERT INTO favorites (client_id, movie_id) VALUES ($1, $2)`, [
      req.clientId,
      movieId,
    ]);
    return res.json({ inList: true, movieId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not update list." });
  }
}

async function myListStatus(req, res) {
  if (!pool) return dbUnavailable(res);
  try {
    const movieId = Number(req.params.movieId);
    if (!Number.isInteger(movieId) || movieId < 1) {
      return res.status(400).json({ error: "Invalid movie id." });
    }
    const result = await pool.query(
      `SELECT 1 FROM favorites WHERE client_id = $1 AND movie_id = $2`,
      [req.clientId, movieId]
    );
    return res.json({ inList: result.rows.length > 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not load status." });
  }
}

module.exports = {
  getAllMovies,
  getMovieById,
  searchMovies,
  getMyList,
  toggleMyList,
  myListStatus,
};
