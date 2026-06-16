/**
 * The Movie Database (TMDB) API v3 — server-side only.
 * @see https://developer.themoviedb.org/reference
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

function getAuthHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (token && token.trim()) {
    return {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    };
  }
  const key = process.env.TMDB_API_KEY;
  if (!key || !key.trim()) {
    throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in .env");
  }
  return {
    Accept: "application/json",
  };
}

function apiKeyQuery() {
  const key = process.env.TMDB_API_KEY;
  return key && key.trim() ? `&api_key=${encodeURIComponent(key.trim())}` : "";
}

async function tmdbGet(path, searchParams = {}) {
  const qs = new URLSearchParams({ language: "en-US", ...searchParams });
  const url = `${TMDB_BASE}${path}?${qs.toString()}${apiKeyQuery()}`;
  const headers = getAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function mapMovie(m) {
  if (!m) return null;
  const year = m.release_date ? parseInt(String(m.release_date).slice(0, 4), 10) : 0;
  const poster = m.poster_path ? `${IMG_BASE}/w500${m.poster_path}` : "";
  return {
    id: m.id,
    title: m.title || m.name || "",
    description: m.overview || "",
    poster_url: poster,
    rating: m.vote_average != null ? Number(m.vote_average) : 0,
    release_year: Number.isFinite(year) ? year : 0,
  };
}

/** Merge unique by id, preserve order */
function dedupeMovies(arr) {
  const seen = new Set();
  const out = [];
  for (const m of arr) {
    const id = m.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(mapMovie(m));
  }
  return out;
}

/**
 * Combined catalog for home: popular + trending + top rated + upcoming (deduped).
 */
async function fetchMoviesCatalog() {
  const tasks = [
    () => tmdbGet("/movie/popular", { page: "1" }),
    () => tmdbGet("/trending/movie/week", {}),
    () => tmdbGet("/movie/top_rated", { page: "1" }),
    () => tmdbGet("/movie/upcoming", { page: "1" }),
  ];
  const raw = [];
  const errors = [];
  for (const fn of tasks) {
    try {
      const data = await fn();
      if (data?.results?.length) raw.push(...data.results);
    } catch (e) {
      const msg = e?.message || String(e);
      errors.push(msg);
      console.warn("TMDB catalog:", msg);
    }
  }
  const movies = dedupeMovies(raw);
  if (movies.length === 0) {
    throw new Error(
      errors[0] ||
        "No movies returned from TMDB. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in the server environment (Coolify → Environment)."
    );
  }
  return movies;
}

/**
 * Paginated discover (for large lists / ?limit & ?offset).
 */
async function fetchDiscoverPaginated(limit, offset) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const perPage = 20;
  const out = [];
  let page = Math.floor(safeOffset / perPage) + 1;
  const skip = safeOffset % perPage;
  let firstChunk = true;

  while (out.length < safeLimit && page <= 500) {
    const data = await tmdbGet("/discover/movie", {
      page: String(page),
      sort_by: "popularity.desc",
    });
    let rows = data.results || [];
    if (firstChunk && skip > 0) {
      rows = rows.slice(skip);
      firstChunk = false;
    }
    for (const m of rows) {
      if (out.length >= safeLimit) break;
      out.push(mapMovie(m));
    }
    if (!data.results?.length || page >= (data.total_pages || 1)) break;
    page += 1;
    firstChunk = false;
  }
  return out;
}

async function fetchMovieById(id) {
  const qs = new URLSearchParams({ language: "en-US" });
  const url = `${TMDB_BASE}/movie/${id}?${qs.toString()}${apiKeyQuery()}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return mapMovie(data);
}

async function searchMovies(query) {
  if (!query || !String(query).trim()) return [];
  const data = await tmdbGet("/search/movie", {
    query: String(query).trim(),
    page: "1",
    include_adult: "false",
  });
  return (data.results || []).map(mapMovie);
}

/** Verify TMDB has this movie id */
async function movieExists(id) {
  const m = await fetchMovieById(id);
  return m != null;
}

async function fetchMoviesByIds(ids) {
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        return await fetchMovieById(id);
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

module.exports = {
  mapMovie,
  fetchMoviesCatalog,
  fetchDiscoverPaginated,
  fetchMovieById,
  searchMovies,
  movieExists,
  fetchMoviesByIds,
};
