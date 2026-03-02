const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB  ,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.PGPORT
});

const fetchDataSome = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
  remote->>'name'  AS name,
  remote->>'qty'   AS qty,
  remote->>'price' AS price
FROM kinguin_products`
    );
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
};

module.exports = fetchDataSome;