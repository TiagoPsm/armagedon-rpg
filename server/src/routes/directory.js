const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/require-role");
const { httpError } = require("../utils/http-error");
const { hashPassword } = require("../utils/password");
const { withTransaction } = require("../db");
const {
  buildCharacterKey,
  createMonsterCharacter,
  createNpcCharacter,
  createPlayerCharacter,
  deleteCharacterByKey,
  deletePlayerByUsername,
  listDirectory
} = require("../services/characters");
const { getUserByUsername, normalizeUsername } = require("../services/users");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const directory = await withTransaction(client => listDirectory(client, req.user));
    res.json(directory);
  })
);

router.post(
  "/players",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const charName = String(req.body?.charname || req.body?.charName || "").trim() || username;

    if (!username || !password) {
      throw httpError(400, "Usuario e senha sao obrigatorios.");
    }

    const result = await withTransaction(async client => {
      const existingUser = await getUserByUsername(client, username);
      if (existingUser) {
        throw httpError(409, "Ja existe um jogador com esse usuario.");
      }

      const insertedUser = await client.query(
        `
          insert into users (username, password_hash, role, is_active)
          values ($1, $2, 'player', true)
          returning id, username, role
        `,
        [username, hashPassword(password)]
      );

      const player = await createPlayerCharacter(
        client,
        insertedUser.rows[0].id,
        username,
        charName,
        req.user.sub
      );

      return {
        user: insertedUser.rows[0],
        player
      };
    });

    req.app.get("io")?.emit("directory:changed", { scope: "players" });
    req.app.get("io")?.emit("sheet:changed", { key: result.player.key, kind: result.player.kind });

    res.status(201).json(result);
  })
);

router.delete(
  "/players/:username",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const removed = await withTransaction(client => deletePlayerByUsername(client, req.params.username));
    if (!removed) throw httpError(404, "Jogador nao encontrado.");

    req.app.get("io")?.emit("directory:changed", { scope: "players" });
    res.json({ ok: true, username: removed.username });
  })
);

router.post(
  "/npcs",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw httpError(400, "Informe o nome do NPC.");

    const npc = await withTransaction(client => createNpcCharacter(client, name, req.user.sub));

    req.app.get("io")?.emit("directory:changed", { scope: "npcs" });
    req.app.get("io")?.emit("sheet:changed", { key: npc.key, kind: npc.kind });

    res.status(201).json(npc);
  })
);

router.delete(
  "/npcs/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const deleted = await withTransaction(client =>
      deleteCharacterByKey(client, buildCharacterKey("npc", req.params.id), "npc")
    );
    if (!deleted) throw httpError(404, "NPC nao encontrado.");

    req.app.get("io")?.emit("directory:changed", { scope: "npcs" });
    res.json({ ok: true, key: deleted.sheet_key });
  })
);

router.post(
  "/monsters",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw httpError(400, "Informe o nome do monstro.");

    const monster = await withTransaction(client => createMonsterCharacter(client, name, req.user.sub));

    req.app.get("io")?.emit("directory:changed", { scope: "monsters" });
    req.app.get("io")?.emit("sheet:changed", { key: monster.key, kind: monster.kind });

    res.status(201).json(monster);
  })
);

router.delete(
  "/monsters/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const deleted = await withTransaction(client =>
      deleteCharacterByKey(client, buildCharacterKey("monster", req.params.id), "monster")
    );
    if (!deleted) throw httpError(404, "Monstro nao encontrado.");

    req.app.get("io")?.emit("directory:changed", { scope: "monsters" });
    res.json({ ok: true, key: deleted.sheet_key });
  })
);

module.exports = router;
