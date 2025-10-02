const Order = require("../models/Orders");
const Coupon = require("../models/Coupon");
const KinguinProduct = require("../models/KinguinProduct");
const axios = require("axios");
const crypto = require("crypto");
const factory = require("../utils/handlerFactory");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
const { convertFromIQD } = require("../utils/currency");

// Wayl config
const WAYL_AUTH_KEY = process.env.WAYL_AUTH_KEY; // set in your .env
const WAYL_BASE = process.env.WAYL_BASE || "https://api.thewayl.com/api/v1";

// Helper to verify Wayl webhook signature
function verifyWaylSignature(req) {
  const signature = req.headers["x-wayl-signature-256"];
  const expected = crypto.createHmac("sha256", process.env.WAYL_SECRET);
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
async function createWaylLink(referenceId, amount, productName, image, req) {
  // keep Wayl in IQD
  const iqd = Number(amount);
  if (!Number.isFinite(iqd) || iqd <= 0) throw new Error("Invalid IQD amount");

  // FX preview (for UI/logs). Truncate to first 2 decimals (no rounding).
  const fx = await convertFromIQD(req, iqd);
  const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;
  const fxAmountTruncated = truncate2(fx.amount);
  console.log({
    ...fx,
    amount: fxAmountTruncated,
    formattedTruncated: (() => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: fx.currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(fxAmountTruncated);
      } catch {
        return `${fxAmountTruncated.toFixed(2)} ${fx.currency}`;
      }
    })(),
  });

  const payload = {
    referenceId: String(referenceId),
    total: iqd, // Wayl expects IQD here
    lineItem: [
      {
        label: productName || "Basket Value",
        type: "increase",
        amount: iqd, // IQD line item
        image,
      },
    ],
    webhookUrl: process.env.WAYL_r, // keeping your env var name as-is
    redirectionUrl: "https://google.com",
    webhookSecret: process.env.WAYL_SECRET,
    currency: "IQD",
  };

  try {
    const res = await axios.post(`${WAYL_BASE}/links`, payload, {
      headers: { "X-WAYL-AUTHENTICATION": WAYL_AUTH_KEY },
      timeout: 15000,
    });

    // append ?currency=iqd (or &currency=iqd) to returned link
    if (res?.data?.url) {
      try {
        const u = new URL(res.data.url);
        u.searchParams.set("currency", "iqd");
        res.data.url = u.toString();
      } catch {
        res.data.url =
          res.data.url +
          (res.data.url.includes("?") ? "&" : "?") +
          "currency=iqd";
      }
    }

    // optionally include the truncated FX preview for your frontend
    return {
      ...res.data,
      fxPreview: {
        currency: fx.currency,
        rate: fx.rate,
        amount: fxAmountTruncated,
      },
    };
  } catch (err) {
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
    // When placing an order the client may supply either a single `productId`
    // or a `cart` array containing multiple items. Each cart item should
    // specify a `productId` and a `qty` (quantity). A coupon code may also be
    // provided via `couponCode`.
    const { productId, cart, couponCode } = req.body;
    const hasCart = Array.isArray(cart) && cart.length > 0;

    let orderItems = [];
    let total = 0;
    let discount = 0;

    if (hasCart) {
      // Process each cart entry
      for (const item of cart) {
        const { productId: pId, qty } = item;
        const p = await KinguinProduct.findById(pId);

        if (!p) {
          return res
            .status(404)
            .json({ status: "fail", message: `Product ${pId} not found` });
        }
        const basePrice = p.derived?.priceMin;
        if (!basePrice) {
          return res
            .status(400)
            .json({ status: "fail", message: `Product ${pId} has no price` });
        }
        const quantity = Number(qty) || 1;
        orderItems.push({ product: p, quantity, unitPrice: basePrice });
        total += basePrice * quantity;
      }
      // Apply coupon to total
      if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode });
        if (coupon) {
          discount = coupon.applyDiscount(total);
        }
      }
      total = Math.max(0, total - discount);
    }
    // else {
    //   // Single product purchase
    //   const p = await KinguinProduct.findById(productId);
    //   if (!p) {
    //     return res.status(404).json({ status: "fail", message: "Product not found" });
    //   }
    //   const basePrice = p.derived?.priceMin;
    //   if (!basePrice) {
    //     return res.status(400).json({ status: "fail", message: "Product has no price" });
    //   }
    //   if (couponCode) {
    //     const coupon = await Coupon.findOne({ code: couponCode });
    //     if (coupon) discount = coupon.applyDiscount(basePrice);
    //   }
    //   const quantity = 1;
    //   orderItems.push({ product: p, quantity, unitPrice: basePrice });
    //   total = Math.max(0, basePrice - discount);
    // }

    // Check Kinguin balance. Convert total to EUR using EUR_TO_IQD if present.
    let check = 0;
    if (process.env.EUR_TO_IQD) {
      check = (total - 5800) / process.env.EUR_TO_IQD;
    }
    const { balance } = await kinguinGetBalance();
    if (Number.isFinite(check) && Number(balance) < Number(check)) {
      return res.status(409).json({
        status: "fail",
        error: "LOW_BALANCE",
        message: "Insufficient Kinguin balance. Top up and retry.",
        balance,
        check,
        total,
        localProduct: hasCart ? cart : productId,
      });
    }

    // Construct order document
    const waylRef = `WAYL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const orderData = {
      user: userId,
      // coupon: couponCode,
      // discount,
      totalPrice: total,
      waylReference: waylRef,
      products: orderItems.map((itm) => ({
        product: itm.product._id.toString(),
        quantity: itm.quantity,
        unitPrice: itm.unitPrice,
      })),
    };
    // Mirror single item into legacy fields
    // if (orderData.products.length === 1) {
    //   orderData.product = orderData.products[0].product;
    //   orderData.quantity = orderData.products[0].quantity;
    //   orderData.unitPrice = orderData.products[0].unitPrice;
    // }
    const order = await Order.create(orderData);

    // Compose label and image for Wayl. For carts use a generic label and the first
    // product’s cover image; for a single item use its name and cover image.
    let label;
    let image;
    if (hasCart) {
      label = "Basket Value";
      image = orderItems[0].product.remote?.images?.cover?.url;
    }
    // else {
    //   label = orderItems[0].product.remote?.name;
    //   image = orderItems[0].product.remote?.images?.cover?.url;
    // }
    const waylResponse = await createWaylLink(
      waylRef,
      total,
      label,
      image,
      req
    );
    // Persist the generated payment link
    const payUrl = waylResponse.data?.url || waylResponse?.url;
    order.waylLink = payUrl;
    await order.save();

    return res.status(200).json({
      status: "success",
      message: "Order created; redirect to pay",
      data: { payUrl },
    });
  } catch (err) {
    next(err);
  }
};

// Wayl payment webhook
exports.waylCallback = async (req, res, next) => {
  try {
    // if (!verifyWaylSignature(req)) {
    //   return res
    //     .status(400)
    //     .json({ status: "fail", message: "Invalid signature" });
    // }

    console.log(req.body);

    const { referenceId } = req.body;
    const order = await Order.findOne({ waylReference: referenceId });
    console.log(order);
    if (!order)
      return res
        .status(404)
        .json({ status: "fail", message: "Order not found" });

    // Mark order as paid according to Wayl
    order.waylPaymentStatus = "paid";
    order.status = "wayle";
    await order.save();

    // Build products payload for Kinguin API. If the order contains a cart
    // (`products` array) we iterate over each entry and map it to the format
    // expected by Kinguin: { kinguinId, qty, price }. Otherwise fall back to
    // the legacy single product fields.
    let kinguinProducts = [];
    if (Array.isArray(order.products) && order.products.length > 0) {
      for (const item of order.products) {
        const prod = await KinguinProduct.findById(item.product);
        if (!prod) continue;
        kinguinProducts.push({
          kinguinId: Number(item.product),
          qty: Number(item.quantity) || 1,
          price: prod.remote?.price,
        });
      }
    }
    //  else {
    //   // Single product fallback
    //   const prod = await KinguinProduct.findById(order.product);
    //   kinguinProducts.push({
    //     kinguinId: Number(order.product),
    //     qty: Number(order.quantity) || 1,
    //     price: prod?.remote?.price,
    //   });
    // }
    const kinguinPayload = {
      products: kinguinProducts,
      orderExternalId: String(order._id),
    };
    // Place order with Kinguin
    const kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);
    order.kinguinOrderId = kinguinOrderResponse.orderId;
    order.status = "kingwin";
    await order.save();
    return res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

// List current user's orders
exports.myOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate("product")
    .sort("-createdAt")
    .lean();
  const summary = orders.map((o) => ({
    id: o._id,
    product: o.product,
    products: o.products,
    totalPrice: o.totalPrice,
    status: o.status,
    createdAt: o.createdAt,
  }));
  res.json({ status: "success", results: summary.length, orders: summary });
};

// Get a specific order (with keys if completed)
exports.getOrder = async (req, res) => {
  let order = await Order.findOne({
    _id: req.params.id,
    user: req.user._id,
  })
    .lean({ virtuals: true }) // include virtuals in plain object
    .populate("products.detail");

  if (!order)
    return res.status(404).json({ status: "fail", message: "Order not found" });
  // If there are no stored keys on the order, attempt to fetch them from Kinguin
  if (!order.keys || order.keys.length === 0) {
    try {
      const r = await axios.get(`${ESA_ONEORDER_URL}/${req.params.id}/keys`, {
        headers: ESA_HEADERS,
        timeout: 20000,
      });
      // r.data should be an array of key objects. Map them into our schema.
      const keys = (Array.isArray(r.data) ? r.data : []).map((k) => ({
        serial: k.serial,
        type: k.type,
        name: k.name,
        kinguinId: k.kinguinId,
      }));
      if (keys.length > 0) {
        // Store all keys on the order; also mirror the first key into the legacy `key` field.
        order = await Order.findOneAndUpdate(
          { kinguinOrderId: req.params.id },
          {
            keys: keys,
            status: "completed",
          },
          { new: true }
        );
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error("Kinguin one order error:", status, data);
    }
  }
  return res.json({ status: "success", data: order });
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
