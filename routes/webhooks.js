// Endpoint definitions for Kinguin webhooks. Use the dashboard to
// configure product-update, order-complete and order-status-change
// webhooks to point here. Verify requests using a shared secret.

const router = require("express").Router();
const axios = require("axios");
const { runOnce } = require("../worker/deltaSync");

let legacyOrderModelCache = null;
let legacyOrderModelLoadAttempted = false;

const SECRET = process.env.WEBHOOK_SECRET || "";

const KINGUIN_API_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_API_KEY = process.env.KINGUIN_API_KEY;
const ESA_HEADERS = {
  "Content-Type": "application/json",
  "X-Api-Key": KINGUIN_API_KEY || "",
};

function getLegacyOrderModel(logger = console) {
  if (legacyOrderModelCache) return legacyOrderModelCache;
  if (legacyOrderModelLoadAttempted) return null;

  legacyOrderModelLoadAttempted = true;
  try {
    legacyOrderModelCache = require("../models/Orders");
    return legacyOrderModelCache;
  } catch (error) {
    logger.error(
      `[webhooks] Legacy order model unavailable; webhook handlers will return 200 without processing. ${error.message}`,
    );
    return null;
  }
}

// Validate incoming webhook using X-Kinguin-Secret header or ?secret parameter
function verifySecret(req) {
  const headerSecret =
    req.get("X-Kinguin-Secret") || req.get("X-Webhook-Secret");
  const querySecret = req.query.secret;
  const s = headerSecret || querySecret;
  return SECRET && s === SECRET;
}

// NOTE: No auth middleware here — Kinguin sends webhooks without a JWT.
// Security is handled via verifySecret() using the shared WEBHOOK_SECRET.

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

  try {
    const Order = getLegacyOrderModel();
    if (!Order) {
      return res.sendStatus(200);
    }

    // Kinguin sends the order ID in the webhook body
    const kinguinOrderId =
      req.body?.orderId || req.body?.orderExternalId || req.body?.dispatchId;

    if (!kinguinOrderId) {
      console.error("[wh order-complete] No order ID in webhook body:", req.body);
      return res.sendStatus(200);
    }

    console.log(`[wh order-complete] Received for kinguinOrderId: ${kinguinOrderId}`);

    // Find the order in our database
    const order = await Order.findOne({ kinguinOrderId });
    if (!order) {
      // Try by orderExternalId (which is our internal order _id)
      const orderByExternal = await Order.findById(req.body?.orderExternalId);
      if (!orderByExternal) {
        console.error("[wh order-complete] Order not found for:", kinguinOrderId);
        return res.sendStatus(200);
      }
      // Use the found order
      await fetchAndStoreKeys(orderByExternal);
      return res.sendStatus(200);
    }

    await fetchAndStoreKeys(order);
    res.sendStatus(200);
  } catch (err) {
    console.error("[wh order-complete] Error:", err.message);
    // Always return 200 so Kinguin doesn't retry endlessly
    res.sendStatus(200);
  }
});

// Helper: fetch keys from Kinguin API and store them on the order
async function fetchAndStoreKeys(order) {
  if (!order.kinguinOrderId) {
    console.error("[wh order-complete] Order has no kinguinOrderId:", order._id);
    return;
  }

  try {
    const r = await axios.get(
      `${KINGUIN_API_BASE}/v2/order/${order.kinguinOrderId}/keys`,
      { headers: ESA_HEADERS, timeout: 20000 }
    );

    const keys = (Array.isArray(r.data) ? r.data : []).map((k) => ({
      serial: k.serial,
      type: k.type,
      name: k.name,
      kinguinId: k.kinguinId,
    }));

    if (keys.length > 0) {
      order.keys = keys;
      order.status = "completed";
      await order.save();
      console.log(
        `[wh order-complete] Order ${order._id} completed with ${keys.length} key(s)`
      );
    } else {
      console.log(
        `[wh order-complete] No keys yet for order ${order._id}, will retry on next webhook or user fetch`
      );
    }
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error(
      `[wh order-complete] Failed to fetch keys for order ${order._id}:`,
      status,
      data || err.message
    );
  }
}

// Order status change webhook. React to reserve/cancel/out_of_stock events.
router.post("/kinguin/order-status", async (req, res) => {
  if (!verifySecret(req)) return res.sendStatus(401);

  try {
    const Order = getLegacyOrderModel();
    if (!Order) {
      return res.sendStatus(200);
    }

    const kinguinOrderId =
      req.body?.orderId || req.body?.orderExternalId;
    const newStatus = req.body?.status;

    console.log(`[wh order-status] orderId=${kinguinOrderId}, status=${newStatus}`);

    if (!kinguinOrderId || !newStatus) {
      return res.sendStatus(200);
    }

    const order =
      (await Order.findOne({ kinguinOrderId })) ||
      (await Order.findById(req.body?.orderExternalId));

    if (!order) {
      console.error("[wh order-status] Order not found for:", kinguinOrderId);
      return res.sendStatus(200);
    }

    // Handle Kinguin status changes
    if (newStatus === "completed" || newStatus === "delivered") {
      await fetchAndStoreKeys(order);
    } else if (newStatus === "canceled" || newStatus === "out_of_stock") {
      order.status = "cancelled";
      await order.save();
      console.log(`[wh order-status] Order ${order._id} cancelled (${newStatus})`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("[wh order-status] Error:", err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
