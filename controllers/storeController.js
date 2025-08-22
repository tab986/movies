const Store = require("../models/storeModel");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const APIFeatures = require("../utils/APIFeatures");
const deleteFiles = require("../utils/deletefiles");
const { deleteS3ObjectFromUrl } = require("../utils/s3Utils");
const appError = require("../utils/appError");

// const multer = require("multer");
// const sharp = require("sharp");

// const multerStorage = multer.memoryStorage();

// const multerFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image")) cb(null, true);
//   else cb(new appError("Only images are allowed", 400), false);
// };

// const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

// // 2. Expose multer fields
// exports.uploadStoreImages = upload.fields([
//   { name: "logoImage", maxCount: 1 },
//   { name: "backgroundImage", maxCount: 1 },
//   { name: "adPictures", maxCount: 5 },
// ]);

// // 3. Image Resizing
// exports.resizeStoreImages = catchAsyncErrors(async (req, res, next) => {
//   if (!req.body.json) {
//     if (req.method === "POST") {
//       return next(new appError("please insert json key with form-data", 400));
//     }
//   }

//   const json = JSON.parse(req.body.json);
//   req.body = json;

//   // Logo Image
//   if (req.files.logoImage) {
//     const filename = `store-logo-${Date.now()}.jpeg`;
//     await sharp(req.files.logoImage[0].buffer)
//       .resize(300, 300)
//       .toFormat("jpeg")
//       .jpeg({ quality: 90 })
//       .toFile(`public/images/stores/${filename}`);
//     req.body.logoImage = filename;
//   }

//   // Background Image
//   if (req.files.backgroundImage) {
//     const filename = `store-bg-${Date.now()}.jpeg`;
//     await sharp(req.files.backgroundImage[0].buffer)
//       .resize(800, 600)
//       .toFormat("jpeg")
//       .jpeg({ quality: 90 })
//       .toFile(`public/images/stores/${filename}`);
//     req.body.backgroundImage = filename;
//   }

//   // Ad Pictures
//   if (req.files.adPictures && req.body.ads) {
//     const ads = JSON.parse(JSON.stringify(req.body.ads));
//     if (!Array.isArray(ads))
//       return next(new appError("Ads should be an array", 400));

//     req.body.ads = await Promise.all(
//       ads.map(async (ad, i) => {
//         const filename = `ad-${Date.now()}-${i + 1}.jpeg`;
//         await sharp(req.files.adPictures[i].buffer)
//           .resize(500, 500)
//           .toFormat("jpeg")
//           .jpeg({ quality: 90 })
//           .toFile(`public/images/stores/${filename}`);
//         return { ...ad, adPicture: filename };
//       })
//     );
//   }

//   next();
// });

exports.createStore = catchAsyncErrors(async (req, res, next) => {
  if (!req.body.json) {
    return next(new appError("please insert json key with form-data", 400));
  }

  let json;
  try {
    json = JSON.parse(req.body.json);
  } catch (err) {
    return next(new appError("Invalid JSON format in form-data", 400));
  }

  if (req.body.logoImage) {
    json.logoImage = req.body.logoImage;
  }

  const newStore = await Store.create(json);

  res.status(201).json({
    status: "success",
    data: { store: newStore },
  });
});

exports.getStores = catchAsyncErrors(async (req, res) => {
  let stores;
  const features = new APIFeatures(Store.find(), req.query)
    .filter()
    .sort()
    .paginate()
    .selectFields();

  if (req.user?.role == "admin") {
    stores = await features.query;
  } else {
    stores = await features.query.select("-activeCoupons");
  }

  res.status(200).json({
    status: "success",
    results: stores.length,
    data: { stores },
  });
});

exports.getStore = catchAsyncErrors(async (req, res, next) => {
  let store;
  if (req.user?.role == "admin") {
    store = await Store.findById(req.params.storeId);
  } else {
    store = await Store.findById(req.params.storeId);
  }

  if (!store) return next(new appError("Store not found", 404));
  res.status(200).json({ status: "success", data: { store } });
});

exports.updateStore = catchAsyncErrors(async (req, res, next) => {
  let json = {};
  if (req.body.json) {
    try {
      json = JSON.parse(req.body.json);
    } catch (err) {
      return next(new appError("Invalid JSON format in form-data", 400));
    }
  }

  const store = await Store.findById(req.params.storeId);
  if (!store) {
    return next(new appError("store not found", 404));
  }

  const imagesToDelete = [];

  if (req.body.logoImage && req.body.logoImage !== store.logoImage) {
    if (store.logoImage) imagesToDelete.push(store.logoImage);
    json.logoImage = req.body.logoImage;
  }

  const updatedStore = await Store.findOneAndUpdate(
    { _id: req.params.storeId },
    json,
    { new: true, runValidators: true }
  );

  if (!updatedStore) {
    return next(new appError("store not found after update", 404));
  }

  await Promise.all(imagesToDelete.filter(Boolean).map(deleteS3ObjectFromUrl));

  res.status(200).json({
    status: "success",
    data: updatedStore,
  });
});

// exports.updateStore = catchAsyncErrors(async (req, res, next) => {
//   const oldStore = await Store.findById(req.params.storeId);
//   if (!oldStore) return next(new appError("Store not found", 404));

//   const filesToDelete = [];

//   if (req.body.logoImage && oldStore.logoImage)
//     filesToDelete.push(`public/images/stores/${oldStore.logoImage}`);

//   if (req.body.backgroundImage && oldStore.backgroundImage)
//     filesToDelete.push(`public/images/stores/${oldStore.backgroundImage}`);

//   if (req.body.ads && Array.isArray(oldStore.ads)) {
//     oldStore.ads.forEach((oldAd, i) => {
//       if (req.body.ads[i]?.adPicture && oldAd.adPicture)
//         filesToDelete.push(`public/images/stores/${oldAd.adPicture}`);
//     });
//   }

//   if (filesToDelete.length > 0) {
//     await deleteFiles(filesToDelete, next);
//   }

//   const updatedStore = await Store.findByIdAndUpdate(
//     req.params.storeId,
//     req.body,
//     {
//       new: true,
//       runValidators: true,
//     }
//   );

//   res.status(200).json({ status: "success", data: { store: updatedStore } });
// });

exports.deleteStore = catchAsyncErrors(async (req, res, next) => {
  const store = await Store.findByIdAndDelete(req.params.storeId);

  if (!store) {
    return next(new appError("Store not found", 404));
  }

  const imagesToDelete = [];

  if (store.logoImage) {
    imagesToDelete.push(store.logoImage);
  }

  await Promise.all(imagesToDelete.map(deleteS3ObjectFromUrl));

  res.status(204).json({
    status: "success",
    message: "Store deleted",
  });
});
