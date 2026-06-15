const { Sequelize } = require("sequelize");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildConfigFromParts() {
  const host =
    process.env.POSTGRES_HOST ||
    process.env.PGHOST ||
    "postgres.railway.internal";
  const port = toNumber(process.env.POSTGRES_PORT || process.env.PGPORT, 5432);
  const database =
    process.env.POSTGRES_DB || process.env.PGDATABASE || "postgres";
  const username = process.env.POSTGRES_USER || process.env.PGUSER || "postgres";
  const password = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "";
  const sslEnabled = String(
    process.env.POSTGRES_SSL || process.env.PGSSLMODE || ""
  ).toLowerCase();

  return {
    database,
    username,
    password,
    host,
    port,
    dialect: "postgres",
    logging: false,
    dialectOptions:
      sslEnabled === "true" || sslEnabled === "require"
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : undefined,
  };
}

function createSequelize() {
  const uri =
    process.env.POSTGRES_URI ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (uri) {
    console.log("[db] Using URI-based Postgres config (POSTGRES_URI/DATABASE_URL/POSTGRES_URL)");
    const sslMode = String(process.env.POSTGRES_SSL || process.env.PGSSLMODE || "")
      .trim()
      .toLowerCase();
    const needsSsl =
      sslMode === "true" ||
      sslMode === "require" ||
      /sslmode=(require|verify-full|prefer)/i.test(uri);
    // pg treats sslmode=require in the URL as verify-full; strip it and use dialectOptions instead.
    const normalizedUri = uri.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]$/, "");
    return new Sequelize(normalizedUri, {
      dialect: "postgres",
      logging: false,
      dialectOptions: needsSsl
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : undefined,
    });
  }

  const config = buildConfigFromParts();
  console.warn(
    `[db] Using host-based Postgres config (host=${config.host}, port=${config.port}, db=${config.database})`
  );
  return new Sequelize(config.database, config.username, config.password, config);
}

const sequelize = createSequelize();

module.exports = {
  Sequelize,
  sequelize,
};