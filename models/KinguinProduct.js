// Schema for products mirrored from Kinguin.
// Each document stores the raw data fetched from the Kinguin ESA API
// under the `remote` field, your custom overrides under `overrides`,
// computed helpers under `derived`, and flags for soft hiding delisted items.

const mongoose = require('mongoose');

// An individual offer. These sit inside remote.offers.
const OfferSchema = new mongoose.Schema({
  offerId: String,
  price: Number,
  availableQty: Number,
  merchantName: String,
}, { _id: false });

const KinguinProductSchema = new mongoose.Schema({
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
    updatedAt: Date,
    // Platform (e.g. 'PC Steam', 'Xbox One'). Included to allow platform filtering.
    platform: String,
    // Genres array (e.g. ['Action','RPG']). Included to allow genre filtering.
    genres: [String],
  },

  // Your overrides. Never overwritten by the worker.
  overrides: {
    name: String,
    description: String,
    images: mongoose.Schema.Types.Mixed,
  },

  // Helpers computed on sync to speed up queries
  derived: {
    inStock: { type: Boolean, index: true },
    priceMin: { type: Number, index: true },
  },

  // Visibility flags. Hidden products are excluded from catalog queries.
  flags: {
    hidden: { type: Boolean, default: false, index: true },
    removedAt: Date,
  },
}, { timestamps: true });

// Indexes for efficient filtering
KinguinProductSchema.index({ 'derived.inStock': 1, 'derived.priceMin': 1 });
KinguinProductSchema.index({ 'flags.hidden': 1 });

module.exports = mongoose.model('KinguinProduct', KinguinProductSchema);