const jwt = require("jsonwebtoken");
const config = require("../config");

function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn
    }
  );
}

function verifySession(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = {
  signSession,
  verifySession
};
