require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'favorites')
    ORDER BY table_name
  `);
  console.log("TABLES:", tables.rows);

  const indexes = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'favorites' AND schemaname = 'public'
  `);
  console.log("INDEXES:", indexes.rows);

  const users = await pool.query(
    "SELECT COUNT(*)::int AS count FROM public.users"
  );
  const favorites = await pool.query(
    "SELECT COUNT(*)::int AS count FROM public.favorites"
  );
  console.log("USER_COUNT:", users.rows[0].count);
  console.log("FAVORITE_COUNT:", favorites.rows[0].count);
})()
  .catch((err) => {
    console.error("FAIL:", err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
