const { sequelize } = require("./db");

function isInitEnabled(flagValue) {
  if (typeof flagValue !== "string") return false;
  const normalized = flagValue.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

async function initDatabaseTables() {
  const enabled = isInitEnabled(process.env.DB_INIT_ON_STARTUP);

  if (!enabled) {
    console.log(
      "[db-init] Skipped table initialization (DB_INIT_ON_STARTUP is disabled)"
    );
    return false;
  }

  console.log("[db-init] Starting table initialization (create-only sync)");

  try {
    await sequelize.sync();
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_price_min_num
      ON kinguin_products ((NULLIF("derived"->>'priceMin', '')::double precision));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_remote_genres_gin
      ON kinguin_products
      USING gin (("remote"->'genres'));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_remote_tags_gin
      ON kinguin_products
      USING gin (("remote"->'tags'));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_hidden_instock_expr
      ON kinguin_products ((("flags"->>'hidden') IS DISTINCT FROM 'true'), ("derived"->'inStock'));
    `);
    console.log("[db-init] Table initialization completed successfully");
    return true;
  } catch (error) {
    console.error("[db-init] Table initialization failed:", error);
    throw error;
  }
}

module.exports = initDatabaseTables;
