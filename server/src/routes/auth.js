const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const { httpError } = require("../utils/http-error");
const { signSession } = require("../utils/jwt");
const { verifyPassword } = require("../utils/password");
const { getCharacterBundleByKey } = require("../services/characters");
const { getUserByUsername, normalizeUsername } = require("../services/users");
const { withTransaction } = require("../db");

const router = express.Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    if (!username || !password) {
      throw httpError(400, "Usuario e senha sao obrigatorios.");
    }

    const user = await getUserByUsername(null, username);

    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      throw httpError(401, "Usuario ou senha invalidos.");
    }

    const token = signSession(user);
    let defaultSheetKey = null;

    if (user.role === "player") {
      defaultSheetKey = username;
    }

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      defaultSheetKey
    });
  })
);

router.get(
  "/session",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payload = {
      user: {
        id: req.user.sub,
        username: req.user.username,
        role: req.user.role
      }
    };

    if (req.user.role === "player") {
      const sheet = await withTransaction(client => getCharacterBundleByKey(client, req.user.username));
      payload.defaultSheet = sheet;
    }

    res.json(payload);
  })
);

module.exports = router;
