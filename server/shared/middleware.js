const env = require("../config/env");

function cors(req, res, next) {
  const origin = req.get("Origin") || "";
  const allowedOrigin = getAllowedOrigin(origin);

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (allowedOrigin) res.set("Access-Control-Allow-Origin", allowedOrigin);

  if (req.method === "OPTIONS") {
    res.status(allowedOrigin ? 204 : 403).send("");
    return;
  }
  if (origin && !allowedOrigin) {
    res.status(403).json({ ok: false, error: "Origin is not allowed." });
    return;
  }
  next();
}

function jsonParserError(error, req, res, next) {
  if (error && error.type === "entity.parse.failed") {
    res.status(400).json({ ok: false, error: "Invalid JSON body." });
    return;
  }
  if (error && error.type === "entity.too.large") {
    res.status(400).json({ ok: false, error: "Request body is too large." });
    return;
  }
  next(error);
}

function getAllowedOrigin(origin) {
  if (!origin) return "";
  if (env.allowedOrigins.includes("*")) return origin;
  return env.allowedOrigins.includes(origin) ? origin : "";
}

module.exports = { cors, jsonParserError };
