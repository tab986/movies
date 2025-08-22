const mongoose = require("mongoose");

const ordersSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // shipping/contact snapshot at time of order
    fullName: String,
    governorate: String,
    city: String,
    addressLine: String,
    phoneNumber: String,
    notes: String,

    localStatus: {
      type: String,
      default: "pending",
      enum: ["pending", "delivered", "canceled"],
      index: true,
    },

    // your local aggregates
    totalItems: Number,
    totalPriceLocal: Number,

    // Kinguin Order Object
    totalPrice: Number,
    requestTotalPrice: Number,
    paymentPrice: mongoose.Schema.Types.Mixed, // string per docs, allow anything
    status: {
      type: String,
      enum: ["processing", "completed", "canceled", "refunded"],
      index: true,
    },
    userEmail: String,
    storeId: Number,
    kinguinCreatedAt: String, // keep their string as-is
    orderId: { type: String, index: true, unique: true, sparse: true },
    kinguinOrderId: Number,
    orderExternalId: { type: String, index: true },
    isPreorder: Boolean,
    totalQty: Number,
    preorderReleaseDate: String,

    products: [
      {
        kinguinId: Number,
        offerId: String,
        productId: String,
        qty: Number,
        name: String,
        price: Number,
        totalPrice: Number,
        requestPrice: Number,
        isPreorder: Boolean,
        releaseDate: String,
        keyType: String, // "text"
        keys: [
          {
            id: String,
            status: String, // PENDING | PROCESSING | DELIVERED | RETURNED | REFUNDED | CANCELED
            serial: { type: String, select: false },
          },
        ],
      },
    ],

    kinguinRequest: { type: Object, select: false },
    kinguinResponse: { type: Object, select: false },
  },
  { timestamps: true }
);

ordersSchema.index({ createdAt: 1 });
ordersSchema.index({ "products.kinguinId": 1 });

module.exports = mongoose.model("Orders", ordersSchema);
