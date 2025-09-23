// Endpoint definitions for Kinguin webhooks. Use the dashboard to
// configure product-update, order-complete and order-status-change
// webhooks to point here. Verify requests using a shared secret.

const router = require("express").Router();
const { runOnce } = require("../worker/deltaSync");

const SECRET = process.env.WEBHOOK_SECRET || "";

// Validate incoming webhook using X-Kinguin-Secret header or ?secret parameter
function verifySecret(req) {
  const headerSecret =
    req.get("X-Kinguin-Secret") || req.get("X-Webhook-Secret");
  const querySecret = req.query.secret;
  const s = headerSecret || querySecret;
  return SECRET && s === SECRET;
}

// Product update webhook. Kick off a short-overlap delta sync and return 200 quickly.
router.post("/kinguin/product-update", async (req, res) => {
  if (!verifySecret(req)) return res.sendStatus(401);
  runOnce({ overlapMinutes: 2 }).catch((err) =>
    console.error("[wh product-update]", err)
  );
  res.sendStatus(200);
});

// Order complete webhook. Fetch keys and mark your order delivered.
router.post("/kinguin/order-complete", async (req, res) => {
  if (!verifySecret(req)) return res.sendStatus(401);
  // You can parse reservation or dispatch ID from req.body and
  // fetch keys from Kinguin if needed. This placeholder does nothing.
  res.sendStatus(200);
});

// Order status change webhook. React to reserve/cancel/out_of_stock events.
router.post("/kinguin/order-status", async (req, res) => {
  if (!verifySecret(req)) return res.sendStatus(401);
  // Examine req.body.status to update your local order state
  res.sendStatus(200);
});

module.exports = router;
