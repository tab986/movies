const fs = require("fs");
const path = require("path");
const { sequelize, Sequelize } = require("./db");

const db = {};
const basename = path.basename(__filename);

fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 &&
      file !== basename &&
      file !== "db.js" &&
      file.slice(-3) === ".js"
    );
  })
  .forEach((file) => {
    if (file !== "initDatabase.js") {
      const defineModel = require(path.join(__dirname, file));
      if (typeof defineModel !== "function") return;

      const model = defineModel(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    }
  });

Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === "function") {
    db[modelName].associate(db);
  }
});

// Compatibility aliases for legacy import names used in controllers/workers.
if (db.Order) db.Orders = db.Order;
if (db.Users) db.userModel = db.Users;

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
