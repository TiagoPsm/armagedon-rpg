const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/require-role");
const { httpError } = require("../utils/http-error");
const { withTransaction } = require("../db");
const {
  createSuggestion,
  deleteSuggestion,
  listSuggestions,
  updateSuggestion
} = require("../services/suggestions");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const suggestions = await withTransaction(client => listSuggestions(client));
    res.json(suggestions);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const category = String(req.body?.category || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!title || !description) {
      throw httpError(400, "Titulo e descricao sao obrigatorios.");
    }

    const suggestion = await withTransaction(client =>
      createSuggestion(client, req.user.sub, req.user.username, { title, category, description })
    );

    req.app.get("io")?.emit("suggestions:changed", { action: "created", id: suggestion.id });
    res.status(201).json(suggestion);
  })
);

router.put(
  "/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const category = String(req.body?.category || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!title || !description) {
      throw httpError(400, "Titulo e descricao sao obrigatorios.");
    }

    const suggestion = await withTransaction(client =>
      updateSuggestion(client, req.params.id, req.user.sub, req.user.username, { title, category, description })
    );

    if (!suggestion) throw httpError(404, "Sugestao nao encontrada.");

    req.app.get("io")?.emit("suggestions:changed", { action: "updated", id: suggestion.id });
    res.json(suggestion);
  })
);

router.delete(
  "/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const removed = await withTransaction(client => deleteSuggestion(client, req.params.id));
    if (!removed) throw httpError(404, "Sugestao nao encontrada.");

    req.app.get("io")?.emit("suggestions:changed", { action: "deleted", id: req.params.id });
    res.json({ ok: true, id: req.params.id });
  })
);

module.exports = router;
