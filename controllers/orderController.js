const {
  Order,
  KinguinProduct,
  Coupon,
  Users,
  Merchant,
  MerchantPurchaseLog,
} = require("../post-models");
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
const { computeMerchantLineDiscount } = require("../utils/merchantDiscount.js");
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

async function consumeCouponUsageForOrder(order) {
  const couponCode = String(order?.coupon || "").trim();
  if (!couponCode) {
    return;
  }

  const coupon = await Coupon.findOne({ where: { code: couponCode } });
  if (!coupon) {
    console.warn("[waylCallback] Coupon missing for order", {
      orderId: order?.id,
      couponCode,
    });
    return;
  }

  const orderUserId = String(order?.user || "").trim();
  if (!orderUserId) {
    return;
  }

  const currentUsers = Array.isArray(coupon.users) ? coupon.users : [];
  const normalizedUsers = currentUsers.map((id) => String(id));
  if (normalizedUsers.includes(orderUserId)) {
    return;
  }

  coupon.users = [...new Set([...normalizedUsers, orderUserId])];
  await coupon.save();
}
// Create payment link via Wayl
async function createWaylLink(referenceId, payment, productName, image) {
  const payAmount = Number(payment?.amount);
  const payCurrency = String(payment?.currency || "").toUpperCase();
  const sourceAmountIQD = Number(payment?.sourceAmountIQD);
  const conversionRate = Number(payment?.rate);
  const usedFallback = Boolean(payment?.fxFallback);

  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error("Invalid payment amount");
  }
  if (!/^[A-Z]{3}$/.test(payCurrency)) {
    throw new Error("Invalid payment currency");
  }

  const payload = {
    referenceId: String(referenceId),
    total: payAmount,
    currency: payCurrency,
    lineItem: [
      {
        label: productName || "Basket Value",
        type: "increase",
        amount: payAmount,
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
      fromIQD: sourceAmountIQD,
      currency: payCurrency,
      rate: Number.isFinite(conversionRate) ? conversionRate : null,
      amount: payAmount,
      fallback: usedFallback,
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

    const dbUser = await Users.findByPk(userId);
    let merchantProfile = null;
    if (dbUser && dbUser.role === "merchant") {
      merchantProfile = await Merchant.findOne({ where: { userId } });
    }

    let merchantDiscountTotal = 0;
    const lineMerchantMeta = [];
    if (merchantProfile && merchantProfile.status === "active" && orderItems.length > 0) {
      for (const itm of orderItems) {
        const { discountAmount, discountType, discountValue } =
          computeMerchantLineDiscount(
            itm.unitPrice,
            itm.quantity,
            merchantProfile
          );
        lineMerchantMeta.push({
          product: itm.product,
          quantity: itm.quantity,
          unitPrice: itm.unitPrice,
          discountAmount,
          discountType,
          discountValue,
        });
        merchantDiscountTotal += discountAmount;
      }
      total = Math.max(0, total - merchantDiscountTotal);
    }

    let merchantDiscountType = null;
    let merchantDiscountValue = null;
    if (merchantDiscountTotal > 0 && merchantProfile) {
      merchantDiscountType = merchantProfile.discountType;
      merchantDiscountValue = merchantProfile.discountValue;
    }

    let discountAmount = 0;
    let appliedCouponCode = null;
    if (couponCode && String(couponCode).trim() !== "") {
      try {
        const couponResult = await applyCoupon(couponCode, total, userId);
        discountAmount = Number(couponResult?.discount) || 0;
        appliedCouponCode = couponResult?.code || null;
        total = Math.max(0, total - discountAmount);
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

    const fx = await convertFromIQD(req, total);
    const paymentCurrency = fx.currency;
    const paymentTotal =
      paymentCurrency === "IQD"
        ? Math.round(Number(fx.amount))
        : Number(Number(fx.amount).toFixed(2));

    // Construct order document
    const waylRef = `WAYL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const orderData = {
      user: userId,
      totalPrice: paymentTotal,
      paymentCurrency,
      discount: discountAmount,
      coupon: appliedCouponCode,
      waylReference: waylRef,
      country: fx.countryCode,
      merchants: merchantProfile ? userId : null,
      merchantDiscountType,
      merchantDiscountValue,
      merchantDiscountAmount: merchantDiscountTotal,
      products: orderItems.map((itm) => ({
        product: String(itm.product.id),
        quantity: itm.quantity,
        unitPrice: itm.unitPrice,
      })),
    };
    console.log("orderData", orderData);
    
    const order = await Order.create(orderData);

    if (merchantProfile && lineMerchantMeta.length > 0) {
      for (const line of lineMerchantMeta) {
        const p = line.product;
        const lineBase = line.unitPrice * line.quantity;
        const name =
          p?.remote?.name ||
          p?.overrides?.name ||
          String(p?.id ?? "");
        const finalUnit =
          line.quantity > 0
            ? (lineBase - line.discountAmount) / line.quantity
            : line.unitPrice;
        await MerchantPurchaseLog.create({
          merchantId: merchantProfile.id,
          merchantUserId: userId,
          userId,
          orderId: order.id,
          productId: String(p.id),
          productName: name,
          quantity: line.quantity,
          baseUnitPriceIQD: line.unitPrice,
          discountType: line.discountType,
          discountValue: line.discountValue,
          discountAmountIQD: line.discountAmount,
          finalUnitPriceIQD: finalUnit,
          gainIQD: lineBase,
          lossIQD: line.discountAmount,
          earningIQD: line.discountAmount,
        });
      }
    }

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
      {
        amount: paymentTotal,
        currency: paymentCurrency,
        sourceAmountIQD: total,
        rate: fx.rate,
        fxFallback: fx.fxFallback,
      },
      label,
      image
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
      await consumeCouponUsageForOrder(order);
      return res.status(200).json({ status: "success", idempotent: true });
    }

    // Mark order as paid according to Wayl
    order.waylPaymentStatus = "paid";
    order.status = "wayle";
    await order.save();
    await consumeCouponUsageForOrder(order);

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

exports.grantGiveawayOrder = async (req, res, next) => {
  try {
    const { userId, productId, qty = 1 } = req.body || {};

    if (!userId) {
      return res
        .status(400)
        .json({ status: "fail", message: "userId is required" });
    }
    if (!productId) {
      return res
        .status(400)
        .json({ status: "fail", message: "productId is required" });
    }

    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "qty must be a positive integer",
      });
    }

    const targetUser = await Users.findByPk(userId);
    if (!targetUser) {
      return res
        .status(404)
        .json({ status: "fail", message: "Target user not found" });
    }

    const preparedProduct = await buildKinguinOrderProduct({
      productId,
      qty: quantity,
    });

    const giveawayReference = `GIVEAWAY-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const order = await Order.create({
      user: userId,
      product: String(preparedProduct.kinguinId),
      quantity,
      unitPrice: preparedProduct.price,
      products: [
        {
          product: String(preparedProduct.kinguinId),
          quantity,
          unitPrice: preparedProduct.price,
        },
      ],
      totalPrice: preparedProduct.price * quantity,
      waylReference: giveawayReference,
      waylPaymentStatus: "paid",
      status: "pending",
    });

    const kinguinOrderResponse = await submitKinguinOrderByProductId({
      productId: preparedProduct.kinguinId,
      qty: quantity,
      orderExternalId: String(order.id),
      kinguinProduct: preparedProduct,
    });

    order.kinguinOrderId = kinguinOrderResponse.orderId;
    order.status = "kingwin";
    await order.save();

    return res.status(201).json({
      status: "success",
      data: {
        orderId: order.id,
        userId,
        kinguinOrderId: order.kinguinOrderId,
      },
    });
  } catch (err) {
    next(err);
  }
};

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