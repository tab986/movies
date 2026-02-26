// const Categories = require("../models/categoriesModel");
// const factory = require("../utils/handlerFactory"); // Corrected path to utils directory
// const catchAsyncErrors = require("../utils/catchAsyncErrors");
// const AppError = require("../utils/appError");
// const Products = require("../models/productsModel");

// exports.getCategories = factory.getAll(Categories, "categories");
// exports.createCategory = factory.createOne(Categories, "category");
// exports.updateCategory = factory.updateOne(Categories, "category");

// exports.deleteCategory = catchAsyncErrors(async (req, res, next) => {
//   const categoryId = req.params.categoryId; // Use specific param name

//   const hasProducts = await Products.findOne({ category: categoryId });
//   if (hasProducts) {
//     return next(new AppError("CATEGORY_DELETE_HAS_BOOKS", 400));
//   }

//   const deletedCategory = await Categories.findByIdAndDelete(categoryId);
//   if (!deletedCategory) {
//     return next(new AppError("CATEGORY_NOT_FOUND", 404));
//   }

//   res.status(204).json({
//     status: "success",
//     data: null,
//   });
// });

// exports.getBaseCategoriesWithSubcategories = catchAsyncErrors(
//   async (req, res, next) => {
//     try {
//       const baseCategories = await Categories.find({
//         categoryType: "base",
//       }).lean();

//       const subCategories = await Categories.find({
//         categoryType: "sub",
//       }).lean();

//       const result = baseCategories.map((baseCat) => {
//         const subs = subCategories.filter(
//           (sub) => sub.baseCategory?.toString() === baseCat._id.toString()
//         );
//         return {
//           ...baseCat,
//           subCategories: subs,
//         };
//       });

//       res.status(200).json({
//         status: "success",
//         data: result,
//       });
//     } catch (err) {
//       next(err);
//     }
//   }
// );
