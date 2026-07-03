require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schemaPath = path.join(__dirname, "..", "deploy", "schema.sql");

(async () => {
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("SCHEMA_APPLIED_OK");
})()
  .catch((err) => {
    console.error("FAIL:", err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
