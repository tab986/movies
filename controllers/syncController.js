// controllers/syncController.js
const { runImportAll } = require("../worker/importAll");
const catchAsyncErrors = require("../utils/catchAsyncErrors");

let isImportRunning = false;

exports.startFullImport = catchAsyncErrors(async (req, res) => {
  // ✅ New synchronous handler: wait for the job to complete before responding
  if (isImportRunning) {
    return res
      .status(429)
      .json({ status: "error", message: "Import already running" });
  }
  isImportRunning = true;

  // keep the socket open for long jobs (per-request)
  req.setTimeout(0); // no per-request timeout
  res.setTimeout(0); // no per-response timeout

  try {
    const stats = await runImportAll({ logger: console });
    // only reply after the import fully completes
    return res.status(200).json({
      status: "success",
      message: "Full import completed",
      stats, // { processed, kept, skipped }
    });
  } catch (e) {
    console.error("[sync] Full import failed:", e);
    return res.status(500).json({
      status: "error",
      message: e.message || "Import failed",
    });
  } finally {
    isImportRunning = false;
  }
});
