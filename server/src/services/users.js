const { query } = require("../db");
const config = require("../config");
const { hashPassword } = require("../utils/password");

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

async function getUserByUsername(client, username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const executor = client || { query };
  const result = await executor.query(
    `
      select id, username, password_hash, role, is_active, created_at, updated_at
      from users
      where lower(username) = lower($1)
      limit 1
    `,
    [normalized]
  );

  return result.rows[0] || null;
}

async function ensureMasterUser() {
  const username = normalizeUsername(config.masterBootstrapUsername);
  if (!username || !config.masterBootstrapPassword) return null;

  const existing = await getUserByUsername(null, username);
  if (existing) return existing;

  const passwordHash = hashPassword(config.masterBootstrapPassword);
  const inserted = await query(
    `
      insert into users (username, password_hash, role, is_active)
      values ($1, $2, 'master', true)
      returning id, username, password_hash, role, is_active, created_at, updated_at
    `,
    [username, passwordHash]
  );

  return inserted.rows[0];
}

module.exports = {
  ensureMasterUser,
  getUserByUsername,
  normalizeUsername
};
