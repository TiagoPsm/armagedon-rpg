const express = require("express");
const asyncHandler = require("../utils/async-handler");
const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/require-role");
const { httpError } = require("../utils/http-error");
const { withTransaction } = require("../db");
const { createRule, deleteRule, listRules, updateRule } = require("../services/rules");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await withTransaction(client => listRules(client));
    res.json(rules);
  })
);

router.post(
  "/",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const tag = String(req.body?.tag || "").trim();

    if (!title || !content) {
      throw httpError(400, "Titulo e conteudo sao obrigatorios.");
    }

    const rule = await withTransaction(client =>
      createRule(client, req.user.sub, { title, tag, content })
    );

    req.app.get("io")?.emit("rules:changed", { action: "created", id: rule.id });
    res.status(201).json(rule);
  })
);

router.put(
  "/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const tag = String(req.body?.tag || "").trim();

    if (!title || !content) {
      throw httpError(400, "Titulo e conteudo sao obrigatorios.");
    }

    const rule = await withTransaction(client =>
      updateRule(client, req.params.id, req.user.sub, { title, tag, content })
    );

    if (!rule) throw httpError(404, "Postagem nao encontrada.");

    req.app.get("io")?.emit("rules:changed", { action: "updated", id: rule.id });
    res.json(rule);
  })
);

router.delete(
  "/:id",
  requireRole("master"),
  asyncHandler(async (req, res) => {
    const removed = await withTransaction(client => deleteRule(client, req.params.id));
    if (!removed) throw httpError(404, "Postagem nao encontrada.");

    req.app.get("io")?.emit("rules:changed", { action: "deleted", id: req.params.id });
    res.json({ ok: true, id: req.params.id });
  })
);

module.exports = router;
