process.on("uncaughtException", (err) => {
  console.log(err.name, err.message, err.stack);
  console.log("UNCAUGHT Exception !!!!!!!!!!!  Terminateing The Server");
  process.exit(1);
});

const dot = require("dotenv");
dot.config({ path: "./config.env" });

const app = require("./app");
const mongoose = require("mongoose");

DB = process.env.MONGODB_URI;

mongoose.connect(DB).then((con) => {
  console.log("DB connected");
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log("running...");
});

// {
//   useCreateIndex: true,
//   autoIndex: true
// }

process.on("unhandledRejection", (err) => {
  console.log(err.name, err.message);
  console.log("UNHANDLED REJECTION !!!!!!!!!!!  Terminateing The Server");

  server.close((_) => {
    process.exit(1);
  });
});
