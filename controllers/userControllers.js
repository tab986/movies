const catchAsyncErrors = require("../utils/catchAsyncErrors");
const Users = require("../models/userModel");
const appError = require("../utils/appError");
const Store = require("../models/storeModel");

exports.deleteUser = catchAsyncErrors(async (req, res, next) => {
  let deletedUser;

  deletedUser = await Users.findByIdAndDelete(req.user._id);

  if (!deletedUser) {
    return next(new appError("user not found", 404));
  }

  res.status(204).json({
    status: "success",
    message: "user is not active",
  });
});

exports.userAccount = catchAsyncErrors(async (req, res, next) => {
  const { address, city, name, usedCoupons, additionalPhone, phone, myOrders } =
    req.user;

  res.status(200).json({
    status: "success",
    data: {
      address,
      city,
      name,
      usedCoupons,
      additionalPhone,
      phone,
      myOrders,
    },
  });
});

exports.incrementFollowerCount = catchAsyncErrors(async (req, res, next) => {
  const storeId = req.params.id;

  const updatedStore = await Store.findByIdAndUpdate(
    storeId,
    { $inc: { followerCount: 1 } },
    { new: true }
  );

  if (!updatedStore) {
    return next(new appError("Store not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      followerCount: updatedStore.followerCount,
    },
  });
});
