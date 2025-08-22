const exp = require("express");
const productsControllers = require("../controllers/productControllers");
const authControllers = require("../controllers/authControllers");
const ordersControllers = require("../controllers/orderControllers");
const statesController = require("../controllers/statesController");
const adsControllers = require("../controllers/adsController");
const categoriesControllers = require("../controllers/categoriesControllers");
const reviewsControllers = require("../controllers/reviewsControllers");
const tagsController = require("../controllers/tagsController");
const storeController = require("../controllers/storeController");
const validationMiddleware = require("../utils/validationMiddleware");

const {
  createImageProcessingMiddleware,
  createMultiImageProcessingMiddleware,
} = require("../utils/imageUploadMiddleware");
const parseJsonBody = require("../utils/parseJsonBodyMiddleware");

const multer = require("multer");
const {
  multerStorage,
  multerFilter,
} = require("../utils/imageUploadMiddleware");

// //store
// const [uploadLogoImageUpdate, processLogoImageUpdate] =
//   createImageProcessingMiddleware({
//     entityName: "storeLogo",
//     imageFieldName: "logoImage",
//     destinationPath: "stores",
//     isRequiredOnCreate: false,
//   });

// const [uploadBackgroundImageUpdate, processBackgroundImageUpdate] =
//   createImageProcessingMiddleware({
//     entityName: "storeBackground",
//     imageFieldName: "backgroundImage",
//     destinationPath: "stores",
//     isRequiredOnCreate: false,
//   });

// const [uploadAdsImagesUpdate, processAdsImagesUpdate] =
//   createMultiImageProcessingMiddleware({
//     entityName: "storeAd",
//     imageFieldName: "adsImages",
//     destinationPath: "stores",
//     isRequiredOnCreate: false,
//   });

// const [uploadLogoImageCreate, processLogoImageCreate] =
//   createImageProcessingMiddleware({
//     entityName: "storeLogo",
//     imageFieldName: "logoImage",
//     destinationPath: "stores",
//     isRequiredOnCreate: true,
//   });

// const [uploadBackgroundImageCreate, processBackgroundImageCreate] =
//   createImageProcessingMiddleware({
//     entityName: "storeBackground",
//     imageFieldName: "backgroundImage",
//     destinationPath: "stores",
//     isRequiredOnCreate: true,
//   });

// const [uploadAdsImagesCreate, processAdsImagesCreate] =
//   createMultiImageProcessingMiddleware({
//     entityName: "storeAd",
//     imageFieldName: "adsImages",
//     destinationPath: "stores",
//     isRequiredOnCreate: true,
//   });
// const sharedStoreUpload = multer({
//   storage: multerStorage,
//   fileFilter: multerFilter,
// }).fields([
//   { name: "logoImage", maxCount: 1 },
//   // { name: "backgroundImage", maxCount: 1 },
//   // { name: "adsImages", maxCount: 10 },
// ]);

//new

const router = exp.Router({ mergeParams: true });

router.route("/signup").post(authControllers.signup("admin"));
router.route("/login").post(authControllers.login);

router.use(authControllers.protect);
router.use(authControllers.onlyPermission("admin"));

//product
const [uploadProductImages, resizeProductImages] =
  createImageProcessingMiddleware({
    entityName: "product",
    imageFieldName: "image",
    destinationPath: "products",
  });
const [uploadProductImagesUpdate, resizeProductImagesUpdate] =
  createImageProcessingMiddleware({
    entityName: "product",
    imageFieldName: "image",
    destinationPath: "products",
    isRequiredOnCreate: false,
  });

const processAdImage = createImageProcessingMiddleware({
  entityName: "ad",
  imageFieldName: "adPicture",
  destinationPath: "ads",
  resizeOptions: { width: 1920, height: 1080, fit: "contain" },
  isRequiredOnCreate: true,
});
const [uploadAdImageUpdate, processAdImageUpdate] =
  createImageProcessingMiddleware({
    entityName: "ad",
    imageFieldName: "adPicture",
    destinationPath: "ads",
    resizeOptions: { width: 1920, height: 1080, fit: "contain" },
    isRequiredOnCreate: false, // optional on PATCH
  });

router
  .route("/ads")
  .get(adsControllers.getAds)
  .post(
    processAdImage[0],
    parseJsonBody,
    processAdImage[1],
    adsControllers.createAd
  );

router
  .route("/ads/:adId")
  .delete(adsControllers.deleteAd)
  .get(adsControllers.getAd)

  .patch(uploadAdImageUpdate, processAdImageUpdate, adsControllers.updateAd);
//products
router.get("/products", productsControllers.listProducts);

router.get("/products/:kinguinId", productsControllers.getProduct);

// //categories
// router
//   .route("/categories")
//   .get(categoriesControllers.getCategories)
//   .post(categoriesControllers.createCategory);

// router
//   .route("/categories/getBaseCategoriesWithSubcategories")
//   .get(categoriesControllers.getBaseCategoriesWithSubcategories);

// router
//   .route("/categories/:categoryId")
//   .patch(categoriesControllers.updateCategory)
//   .delete(categoriesControllers.deleteCategory);

// //store
// const sharedStoreUploadCreate = multer({
//   storage: multerStorage,
//   fileFilter: multerFilter,
// }).fields([
//   { name: "logoImage", maxCount: 1 },
//   // { name: "backgroundImage", maxCount: 1 },
//   // { name: "adsImages", maxCount: 10 },
// ]);

// router.route("/store").get(storeController.getStores).post(
//   sharedStoreUploadCreate,
//   processLogoImageCreate,
//   // processBackgroundImageCreate,
//   // processAdsImagesCreate,
//   storeController.createStore
// );

// router
//   .route("/store/:storeId")
//   .get(storeController.getStore)
//   .patch(
//     sharedStoreUpload,
//     processLogoImageUpdate,
//     // processBackgroundImageUpdate,
//     // processAdsImagesUpdate,
//     storeController.updateStore
//   )
//   .delete(storeController.deleteStore);

// //tags
// router
//   .route("/tags")
//   .get(tagsController.getAllTags)
//   .post(tagsController.createTag);

// router
//   .route("/tags/:tagId")
//   .get(tagsController.getTag)
//   .patch(tagsController.updateTag)
//   .delete(tagsController.deleteTag);

// router
//   .route("/products/get-product-by-categories")
//   .get(productsControllers.findByCategories);

//orders
router
  .route("/orders")
  .get(ordersControllers.getOrders)
  .post(ordersControllers.createOrder);
router
  .route("/orders/:orderId")
  .get(ordersControllers.getOrder)
  .patch(ordersControllers.updateOrder)
  .delete(ordersControllers.deleteOrder);
//reviews
// router
//   .route("/reviews")
//   .get(reviewsControllers.getReviews)
//   .post(reviewsControllers.createReview);

// router
//   .route("/reviews/:reviewId")
//   .get(reviewsControllers.getReview)
//   .delete(reviewsControllers.deleteReview);

//home

// const homeController = require("../controllers/homeController");
// const {
//   multerStorage,
//   multerFilter,
// } = require("../utils/imageUploadMiddleware");

// const [uploadMainImageCreate, processMainImageCreate] =
//   createImageProcessingMiddleware({
//     entityName: "homeMain",
//     imageFieldName: "mainImage",
//     destinationPath: "home",
//     isRequiredOnCreate: true,
//   });

// const [uploadAboutImageCreate, processAboutImageCreate] =
//   createImageProcessingMiddleware({
//     entityName: "homeAbout",
//     imageFieldName: "aboutImage",
//     destinationPath: "home",
//     isRequiredOnCreate: true,
//   });

// const [uploadMainImageUpdate, processMainImageUpdate] =
//   createImageProcessingMiddleware({
//     entityName: "homeMain",
//     imageFieldName: "mainImage",
//     destinationPath: "home",
//     isRequiredOnCreate: false,
//   });

// const [uploadAboutImageUpdate, processAboutImageUpdate] =
//   createImageProcessingMiddleware({
//     entityName: "homeAbout",
//     imageFieldName: "aboutImage",
//     destinationPath: "home",
//     isRequiredOnCreate: false,
//   });
// const multer = require("multer");

// const sharedHomeUploadCreate = multer({
//   storage: multerStorage,
//   fileFilter: multerFilter,
// }).fields([
//   { name: "mainImage", maxCount: 1 },
//   { name: "aboutImage", maxCount: 1 },
// ]);

// const sharedHomeUploadUpdate = multer({
//   storage: multerStorage,
//   fileFilter: multerFilter,
// }).fields([
//   { name: "mainImage", maxCount: 1 },
//   { name: "aboutImage", maxCount: 1 },
// ]);

// router
//   .route("/home")
//   .get(homeController.getHomeSection)
//   .post(
//     sharedHomeUploadCreate,
//     processMainImageCreate,
//     processAboutImageCreate,
//     homeController.createHomeSection
//   )
//   .patch(
//     sharedHomeUploadUpdate,
//     processMainImageUpdate,
//     processAboutImageUpdate,
//     homeController.updateHomeSection
//   );

//states

router.route("/getTotalCustomers").get(statesController.getTotalCustomers);
router.route("/getTotalRevenue").get(statesController.getTotalRevenue);

module.exports = router;
