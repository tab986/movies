const router = require("express").Router();
const fetchDataSome = require("../controllers/dataFetchSome");
app.get("/liveS", (req , res) =>{ res = fetchDataSome()});


module.exports = router;