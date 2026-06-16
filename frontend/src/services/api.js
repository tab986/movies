import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

export async function fetchMovies(params) {
  const { data } = await api.get("/movies", { params });
  return data;
}

export async function fetchMovie(id) {
  const { data } = await api.get(`/movies/${id}`);
  return data;
}

export async function searchMovies(q) {
  const { data } = await api.get("/search", { params: { q } });
  return data;
}

export default api;
