-- ============================================================
-- Movies app — users + favorites (My List)
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Paste into pgAdmin Query Tool or: psql -f deploy/schema.sql
-- ============================================================

-- 1) Users (accounts for login)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Favorites (saved movies per user)
-- movie_id = TMDB movie ID (integer), not stored in DB otherwise
CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

-- 3) Helpful index for listing a user's favorites (newest first)
CREATE INDEX IF NOT EXISTS idx_favorites_user_created
  ON public.favorites (user_id, created_at DESC);
