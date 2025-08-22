const Ad = require("../models/adsModel.js");
const AppError = require("../utils/appError");
const { deleteS3ObjectFromUrl } = require("../utils/s3Utils");
const catchAsyncErrors = require("../utils/catchAsyncErrors.js");
const factory = require("../utils/handlerFactory");

exports.createAd = factory.createOne(Ad, "ads");

exports.deleteAd = catchAsyncErrors(async (req, res, next) => {
  const adId = req.params.adId;
  const deletedAd = await Ad.findByIdAndDelete(adId);

  if (!deletedAd) {
    return next(new AppError("AD_NOT_FOUND", 404));
  }

  if (deletedAd.adPicture) {
    await deleteS3ObjectFromUrl(deletedAd.adPicture);
  }

  res.status(204).json({
    status: "success",
    message: "ad deleted",
  });
});

exports.getAds = factory.getAll(Ad, "ads");
exports.getAd = catchAsyncErrors(async (req, res, next) => {
  const ad = await Ad.findById(req.params.adId);

  if (!ad) {
    return next(new AppError("ad not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      ad,
    },
  });
});

exports.updateAd = catchAsyncErrors(async (req, res, next) => {
  if (!req.body.json) {
    return next(new AppError("please insert json key with form-data", 400));
  }
  const json = JSON.parse(req.body.json);

  // role-aware filter like your hotel code
  const { adId } = req.params;

  const currentAd = await Ad.findOne({ _id: adId });
  if (!currentAd) {
    return next(new AppError("ad not found", 404));
  }

  const imagesToDelete = [];

  if (req.body.adPicture) {
    if (currentAd.adPicture && currentAd.adPicture !== req.body.adPicture) {
      imagesToDelete.push(currentAd.adPicture);
    }
    json.adPicture = req.body.adPicture;
  }

  const updatedAd = await Ad.findOneAndUpdate({ _id: adId }, json, {
    new: true,
    runValidators: true,
  });

  if (!updatedAd) {
    return next(new AppError("ad update failed", 500));
  }

  await Promise.all(imagesToDelete.map((url) => deleteS3ObjectFromUrl(url)));

  res.status(200).json({ status: "success", data: updatedAd });
});
