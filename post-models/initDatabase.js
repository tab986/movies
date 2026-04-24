const { sequelize } = require("./db");

function isInitEnabled(flagValue) {
  if (typeof flagValue !== "string") return false;
  const normalized = flagValue.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isProductionLikeEnv() {
  const env = (process.env.NODE_ENV || "").trim().toLowerCase();
  return env === "production" || env === "staging";
}

async function initDatabaseTables() {
  const rawFlag = process.env.DB_INIT_ON_STARTUP;
  const enabled = isInitEnabled(rawFlag);

  if (!enabled) {
    const envLabel = process.env.NODE_ENV || "unknown";
    console.log(
      `[db-init] Skipped table initialization (DB_INIT_ON_STARTUP=${rawFlag || "unset"}, NODE_ENV=${envLabel})`
    );
    return false;
  }

  if (isProductionLikeEnv()) {
    console.warn(
      "[db-init] DB_INIT_ON_STARTUP enabled in production-like environment; ensure this is intentional"
    );
  }

  console.log("[db-init] Starting table initialization (create-only sync)");

  try {
    await sequelize.sync();
    await sequelize.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS "paymentCurrency" VARCHAR(3) NOT NULL DEFAULT 'IQD';
    `);
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
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
      CREATE INDEX IF NOT EXISTS idx_kinguin_remote_publishers_gin
      ON kinguin_products
      USING gin (("remote"->'publishers'));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_remote_developers_gin
      ON kinguin_products
      USING gin (("remote"->'developers'));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_metacritic_num
      ON kinguin_products ((NULLIF("remote"->>'metacriticScore', '')::double precision));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_platform_canonical
      ON kinguin_products ((("derived"->>'platformCanonical')));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_hidden_instock_expr
      ON kinguin_products ((("flags"->>'hidden') IS DISTINCT FROM 'true'), ("derived"->'inStock'));
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_search_name_norm_trgm
      ON kinguin_products
      USING gin (
        (
          LOWER(
            COALESCE(
              "overrides"->>'name',
              "remote"->>'name',
              "remote"->>'originalName',
              ''
            )
          )
        ) gin_trgm_ops
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_search_initials_prefix
      ON kinguin_products (
        (
          regexp_replace(
            regexp_replace(
              LOWER(
                COALESCE(
                  "overrides"->>'name',
                  "remote"->>'name',
                  "remote"->>'originalName',
                  ''
                )
              ),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '(^|\\s+)([a-z0-9])[a-z0-9]*',
            '\\2',
            'g'
          )
        ) text_pattern_ops
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_kinguin_visible_instock_region_price
      ON kinguin_products (
        (NULLIF("remote"->>'regionId', '')::integer),
        (NULLIF("derived"->>'priceMin', '')::double precision)
      )
      WHERE ("flags"->>'hidden') IS DISTINCT FROM 'true'
        AND "derived"->'inStock' = 'true'::jsonb;
    `);
    console.log("[db-init] Table initialization completed successfully");
    return true;
  } catch (error) {
    console.error("[db-init] Table initialization failed:", error);
    throw error;
  }
}

module.exports = initDatabaseTables;
