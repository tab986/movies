// // controllers/physicalOrdersController.js
// //
// // Handlers for orders associated with physical products. Each physical order
// // references a physical product and records the buyer, seller, quantity and
// // status. Sellers can view and update their orders; admins can view and
// // manage all orders. This controller does not implement order creation
// // through the API (orders are created when buyers checkout); rather it
// // provides listing, detail and update operations.

// const PhysicalProduct = require("./PhysicalProduct");
// const catchAsyncErrors = require("../utils/catchAsyncErrors");
// const AppError = require("../utils/appError");

// /**
//  * List all physical orders for the authenticated seller. Supports optional
//  * filters by status or product. Pagination parameters `page` and `limit`
//  * behave the same as in product listings. Orders are returned sorted by
//  * creation date descending.
//  */
// exports.getSellerOrders = catchAsyncErrors(async (req, res, next) => {
//   const sellerId = req.user._id;
//   const where = { seller: sellerId };
//   if (req.query.status) where.status = req.query.status;
//   if (req.query.productId) where.product = req.query.productId;
//   const page = Math.max(1, Number(req.query.page) || 1);
//   const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 24));
//   const skip = (page - 1) * limit;
//   let pageCount = await PhysicalOrder.find(where).countDocuments();
//   pageCount = Math.ceil(pageCount / limit);
//   const orders = await PhysicalOrder.find(where)
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .populate({ path: "product", select: "remote overrides derived sku" })
//     .populate({ path: "user", select: "fullName phone" })
//     .lean();
//   res.status(200).json({
//     status: "success",
//     meta: { pageCount, page, limit },
//     results: orders.length,
//     data: { orders },
//   });
// });

// /**
//  * Get a single order for the seller. Ensures the seller owns the order or
//  * the current user is admin. Populates product and user references.
//  */
// exports.getSellerOrder = catchAsyncErrors(async (req, res, next) => {
//   const id = req.params.id;
//   const order = await PhysicalOrder.findById(id)
//     .populate({
//       path: "product",
//       select: "remote overrides derived sku seller",
//     })
//     .populate({ path: "user", select: "fullName phone" })
//     .lean();
//   if (!order) {
//     return next(new AppError("Order not found", 404));
//   }
//   if (
//     order.seller.toString() !== req.user._id.toString() &&
//     req.user.role !== "admin"
//   ) {
//     return next(
//       new AppError("You do not have permission to view this order", 403)
//     );
//   }
//   res.status(200).json({ status: "success", data: { order } });
// });

// /**
//  * Update the status of a physical order. Sellers may update their own
//  * orders; admins may update any order. Only the `status` field is
//  * updateable. Valid statuses are pending, confirmed, shipped, delivered
//  * and cancelled. The request body should include `status` with one of
//  * those values. Returns the updated order.
//  */
// exports.updateSellerOrder = catchAsyncErrors(async (req, res, next) => {
//   const id = req.params.id;
//   const order = await PhysicalOrder.findById(id);
//   if (!order) {
//     return next(new AppError("Order not found", 404));
//   }
//   if (
//     order.seller.toString() !== req.user._id.toString() &&
//     req.user.role !== "admin"
//   ) {
//     return next(
//       new AppError("You do not have permission to update this order", 403)
//     );
//   }
//   if (!req.body.status) {
//     return next(new AppError("Missing status field", 400));
//   }
//   const validStatuses = [
//     "pending",
//     "confirmed",
//     "shipped",
//     "delivered",
//     "cancelled",
//   ];
//   if (!validStatuses.includes(String(req.body.status))) {
//     return next(new AppError("Invalid order status", 400));
//   }
//   order.status = String(req.body.status);
//   await order.save();
//   const updated = await PhysicalOrder.findById(id)
//     .populate({
//       path: "product",
//       select: "remote overrides derived sku seller",
//     })
//     .populate({ path: "user", select: "fullName phone" });
//   res.status(200).json({ status: "success", data: { order: updated } });
// });

// /**
//  * List all physical orders (admin). Supports filtering by sellerId, status
//  * and productId via query params. Pagination is the same as for sellers.
//  */
// exports.getOrdersAdmin = catchAsyncErrors(async (req, res, next) => {
//   if (req.user.role !== "admin") {
//     return next(new AppError("Only admins may view all orders", 403));
//   }
//   const where = {};
//   if (req.query.sellerId) where.seller = req.query.sellerId;
//   if (req.query.status) where.status = req.query.status;
//   if (req.query.productId) where.product = req.query.productId;
//   const page = Math.max(1, Number(req.query.page) || 1);
//   const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 24));
//   const skip = (page - 1) * limit;
//   let pageCount = await PhysicalOrder.find(where).countDocuments();
//   pageCount = Math.ceil(pageCount / limit);
//   const orders = await PhysicalOrder.find(where)
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .populate({
//       path: "product",
//       select: "remote overrides derived sku seller",
//     })
//     .populate({ path: "user", select: "fullName phone" })
//     .lean();
//   res.status(200).json({
//     status: "success",
//     meta: { pageCount, page, limit },
//     results: orders.length,
//     data: { orders },
//   });
// });

// /**
//  * Retrieve a single physical order (admin). No seller check.
//  */
// exports.getOrderAdmin = catchAsyncErrors(async (req, res, next) => {
//   if (req.user.role !== "admin") {
//     return next(new AppError("Only admins may view an order", 403));
//   }
//   const id = req.params.id;
//   const order = await PhysicalOrder.findById(id)
//     .populate({
//       path: "product",
//       select: "remote overrides derived sku seller",
//     })
//     .populate({ path: "user", select: "fullName phone" })
//     .lean();
//   if (!order) {
//     return next(new AppError("Order not found", 404));
//   }
//   res.status(200).json({ status: "success", data: { order } });
// });

// /**
//  * Update a physical order (admin). Allows updating the status and seller
//  * assignment, but not the product or user. Delegates to the seller update
//  * function if only status is provided. If a `seller` field is present
//  * the order will be reassigned; note that reassigning an order does not
//  * validate that the product belongs to the new seller – this must be
//  * enforced at a higher level if desired.
//  */
// exports.updateOrderAdmin = catchAsyncErrors(async (req, res, next) => {
//   if (req.user.role !== "admin") {
//     return next(new AppError("Only admins may update orders", 403));
//   }
//   const id = req.params.id;
//   const order = await PhysicalOrder.findById(id);
//   if (!order) {
//     return next(new AppError("Order not found", 404));
//   }
//   if (req.body.seller) {
//     order.seller = req.body.seller;
//   }
//   if (req.body.status) {
//     const validStatuses = [
//       "pending",
//       "confirmed",
//       "shipped",
//       "delivered",
//       "cancelled",
//     ];
//     if (!validStatuses.includes(String(req.body.status))) {
//       return next(new AppError("Invalid order status", 400));
//     }
//     order.status = String(req.body.status);
//   }
//   await order.save();
//   const updated = await PhysicalOrder.findById(id)
//     .populate({
//       path: "product",
//       select: "remote overrides derived sku seller",
//     })
//     .populate({ path: "user", select: "fullName phone" });
//   res.status(200).json({ status: "success", data: { order: updated } });
// });

// /**
//  * Delete a physical order (admin). Permanently removes the order from
//  * the database. This action should be used sparingly as it is irreversible.
//  */
// exports.deleteOrderAdmin = catchAsyncErrors(async (req, res, next) => {
//   if (req.user.role !== "admin") {
//     return next(new AppError("Only admins may delete orders", 403));
//   }
//   const id = req.params.id;
//   const order = await PhysicalOrder.findByIdAndDelete(id);
//   if (!order) {
//     return next(new AppError("Order not found", 404));
//   }
//   res.status(204).json({ status: "success", message: "Order deleted" });
// });
