const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.DATABASE_URL,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.PGPORT,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const fetchDataSome = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT name, qty, price FROM kinguin_products"
    );
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
};

module.exports = fetchDataSome;