// Routes to manage sync profiles and trigger delta syncs manually.

const router = require("express").Router();
const { SyncProfile } = require("../post-models");
const { runOnce } = require("../worker/deltaSync");
const { runImportAll } = require("../worker/importAll");
const { run: runReconcile } = require("../worker/reconcile");
const {
  runMongoToPostgresImport,
  validateMongoImportIdempotency,
} = require("../worker/mongoToPostgresImport");

// Retrieve the current sync profile
router.get("/profile", async (req, res) => {
  const profile = await SyncProfile.findOne({
    where: { name: "default" },
    raw: true,
  });
  res.json({
    status: "success",
    profile: profile || { name: "default", filters: {}, fields: [] },
  });
});

// Update or create the sync profile. Expects { filters, fields } in body
router.put("/profile", async (req, res) => {
  const { filters = {}, fields = [] } = req.body || {};
  const [saved, created] = await SyncProfile.findOrCreate({
    where: { name: "default" },
    defaults: { name: "default", filters, fields },
  });
  if (!created) {
    await saved.update({ filters, fields });
  }
  res.json({ status: "success", profile: saved.get({ plain: true }) });
});

// Trigger a delta sync immediately. Optional body: { overlapMinutes }
router.post("/run", async (req, res) => {
  try {
    const overlapMinutes = Number(req.body?.overlapMinutes || 2);
    const r = await runOnce({ overlapMinutes });
    res.json({ status: "success", updated: r.updated });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

const syncController = require("../controllers/syncController");

router.post("/import", syncController.startFullImport);
// Trigger a full import (import all products). This should be run rarely (e.g. first time or after changing filters drastically).
router.post("/import", async (req, res) => {
  try {
    await runImportAll();
    res.json({ status: "success", message: "Full import completed" });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// Trigger a reconciliation to hide removed products.
router.post("/reconcile", async (req, res) => {
  try {
    await runReconcile();
    res.json({ status: "success", message: "Reconciliation completed" });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// Import overlapping entities from Mongo test DB to Postgres (insert-only).
router.post("/import-mongo-test", async (req, res) => {
  try {
    const result = await runMongoToPostgresImport({ logger: console });
    if (result.status === "disabled") {
      return res.status(403).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// Validation endpoint for disabled gate and idempotent second run.
router.post("/import-mongo-test/validate", async (req, res) => {
  try {
    const result = await validateMongoImportIdempotency({ logger: console });
    res.json(result);
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

module.exports = router;
