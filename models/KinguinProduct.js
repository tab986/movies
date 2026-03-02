// Schema for products mirrored from Kinguin.
// Each document stores the raw data fetched from the Kinguin ESA API
// under the `remote` field, your custom overrides under `overrides`,
// computed helpers under `derived`, and flags for soft hiding delisted items.

const mongoose = require("mongoose");

// An individual offer. These sit inside remote.offers.
const OfferSchema = new mongoose.Schema(
  {
    offerId: String,
    price: Number,
    availableQty: Number,
    merchantName: String,
  },
  { _id: false }
);

const KinguinProductSchema = new mongoose.Schema(
  {
    // The Kinguin product ID is used as the MongoDB _id for easy upserts
    _id: { type: Number, required: true },
    officialStore: {
      itadGameId: String,
      shopId: Number,
      shopName: String,
      url: String,
      country: String,
      currency: String,
      priceAmount: Number, // current price on official store
      regularAmount: Number, // original / non-discount price
      cut: Number, // store's own discount (0–100)
      lastUpdatedAt: Date,
    },

    // Data straight from Kinguin (overwritten each sync)
    remote: {
      regionalLimitations: mongoose.Schema.Types.Mixed,
      countryLimitation: mongoose.Schema.Types.Mixed,
      name: String,
      description: String,
      images: mongoose.Schema.Types.Mixed,
      price: Number,
      qty: Number,
      offers: [OfferSchema],
      regionId: Number,
      tags: [String],
      isCard: Boolean, // derived from tags
      updatedAt: Date,
      activationDetails: String,
      videos: mongoose.Schema.Types.Mixed,
      languages: [String],
      currency: { type: String, default: "IQD" }, // always "USD" from Kinguin
      systemRequirements: mongoose.Schema.Types.Mixed,
      originalName: String,
      metacriticScore: Number,
      releaseDate: String,
      publishers: [String],
      developers: [String],
      platform: String,
      genres: [String],
    },

    // Your overrides. Never overwritten by the worker.
    overrides: {
      name: String,
      description: String,
      images: mongoose.Schema.Types.Mixed,
      isAd: Boolean,
    },

    // Helpers computed on sync to speed up queries
    derived: {
      inStock: { type: Boolean, index: true },
      priceMin: { type: Number, index: true },
      searchRating: { type: Number, default: 0, index: true },
      platformCanonical: { type: String, index: true }, // NEW
    },

    // Visibility flags. Hidden products are excluded from catalog queries.
    flags: {
      hidden: { type: Boolean, default: false, index: true },
      removedAt: Date,
    },
  },
  { timestamps: true }
);

// Indexes for efficient filtering
KinguinProductSchema.index({ "derived.inStock": 1, "derived.priceMin": 1 });
KinguinProductSchema.index(
  { "flags.hidden": 1, "derived.inStock": 1, "remote.regionId": 1, "derived.priceMin": 1 },
  { name: "search_visibility_region_price_idx" }
);
KinguinProductSchema.index(
  {
    "flags.hidden": 1,
    "derived.inStock": 1,
    "derived.searchRating": -1,
    "derived.priceMin": 1,
    _id: 1,
  },
  { name: "search_visibility_rating_price_idx" }
);
KinguinProductSchema.index(
  {
    "overrides.name": "text",
    "remote.name": "text",
    "remote.originalName": "text",
  },
  {
    weights: {
      "overrides.name": 8,
      "remote.name": 6,
      "remote.originalName": 4,
    },
    name: "search_name_text_idx",
  }
);


module.exports = mongoose.model("KinguinProduct", KinguinProductSchema);
