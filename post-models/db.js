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
  const uri = process.env.POSTGRES_URI || process.env.DATABASE_URL;

  if (uri) {
    return new Sequelize(uri, {
      dialect: "postgres",
      logging: false,
    });
  }

  const config = buildConfigFromParts();
  return new Sequelize(config.database, config.username, config.password, config);
}

const sequelize = createSequelize();

module.exports = {
  Sequelize,
  sequelize,
};
