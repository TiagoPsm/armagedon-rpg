const crypto = require("crypto");
const config = require("../config");

function hashPassword(password) {
  const normalized = String(password || "");
  if (!normalized) {
    throw new Error("Senha obrigatoria.");
  }

  const salt = crypto.randomBytes(config.passwordSaltBytes).toString("hex");
  const derived = crypto
    .scryptSync(normalized, salt, config.passwordKeyLength, {
      N: config.passwordScryptCost
    })
    .toString("hex");

  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const normalized = String(password || "");
  const [salt, expected] = String(storedHash || "").split(":");

  if (!normalized || !salt || !expected) return false;

  const candidate = crypto
    .scryptSync(normalized, salt, Buffer.from(expected, "hex").length, {
      N: config.passwordScryptCost
    })
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
}

module.exports = {
  hashPassword,
  verifyPassword
};
