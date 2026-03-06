const { Order, KinguinProduct } = require("../post-models");
const axios = require("axios");
const crypto = require("crypto");
const factory = require("../utils/handlerFactory");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
const { convertFromIQD } = require("../utils/currency");
const { stat } = require("fs");
const { fetchKinguinProductById } = require("../lib/kinguinClient");
const { Op } = require("sequelize");
const { applyCoupon } = require("../utils/coupon.js");
// Wayl config
const WAYL_AUTH_KEY = process.env.WAYL_AUTH_KEY; // set in your .env
const WAYL_BASE = process.env.WAYL_BASE || "https://api.thewayl.com/api/v1";

// Helper to verify Wayl webhook signature
function verifyWaylSignature(req) {
  const signature = req.headers["x-wayl-signature-256"];
  const expected = crypto.createHmac("sha256", process.env.WAYL_SECRET).update(json.stringify(req.body)).digest("hex");
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

function parsePositiveNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new appError(`${fieldName} must be a positive number`, 400);
  }
  return parsed;
}

async function buildKinguinOrderProduct({ productId, qty = 1 }) {
  const kinguinId = parsePositiveNumber(productId, "productId");
  const quantity = parsePositiveNumber(qty, "qty");

  let remoteProduct;
  try {
    remoteProduct = await fetchKinguinProductById(kinguinId);
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    throw new appError(
      `Kinguin product lookup failed for ${kinguinId}: ${
        data?.detail || data?.message || err.message
      }`,
      status || 400
    );
  }

  const price = Number(remoteProduct?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new appError(`Kinguin product ${kinguinId} has invalid price`, 400);
  }

  return {
    kinguinId,
    qty: quantity,
    price,
  };
}

async function submitKinguinOrderByProductId({
  productId,
  qty = 1,
  orderExternalId,
  kinguinProduct,
}) {
  if (!orderExternalId) {
    throw new appError("orderExternalId is required", 400);
  }

  const productPayload =
    kinguinProduct || (await buildKinguinOrderProduct({ productId, qty }));
  const response = await kinguinPlaceOrderV2({
    products: [productPayload],
    orderExternalId: String(orderExternalId),
  });
  if (!response?.orderId) {
    throw new appError("Kinguin order response missing orderId", 502);
  }

  return response;
}

async function submitKinguinOrderWithProducts({ products, orderExternalId }) {
  if (!orderExternalId) {
    throw new appError("orderExternalId is required", 400);
  }
  if (!Array.isArray(products) || products.length === 0) {
    throw new appError("products must be a non-empty array", 400);
  }

  const response = await kinguinPlaceOrderV2({
    products,
    orderExternalId: String(orderExternalId),
  });
  if (!response?.orderId) {
    throw new appError("Kinguin order response missing orderId", 502);
  }

  return response;
}

async function submitKinguinOrderForOrder(order) {
  if (!order || !Array.isArray(order.products) || order.products.length === 0) {
    throw new appError("Order has no products to submit to Kinguin", 400);
  }

  const kinguinProducts = [];
  for (const item of order.products) {
    const product = await buildKinguinOrderProduct({
      productId: item.product,
      qty: item.quantity || 1,
    });
    kinguinProducts.push(product);
  }

  const response = await submitKinguinOrderWithProducts({
    products: kinguinProducts,
    orderExternalId: String(order.id),
  });

  order.kinguinOrderId = response.orderId;
  order.status = "kingwin";
  await order.save();
}

function normalizeWaylValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getWaylPaymentSignals(payload = {}) {
  const referenceId =
    payload.referenceId ||
    payload.reference ||
    payload.orderReference ||
    payload?.data?.referenceId ||
    payload?.data?.reference ||
    null;

  const paymentStatusRaw =
    payload.paymentStatus || payload.status || payload?.data?.paymentStatus || "";
  const eventRaw = payload.event || payload.eventType || payload?.data?.event || "";

  const paymentStatus = normalizeWaylValue(paymentStatusRaw);
  const event = normalizeWaylValue(eventRaw);
  const successValues = new Set(["paid", "success", "succeeded", "completed"]);
  const successEvents = new Set([
    "paymentpaid",
    "paymentcompleted",
    "paymentcaptured",
    "linkpaid",
    "orderpaid",
  ]);

  const isPaid =
    successValues.has(paymentStatus) ||
    successEvents.has(event) ||
    successEvents.has(event.replace(/\./g, ""));

  return {
    referenceId,
    isPaid,
    paymentStatus,
    event,
    paymentStatusRaw,
    eventRaw,
  };
}
// Create payment link via Wayl
async function createWaylLink(referenceId, amount, productName, image, req) {
  // base (IQD from your system)
  const iqd = Number(amount);
  if (!Number.isFinite(iqd) || iqd <= 0) throw new Error("Invalid amount");

  // FX: detect target currency from IP (or ?currency / x-currency override)
  const fx = await convertFromIQD(req, iqd);
  console.log("FX result:", fx ,":",typeof fx);
  // first 2 decimals (truncate, not round)
  const truncate2 = (n) => Math.trunc(Number(n) * 100) / 100;

  // Decide what to send to Wayl:
  // - If FX succeeded → use detected currency + converted amount
  // - If FX failed or stayed IQD → fall back to IQD + original amount
  const payCurrency = fx.fxFallback ? "IQD" : fx.currency || "IQD";
  const payAmount =
    fx.fxFallback || payCurrency === "IQD" ? iqd : truncate2(fx.amount);

  const payload = {
    referenceId: String(referenceId),
    total: iqd, // converted amount (or IQD fallback)
    currency: "IQD", // detected currency (or IQD fallback)
    lineItem: [
      {
        label: productName || "Basket Value",
        type: "increase",
        amount: payAmount || 0.00,
        image: image || "",
      },
    ],
    webhookUrl: process.env.WAYL_r,
    redirectionUrl: "https://www.gamewiseiq.com/my-orders",
    webhookSecret: process.env.WAYL_SECRET,
  };


  try {
    const res = await axios.post(`${WAYL_BASE}/links`, payload, {
      headers: { "X-WAYL-AUTHENTICATION": WAYL_AUTH_KEY },
      timeout: 15000,
    });

    // Append currency param to link (?currency=xxx)
    if (res?.data?.url) {
      try {
        const u = new URL(res.data.url);
        u.searchParams.set("currency", String(payCurrency).toLowerCase());
        res.data.url = u.toString();
      } catch {
        res.data.url =
          res.data.url +
          (res.data.url.includes("?") ? "&" : "?") +
          `currency=${encodeURIComponent(String(payCurrency).toLowerCase())}`;
      }
    }

    // Optional: include FX info for your UI/logs
    res.data.fxPreview = {
      fromIQD: iqd,
      currency: payCurrency,
      rate: fx.fxFallback ? 1 : fx.rate,
      amount: payAmount,
      fallback: !!fx.fxFallback,
    };

    return res.data; // { url, linkId, referenceId, ..., fxPreview }
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error(
      "Wayl create link error:",
      status,
      JSON.stringify(data, null, 2)
    );
    console.log("payload", payload , "gg");
    throw err;
  }
}

// Place and dispatch order on Kinguin (returns keys)

exports.checkout = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    // When placing an order the client may supply either a single `productId`
    // or a `cart` array containing multiple items. Each cart item should
    // specify a `productId` and a `qty` (quantity). A coupon code may also be
    // provided via `couponCode`.
    const { productId, cart, couponCode } = req.body;
    const hasCart = Array.isArray(cart) && cart.length > 0;

    let orderItems = [];
    let total = 0;
    if (hasCart) {
      // Process each cart entry
      for (const item of cart) {
        const { productId: pId, qty } = item;
        const p = await KinguinProduct.findByPk(Number(pId));

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
    }

    if (couponCode && String(couponCode).trim() !== "") {
      try {
        const discount = await applyCoupon(couponCode, total);
        total = Math.max(0, total - discount);
      } catch (err) {
        return res.status(400).json({
          status: "fail",
          message: err.message || "Failed to apply coupon",
        });
      }
    }

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
      totalPrice: total,
      waylReference: waylRef,
      products: orderItems.map((itm) => ({
        product: String(itm.product.id),
        quantity: itm.quantity,
        unitPrice: itm.unitPrice,
      })),
    };
    console.log("orderData", orderData);
    
    const order = await Order.create(orderData);

    // Compose label and image for Wayl. For carts use a generic label and the first
    // product’s cover image; for a single item use its name and cover image.
    let label;
    let image;
    if (hasCart) {
      label = "Basket Value";
      image = orderItems[0].product.remote?.images?.cover?.url;

    }
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

    console.log(req.body);
    const {
      referenceId,
      isPaid,
      paymentStatus,
      event,
      paymentStatusRaw,
      eventRaw,
    } = getWaylPaymentSignals(req.body);

    if (!referenceId) {
      return res.status(400).json({
        status: "fail",
        message: "Missing Wayl referenceId in callback payload",
      });
    }

    const order = await Order.findOne({ where: { waylReference: referenceId } });
    console.log(order);
    if (!order)
      return res
        .status(404)
        .json({ status: "fail", message: "Order not found" });

    if (!isPaid) {
      if (paymentStatus === "failed") {
        order.waylPaymentStatus = "failed";
        await order.save();
      }
      console.warn("[waylCallback] Rejected non-paid callback", {
        referenceId,
        orderId: order.id,
        paymentStatus,
        event,
        paymentStatusRaw,
        eventRaw,
      });
      return res.status(422).json({
        status: "fail",
        message: "Callback does not represent a successful payment",
      });
    }

    if (["kingwin", "completed"].includes(order.status) && order.kinguinOrderId) {
      return res.status(200).json({ status: "success", idempotent: true });
    }

    // Mark order as paid according to Wayl
    order.waylPaymentStatus = "paid";
    order.status = "wayle";
    await order.save();

    // Build products payload for Kinguin API. Each entry needs
    // { kinguinId, qty, price } where price must match an available offer.
    let kinguinProducts = [];
    if (Array.isArray(order.products) && order.products.length > 0) {
      for (const item of order.products) {
        const dbProductId = Number(item.product);
        const prod = Number.isFinite(dbProductId)
          ? await KinguinProduct.findByPk(dbProductId)
          : null;
        if (!prod) {
          console.error("[waylCallback] Product not found in DB", {
            referenceId,
            orderId: order.id,
            productId: item.product,
          });
          continue;
        }

        // Use the minimum available offer price so Kinguin can match it.
        // Falls back to remote.price only if no offers have stock.
        const offers = Array.isArray(prod.remote?.offers) ? prod.remote.offers : [];
        const availablePrices = offers
          .filter(o => (Number(o?.availableQty) || 0) > 0 && Number.isFinite(o?.price) && o.price > 0)
          .map(o => o.price);
        const price = availablePrices.length > 0
          ? Math.min(...availablePrices)
          : prod.remote?.price;

        if (!price) {
          console.error("[waylCallback] Product has no valid price", {
            referenceId,
            orderId: order.id,
            productId: item.product,
            productName: prod.remote?.name,
          });
          continue;
        }

        kinguinProducts.push({
          kinguinId: Number(item.product),
          qty: Number(item.quantity) || 1,
          price,
        });
      }
    }

    if (kinguinProducts.length === 0) {
      order.kinguinOrderId = "retry_required";
      await order.save();
      console.error("[waylCallback] No valid products for Kinguin", {
        referenceId,
        orderId: order.id,
        rawProducts: order.products,
      });
      return res.status(400).json({
        status: "fail",
        message: "No valid products could be sent to Kinguin",
      });
    }

    const kinguinPayload = {
      products: kinguinProducts,
      orderExternalId: String(order.id),
    };
    console.log("[waylCallback] Kinguin payload:", JSON.stringify(kinguinPayload));

    // Place order with Kinguin
    try {
      const kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);
      order.kinguinOrderId = kinguinOrderResponse.orderId;
      order.status = "kingwin";
      await order.save();
      return res.json({ status: "success" });
    } catch (err) {
      order.kinguinOrderId = "retry_required";
      await order.save();
      console.error("[waylCallback] Kinguin order placement failed", {
        referenceId,
        orderId: order.id,
        productIds: (order.products || []).map((p) => p.product),
        kinguinPayload,
        kinguinStatus: err.response?.status,
        kinguinResponse: err.response?.data,
        message: err.message,
      });
      return res.status(502).json({
        status: "error",
        message:
          "Payment confirmed but Kinguin order placement failed; marked for retry",
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.submitKinguinOrderByProductId = submitKinguinOrderByProductId;
exports.prepareKinguinOrderProduct = buildKinguinOrderProduct;

// List current user's orders
exports.myOrders = async (req, res) => {
  const orders = await Order.findAll({
    where: {
      user: req.user._id || req.user.id,
      status: { [Op.in]: ["completed", "kingwin"] },
    },
    order: [["createdAt", "DESC"]],
    raw: true,
  });
  const summary = orders.map((o) => ({
    id: o.id,
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
    where: {
      status: { [Op.in]: ["completed", "kingwin"] },
      id: req.params.id,
      user: req.user._id || req.user.id,
    },
    raw: true,
  });

  if (!order)
    return res.status(404).json({ status: "fail", message: "Order not found" });
  // If there are no stored keys on the order, attempt to fetch them from Kinguin
  if (!order.keys || order.keys.length === 0) {
    try {
      const r = await axios.get(
        `${ESA_ONEORDER_URL}/${order.kinguinOrderId}/keys`,
        {
          headers: ESA_HEADERS,
          timeout: 20000,
        }
      );
      // r.data should be an array of key objects. Map them into our schema.
      const keys = (Array.isArray(r.data) ? r.data : []).map((k) => ({
        serial: k.serial,
        type: k.type,
        name: k.name,
        kinguinId: k.kinguinId,
      }));
      if (keys.length > 0) {
        // Store all keys on the order; also mirror the first key into the legacy `key` field.
        await Order.update(
          {
            keys,
            status: "completed",
          },
          { where: { kinguinOrderId: order.kinguinOrderId } }
        );
        order = await Order.findOne({
          where: { kinguinOrderId: order.kinguinOrderId },
          raw: true,
        });
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
  const order = await Order.findByPk(req.params.orderId);
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
    const order = await Order.findByPk(req.params.orderId);
    if (!order) {
      return next(new appError("order not found", 404));
    }
    await order.update(req.body);
    res.status(200).json({
      status: "success",
      order,
    });
  }
});

exports.deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const deletedorder = await Order.findByPk(req.params.orderId);

  if (!deletedorder) {
    return next(new appError("order not found", 404));
  }

  await deletedorder.destroy();

  res.status(204).json({
    status: "success",
    message: "order deleted",
  });
});
