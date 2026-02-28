const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A tag must have a name"],
      unique: true,
      trim: true,
    },
    color: {
      type: String,
      required: [true, "A tag must have a color"],
    },
  },
  {
    timestamps: true,
  }
);

tagSchema.virtual("productCount", {
  ref: "Products",
  localField: "_id",
  foreignField: "tags",
  count: true,
});

const Tag = mongoose.model("Tag", tagSchema);

module.exports = Tag;
