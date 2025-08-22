const axios = require("axios");
const Orders = require("../models/ordersModel");
const User = require("../models/userModel");

const APIFeatures = require("../utils/APIFeatures");
const appError = require("../utils/appError");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const factory = require("../utils/handlerFactory");

const KINGUIN_API_BASE =
  process.env.KINGUIN_API_BASE || "https://gateway.kinguin.net/esa/api";
const KINGUIN_API_KEY = process.env.KINGUIN_API_KEY;

// --- helpers ---
function calcTotals(items = []) {
  const totalItems = items.reduce(
    (s, i) => s + Number(i.quantity ?? i.qty ?? 0),
    0
  );
  const totalPriceLocal = items.reduce(
    (s, i) => s + Number(i.price || 0) * Number(i.quantity ?? i.qty ?? 0),
    0
  );
  return { totalItems, totalPriceLocal: Number(totalPriceLocal.toFixed(2)) };
}
async function kinguinGetBalance() {
  const r = await axios.get(`${KINGUIN_API_BASE}/v1/balance`, {
    headers: { "X-Api-Key": KINGUIN_API_KEY },
  });
  return r.data; // { balance }
}
async function kinguinPlaceOrderV2(payload) {
  const r = await axios.post(`${KINGUIN_API_BASE}/v2/order`, payload, {
    headers: {
      "X-Api-Key": KINGUIN_API_KEY,
      "Content-Type": "application/json",
    },
  });
  return r.data; // Kinguin order object
}

exports.createOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    user = {},
    items = [],
    orderExternalId,
    mode = "own",
  } = req.body || {};
  if (!items.length) return next(new appError("items are required", 400));
  if (!KINGUIN_API_KEY)
    return next(new appError("Kinguin API key missing", 500));
  if (!orderExternalId)
    return next(new appError("orderExternalId is required", 400));

  // 1) Upsert user (by phone or email)
  const lookup = {};
  if (user.phoneNumber) lookup.phoneNumber = user.phoneNumber;
  if (user.email) lookup.email = user.email;

  let userDoc = await User.findOne(lookup);
  if (!userDoc) {
    userDoc = await User.create({
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      governorate: user.governorate,
      city: user.city,
      address: user.address,
      notes: user.notes,
    });
  } else {
    if (user.fullName) userDoc.fullName = user.fullName;
    if (user.email) userDoc.email = user.email;
    if (user.phoneNumber) userDoc.phoneNumber = user.phoneNumber;
    if (user.governorate) userDoc.governorate = user.governorate;
    if (user.city) userDoc.city = user.city;
    if (user.address) userDoc.address = user.address;
    if (user.notes) userDoc.notes = user.notes;
    await userDoc.save();
  }

  // 2) Idempotency: if an order for this user+externalId already exists, return it
  let existing = await Orders.findOne({ user: userDoc._id, orderExternalId });
  if (existing && existing.orderId) {
    return res
      .status(200)
      .json({ status: "success", data: { order: existing } });
  }

  // 3) Create (or reuse) local order shell in pending
  const { totalItems, totalPriceLocal } = calcTotals(items);
  let orderDoc = existing;
  if (!orderDoc) {
    orderDoc = await Orders.create({
      user: userDoc._id,
      // shipping snapshot
      fullName: user.fullName || userDoc.fullName,
      governorate: user.governorate || userDoc.governorate,
      city: user.city || userDoc.city,
      addressLine: user.address || userDoc.address,
      phoneNumber: user.phoneNumber || userDoc.phoneNumber,
      notes: user.notes || userDoc.notes,

      orderExternalId,
      localStatus: "pending",
      totalItems,
      totalPriceLocal,

      // optional: stash cart as products until Kinguin reply arrives
      products: items.map((i) => ({
        productId: String(i.productId),
        qty: Number(i.qty ?? i.quantity ?? 1),
        price: Number(i.price),
        name: i.name,
        offerId: i.offerId,
        keyType: i.keyType || "text",
        totalPrice: Number(
          (Number(i.price) * Number(i.qty ?? i.quantity ?? 1)).toFixed(2)
        ),
      })),
    });
  }

  // 4) Build Kinguin payload
  const kinguinPayload = {
    products: items.map((i) => ({
      productId: Number(i.productId),
      qty: Number(i.qty ?? i.quantity ?? 1),
      price: Number(i.price),
      offerId: i.offerId,
      keyType: i.keyType || "text",
    })),
    orderExternalId,
  };

  // 5) Place order (only check balance if mode === "own")
  let kinguinOrderResponse;
  if (mode === "own") {
    const { balance } = await kinguinGetBalance();
    const needed = kinguinPayload.products.reduce(
      (s, p) => s + p.price * p.qty,
      0
    );
    if (Number(balance) < Number(needed)) {
      return res.status(409).json({
        status: "fail",
        error: "LOW_BALANCE",
        message: "Insufficient Kinguin balance. Top up and retry.",
        balance,
        needed,
        localOrderId: orderDoc._id,
      });
    }
  }
  kinguinOrderResponse = await kinguinPlaceOrderV2(kinguinPayload);

  // 6) Merge Kinguin response into the order
  orderDoc = await Orders.findByIdAndUpdate(
    orderDoc._id,
    {
      $set: {
        totalPrice: kinguinOrderResponse.totalPrice,
        requestTotalPrice: kinguinOrderResponse.requestTotalPrice,
        paymentPrice: kinguinOrderResponse.paymentPrice,
        status: kinguinOrderResponse.status,
        userEmail: kinguinOrderResponse.userEmail,
        storeId: kinguinOrderResponse.storeId,
        kinguinCreatedAt: kinguinOrderResponse.createdAt,
        orderId: kinguinOrderResponse.orderId,
        kinguinOrderId: kinguinOrderResponse.kinguinOrderId,
        isPreorder: kinguinOrderResponse.isPreorder,
        totalQty: kinguinOrderResponse.totalQty,
        preorderReleaseDate: kinguinOrderResponse.preorderReleaseDate,
        products: (kinguinOrderResponse.products || []).map((p) => ({
          kinguinId: p.kinguinId,
          offerId: p.offerId,
          productId: p.productId,
          qty: p.qty,
          name: p.name,
          price: p.price,
          totalPrice: p.totalPrice,
          requestPrice: p.requestPrice,
          isPreorder: p.isPreorder,
          releaseDate: p.releaseDate,
          keyType: p.keyType,
          keys: Array.isArray(p.keys)
            ? p.keys.map((k) => ({ id: k.id, status: k.status }))
            : [],
        })),
        kinguinRequest: kinguinPayload,
        kinguinResponse: kinguinOrderResponse,
      },
    },
    { new: true }
  );

  if (orderDoc.status === "completed") {
    orderDoc.localStatus = "delivered";
    await orderDoc.save();
  }

  res.status(201).json({ status: "success", data: { order: orderDoc } });
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
  const order = await Orders.findById(req.params.orderId).populate("user");
  if (!order) return next(new appError("order not found", 404));
  res.status(200).json({ status: "success", data: { order } });
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
