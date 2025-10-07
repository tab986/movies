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

    // Data straight from Kinguin (overwritten each sync)
    remote: {
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
KinguinProductSchema.index({ "flags.hidden": 1 });

module.exports = mongoose.model("KinguinProduct", KinguinProductSchema);
