const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true }, // percentage (0–100) or fixed IQD
    expiresAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.methods.applyDiscount = function (subtotal) {
  if (!this.active || (this.expiresAt && this.expiresAt < new Date())) return 0;
  if (this.type === "percent") return Math.round(subtotal * (this.value / 100));
  return this.value;
};

module.exports = mongoose.model("Coupon", couponSchema);
