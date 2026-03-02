const router = require("express").Router();
const app = express();
const fetchDataSome = require("../controllers/dataFetchSome");
app.get("/liveS", (req , res) =>{ res = fetchDataSome()});


module.exports = router;