const express = require("express");
const router = express.Router();
const orderCtrl = require("../controllers/orderController");
const buySyncCtrl = require("../controllers/buySyncController");
const authControllers = require("../controllers/authControllers");
const requireDbReady = require("../utils/requireDbReady");

router.post(
  "/wayl-callback",
  express.json({ type: "*/*" }),
  orderCtrl.waylCallback
);

router.use(authControllers.protect);
router.post(
  "/checkout",
  requireDbReady({ dependency: "checkout catalog pricing" }),
  orderCtrl.checkout
);
router.post("/buy-sync", buySyncCtrl.buySync);
router.get("/my", orderCtrl.myOrders);
router.get(
  "/:id",
  requireDbReady({ dependency: "order product catalog enrichment" }),
  orderCtrl.getOrder
);

module.exports = router;
