const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, ensureSchema } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const MIN_PASSWORD_LENGTH = 8;

function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error("Server missing JWT_SECRET.");
  }
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function register(req, res) {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  if (!JWT_SECRET) {
    return res.status(500).json({ error: "Server missing JWT_SECRET." });
  }

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required." });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await ensureSchema();
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [randomUUID(), email, passwordHash]
    );
    const user = result.rows[0];
    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    if (err.code === "42P01") {
      console.error("[auth] users table missing after ensureSchema:", err.message);
      return res.status(503).json({ error: "Database is not ready. Try again in a moment." });
    }
    console.error("[auth] register failed:", err.code, err.message);
    return res.status(500).json({ error: "Could not create account." });
  }
}

async function login(req, res) {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  if (!JWT_SECRET) {
    return res.status(500).json({ error: "Server missing JWT_SECRET." });
  }

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed." });
  }
}

module.exports = { register, login };
