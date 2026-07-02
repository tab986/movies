const express = require("express");
const movieController = require("../controllers/movieController");
const { asyncHandler } = require("../middleware/asyncHandler");
const { clientIdMiddleware } = require("../middleware/clientId");

const router = express.Router();

router.get("/movies", asyncHandler(movieController.getAllMovies));
router.get("/movies/:id", asyncHandler(movieController.getMovieById));
router.get("/search", asyncHandler(movieController.searchMovies));

router.get("/my-list", clientIdMiddleware, asyncHandler(movieController.getMyList));
router.post("/my-list", clientIdMiddleware, asyncHandler(movieController.toggleMyList));
router.get(
  "/my-list/:movieId/status",
  clientIdMiddleware,
  asyncHandler(movieController.myListStatus)
);

module.exports = router;
