const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const databaseUrl = process.env.DATABASE_URL?.trim();

let pool = null;
let schemaPromise = null;

function needsSsl(url) {
  if (process.env.PGSSLMODE === "require") {
    return true;
  }
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("sslmode");
    return mode === "require" || mode === "verify-ca" || mode === "verify-full";
  } catch {
    return false;
  }
}

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS) || 15_000,
    ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
} else {
  console.warn("[db] DATABASE_URL is not set — auth and My List will not work.");
}

async function ensureSchema() {
  if (!pool) {
    return false;
  }
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const client = await pool.connect();
    try {
      try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      } catch (err) {
        console.warn("[db] pgcrypto extension skipped:", err.message || err);
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
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
  })();

  try {
    return await schemaPromise;
  } catch (err) {
    schemaPromise = null;
    throw err;
  }
}

module.exports = { pool, ensureSchema };
