const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const AppError = require("./appError");
const catchAsyncErrors = require("./catchAsyncErrors");
const { buildPublicFileUrl } = require("./publicFileUrl");

// --- Cloudflare R2 Configuration ---
if (
  !process.env.R2_ACCESS_KEY_ID ||
  !process.env.R2_SECRET_ACCESS_KEY ||
  !process.env.R2_BUCKET_NAME ||
  !process.env.R2_ENDPOINT
) {
  console.error("Missing required R2 environment variables");
}

const s3Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: process.env.AWS_REGION, // R2 doesn't care about region
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("IMAGE_INVALID_FORMAT", 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

const createImageProcessingMiddleware = ({
  entityName,
  imageFieldName,
  destinationPath,
  resizeOptions = { width: 500, height: 500, fit: "cover" },
  formatOptions = { format: "jpeg", quality: 90 },
  isRequiredOnCreate = true,
}) => {
  const uploadSingleImage = upload.fields([
    { name: imageFieldName, maxCount: 1 },
  ]);

  const resizeImage = catchAsyncErrors(async (req, res, next) => {
    const filesObject = req.files;

    if (
      isRequiredOnCreate &&
      req.method === "POST" &&
      (!filesObject || !filesObject[imageFieldName])
    ) {
      return next(
        new AppError(`${entityName.toUpperCase()}_IMAGE_REQUIRED`, 400)
      );
    }

    if (!filesObject || !filesObject[imageFieldName]) {
      return next();
    }

    const imageBuffer = await sharp(filesObject[imageFieldName][0].buffer)
      .resize(resizeOptions.width, resizeOptions.height, {
        fit: resizeOptions.fit,
      })
      .toFormat(formatOptions.format || "jpeg")
      [formatOptions.format || "jpeg"]({ quality: formatOptions.quality || 90 })
      .toBuffer();

    const userId = req.user ? req.user._id : "unknownUser";
    const fileExtension = formatOptions.format || "jpeg";
    const s3Key = `${destinationPath}/${entityName}-${userId}-${Date.now()}.${fileExtension}`;

    try {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: `image/${fileExtension}`,
        },
      });

      const result = await upload.done();
      console.log("R2 Upload Success:", result.Location);

      const fileUrl = buildPublicFileUrl(s3Key);
      req.body[imageFieldName] = fileUrl;

      next();
    } catch (err) {
      console.error("R2 Upload Error:", err);
      return next(new AppError("FILE_UPLOAD_FAILED", 500));
    }
  });

  return [uploadSingleImage, resizeImage];
};

const createMultiImageProcessingMiddleware = ({
  entityName,
  imageFieldName,
  destinationPath,
  resizeOptions = { width: 500, height: 500, fit: "cover" },
  formatOptions = { format: "jpeg", quality: 90 },
  isRequiredOnCreate = true,
}) => {
  const uploadImages = upload.fields([{ name: imageFieldName, maxCount: 10 }]);

  const resizeImages = catchAsyncErrors(async (req, res, next) => {
    const filesObject = req.files;

    if (
      isRequiredOnCreate &&
      req.method === "POST" &&
      (!filesObject || !filesObject[imageFieldName])
    ) {
      return next(
        new AppError(`${entityName.toUpperCase()}_IMAGES_REQUIRED`, 400)
      );
    }

    if (!filesObject || !filesObject[imageFieldName]) {
      return next();
    }

    const uploadedImageUrls = [];

    await Promise.all(
      filesObject[imageFieldName].map(async (file, index) => {
        const buffer = await sharp(file.buffer)
          .resize(resizeOptions.width, resizeOptions.height, {
            fit: resizeOptions.fit,
          })
          .toFormat(formatOptions.format || "jpeg")
          [formatOptions.format || "jpeg"]({
            quality: formatOptions.quality || 90,
          })
          .toBuffer();

        const userId = req.user ? req.user._id : "unknownUser";
        const ext = formatOptions.format || "jpeg";
        const key = `${destinationPath}/${entityName}-${userId}-${Date.now()}-${index + 1}.${ext}`;

        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: `image/${ext}`,
          },
        });

        const result = await upload.done();
        const url = buildPublicFileUrl(key);
        uploadedImageUrls.push(url);
      })
    );

    req.body[imageFieldName] = uploadedImageUrls;
    next();
  });

  return [uploadImages, resizeImages];
};

module.exports = {
  createImageProcessingMiddleware,
  createMultiImageProcessingMiddleware,
};
