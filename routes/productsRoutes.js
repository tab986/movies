const exp = require("express");
const productsControllers = require("../controllers/productControllers");
const reviewsControllers = require("../controllers/reviewsControllers");
const categoriesControllers = require("../controllers/categoriesControllers");
const adsControllers = require("../controllers/adsController");
const homeController = require("../controllers/homeController");
const storeController = require("../controllers/storeController");

router = exp.Router({ mergeParams: true });

router.route("/").get(productsControllers.listProducts);
// router.route("/store").get(storeController.getStores);
// router.route("/store/:storeId").get(storeController.getStore);
// router.route("/review").post(reviewsControllers.createReview);
//ads
// router.route("/ads").get(adsControllers.getAds);
// router.route("/home").get(homeController.getHomeSection);
// router.route("/categories").get(categoriesControllers.getCategories);
// router
//   .route("/getBaseCategoriesWithSubcategories")
//   .get(categoriesControllers.getBaseCategoriesWithSubcategories);

// router.route("/find-by-categories").post(productsControllers.findByCategories);

router.get("/:kinguinId", productsControllers.getProduct);
module.exports = router;
