const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A category must have a title"],
      unique: true,
      trim: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    categoryType: {
      type: String,
      enum: ["base", "sub"],
    },
    baseCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      validate: {
        validator: function (val) {
          return this.categoryType !== "sub" || !!val;
        },
        message: "A sub category must reference a base category",
      },
    },
  },
  {
    timestamps: true,
  }
);

const CategoryModel = mongoose.model("Category", categorySchema);

module.exports = CategoryModel;
