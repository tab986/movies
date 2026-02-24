// worker/scheduler.js
// Internal cron job scheduler for full import
// This runs full import daily within the Node.js process
// Alternative to using Render cron jobs

require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });
const cron = require("node-cron");
const { runImportAll } = require("./importAll");

// Schedule full import daily at 5 AM (Asia/Baghdad)
// Cron format: "0 5 * * *" means "every day at 05:00"
const SYNC_SCHEDULE = process.env.SYNC_SCHEDULE || "0 5 * * *";

console.log(
  `[scheduler] Starting full import scheduler with schedule: ${SYNC_SCHEDULE} (Asia/Baghdad)`
);

const job = cron.schedule(SYNC_SCHEDULE, async () => {
  const startTime = Date.now();
  console.log(`[scheduler] Running full import at ${new Date().toISOString()}`);

  try {
    const result = await runImportAll({ logger: console });
    const duration = Date.now() - startTime;
    console.log(
      `[scheduler] full import completed in ${duration}ms. Processed: ${
        result?.processed || 0
      }, upserted: ${result?.upserted || 0}`
    );
  } catch (error) {
    console.error(`[scheduler] full import failed:`, error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Baghdad"
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[scheduler] Received SIGTERM, stopping scheduler...");
  job.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[scheduler] Received SIGINT, stopping scheduler...");
  job.stop();
  process.exit(0);
});

module.exports = { job };
