const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const databaseUrl = process.env.DATABASE_URL?.trim();

let pool = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS) || 15_000,
  });
} else {
  console.warn("[db] DATABASE_URL is not set — auth and My List will not work.");
}

async function ensureSchema() {
  if (!pool) {
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const favCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'favorites'
    `);
    const colNames = favCols.rows.map((r) => r.column_name);
    if (colNames.includes("client_id") && !colNames.includes("user_id")) {
      await client.query(`DROP TABLE IF EXISTS favorites CASCADE`);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        movie_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, movie_id)
      )
    `);

    await client.query("SELECT 1");
    console.log("[db] Postgres connected — users and favorites tables ready.");
    return true;
  } finally {
    client.release();
  }
}

module.exports = { pool, ensureSchema };
