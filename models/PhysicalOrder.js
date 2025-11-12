// const mongoose = require("mongoose");

// const orderSchema = new mongoose.Schema(
//   {
//     user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     seller: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//     product: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "PhysicalProduct",
//       required: true,
//     },
//     quantity: { type: Number, default: 1 },
//     totalPrice: { type: Number, required: true }, // final IQD after discount
//     status: {
//       type: String,
//       enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
//     },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Order", orderSchema);
