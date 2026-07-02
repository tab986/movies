const express = require("express");
const movieController = require("../controllers/movieController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.get("/movies", asyncHandler(movieController.getAllMovies));
router.get("/movies/:id", asyncHandler(movieController.getMovieById));
router.get("/search", asyncHandler(movieController.searchMovies));

router.get("/my-list", authMiddleware, asyncHandler(movieController.getMyList));
router.post("/my-list", authMiddleware, asyncHandler(movieController.toggleMyList));
router.get(
  "/my-list/:movieId/status",
  authMiddleware,
  asyncHandler(movieController.myListStatus)
);

module.exports = router;
