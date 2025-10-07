const exp = require("express");
const productsControllers = require("../controllers/productControllers");
const authControllers = require("../controllers/authControllers");
const ordersControllers = require("../controllers/orderController");
const statesController = require("../controllers/statsController");
const adsControllers = require("../controllers/adsController");
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

//new

const router = exp.Router({ mergeParams: true });
router.route("/signup").post(authControllers.signup("admin"));
router.route("/login").post(authControllers.login("admin"));

router.use(authControllers.protect);
router.use(authControllers.onlyPermission("admin"));
router.route("/stats").get(statesController.getDashboardStats);

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

// router
//   .route("/ads")
//   .get(adsControllers.getAds)
//   .post(
//     processAdImage[0],
//     parseJsonBody,
//     processAdImage[1],
//     adsControllers.createAd
//   );

// router
//   .route("/ads/:adId")
//   .delete(adsControllers.deleteAd)
//   .get(adsControllers.getAd)

//   .patch(uploadAdImageUpdate, processAdImageUpdate, adsControllers.updateAd);
//products
router.get("/products", productsControllers.listProducts);

router.get("/products/:kinguinId", productsControllers.getProduct);
router.patch(
  "/products/:kinguinId/overrides",
  productsControllers.patchOverrides
);

//orders
router.route("/orders").get(ordersControllers.getOrders);
router
  .route("/orders/:orderId")
  .get(ordersControllers.getOrder)
  .patch(ordersControllers.updateOrder)
  .delete(ordersControllers.deleteOrder);

const userProfile = require("../controllers/userProfileControllers");

router.get("/user", userProfile.getUsers);
router.get("/user/:userId/details", userProfile.getMyProfileDetails);

router.delete("/user/:userId", userProfile.adminDeleteUser);

// router.route("/getTotalCustomers").get(statesController.getTotalCustomers);
// router.route("/getTotalRevenue").get(statesController.getTotalRevenue);

module.exports = router;
