const express = require("express");
const authControllers = require("../controllers/authControllers");
const merchantController = require("../controllers/merchantController");

const router = express.Router();

router.post("/signup", authControllers.signup("merchant"));
router.post("/login", authControllers.login("merchant"));

router.use(authControllers.protect);
router.use(authControllers.onlyPermission("merchant"));

router.get("/purchase-log", merchantController.getMyPurchaseLog);
router.get("/analytics/summary", merchantController.getMyAnalyticsSummary);
router.get("/analytics/most-bought", merchantController.getMyMostBoughtItems);

module.exports = router;
