// controllers/orderControllers.js
const axios = require("axios");
const Orders = require("../models/ordersModel");
const User = require("../models/userModel");

const APIFeatures = require("../utils/APIFeatures");
const appError = require("../utils/appError");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const factory = require("../utils/handlerFactory");

/**
 * Kinguin ESA config
 * - Use ESA base, not the generic gateway root
 * - Auth header is X-Api-Key
 * - Orders endpoint is /v2/order (singular) for ESA
 */
const KINGUIN_API_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_API_KEY = process.env.KINGUIN_API_KEY;

const ESA_BALANCE_URL = `${KINGUIN_API_BASE}/v1/balance`;
const ESA_ORDER_URL = `${KINGUIN_API_BASE}/v2/order`;

const ESA_HEADERS = {
  "Content-Type": "application/json",
  "X-Api-Key": KINGUIN_API_KEY || "", // filled at runtime; validated below
};

// --- helpers ---
function calcTotals(items = []) {
  const totalItems = items.reduce(
    (s, i) => s + Number(i.quantity ?? i.qty ?? 0),
    0
  );
  const totalPriceLocal = items.reduce(
    (s, i) =>
      s + Number(i.price || 0) * Math.max(0, Number(i.quantity ?? i.qty ?? 0)),
    0
  );
  return { totalItems, totalPriceLocal: Number(totalPriceLocal.toFixed(2)) };
}

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

/**
 * ESA order call
 * Docs show minimal payload:
 *   { products: [{ productId: "<string>", qty: <number>, price?: <number> }], orderExternalId?: "<string>" }
 * We keep offerId if you provide it (harmless); ESA ignores unknown fields.
 */
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

exports.createOrder = catchAsyncErrors(async (req, res, next) => {
  // const {
  //   user = {},
  //   items = [],
  //   orderExternalId,
  //   mode = "own",
  // } = req.body || {};

  // if (!items.length) return next(new appError("items are required", 400));
  // if (!KINGUIN_API_KEY)
  //   return next(new appError("Kinguin API key missing", 500));
  // if (!/^https?:\/\//.test(KINGUIN_API_BASE))
  //   return next(new appError("Kinguin base URL invalid", 500));
  // if (!orderExternalId)
  //   return next(new appError("orderExternalId is required", 400));

  // // 1) Upsert user (by phone or email)
  // const lookup = {};
  // if (user.phoneNumber) lookup.phoneNumber = user.phoneNumber;
  // if (user.email) lookup.email = user.email;

  // let userDoc = await User.findOne(lookup);
  // if (!userDoc) {
  //   userDoc = await User.create({
  //     fullName: user.fullName,
  //     email: user.email,
  //     phoneNumber: user.phoneNumber,
  //     governorate: user.governorate,
  //     city: user.city,
  //     address: user.address,
  //     notes: user.notes,
  //   });
  // } else {
  //   if (user.fullName) userDoc.fullName = user.fullName;
  //   if (user.email) userDoc.email = user.email;
  //   if (user.phoneNumber) userDoc.phoneNumber = user.phoneNumber;
  //   if (user.governorate) userDoc.governorate = user.governorate;
  //   if (user.city) userDoc.city = user.city;
  //   if (user.address) userDoc.address = user.address;
  //   if (user.notes) userDoc.notes = user.notes;
  //   await userDoc.save();
  // }

  // // 2) Idempotency: if an order for this user+externalId already exists, return it
  // let existing = await Orders.findOne({ user: userDoc._id, orderExternalId });
  // if (existing && existing.orderId) {
  //   return res
  //     .status(200)
  //     .json({ status: "success", data: { order: existing } });
  // }

  // // 3) Create (or reuse) local order shell in pending
  // const { totalItems, totalPriceLocal } = calcTotals(items);
  // let orderDoc = existing;
  // if (!orderDoc) {
  //   orderDoc = await Orders.create({
  //     user: userDoc._id,

  //     // shipping snapshot
  //     fullName: user.fullName || userDoc.fullName,
  //     governorate: user.governorate || userDoc.governorate,
  //     city: user.city || userDoc.city,
  //     addressLine: user.address || userDoc.address,
  //     phoneNumber: user.phoneNumber || userDoc.phoneNumber,
  //     notes: user.notes || userDoc.notes,

  //     orderExternalId,
  //     localStatus: "pending",
  //     totalItems,
  //     totalPriceLocal,

  //     // stash cart
  //     products: items.map((i) => ({
  //       productId: String(i.productId), // keep as string for ESA
  //       qty: Number(i.qty ?? i.quantity ?? 1),
  //       price: i.price != null ? Number(i.price) : undefined,
  //       name: i.name,
  //       offerId: i.offerId,
  //       keyType: i.keyType || "text",
  //       totalPrice:
  //         i.price != null
  //           ? Number(
  //               (Number(i.price) * Number(i.qty ?? i.quantity ?? 1)).toFixed(2)
  //             )
  //           : undefined,
  //     })),
  //   });
  // }

  // // 4) Build Kinguin ESA payload (string productId; price optional)
  // const kinguinPayload = {
  //   products: items.map((i) => {
  //     const p = {
  //       productId: String(i.productId),
  //       qty: Number(i.qty ?? i.quantity ?? 1),
  //     };
  //     if (i.price != null) p.price = Number(i.price);
  //     // keep offerId if you have it; ESA ignores unknowns
  //     if (i.offerId) p.offerId = i.offerId;
  //     return p;
  //   }),
  //   orderExternalId,
  // };

  // // 5) Place order (only check balance if mode === "own")
  // let kinguinOrderResponse;
  // if (mode === "own") {
  //   const { balance } = await kinguinGetBalance();
  //   const needed = kinguinPayload.products.reduce(
  //     (s, p) => s + Number(p.price || 0) * Number(p.qty || 0),
  //     0
  //   );
  //   if (Number.isFinite(needed) && Number(balance) < Number(needed)) {
  //     return res.status(409).json({
  //       status: "fail",
  //       error: "LOW_BALANCE",
  //       message: "Insufficient Kinguin balance. Top up and retry.",
  //       balance,
  //       needed,
  //       localOrderId: orderDoc._id,
  //     });
  //   }
  // }

  // kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);

  // // 6) Merge Kinguin response into the order
  // orderDoc = await Orders.findByIdAndUpdate(
  //   orderDoc._id,
  //   {
  //     $set: {
  //       totalPrice: kinguinOrderResponse.totalPrice,
  //       requestTotalPrice: kinguinOrderResponse.requestTotalPrice,
  //       paymentPrice: kinguinOrderResponse.paymentPrice,
  //       status: kinguinOrderResponse.status,
  //       userEmail: kinguinOrderResponse.userEmail,
  //       storeId: kinguinOrderResponse.storeId,
  //       kinguinCreatedAt: kinguinOrderResponse.createdAt,
  //       orderId: kinguinOrderResponse.orderId,
  //       kinguinOrderId: kinguinOrderResponse.kinguinOrderId,
  //       isPreorder: kinguinOrderResponse.isPreorder,
  //       totalQty: kinguinOrderResponse.totalQty,
  //       preorderReleaseDate: kinguinOrderResponse.preorderReleaseDate,
  //       products: (kinguinOrderResponse.products || []).map((p) => ({
  //         kinguinId: p.kinguinId,
  //         offerId: p.offerId,
  //         productId: p.productId,
  //         qty: p.qty,
  //         name: p.name,
  //         price: p.price,
  //         totalPrice: p.totalPrice,
  //         requestPrice: p.requestPrice,
  //         isPreorder: p.isPreorder,
  //         releaseDate: p.releaseDate,
  //         keyType: p.keyType,
  //         keys: p.keys,
  //       })),
  //       kinguinRequest: kinguinPayload,
  //       kinguinResponse: kinguinOrderResponse,
  //     },
  //   },
  //   { new: true }
  // );

  // if (orderDoc.status === "completed") {
  //   orderDoc.localStatus = "delivered";
  //   await orderDoc.save();
  // }

  res.status(201).json({
    status: "success",
    data: {
      totalPrice: 11.49,
      requestTotalPrice: 11.49,
      status: "completed",
      originalStatus: "COMPLETED",
      kidId: 20678477,
      userEmail: "gamewiseiq@gmail.com",
      storeId: 5366,
      createdAt: "2025-09-04T21:30:17+00:00",
      updatedAt: "2025-09-04T21:30:17+00:00",
      orderId: "908C54513B05",
      orderExternalId: "ORD-ESA-20250903-0022",
      paymentPrice: 11.49,
      products: [
        {
          kinguinId: 27890,
          offerId: "6839f530ce39120143190bb2",
          productId: "5c9b67a92539a4e8f17a59a9",
          qty: 1,
          name: "Dead by Daylight PC Steam CD Key",
          price: 11.49,
          totalPrice: 11.49,
          requestPrice: 11.49,
          isPreorder: false,
          releaseDate: "2016-06-14",
          accurate: true,
          broker: "internal",
          keys: [
            {
              id: "68ba04e9f84bce32e770d931",
              status: "DELIVERED",
            },
          ],
        },
      ],
      totalQty: 1,
      dispatch: {
        dispatchId: 69003276,
        createdAt: "2025-09-04T21:30:17+00:00",
      },
      isPreorder: false,
    },
  });
});

// this shit for admin it needs testing
// exports.createOrder = catchAsyncErrors(async (req, res, next) => {
//   const {
//     user = {},
//     items = [],
//     orderExternalId,
//     mode = "own",
//   } = req.body || {};
//   if (!items.length) return next(new appError("items are required", 400));
//   if (!KINGUIN_API_KEY)
//     return next(new appError("Kinguin API key missing", 500));

//   // 1) Upsert user by phone or email
//   const lookup = {};
//   if (user.phoneNumber) lookup.phoneNumber = user.phoneNumber;
//   if (user.email) lookup.email = user.email;

//   let userDoc = await User.findOne(lookup);
//   if (!userDoc) {
//     userDoc = await User.create({
//       fullName: user.fullName,
//       email: user.email,
//       phoneNumber: user.phoneNumber,
//       governorate: user.governorate,
//       city: user.city,
//       address: user.address,
//       notes: user.notes,
//     });
//   } else {
//     // update shallow fields if provided
//     if (user.fullName) userDoc.fullName = user.fullName;
//     if (user.email) userDoc.email = user.email;
//     if (user.phoneNumber) userDoc.phoneNumber = user.phoneNumber;
//     if (user.governorate) userDoc.governorate = user.governorate;
//     if (user.city) userDoc.city = user.city;
//     if (user.address) userDoc.address = user.address;
//     if (user.notes) userDoc.notes = user.notes;
//     await userDoc.save();
//   }

//   // 2) Create local order first
//   const { totalItems, totalPriceLocal } = calcTotals(items);
//   let orderDoc = await Orders.create({
//     user: userDoc._id,

//     // flat shipping snapshot
//     fullName: user.fullName || userDoc.fullName,
//     governorate: user.governorate || userDoc.governorate,
//     city: user.city || userDoc.city,
//     addressLine: user.address || userDoc.address,
//     phoneNumber: user.phoneNumber || userDoc.phoneNumber,
//     notes: user.notes || userDoc.notes,

//     orderExternalId,
//     localStatus: "pending",
//     totalItems,
//     totalPriceLocal,
//   });

//   // 3) Build Kinguin payload
//   const kinguinPayload = {
//     products: items.map((i) => ({
//       productId: Number(i.productId),
//       qty: Number(i.qty ?? i.quantity ?? 1),
//       price: Number(i.price),
//       offerId: i.offerId,
//       keyType: i.keyType || "text",
//     })),
//     orderExternalId,
//   };

//   // 4) If you are using your own checkout, check balance first
//   let kinguinOrderResponse;

//   const { balance } = await kinguinGetBalance();
//   const needed = kinguinPayload.products.reduce(
//     (s, p) => s + p.price * p.qty,
//     0
//   );
//   if (Number(balance) < Number(needed)) {
//     return res.status(409).json({
//       status: "fail",
//       error: "LOW_BALANCE",
//       message: "Insufficient Kinguin balance. Top up and retry.",
//       balance,
//       needed,
//       localOrderId: orderDoc._id,
//     });
//   }
//   kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);

//   // 5) Merge Kinguin response into flat order doc
//   orderDoc = await Orders.findByIdAndUpdate(
//     orderDoc._id,
//     {
//       $set: {
//         totalPrice: kinguinOrderResponse.totalPrice,
//         requestTotalPrice: kinguinOrderResponse.requestTotalPrice,
//         paymentPrice: kinguinOrderResponse.paymentPrice,
//         status: kinguinOrderResponse.status,
//         userEmail: kinguinOrderResponse.userEmail,
//         storeId: kinguinOrderResponse.storeId,
//         kinguinCreatedAt: kinguinOrderResponse.createdAt,
//         orderId: kinguinOrderResponse.orderId,
//         kinguinOrderId: kinguinOrderResponse.kinguinOrderId,
//         isPreorder: kinguinOrderResponse.isPreorder,
//         totalQty: kinguinOrderResponse.totalQty,
//         preorderReleaseDate: kinguinOrderResponse.preorderReleaseDate,
//         products: (kinguinOrderResponse.products || []).map((p) => ({
//           kinguinId: p.kinguinId,
//           offerId: p.offerId,
//           productId: p.productId,
//           qty: p.qty,
//           name: p.name,
//           price: p.price,
//           totalPrice: p.totalPrice,
//           requestPrice: p.requestPrice,
//           isPreorder: p.isPreorder,
//           releaseDate: p.releaseDate,
//           keyType: p.keyType,
//           keys: Array.isArray(p.keys)
//             ? p.keys.map((k) => ({ id: k.id, status: k.status }))
//             : [],
//         })),
//         kinguinRequest: kinguinPayload,
//         kinguinResponse: kinguinOrderResponse,
//       },
//     },
//     { new: true }
//   );

//   if (orderDoc.status === "completed") {
//     orderDoc.localStatus = "delivered";
//     await orderDoc.save();
//   }

//   res.status(201).json({
//     status: "success",
//     data: { order: orderDoc },
//   });
// });
exports.getOrders = factory.getAll(Orders, "orders");

// single get
exports.getOrder = catchAsyncErrors(async (req, res, next) => {
  if (!KINGUIN_API_KEY)
    return next(new appError("Kinguin API key missing", 500));
  if (!KINGUIN_API_BASE)
    return next(new appError("Kinguin base URL missing", 500));

  const { orderId } = req.params;
  if (!orderId || typeof orderId !== "string") {
    return next(new appError("Valid orderId param is required", 400));
  }

  const url = `${KINGUIN_API_BASE}/v1/order/${encodeURIComponent(orderId)}`;

  try {
    const { data } = await axios.get(url, {
      headers: { "X-Api-Key": KINGUIN_API_KEY },
    });

    // Keep a consistent API shape with your other controllers
    return res.status(200).json({
      status: "success",
      data, // Kinguin Order Object
    });
  } catch (err) {
    // Normalize axios errors into your appError flow
    const status = err?.response?.status || 500;
    const message =
      err?.response?.data?.message ||
      (typeof err?.response?.data === "string"
        ? err.response.data
        : err.message) ||
      "Failed to fetch order from Kinguin";

    // Common cases: 401 bad API key, 404 not found, 429 rate limit, 5xx upstream
    return next(new appError(`Kinguin order fetch failed: ${message}`, status));
  }
});

// update
exports.updateOrder = catchAsyncErrors(async (req, res, next) => {
  const order = await Orders.findByIdAndUpdate(req.params.orderId, req.body, {
    new: true,
  });
  if (!order) return next(new appError("order not found", 404));
  res.status(200).json({ status: "success", data: { order } });
});

// delete
exports.deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const deleted = await Orders.findOneAndDelete({ _id: req.params.orderId });
  if (!deleted) return next(new appError("order not found", 404));
  res.status(204).json({ status: "success", message: "order deleted" });
});

exports.getMyOrders = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?._id || req.query.userId;
  if (!userId) return next(new appError("User not authenticated", 401));

  const features = new APIFeatures(Orders.find({ user: userId }), req.query)
    .filter()
    .sort()
    .paginate()
    .selectFields();

  const orders = await features.query;

  res.status(200).json({
    status: "success",
    results: orders.length,
    data: { orders },
  });
});

exports.getMyOrder = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?._id || req.query.userId;
  if (!userId) return next(new appError("User not authenticated", 401));

  const order = await Orders.findById(req.params.orderId).populate("user");
  if (!order) return next(new appError("order not found", 404));
  if (String(order.user) !== String(userId))
    return next(new appError("forbidden: not your order", 403));

  res.status(200).json({ status: "success", data: { order } });
});
