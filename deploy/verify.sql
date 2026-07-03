-- Verification queries — run in pgAdmin after deploy/schema.sql

-- Confirm tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'favorites');

-- List all users
SELECT id, email, created_at FROM public.users ORDER BY created_at DESC;

-- List all saved favorites (with user email)
SELECT u.email, f.movie_id, f.created_at
FROM public.favorites f
JOIN public.users u ON u.id = f.user_id
ORDER BY f.created_at DESC;

-- Count favorites per user
SELECT u.email, COUNT(*) AS favorite_count
FROM public.users u
LEFT JOIN public.favorites f ON f.user_id = u.id
GROUP BY u.email
ORDER BY favorite_count DESC;
