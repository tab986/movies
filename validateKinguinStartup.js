const dot = require("dotenv");
dot.config();
dot.config({ path: "./config.env", override: false });

const { sequelize } = require("./post-models");

function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

async function checkRelation() {
  const [rows] = await sequelize.query(
    "SELECT to_regclass('public.kinguin_products') AS relation_name;"
  );
  const relationName = rows?.[0]?.relation_name || null;
  if (!relationName) {
    throw new Error('Missing relation "public.kinguin_products"');
  }
  console.log(`[validate] relation check passed (${relationName})`);
}

async function checkEndpoint(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `[${response.status}] ${endpoint} failed: ${text.slice(0, 400)}`
    );
  }

  console.log(`[validate] endpoint check passed (${endpoint})`);
}

async function run() {
  const baseUrl = normalizeBaseUrl(
    process.env.POST_DEPLOY_BASE_URL || process.env.BASE_URL
  );

  try {
    await sequelize.authenticate();
    console.log("[validate] postgres connection passed");
    await checkRelation();

    if (!baseUrl) {
      console.log(
        "[validate] skipping HTTP endpoint checks (set POST_DEPLOY_BASE_URL to enable)"
      );
      return;
    }

    await checkEndpoint(baseUrl, "/healthz");
    await checkEndpoint(baseUrl, "/api/v1/products?limit=1");
    await checkEndpoint(baseUrl, "/api/v1/catalog?limit=1");
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run()
  .then(() => {
    console.log("[validate] completed successfully");
  })
  .catch((error) => {
    console.error("[validate] failed:", error?.stack || error?.message || error);
    process.exitCode = 1;
  });
