const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? fallback : numeric;
}

const config = {
  port: parseNumber(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  jwtSecret: process.env.JWT_SECRET || "armagedon-dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigins: String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
  masterBootstrapUsername: process.env.MASTER_BOOTSTRAP_USERNAME || "mestre",
  masterBootstrapPassword: process.env.MASTER_BOOTSTRAP_PASSWORD || "Mestre123",
  passwordSaltBytes: parseNumber(process.env.PASSWORD_SALT_BYTES, 16),
  passwordKeyLength: parseNumber(process.env.PASSWORD_KEYLEN, 64),
  passwordScryptCost: parseNumber(process.env.PASSWORD_SCRYPT_COST, 16384)
};

module.exports = config;
