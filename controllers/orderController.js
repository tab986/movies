const Order = require("../models/Orders");
const Coupon = require("../models/Coupon");
const KinguinProduct = require("../models/KinguinProduct");
const axios = require("axios");
const crypto = require("crypto");
const factory = require("../utils/handlerFactory");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
// Wayl config
const WAYL_AUTH_KEY = process.env.WAYL_AUTH_KEY; // set in your .env
const WAYL_BASE = process.env.WAYL_BASE || "https://api.thewayl.com/api/v1";

// Helper to verify Wayl webhook signature
function verifyWaylSignature(req) {
  const signature = req.headers["x-wayl-signature"];
  const body = JSON.stringify(req.body);
  const expected = crypto
    .createHmac("sha256", process.env.WAYL_SECRET)
    .update(body)
    .digest("hex");
  return signature === expected;
}
const KINGUIN_API_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_API_KEY = process.env.KINGUIN_API_KEY;

const ESA_BALANCE_URL = `${KINGUIN_API_BASE}/v1/balance`;
const ESA_ORDER_URL = `${KINGUIN_API_BASE}/v1/order`;
const ESA_ONEORDER_URL = `${KINGUIN_API_BASE}/v2/order`;

const ESA_HEADERS = {
  "Content-Type": "application/json",
  "X-Api-Key": KINGUIN_API_KEY || "", // filled at runtime; validated below
};

async function kinguinGetBalance() {
  if (!KINGUIN_API_KEY) throw new appError("KINGUIN_API_KEY missing", 500);

  try {
    const r = await axios.get(ESA_BALANCE_URL, {
      headers: ESA_HEADERS,
      timeout: 20000,
    });
    return r.data; // { balance }
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("Kinguin balance error:", status, data);
    throw new appError(
      `Kinguin balance ${status || ""} – ${
        data?.detail || data?.message || JSON.stringify(data) || err.message
      }`,
      status || 400
    );
  }
}

async function kinguinPlaceOrderV2(payload) {
  if (!KINGUIN_API_KEY) throw new appError("KINGUIN_API_KEY missing", 500);

  try {
    const res = await axios.post(ESA_ORDER_URL, payload, {
      headers: ESA_HEADERS,
      timeout: 20000,
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("Kinguin order error:", status, data);
    throw new appError(
      `Kinguin ${status || ""} – ${
        data?.detail || data?.message || JSON.stringify(data) || err.message
      }`,
      status || 400
    );
  }
}
// Create payment link via Wayl
async function createWaylLink(referenceId, amount, productName, image) {
  const payload = {
    referenceId,
    total: Number(1000), // integer in IQD
    lineItem: [
      {
        label: productName,
        type: "increase",
        amount: 1000,
        image,
      },
    ],
    webhookUrl: process.env.WAYL_r, //process.env.WAYL_WEBHOOK_URL, // e.g. https://yourdomain.com/api/v1/orders/wayl-callback
    redirectionUrl: "https://google.com",
    webhookSecret: "1234567890", //process.env.WAYL_REDIRECT_URL, // e.g. https://yourdomain.com/order-success
    currency: "IQD",
  };

  try {
    const res = await axios.post(`${WAYL_BASE}/links`, payload, {
      headers: { "X-WAYL-AUTHENTICATION": WAYL_AUTH_KEY },
    });
    return res.data; // { url, linkId, referenceId, ... }
  } catch (err) {
    // Print Wayl’s validation message so you see exactly what failed
    const status = err.response?.status;
    const data = err.response?.data;
    console.error(
      "Wayl create link error:",
      status,
      JSON.stringify(data, null, 2)
    );
    throw err;
  }
}

// Place and dispatch order on Kinguin (returns keys)

exports.checkout = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { productId, couponCode } = req.body;

    // 1. fetch product
    const product = await KinguinProduct.findById(productId);
    if (!product)
      return res
        .status(404)
        .json({ status: "fail", message: "Product not found" });

    // 2. calculate price (IQD). base price from derived.priceMin (already converted & marked-up)
    const basePrice = product.derived.priceMin;
    if (!basePrice)
      return res
        .status(400)
        .json({ status: "fail", message: "Product has no price" });

    // 3. apply coupon if any
    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (coupon) discount = coupon.applyDiscount(basePrice);
    }
    const total = Math.max(0, basePrice - discount);
    check = (total - 5800) / process.env.EUR_TO_IQD;

    const { balance } = await kinguinGetBalance();

    if (Number.isFinite(check) && Number(balance) < Number(check)) {
      return res.status(409).json({
        status: "fail",
        error: "LOW_BALANCE",
        message: "Insufficient Kinguin balance. Top up and retry.",
        balance,
        check,
        total,
        localProduct: productId,
      });
    }
    // 4. create order in DB
    const order = await Order.create({
      user: userId,
      product: productId,
      quantity: 1,
      unitPrice: basePrice,
      coupon: couponCode,
      discount,
      totalPrice: total,
      waylReference: `WAYL-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
    });

    // 5. call Wayl to create link
    const waylResponse = await createWaylLink(
      order.waylReference,
      total,
      product.remote.name,
      product.remote.images.cover.url
    );

    // 6. update order with link (optional)
    order.waylLink = waylResponse.data.url;
    await order.save();

    // 7. respond with payment URL
    res.status(200).json({
      status: "success",
      message: "Order created; redirect to pay",
      data: { payUrl: waylResponse.data.url },
    });
  } catch (err) {
    next(err);
  }
};

// Wayl payment webhook
exports.waylCallback = async (req, res, next) => {
  try {
    // Verify signature
    // if (!verifyWaylSignature(req)) {
    //   return res
    //     .status(400)
    //     .json({ status: "fail", message: "Invalid signature" });
    // }

    console.log(req.body);

    const { referenceId, status } = req.body;
    const order = await Order.findOne({ waylReference: referenceId });
    console.log(order);
    if (!order)
      return res
        .status(404)
        .json({ status: "fail", message: "Order not found" });

    if (1) {
      // Mark as paid
      order.waylPaymentStatus = "paid";
      order.status = "wayle";
      await order.save();
      // Trigger Kinguin order & dispatch (could be in background)
      const product = await KinguinProduct.findById(order.product);
      // const { orderId, dispatchId, keys } = await placeAndDispatch(
      //   product._id,
      //   1
      // );
      const kinguinPayload = {
        products: [
          {
            kinguinId: Number(order.product),
            qty: Number(1),
            price: product.remote.price,
          },
        ],
        orderExternalId: String(order._id),
      };

      // 5) Place order (only check balance if mode === "own")
      let kinguinOrderResponse;

      kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);
      console.log("gg");

      order.kinguinOrderId = kinguinOrderResponse.orderId;

      order.status = "kingwin";
      await order.save();
    } else {
      order.waylPaymentStatus = "cancelled";
      order.status = "cancelled";
      await order.save();
    }
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

// List current user's orders
exports.myOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort("-createdAt")
    .lean();
  const summary = orders.map((o) => ({
    id: o._id,
    product: o.product,
    totalPrice: o.totalPrice,
    status: o.status,
    createdAt: o.createdAt,
  }));
  res.json({ status: "success", results: summary.length, orders: summary });
};

// Get a specific order (with keys if completed)
exports.getOrder = async (req, res) => {
  let order = await Order.findOne({
    kinguinOrderId: req.params.id,
    user: req.user._id,
  }).populate("product");

  if (!order)
    return res.status(404).json({ status: "fail", message: "Order not found" });

  try {
    const r = await axios.get(`${ESA_ONEORDER_URL}/${req.params.id}/keys`, {
      headers: ESA_HEADERS,
      timeout: 20000,
    });
    console.log(r.data);

    let key = r.data[0].serial;
    if (key) {
      if (Array.isArray(key)) key = key[0];
      order = await Order.findOneAndUpdate(
        { kinguinOrderId: req.params.id },
        {
          key: key,
          status: "completed",
        }
      );
    }
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("Kinguin one order error:", status, data);
  }
  res.json({ status: "success", data: order });
};

exports.getOrders = factory.getAll(Order, "orders");

exports.getOrderUser = catchAsyncErrors(async (req, res, next) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return next(new appError("order not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      order,
    },
  });
});

exports.updateOrder = catchAsyncErrors(async (req, res, next) => {
  if (req.body) {
    const order = await Order.findByIdAndUpdate(req.params.orderId, req.body);
    res.status(200).json({
      status: "success",
      order: order,
    });
  }
});

exports.deleteOrder = catchAsyncErrors(async (req, res, next) => {
  let deletedorder;
  deletedorder = await Order.findOneAndDelete({
    _id: req.params.orderId,
  });

  if (!deletedorder) {
    return next(new appError("order not found", 404));
  }

  res.status(204).json({
    status: "success",
    message: "order deleted",
  });
});
