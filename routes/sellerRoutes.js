// // routes/sellerRoutes.js
// //
// // Router exposing endpoints for merchant (seller) operations. Sellers
// // authenticate with their own credentials and can manage their physical
// // products and fulfil orders. Admins can also access these routes when
// // impersonating a seller (because authControllers.onlyPermission includes
// // both roles).

// const exp = require("express");
// const authControllers = require("./authControllers");
// const physicalProductsController = require("./physicalProductsController");
// const physicalOrdersController = require("./physicalOrdersController");

// const router = exp.Router({ mergeParams: true });

// // Seller sign up/login. These routes do not require prior authentication.
// router.post("/signup", authControllers.signup("seller"));
// router.post("/login", authControllers.login("seller"));

// // Protect all following routes. Sellers and admins are permitted.
// router.use(authControllers.protect);
// router.use(authControllers.onlyPermission("seller", "admin"));

// // Physical product management
// router
//   .route("/products")
//   .post(physicalProductsController.createPhysicalProduct)
//   .get(physicalProductsController.getSellerProducts);

// router
//   .route("/products/:id")
//   .get(physicalProductsController.getPhysicalProductSeller)
//   .patch(physicalProductsController.updatePhysicalProductSeller)
//   .delete(physicalProductsController.deletePhysicalProductSeller);

// // Orders management for sellers
// router
//   .route("/orders")
//   .get(physicalOrdersController.getSellerOrders);

// router
//   .route("/orders/:id")
//   .get(physicalOrdersController.getSellerOrder)
//   .patch(physicalOrdersController.updateSellerOrder);

// module.exports = router;
