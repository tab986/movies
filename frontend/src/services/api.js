import axios from "axios";
import { getClientId } from "../lib/clientId";

const baseURL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  config.headers["X-Client-Id"] = getClientId();
  return config;
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

export async function fetchMyList() {
  const { data } = await api.get("/my-list");
  return data;
}

export async function toggleMyList(movieId) {
  const { data } = await api.post("/my-list", { movieId });
  return data;
}

export async function myListStatus(movieId) {
  const { data } = await api.get(`/my-list/${movieId}/status`);
  return data;
}

export default api;
