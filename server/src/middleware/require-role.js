const { httpError } = require("../utils/http-error");

function requireRole(role) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user || req.user.role !== role) {
      return next(httpError(403, "Você não tem permissão para esta ação."));
    }

    return next();
  };
}

module.exports = requireRole;
