const mongoose = require("mongoose");
// const Follow = require("./followModel");
// const Product = require("./productsModel");
// const StoreReview = require("./storeReviewModel");

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    logoImage: { type: String },
    // activeCoupons: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Coupons",
    //   },
    // ],
    // ads: [
    //   {
    //     adPicture: { type: String },
    //     productId: String,
    //     discountText: String,
    //   },
    // ],
    description: String,
    // contact: {
    //   phone: String,
    //   website: String,
    // },
  },
  { timestamps: true }
);

storeSchema.virtual("productIds", {
  ref: "Products",
  foreignField: "store",
  localField: "_id",
});

// // ⬇️ Middleware to attach followerCount, productCount, rateAvg, rateCount
// async function attachVirtualCounts(docs) {
//   if (!Array.isArray(docs)) docs = [docs];

//   await Promise.all(
//     docs.map(async (doc) => {
//       if (doc && doc._id) {
//         const [followerCount, productCount, reviewStats] = await Promise.all([
//           Follow.countDocuments({ store: doc._id }),
//           Product.countDocuments({ store: doc._id }),
//           StoreReview.aggregate([
//             { $match: { storeId: doc._id } },
//             {
//               $group: {
//                 _id: null,
//                 avgRating: { $avg: "$rating" },
//                 ratingCount: { $sum: 1 },
//               },
//             },
//           ]),
//         ]);

//         doc.set("followerCount", followerCount, { strict: false });
//         doc.set("productCount", productCount, { strict: false });

//         if (reviewStats.length > 0) {
//           doc.set("rateAvg", reviewStats[0].avgRating, { strict: false });
//           doc.set("rateCount", reviewStats[0].ratingCount, { strict: false });
//         } else {
//           doc.set("rateAvg", 0, { strict: false });
//           doc.set("rateCount", 0, { strict: false });
//         }
//       }
//     })
//   );
// }

// // ⬇️ Add post middleware to inject counts
// storeSchema.post("find", async function (docs) {
//   await attachVirtualCounts(docs);
// });

// storeSchema.post("findOne", async function (doc) {
//   await attachVirtualCounts(doc);
// });

module.exports = mongoose.model("Store", storeSchema);
