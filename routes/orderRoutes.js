const exp = require("express");
const ordersControllers = require("../controllers/orderControllers");

router = exp.Router();

// router.route('/history').get(ordersControllers.getOrders);
router.post("/", ordersControllers.createOrder);
router.get("/", ordersControllers.getMyOrders);
router.get("/:orderId", ordersControllers.getMyOrder);
module.exports = router;
