// const Reviews = require("../models/reviewsModel");
// const APIFeatures = require("../utils/APIFeatures");
// const appError = require("../utils/appError");
// const catchAsyncErrors = require("../utils/catchAsyncErrors");
// const factory = require("../utils/handlerFactory");

// exports.getReviews = factory.getAll(Reviews, "reviews");

// // exports.getReviews = catchAsyncErrors(async (req, res, next) => {
// //   const features = new APIFeatures(Reviews.find(), req.query)
// //     .filter()
// //     .sort()
// //     .paginate()
// //     .selectFields();

// //   const reviews = await features.query;

// //   res.status(200).json({
// //     status: "success",
// //     results: reviews.length,
// //     data: {
// //       reviews,
// //     },
// //   });
// // });

// exports.createReview = catchAsyncErrors(async (req, res, next) => {
//   if (req.body) {
//     if (req.body.rating > 5 || req.body.rating < 0) {
//       return next(new appError(" invalid rating", 400));
//     }
//     review = await Reviews.create(req.body);
//   } else {
//     return next(new appError("please insert review data", 400));
//   }

//   res.status(201).json({
//     status: "success",
//     data: {
//       review,
//     },
//   });
// });

// exports.getReview = catchAsyncErrors(async (req, res, next) => {
//   const review = await Reviews.findById(req.params.reviewId);
//   if (!review) {
//     return next(new appError("review not found", 404));
//   }

//   res.status(200).json({
//     status: "success",
//     data: {
//       review,
//     },
//   });
// });

// exports.updateReview = catchAsyncErrors(async (req, res, next) => {
//   if (req.body) {
//     if (req.body.rating) {
//       if (req.body.rating > 5 || req.body.rating < 0) {
//         return next(new appError(" invalid rating", 400));
//       }
//     }
//     review = await Reviews.findByIdAndUpdate(req.params.reviewId, req.body);
//     if (!review) {
//       return next(new appError("review not found", 404));
//     }
//     res.status(200).json({
//       status: "success",
//       review,
//     });
//   }
// });

// exports.deleteReview = catchAsyncErrors(async (req, res, next) => {
//   let deletedReview;
//   if (req.user.role === "admin") {
//     deletedReview = await Reviews.findOneAndDelete({
//       _id: req.params.reviewId,
//     });
//   }

//   if (!deletedReview) {
//     return next(new appError("review not found", 404));
//   }

//   res.status(204).json({
//     status: "success",
//     message: "review deleted",
//   });
// });
