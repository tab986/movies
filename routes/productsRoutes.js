const exp = require("express");
// Use the local catalog controller instead of proxying the Kinguin API.
const productsControllers = require("../controllers/productControllers");
const adsControllers = require("../controllers/adsController");
const requireDbReady = require("../utils/requireDbReady");

const router = exp.Router({ mergeParams: true });

router
  .route("/")
  .get(requireDbReady({ dependency: "products catalog" }), productsControllers.listProducts);
// Temporary backward-compatibility alias for legacy frontend requests.
router
  .route("/search")
  .get(requireDbReady({ dependency: "products catalog" }), productsControllers.listProducts);
router
  .route("/suggest")
  .get(requireDbReady({ dependency: "products catalog" }), productsControllers.suggestProducts);

router.route("/ads").get(adsControllers.getAds);
router.route("/ads/:id").get(adsControllers.getAd);
router.get(
  "/:kinguinId(\\d+)",
  requireDbReady({ dependency: "product details catalog" }),
  productsControllers.getProduct
);

// Override name/description/images for a product
// router.patch("/:kinguinId/overrides", productsControllers.patchOverrides);
module.exports = router;
