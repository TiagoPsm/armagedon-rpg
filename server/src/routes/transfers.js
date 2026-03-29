const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const { httpError } = require("../utils/http-error");
const { withTransaction } = require("../db");
const {
  awardMonsterMemoryDrop,
  transferItemBetweenPlayers,
  transferMemoryBetweenPlayers,
  rollMonsterMemoryDrop
} = require("../services/characters");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/items/player-to-player",
  asyncHandler(async (req, res) => {
    const sourceKey = String(req.body?.sourceKey || "").trim().toLowerCase();
    const targetKey = String(req.body?.targetKey || "").trim().toLowerCase();
    const itemIndex = req.body?.itemIndex;

    if (!sourceKey || !targetKey) {
      throw httpError(400, "Origem e destino sao obrigatorios.");
    }

    const result = await withTransaction(client =>
      transferItemBetweenPlayers(client, req.user, sourceKey, targetKey, itemIndex)
    );

    req.app.get("io")?.emit("inventory:changed", {
      sourceKey: result.sourceKey,
      targetKey: result.targetKey
    });
    req.app.get("io")?.emit("sheet:changed", { key: result.sourceKey, kind: "player" });
    req.app.get("io")?.emit("sheet:changed", { key: result.targetKey, kind: "player" });

    res.json(result);
  })
);

router.post(
  "/memories/player-to-player",
  asyncHandler(async (req, res) => {
    const sourceKey = String(req.body?.sourceKey || "").trim().toLowerCase();
    const targetKey = String(req.body?.targetKey || "").trim().toLowerCase();
    const memoryIndex = req.body?.memoryIndex;

    if (!sourceKey || !targetKey) {
      throw httpError(400, "Origem e destino sao obrigatorios.");
    }

    const result = await withTransaction(client =>
      transferMemoryBetweenPlayers(client, req.user, sourceKey, targetKey, memoryIndex)
    );

    req.app.get("io")?.emit("memory:changed", {
      sourceKey: result.sourceKey,
      targetKey: result.targetKey
    });
    req.app.get("io")?.emit("sheet:changed", { key: result.sourceKey, kind: "player" });
    req.app.get("io")?.emit("sheet:changed", { key: result.targetKey, kind: "player" });

    res.json(result);
  })
);

router.post(
  "/memories/monster-roll",
  asyncHandler(async (req, res) => {
    const monsterKey = String(req.body?.monsterKey || "").trim().toLowerCase();
    const dropIndex = req.body?.dropIndex;

    if (!monsterKey) {
      throw httpError(400, "Monstro obrigatorio.");
    }

    const result = await withTransaction(client =>
      rollMonsterMemoryDrop(client, req.user, monsterKey, dropIndex)
    );

    res.json(result);
  })
);

router.post(
  "/memories/monster-award",
  asyncHandler(async (req, res) => {
    const monsterKey = String(req.body?.monsterKey || "").trim().toLowerCase();
    const targetKey = String(req.body?.targetKey || "").trim().toLowerCase();
    const dropIndex = req.body?.dropIndex;

    if (!monsterKey || !targetKey) {
      throw httpError(400, "Monstro e destino sao obrigatorios.");
    }

    const result = await withTransaction(client =>
      awardMonsterMemoryDrop(client, req.user, monsterKey, dropIndex, targetKey)
    );

    req.app.get("io")?.emit("memory:changed", {
      sourceKey: result.monsterKey,
      targetKey: result.targetKey
    });
    req.app.get("io")?.emit("sheet:changed", { key: result.targetKey, kind: "player-or-npc" });

    res.json(result);
  })
);

module.exports = router;
