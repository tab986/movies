import axios from "axios";
import { clearAuthStorage, getStoredToken, setAuthStorage } from "../lib/authStorage";

const baseURL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function register(email, password) {
  const { data } = await api.post("/auth/register", { email, password });
  setAuthStorage(data.token, data.user);
  return data;
}

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  setAuthStorage(data.token, data.user);
  return data;
}

export function logoutApi() {
  clearAuthStorage();
}

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
