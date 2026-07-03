/**
 * End-to-end smoke test: register → add favorite → verify in DB.
 * Usage: node scripts/test-favorites-flow.js
 */
require("dotenv").config();
const { Pool } = require("pg");

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:5000";
const TEST_EMAIL = `favtest_${Date.now()}@example.com`;
const TEST_PASSWORD = "password123";
const TEST_MOVIE_ID = 550; // Fight Club — common TMDB id

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function httpJson(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main() {
  console.log("1) Register test user...");
  const reg = await httpJson("POST", "/api/auth/register", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (reg.status !== 201) {
    throw new Error(`Register failed (${reg.status}): ${JSON.stringify(reg.data)}`);
  }
  const token = reg.data.token;
  const userId = reg.data.user.id;
  console.log("   OK — user id:", userId);

  console.log("2) Add movie to My List...");
  const toggle = await httpJson("POST", "/api/my-list", { movieId: TEST_MOVIE_ID }, token);
  if (toggle.status !== 200 || !toggle.data.inList) {
    throw new Error(`Toggle failed (${toggle.status}): ${JSON.stringify(toggle.data)}`);
  }
  console.log("   OK — movie_id:", TEST_MOVIE_ID);

  console.log("3) Fetch My List via API...");
  const list = await httpJson("GET", "/api/my-list", null, token);
  if (list.status !== 200 || !list.data.some((m) => m.id === TEST_MOVIE_ID)) {
    throw new Error(`My List fetch failed (${list.status}): ${JSON.stringify(list.data)}`);
  }
  console.log("   OK —", list.data.length, "movie(s) in list");

  console.log("4) Verify row in Postgres...");
  const row = await pool.query(
    `SELECT f.user_id, f.movie_id, u.email
     FROM public.favorites f
     JOIN public.users u ON u.id = f.user_id
     WHERE f.user_id = $1 AND f.movie_id = $2`,
    [userId, TEST_MOVIE_ID]
  );
  if (row.rows.length !== 1) {
    throw new Error("Favorite row not found in database");
  }
  console.log("   OK —", row.rows[0]);

  console.log("5) Remove favorite (cleanup)...");
  const remove = await httpJson("POST", "/api/my-list", { movieId: TEST_MOVIE_ID }, token);
  if (remove.status !== 200 || remove.data.inList) {
    throw new Error(`Remove failed (${remove.status}): ${JSON.stringify(remove.data)}`);
  }
  await pool.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
  console.log("   OK — test user cleaned up");

  console.log("\nFAVORITES_FLOW_OK");
}

main()
  .catch((err) => {
    console.error("\nFAIL:", err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
