const appError = require("../utils/appError");
const { Order } = require("../post-models");
const {
  submitKinguinOrderByProductId,
  prepareKinguinOrderProduct,
} = require("./orderController");

exports.buySync = async (req, res, next) => {
  try {
    const { productId, qty = 1 } = req.body || {};
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      throw new appError("Authenticated user is required", 401);
    }

    const kinguinProduct = await prepareKinguinOrderProduct({ productId, qty });
    const syncReference = `SYNC-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const quantity = Number(kinguinProduct.qty);

    const order = await Order.create({
      user: userId,
      product: String(kinguinProduct.kinguinId),
      quantity,
      products: [
        {
          product: String(kinguinProduct.kinguinId),
          quantity,
        },
      ],
      waylReference: syncReference,
      waylPaymentStatus: "paid",
      status: "pending",
    });

    const kinguinOrderResponse = await submitKinguinOrderByProductId({
      productId: kinguinProduct.kinguinId,
      qty: quantity,
      orderExternalId: String(order.id),
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
