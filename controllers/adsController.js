const { Ad } = require("../post-models");
const AppError = require("../utils/appError");
const { deleteS3ObjectFromUrl } = require("../utils/s3Utils");
const catchAsyncErrors = require("../utils/catchAsyncErrors.js");
const factory = require("../utils/handlerFactory");

exports.createAd = factory.createOne(Ad, "ads");

exports.deleteAd = catchAsyncErrors(async (req, res, next) => {
  const adId = req.params.adId;
  const deletedAd = await Ad.findByPk(adId);

  if (!deletedAd) {
    return next(new AppError("AD_NOT_FOUND", 404));
  }

  await deletedAd.destroy();

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
  const ad = await Ad.findByPk(req.params.adId);

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
  let json;
  if (!req.body.json) {
    json = req.body;
  } else {
    json = JSON.parse(req.body.json);
  }
  // role-aware filter like your hotel code
  const { adId } = req.params;

  const currentAd = await Ad.findByPk(adId);
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

  await currentAd.update(json);
  const updatedAd = await Ad.findByPk(adId);

  if (!updatedAd) {
    return next(new AppError("ad update failed", 500));
  }

  await Promise.all(imagesToDelete.map((url) => deleteS3ObjectFromUrl(url)));

  res.status(200).json({ status: "success", data: updatedAd });
});
