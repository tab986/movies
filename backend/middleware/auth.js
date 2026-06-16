const jwt = require("jsonwebtoken");

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

function authMiddleware(req, res, next) {
  if (!SUPABASE_JWT_SECRET) {
    return res.status(500).json({ error: "Server missing SUPABASE_JWT_SECRET." });
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    const meta = payload.user_metadata || {};
    const username =
      typeof meta.username === "string" && meta.username.trim()
        ? meta.username.trim()
        : String(payload.email || "user")
            .split("@")[0] || "user";
    req.user = {
      id: payload.sub,
      email: payload.email,
      username,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = { authMiddleware, SUPABASE_JWT_SECRET };
