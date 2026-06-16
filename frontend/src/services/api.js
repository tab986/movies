import axios from "axios";
import { supabase } from "../lib/supabase";

/**
 * In dev, use same-origin `/api` so Vite proxies to the Express server (see vite.config.js).
 * Set VITE_API_URL only if you need an absolute URL (e.g. testing against another host).
 */
const baseURL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
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
