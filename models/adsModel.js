const mongoose = require("mongoose");

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "An ad must have a title"],
      trim: true,
    },
    adPicture: {
      type: String,
    },
    link: {
      type: String,
    },
    string: { type: String },
    position: { type: String },
    active: {
      type: Boolean,
      default: true,
    },
  },

  {
    timestamps: true,
  }
);

const adModel = mongoose.model("Ad", adSchema);

module.exports = adModel;
