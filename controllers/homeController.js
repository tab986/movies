const Home = require("../models/homeModel");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const appError = require("../utils/appError");
const deleteS3ObjectFromUrl = require("../utils/s3Utils"); // Adjust path if needed

exports.getHomeSection = catchAsyncErrors(async (req, res, next) => {
  const home = await Home.findOne();

  if (!home) {
    return next(new appError("No home section found", 404));
  }

  res.status(200).json({
    status: "success",
    data: { home },
  });
});

exports.createHomeSection = catchAsyncErrors(async (req, res, next) => {
  const exists = await Home.findOne();
  if (exists) {
    return next(new appError("Home section already exists", 400));
  }

  if (!req.body.json) {
    return next(new appError("Please insert 'json' key with form-data", 400));
  }

  const json = JSON.parse(req.body.json);

  // Add uploaded image filenames from multer
  if (req.body.mainImage) json.mainSection.mainImage = req.body.mainImage;
  if (req.body.aboutImage) json.about.aboutImage = req.body.aboutImage;

  // Ensure categories and partners are arrays (if sent as strings)
  if (typeof json.mainCategories === "string") {
    try {
      json.mainCategories = JSON.parse(json.mainCategories);
    } catch {
      return next(new appError("Invalid mainCategories format", 400));
    }
  }

  if (typeof json.about?.ourPartners === "string") {
    try {
      json.about.ourPartners = JSON.parse(json.about.ourPartners);
    } catch {
      return next(new appError("Invalid ourPartners format", 400));
    }
  }

  const newHome = await Home.create(json);

  res.status(201).json({
    status: "success",
    data: { home: newHome },
  });
});

exports.updateHomeSection = catchAsyncErrors(async (req, res, next) => {
  const json = req.body.json ? JSON.parse(req.body.json) : {};

  const home = await Home.findOne();
  if (!home) {
    return next(new appError("Home section not found", 404));
  }

  const imagesToDelete = [];

  // Handle mainImage replacement
  if (
    req.body.mainImage &&
    req.body.mainImage !== home.mainSection?.mainImage
  ) {
    if (home.mainSection?.mainImage)
      imagesToDelete.push(home.mainSection.mainImage);
    json.mainSection = {
      ...(home.mainSection || {}),
      ...json.mainSection,
      mainImage: req.body.mainImage,
    };
  }

  // Handle aboutImage replacement
  if (req.body.aboutImage && req.body.aboutImage !== home.about?.aboutImage) {
    if (home.about?.aboutImage) imagesToDelete.push(home.about.aboutImage);
    json.about = {
      ...(home.about || {}),
      ...json.about,
      aboutImage: req.body.aboutImage,
    };
  }

  // Parse array strings if needed
  if (typeof json.mainCategories === "string") {
    try {
      json.mainCategories = JSON.parse(json.mainCategories);
    } catch {
      return next(new appError("Invalid mainCategories format", 400));
    }
  }

  if (typeof json.about?.ourPartners === "string") {
    try {
      json.about.ourPartners = JSON.parse(json.about.ourPartners);
    } catch {
      return next(new appError("Invalid ourPartners format", 400));
    }
  }

  // Merge and update
  const updatedHome = await Home.findByIdAndUpdate(home._id, json, {
    new: true,
    runValidators: true,
  });

  if (!updatedHome) {
    return next(new appError("Home section not found after update", 404));
  }

  // Delete old images from S3
  await Promise.all(imagesToDelete.map(deleteS3ObjectFromUrl));

  res.status(200).json({
    status: "success",
    data: { home: updatedHome },
  });
});
