const { verifySession } = require("../utils/jwt");
const { httpError } = require("../utils/http-error");

function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return next(httpError(401, "Sessão não autenticada."));
  }

  try {
    req.user = verifySession(token);
    return next();
  } catch {
    return next(httpError(401, "Token inválido ou expirado."));
  }
}

module.exports = authMiddleware;
