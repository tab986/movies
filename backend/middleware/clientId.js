function clientIdMiddleware(req, res, next) {
  const id = req.get("X-Client-Id")?.trim();
  if (!id || id.length > 128) {
    return res.status(400).json({ error: "X-Client-Id header is required." });
  }
  req.clientId = id;
  next();
}

module.exports = { clientIdMiddleware };
