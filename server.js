process.on("uncaughtException", (err) => {
  console.log(err.name, err.message, err.stack);
  console.log("UNCAUGHT Exception !!!!!!!!!!!  Terminateing The Server");
  process.exit(1);
});

const dot = require("dotenv");
dot.config();
dot.config({ path: "./config.env", override: false });

const app = require("./app");
const { sequelize } = require("./post-models");
const initDatabaseTables = require("./post-models/initDatabase");

let server;

async function startServer() {
  await sequelize.authenticate();
  console.log("Postgres connected");
  await initDatabaseTables();

  const port = process.env.PORT || 3000;
  server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  // Start internal scheduler for full import (if enabled)
  if (process.env.ENABLE_INTERNAL_SCHEDULER !== "false") {
    require("./worker/scheduler");
    console.log("[server] Internal full import scheduler enabled");
  }

  // Keep long-running import requests alive on the Node side
  server.requestTimeout = 0; // disable (Node v18+)
  server.headersTimeout = 0; // disable (Node v18+)
  server.keepAliveTimeout = 0; // optional: let the import hold the socket
}

startServer().catch((err) => {
  console.log(err.name, err.message);
  process.exit(1);
});

// {
//   useCreateIndex: true,
//   autoIndex: true
// }

process.on("unhandledRejection", (err) => {
  console.log(err.name, err.message);
  console.log("UNHANDLED REJECTION !!!!!!!!!!!  Terminateing The Server");

  if (server) {
    server.close((_) => {
      process.exit(1);
    });
    return;
  }
  process.exit(1);
});
