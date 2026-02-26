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

// productsSchema.virtual("reviews", {
//   ref: "Reviews",
//   foreignField: "product",
//   localField: "_id",
// });

// async function attachReviewStats(docs) {
//   if (!Array.isArray(docs)) docs = [docs];

//   await Promise.all(
//     docs.map(async (doc) => {
//       if (doc && doc._id) {
//         const result = await Reviews.aggregate([
//           { $match: { product: doc._id } },
//           {
//             $group: {
//               _id: null,
//               avgRating: { $avg: "$rating" },
//               count: { $sum: 1 },
//             },
//           },
//         ]);

//         const rateAvg = result[0]?.avgRating || 0;
//         const rateCount = result[0]?.count || 0;

//         doc.set("rateAvg", rateAvg, { strict: false });
//         doc.set("rateCount", rateCount, { strict: false });
//       }
//     })
//   );
// }

// productsSchema.post("find", async function (docs) {
//   await attachReviewStats(docs);
// });

// productsSchema.post("findOne", async function (doc) {
//   await attachReviewStats(doc);
// });
// productsSchema.pre(/^find/, async function(next) {
//     this.populate({
//         path: 'user',
//         select: 'displayName _id profilePicture'
//       })
//     next()
// })

const Products = mongoose.model("Products", productsSchema);

module.exports = Products;
