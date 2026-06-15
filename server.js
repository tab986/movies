const path = require("path");
const dot = require("dotenv");

dot.config();
dot.config({ path: path.join(__dirname, "config.env"), override: false });

const app = require("./app");
const { sequelize } = require("./post-models");
const initDatabaseTables = require("./post-models/initDatabase");

let server;
let isShuttingDown = false;

const startupState = {
  phase: "booting",
  dbReady: false,
  dbAuthenticated: false,
  dbInitCompleted: false,
  dbInitEnabled: false,
  dbError: null,
};

app.locals.startupState = startupState;

function isTruthy(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function logPhase(phase, message, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[startup:${phase}] ${message}${suffix}`);
}

async function ensureKinguinRelationExists() {
  startupState.phase = "db_verify_schema";
  logPhase(
    "db_verify_schema",
    'Verifying required relation "public.kinguin_products"...'
  );

  const [rows] = await sequelize.query(
    "SELECT to_regclass('public.kinguin_products') AS relation_name;"
  );
  const relationName = rows?.[0]?.relation_name || null;

  if (!relationName) {
    throw new Error(
      'Missing required relation "public.kinguin_products". Set DB_INIT_ON_STARTUP=true for one deployment (or apply migrations) before serving catalog traffic.'
    );
  }

  logPhase("db_verify_schema", `Verified relation exists (${relationName})`);
}

function shutdown(exitCode, reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  startupState.phase = "shutting_down";
  console.log(`[shutdown] Received ${reason}. Closing HTTP server...`);

  if (!server) {
    process.exit(exitCode);
    return;
  }

  const forceExitTimer = setTimeout(() => {
    console.error("[shutdown] Graceful shutdown timeout reached. Forcing exit.");
    process.exit(exitCode);
  }, 10_000);

  server.close(() => {
    clearTimeout(forceExitTimer);
    console.log("[shutdown] HTTP server closed. Exiting process.");
    process.exit(exitCode);
  });
}

async function runBackgroundStartup() {
  startupState.phase = "db_connecting";
  logPhase("db_connecting", "Authenticating Postgres connection...");

  try {
    await sequelize.authenticate();
    startupState.dbAuthenticated = true;
    startupState.phase = "db_connected";
    logPhase("db_connected", "Postgres connected");

    startupState.phase = "db_init";
    const rawInitFlag = process.env.DB_INIT_ON_STARTUP;
    startupState.dbInitEnabled = isTruthy(rawInitFlag);
    logPhase(
      "db_init",
      "Running DB initialization guard",
      `(DB_INIT_ON_STARTUP=${rawInitFlag || "unset"}, enabled=${startupState.dbInitEnabled})`
    );
    if (!startupState.dbInitEnabled) {
      console.warn(
        "[startup:db_init] DB_INIT_ON_STARTUP is disabled; startup will verify schema and stay degraded if relation is missing"
      );
    }
    const didRunInit = await initDatabaseTables();
    startupState.dbInitCompleted = !!didRunInit;
    logPhase(
      "db_init",
      didRunInit
        ? "Table initialization executed"
        : "Table initialization skipped by startup flag"
    );

    await ensureKinguinRelationExists();

    startupState.dbReady = true;
    startupState.phase = "ready";
    logPhase("ready", "Startup background tasks completed");
  } catch (err) {
    startupState.dbError = err?.message || String(err);
    startupState.phase = "degraded";
    console.error(
      "[startup:degraded] DB startup failed:",
      err?.stack || err?.message || err
    );

    const rawExitFlag = process.env.EXIT_ON_STARTUP_DB_FAILURE;
    const shouldExitOnFailure = isTruthy(rawExitFlag);
    if (shouldExitOnFailure) {
      console.error(
        `[startup:degraded] EXIT_ON_STARTUP_DB_FAILURE=${rawExitFlag || "unset"} resolved to true, shutting down`
      );
      shutdown(1, "startup DB failure");
    } else {
      console.warn(
        `[startup:degraded] EXIT_ON_STARTUP_DB_FAILURE=${rawExitFlag || "unset"} resolved to false; service continues in degraded mode`
      );
    }
  }
}

async function startServer() {
  const port = process.env.PORT || 3000;
  startupState.phase = "http_listen";
  logPhase("http_listen", `Binding HTTP listener on port ${port}...`);
  server = app.listen(port, "0.0.0.0", () => {
    logPhase("http_listen", `Server running on 0.0.0.0:${port}`);
  });

  // Start internal scheduler for full import (if enabled)
  if (process.env.ENABLE_INTERNAL_SCHEDULER !== "false") {
    require("./worker/scheduler");
    console.log("[server] Internal full import scheduler enabled");
  }

  // Keep long-running import requests alive on the Node side
  server.requestTimeout = 0; // disable (Node v18+)
  server.headersTimeout = 0; // disable (Node v18+)
  server.keepAliveTimeout = 0; // optional: let the import hold the socket

  runBackgroundStartup();
}

startServer().catch((err) => {
  console.error(
    "[startup:fatal] Failed before HTTP listener became healthy:",
    err?.stack || err?.message || err
  );
  shutdown(1, "fatal startup error");
});


process.on("SIGTERM", () => {
  console.log("[signal] SIGTERM received");
  shutdown(0, "SIGTERM");
});

process.on("SIGINT", () => {
  console.log("[signal] SIGINT received");
  shutdown(0, "SIGINT");
});

process.on("uncaughtException", (err) => {
  console.error(
    "[process:uncaughtException]",
    `phase=${startupState.phase}`,
    err?.stack || err?.message || err
  );
  shutdown(1, "uncaughtException");
});

process.on("unhandledRejection", (err) => {
  console.error(
    "[process:unhandledRejection]",
    `phase=${startupState.phase}`,
    err?.stack || err?.message || err
  );
  shutdown(1, "unhandledRejection");
});
