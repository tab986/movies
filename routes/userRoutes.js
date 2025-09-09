const express = require("express");
const authControllers = require("../controllers/authControllers");
const userControllers = require("../controllers/userControllers");
const userProfile = require("../controllers/userProfileControllers");
const {
  createImageProcessingMiddleware,
} = require("../utils/imageUploadMiddleware");

const router = express.Router();
const [uploadProfileImage, processProfileImage] =
  createImageProcessingMiddleware({
    entityName: "userProfile",
    imageFieldName: "image",
    destinationPath: "users",
    isRequiredOnCreate: false,
  });

// Public auth routes
router.post("/signup", authControllers.signup()); // default role = "user"
router.post("/login", authControllers.login);
router.post("/send-otp", authControllers.sendOTP);
router.post("/password/request-otp", authControllers.requestPasswordResetOtp);
router.post("/password/update-with-otp", authControllers.updatePasswordWithOtp);

/* =========================
 * Protected routes (must be authenticated)
 * =======================*/
router.use(authControllers.protect);

// Change password using old password (authenticated)
router.post("/reset-password", authControllers.updatePasswordWithOld);
// router.get("/myProfile", getMyProfileDetails);

router.patch("/profile-data", userControllers.updateProfileData);
// Update user profile picture. Expects an image file with field name `image`.
router.patch(
  "/profile-image",
  uploadProfileImage,
  processProfileImage,
  userControllers.updateProfileImage
);
router.route("/deleteMyAccount").delete(userControllers.deleteUser);

router.get("/me/details", userProfile.getMyProfileDetails);
router.delete("/me", userProfile.deleteMe);

module.exports = router;
