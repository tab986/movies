const catchAsyncErrors = require("../utils/catchAsyncErrors");
const User = require("../models/userModel");
const appError = require("../utils/appError");

const { deleteS3ObjectFromUrl } = require("../utils/deleteR2File");

exports.updateProfileData = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    }

    // Only update fields that are sent in the request body. We do not
    // attempt to update sensitive fields like password here.
    const updatableFields = ["fullName", "governorate", "city", "address"];
    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    res.status(200).json({ status: "success", data: { user } });
  } catch (err) {
    next(err);
  }
};

exports.updateProfileImage = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    }

    const imagesToDelete = [];

    // If a new image is provided and it's different from the existing
    // profileImage, schedule the old one for deletion and update the
    // user's profileImage field.
    if (req.body.image && req.body.image !== user.profileImage) {
      if (user.profileImage) imagesToDelete.push(user.profileImage);
      user.profileImage = req.body.image;
    }

    await user.save();

    // Delete any old images from R2 after the user document is saved
    await Promise.all(imagesToDelete.map(deleteS3ObjectFromUrl));

    res.status(200).json({ status: "success", data: { user } });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = catchAsyncErrors(async (req, res, next) => {
  let deletedUser;
  if ((!req.user.role == "admin")) {
    deletedUser = await User.findByIdAndUpdate(req.body.user, {
      active: false,
    });
  } else {
    deletedUser = await User.findByIdAndUpdate(req.user._id, {
      active: false,
    });
  }
  if (!deletedUser) {
    return next(new appError("user not found", 404));
  }

  res.status(204).json({
    status: "success",
    message: "user is not active",
  });
});
