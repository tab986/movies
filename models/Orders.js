const mongoose = require("mongoose");

const keySchema = new mongoose.Schema(
  {
    serial: { type: String },
    type: { type: String },
    name: { type: String },
    kinguinId: { type: Number },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true }, // price per item in IQD (incl. markup)
    coupon: { type: String },
    discount: { type: Number, default: 0 }, // discount amount in IQD
    totalPrice: { type: Number, required: true }, // final IQD after discount
    waylReference: { type: String, required: true },
    waylPaymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    kinguinOrderId: { type: Number }, // from Kinguin placeOrder
    kinguinDispatchId: { type: Number }, // from Kinguin dispatch
    key: String, // filled after dispatch
    status: {
      type: String,
      enum: ["pending", "completed", "wayle", "kingwin", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
