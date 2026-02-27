const mongoose = require("mongoose");
const Reviews = require("./reviewsModel");

const productsSchema = new mongoose.Schema(
  {
    name: String,
    isVisible: { type: Boolean, default: true },
    originalPrice: Number,
    isBestseller: Boolean,
    isNew: Boolean,
    category: String,
    image: { type: String, required: true },
    // rateAvg: {
    //   type: Number,
    //   default: 0,
    // },
    // rateCount: {
    //   type: Number,
    //   default: 0,
    // },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    sizes: [{ price: Number, size: String }],
    description: String,
    size: String,
    expireDate: String,
    usage: String,
    skinType: String,
    origin: String,
    content: String,
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
    },
    productStock: Number,
  },
  {
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
    id: false,
    timestamps: true,
  }
);

productsSchema.index({ price: 1 });
productsSchema.index({ title: 1 });
const Products = mongoose.model("Products", productsSchema);

module.exports = Products;
