const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const { httpError } = require("../utils/http-error");
const { withTransaction } = require("../db");
const {
  assertCharacterAccess,
  awardSoulExperienceToCharacter,
  completeSoulNightmareForCharacter,
  getCharacterBundleByKey,
  getCharacterByKey,
  saveCharacterBundle
} = require("../services/characters");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const character = await withTransaction(async client => {
      const row = await getCharacterByKey(client, req.params.key);
      if (!row) throw httpError(404, "Ficha nao encontrada.");
      assertCharacterAccess(req.user, row, "read");
      return getCharacterBundleByKey(client, req.params.key);
    });

    res.json(character);
  })
);

router.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const saved = await withTransaction(async client => {
      const row = await getCharacterByKey(client, req.params.key, { forUpdate: true });
      if (!row) throw httpError(404, "Ficha nao encontrada.");
      assertCharacterAccess(req.user, row, "write");
      return saveCharacterBundle(client, row, req.body, req.user);
    });

    req.app.get("io")?.emit("sheet:changed", { key: saved.key, kind: saved.kind });
    res.json(saved);
  })
);

router.post(
  "/:key/soul-essence",
  asyncHandler(async (req, res) => {
    const saved = await withTransaction(async client => {
      return awardSoulExperienceToCharacter(client, req.user, req.params.key, req.body || {});
    });

    req.app.get("io")?.emit("sheet:changed", {
      key: saved.character.key,
      kind: saved.character.kind
    });
    res.json(saved);
  })
);

router.post(
  "/:key/soul-nightmare",
  asyncHandler(async (req, res) => {
    const saved = await withTransaction(async client => {
      return completeSoulNightmareForCharacter(client, req.user, req.params.key);
    });

    req.app.get("io")?.emit("sheet:changed", {
      key: saved.character.key,
      kind: saved.character.kind
    });
    res.json(saved);
  })
);

module.exports = router;
