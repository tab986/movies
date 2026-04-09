const exp = require("express");
const articleController = require("../controllers/articleController");

const router = exp.Router({ mergeParams: true });

router.route("/").get(articleController.listPublished);
router.route("/:slug").get(articleController.getPublishedBySlug);

module.exports = router;
