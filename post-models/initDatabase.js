const { sequelize } = require("./index");

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
    console.log("[db-init] Table initialization completed successfully");
    return true;
  } catch (error) {
    console.error("[db-init] Table initialization failed:", error);
    throw error;
  }
}

module.exports = initDatabaseTables;
