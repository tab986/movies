const path = require("path");
const { parse } = require("pg-connection-string");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !String(databaseUrl).trim()) {
  console.error("Missing DATABASE_URL. Add your Supabase Postgres URI (Project Settings → Database).");
  process.exit(1);
}

/** Remove sslmode from query string so we can set a single TLS mode below. */
function stripSslModeQuery(url) {
  const q = url.indexOf("?");
  if (q === -1) return url;
  const base = url.slice(0, q);
  const params = new URLSearchParams(url.slice(q + 1));
  params.delete("sslmode");
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Use sslmode=no-verify in the URI so pg-connection-string sets ssl.rejectUnauthorized=false.
 * Avoids merging bugs from passing both connectionString and a separate ssl object (Windows + pooler).
 */
function connectionStringForPool(url) {
  const u = stripSslModeQuery(url.trim());
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}sslmode=no-verify`;
}

const poolUrl = connectionStringForPool(databaseUrl);
const parsed = parse(poolUrl);

const isPoolerHost = /pooler\.supabase\.com/i.test(String(parsed.host || ""));
const port = String(parsed.port || "");
if (isPoolerHost && parsed.user === "postgres") {
  console.warn(
    "[db] DATABASE_URL uses pooler host but DB user is \"postgres\". For Supabase Session pooler, " +
      "the username must be postgres.<project_ref> (copy the full URI from the dashboard). " +
      "Plain \"postgres\" often causes 28P01 password authentication failed."
  );
}
if (isPoolerHost && port === "6543" && parsed.user && String(parsed.user).includes(".")) {
  console.warn(
    "[db] Port 6543 is transaction pooler (user \"postgres\"). Session pooler uses port 5432 with " +
      "user postgres.<project_ref>. Mixing them causes \"Connection to database not available\" (XX000)."
  );
}

const pool = new Pool({
  connectionString: poolUrl,
  max: 10,
  keepAlive: true,
  connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS) || 30_000,
});

if (isPoolerHost) {
  const u = String(parsed.user || "");
  const userLabel =
    u.startsWith("postgres.") && u.length > "postgres.".length + 2
      ? `postgres.${u.slice("postgres.".length, "postgres.".length + 6)}…`
      : u;
  console.warn(`[db] Pooler connection: host=${parsed.host} port=${parsed.port} user=${userLabel}`);
}

/**
 * Favorites keyed by Supabase Auth user id (auth.users).
 * Drops legacy integer user_id tables from the pre–Supabase Auth app when detected.
 */
async function ensureSchema() {
  try {
    const col = await pool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'favorites' AND column_name = 'user_id'
    `);
    if (col.rows[0]?.data_type === "integer") {
      await pool.query(`DROP TABLE IF EXISTS favorites CASCADE`);
      await pool.query(`DROP TABLE IF EXISTS users CASCADE`);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        movie_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, movie_id)
      )
    `);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (err && err.code === "XX000" && msg.includes("Tenant")) {
      const hint =
        "Supavisor: 'Tenant or user not found' — the pooler hostname region usually does not match your project. " +
        "In Supabase: Connect → Database → copy the Shared pooler URI exactly (do not change aws-0-REGION). " +
        "Username must stay postgres.<project_ref> from that same screen.";
      console.error(`[db] ${hint}`);
    }
    if (msg.includes("Connection terminated unexpectedly")) {
      console.error(
        "[db] The pooler closed the socket during connect (TLS or network). Try: disable VPN/proxy, " +
          "confirm project is not paused, or reset DB password in Supabase and update DATABASE_URL."
      );
    }
    if (msg.includes("Circuit breaker") || msg.includes("upstream database")) {
      console.error(
        "[db] Supabase pooler cannot reach your Postgres (platform-side). Open the dashboard to wake a paused " +
          "project, wait a few minutes, check status.supabase.com, or contact Support. Your URL is usually fine."
      );
    }
    throw err;
  }
}

module.exports = { pool, ensureSchema };
