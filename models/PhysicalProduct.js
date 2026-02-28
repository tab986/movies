// const mongoose = require("mongoose");

// const ImagesSchema = new mongoose.Schema(
//   {
//     cover: {
//       url: { type: String },
//     },
//     gallery: [
//       {
//         url: { type: String },
//       },
//     ],
//   },
//   { _id: false }
// );

// const PhysicalProductSchema = new mongoose.Schema(
//   {
//     // Owner of this product (merchant/seller user)
//     seller: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       index: true,
//     },

//     // Data describing the physical product. We mirror the `remote` shape from
//     // KinguinProduct so that the same list query logic can be applied.
//     remote: {
//       name: { type: String, required: true },
//       description: String,
//       images: { type: Object, default: {} }, // cover & gallery URLs
//       price: { type: Number, required: true }, // stored in IQD
//       qty: { type: Number, default: 0 }, // physical stock on hand
//       regionId: Number,
//       tags: [String],
//       isCard: { type: Boolean, default: false },
//       updatedAt: { type: Date, default: Date.now },
//       activationDetails: String,
//       videos: { type: Object },
//       languages: [String],
//       currency: { type: String, default: "IQD" },
//       systemRequirements: { type: Object },
//       originalName: String,
//       metacriticScore: Number,
//       releaseDate: String, // YYYY-MM-DD (optional)
//       publishers: [String],
//       developers: [String],
//       platform: String,
//       genres: [String],
//     },

//     // Seller overrides (optional). Never overwritten by sync.
//     overrides: {
//       name: String,
//       description: String,
//       images: { type: Object },
//       isAd: Boolean,
//     },

//     // Helpers computed to speed up catalog queries
//     derived: {
//       inStock: { type: Boolean, index: true },
//       priceMin: { type: Number, index: true },
//       platformCanonical: { type: String, index: true },
//     },

//     // Visibility flags. Hidden products are excluded from catalog queries.
//     flags: {
//       hidden: { type: Boolean, default: false, index: true },
//       removedAt: Date,
//     },
//   },
//   { timestamps: true }
// );

// // Helpers to normalize platform strings
// function normStr(s) {
//   return String(s || "")
//     .toLowerCase()
//     .replace(/[_\-]+/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function normalizePlatform(p) {
//   const n = normStr(p);
//   if (!n) return "";
//   if (/(pc.*steam|steam.*pc)/.test(n)) return "pc steam";
//   if (/^(uplay|ubisoft|ubisoft connect)|pc.*(uplay|ubisoft)/.test(n))
//     return "pc ubisoft connect";
//   if (/(origin|ea app)/.test(n)) return "ea app";
//   if (/(battle\.?net|battlenet|blizzard)/.test(n)) return "pc battle.net";
//   if (/epic/.test(n)) return "pc epic games";
//   if (/(rockstar|social club)/.test(n)) return "pc rockstar games";
//   if (/gog/.test(n)) return "pc gog";
//   if (/mog station/.test(n)) return "pc mog station";
//   if (n === "pc") return "pc";
//   if (/^xbox series (x|s)|xbox series x\|s/.test(n)) return "xbox series x|s";
//   if (/xbox one/.test(n)) return "xbox one";
//   if (/xbox 360/.test(n)) return "xbox 360";
//   return n;
// }

// // Compute derived fields prior to saving. This ensures that inStock,
// // priceMin and platformCanonical are always consistent with the remote object.
// PhysicalProductSchema.pre("save", function (next) {
//   const qty = Number(this.remote?.qty || 0);
//   this.derived = this.derived || {};
//   this.derived.inStock = qty > 0;
//   this.derived.priceMin = Number(this.remote?.price) || 0;
//   this.derived.platformCanonical = normalizePlatform(this.remote?.platform);
//   next();
// });

// // Index definitions
// PhysicalProductSchema.index({ "derived.inStock": 1, "derived.priceMin": 1 });
// PhysicalProductSchema.index({ "flags.hidden": 1 });
// PhysicalProductSchema.index({ seller: 1, sku: 1 }, { unique: true });

// module.exports = mongoose.model("PhysicalProduct", PhysicalProductSchema);
