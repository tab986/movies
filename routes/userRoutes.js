const exp = require("express");
// const authControllers = require("../controllers/authControllers");
// const userControllers = require("../controllers/userControllers");
// const favouritesControllers = require("../controllers/favouritesControllers");
// const storeFollowController = require("../controllers/storeFollowController");
// const { getMyOrders } = require("../controllers/orderControllers");

router = exp.Router();

// router.route("/auth").post(authControllers.signup());
// router.route("/login").post(authControllers.login);

// router.use(authControllers.protect);
// router.route("/updateMyAccount").patch(authControllers.updateUser);

// router.route("/favourites").get(favouritesControllers.getFavourites);

// router
//   .route("/favourites/:productId")
//   .post(favouritesControllers.createFavourite)
//   .delete(favouritesControllers.deleteFavourite);

// router.route("/myAccount").get(userControllers.userAccount);

// router.route("/follows").get(storeFollowController.getFollows);
// router.route("/myOrders").get(getMyOrders);

// router
//   .route("/follows/:storeId")
//   .post(storeFollowController.createFollow)
//   .delete(storeFollowController.deleteFollow);

// router.route("/deleteMyAccount").delete(userControllers.deleteUser);

module.exports = router;
