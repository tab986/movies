const tmdb = require("../services/tmdb");

/**
 * GET /api/movies — TMDB catalog (merged) or discover with ?limit=&offset=
 */
function queryProvided(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "";
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

module.exports = {
  getAllMovies,
  getMovieById,
  searchMovies,
};
