const express = require("express");
const movieController = require("../controllers/movieController");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/movies", asyncHandler(movieController.getAllMovies));
router.get("/movies/:id", asyncHandler(movieController.getMovieById));
router.get("/search", asyncHandler(movieController.searchMovies));

module.exports = router;
