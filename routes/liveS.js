const router = require("express").Router();
const fetchDataSome = require("../controllers/dataFetchSome");

router.get("/liveS", fetchDataSome);

module.exports = router;