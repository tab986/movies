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
  console.warn("[db] DATABASE_URL is not set — My List will not persist to Postgres.");
}

async function ensureSchema() {
  if (!pool) {
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        client_id TEXT NOT NULL,
        movie_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (client_id, movie_id)
      )
    `);
    await client.query("SELECT 1");
    console.log("[db] Postgres connected and favorites table is ready.");
    return true;
  } finally {
    client.release();
  }
}

module.exports = { pool, ensureSchema };
