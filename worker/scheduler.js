// worker/scheduler.js
// Internal cron job scheduler for deltaSync
// This runs deltaSync every 5 minutes within the Node.js process
// Alternative to using Render cron jobs

require("dotenv").config({ path: process.env.DOTENV_PATH || "./config.env" });
const cron = require("node-cron");
const { runOnce } = require("./deltaSync");

// Schedule deltaSync to run every 2 minutes
// Cron format: "*/2 * * * *" means "every 2 minutes"
// Change to "*/1 * * * *" for every 1 minute if needed
const SYNC_SCHEDULE = process.env.SYNC_SCHEDULE || "*/30 * * * * *";

console.log(`[scheduler] Starting deltaSync scheduler with schedule: ${SYNC_SCHEDULE}`);

const job = cron.schedule(SYNC_SCHEDULE, async () => {
  const startTime = Date.now();
  console.log(`[scheduler] Running deltaSync at ${new Date().toISOString()}`);
  
  try {
    const result = await runOnce({ overlapMinutes: 10 });
    const duration = Date.now() - startTime;
    console.log(
      `[scheduler] deltaSync completed in ${duration}ms. Updated: ${result.updated || 0} products`
    );
  } catch (error) {
    console.error(`[scheduler] deltaSync failed:`, error);
  }
}, {
  scheduled: true,
  timezone: "UTC"
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
