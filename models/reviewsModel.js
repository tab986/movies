const mongoose = require("mongoose");

const reviewsSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: [true, "insert the username"],
    },
    date: {
      type: String,
      required: [true, "insert the date"],
    },
    rating: {
      type: Number,
      required: [true, "insert the rating"],
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Products",
      required: [true, "the review must belong to a Product"],
    },
    comment: String,
  },
  {
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
    id: false,
    timestamps: true,
  }
);

reviewsSchema.post("save", async function () {
  const review = this;

  const stats = await mongoose.model("Reviews").aggregate([
    { $match: { product: review.product } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const rateAvg = stats[0]?.avgRating || 0;
  const rateCount = stats[0]?.count || 0;
  const Products = require("./productsModel");

  await Products.findByIdAndUpdate(review.product, {
    rateAvg,
    rateCount,
  });
});

reviewsSchema.post("findOneAndDelete", async function (doc) {
  if (doc?.product) {
    const stats = await mongoose.model("Reviews").aggregate([
      { $match: { product: doc.product } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    const rateAvg = stats[0]?.avgRating || 0;
    const rateCount = stats[0]?.count || 0;
    const Products = require("./productsModel");

    await Products.findByIdAndUpdate(doc.product, {
      rateAvg,
      rateCount,
    });
  }
});

const Reviews = mongoose.model("Reviews", reviewsSchema);
module.exports = Reviews;
