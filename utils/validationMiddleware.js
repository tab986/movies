const { Category, Tag } = require("../post-models");
const AppError = require("./appError");
const catchAsyncErrors = require("./catchAsyncErrors");
const { Op } = require("sequelize");

exports.validateCategoryExists = catchAsyncErrors(async (req, res, next) => {
  if (!req.body.category) {
    return next();
  }

  const categoryExists = await Category.findByPk(req.body.category);
  if (!categoryExists) {
    return next(new AppError("CATEGORY_NOT_FOUND", 404));
  }
  next();
});

exports.validateTagsExist = catchAsyncErrors(async (req, res, next) => {
  if (
    !req.body.tags ||
    !Array.isArray(req.body.tags) ||
    req.body.tags.length === 0
  ) {
    return next();
  }

  const tagIds = req.body.tags;
  const tagCount = await Tag.count({
    where: { id: { [Op.in]: tagIds } },
  });

  if (tagCount !== tagIds.length) {
    return next(new AppError("TAG_NOT_FOUND_MULTIPLE", 404));
  }
  next();
});
