const exp = require("express");
// Use the local catalog controller instead of proxying the Kinguin API.
const productsControllers = require("../controllers/productControllers");
const adsControllers = require("../controllers/adsController");

const router = exp.Router({ mergeParams: true });

router.route("/").get(productsControllers.listProducts);

router.route("/ads").get(adsControllers.getAds);
router.route("/ads/:id").get(adsControllers.getAd);
router.get("/:kinguinId", productsControllers.getProduct);

// Override name/description/images for a product
// router.patch("/:kinguinId/overrides", productsControllers.patchOverrides);
module.exports = router;
