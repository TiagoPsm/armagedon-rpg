const { httpError } = require("../utils/http-error");

function requireRole(role) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user || req.user.role !== role) {
      return next(httpError(403, "Voce nao tem permissao para esta acao."));
    }

    return next();
  };
}

module.exports = requireRole;
