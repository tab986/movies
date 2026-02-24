const appError = require("../utils/appError");
const Order = require("../models/Orders");
const {
  submitKinguinOrderByProductId,
  prepareKinguinOrderProduct,
} = require("./orderController");

exports.buySync = async (req, res, next) => {
  try {
    const { productId, qty = 1 } = req.body || {};
    if (!req.user?._id) {
      throw new appError("Authenticated user is required", 401);
    }

    const kinguinProduct = await prepareKinguinOrderProduct({ productId, qty });
    const syncReference = `SYNC-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const quantity = Number(kinguinProduct.qty);
    const unitPrice = Number(kinguinProduct.price);
    const totalPrice = unitPrice * quantity;

    const order = await Order.create({
      user: req.user._id,
      product: String(kinguinProduct.kinguinId),
      quantity,
      unitPrice,
      products: [
        {
          product: String(kinguinProduct.kinguinId),
          quantity,
          unitPrice,
        },
      ],
      totalPrice,
      waylReference: syncReference,
      waylPaymentStatus: "paid",
      status: "pending",
    });

    const kinguinOrderResponse = await submitKinguinOrderByProductId({
      productId: kinguinProduct.kinguinId,
      qty: quantity,
      orderExternalId: String(order._id),
      kinguinProduct,
    });

    order.kinguinOrderId = kinguinOrderResponse.orderId;
    order.status = "kingwin";
    await order.save();

    return res.status(200).json({ status: "success" });
  } catch (err) {
    next(err);
  }
};
