const { Tag } = require("../post-models");
const factory = require("../utils/handlerFactory"); // Correct path
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const AppError = require("../utils/appError");

exports.getAllTags = factory.getAll(Tag, "tags");
exports.getTag = factory.getOne(Tag, null, "tag");
exports.createTag = factory.createOne(Tag, "tag");
exports.updateTag = factory.updateOne(Tag, "tag");

exports.deleteTag = catchAsyncErrors(async (req, res, next) => {
  const tagId = req.params.tagId;
  const tag = await Tag.findByPk(tagId);
  if (!tag) {
    return next(new AppError("TAG_NOT_FOUND", 404));
  }

  // productCount used to come from a Mongoose virtual; keep deletion conservative.
  const tagWithCount = tag;
  if (tagWithCount && Number(tagWithCount.productCount || 0) > 0) {
    return next(new AppError("TAG_DELETE_HAS_PRODUCTS", 400));
  }

  await tag.destroy();

  res.status(204).json({
    status: "success",
    data: null,
  });
});
