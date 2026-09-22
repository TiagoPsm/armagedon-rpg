/* Shared, pure contract. Authentication and atomic persistence belong to callers. */
(function (root) {
  "use strict";
  const G = root.MesaVisionGeometry;
  function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  function normalize(raw) {
    if (raw == null) return null;
    let value;
    try { value = G.normalizeVision(raw); } catch (e) { fail(e.message); }
    const aspect = raw.aspect ?? 1, revision = raw.revision ?? 0;
    if (!Number.isFinite(aspect) || aspect < .01 || aspect > 100) fail("Proporcao de mapa invalida.");
    if (!Number.isSafeInteger(revision) || revision < 0) fail("Revisao invalida.");
    return { ...value, aspect, revision };
  }
  function radius(token) { return Number(token.visionRadius) || .025 * (Number(token.tokenScale) || 1); }
  function center(token, vision) {
    return { x: Number(token.x) / 100 + radius(token), y: Number(token.y) / 100 * vision.aspect + radius(token) };
  }
  function own(token, actor) {
    return token?.type === "player" && token.layer !== "dm" && token.visibleToPlayers !== false &&
      String(token.ownerUsername || token.characterKey || token.id).trim().toLowerCase() === String(actor?.username || "").trim().toLowerCase();
  }
  function apply(scene, actor, action, locked = false) {
    const next = JSON.parse(JSON.stringify(scene)), vision = normalize(next.vision);
    if (!vision?.enabled) fail("Visao dinamica nao esta ativa.", 409);
    if (!action || !["move", "face", "door"].includes(action.kind)) fail("Acao invalida.");
    const token = next.tokens.find(t => t.id === action.tokenId);
    const master = actor?.role === "master";
    if (!token || (!master && !own(token, actor))) fail("Personagem nao autorizado.", 403);
    if (!master && locked) fail("O mestre travou o movimento.", 403);
    const geometry = G.prepare(vision, vision.aspect);
    if (action.kind === "face") {
      if (!Number.isFinite(action.facingDeg)) fail("Direcao invalida.");
      token.facingDeg = ((action.facingDeg % 360) + 360) % 360;
    } else if (action.kind === "move") {
      if (!Array.isArray(action.path) || !action.path.length || action.path.length > 256) fail("Percurso invalido.");
      for (const p of action.path) {
        if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || p.x < 0 || p.y < 0 || p.x > 100 || p.y > 100) fail("Posicao invalida.");
        const target = center({ ...token, x: p.x, y: p.y }, vision);
        const hit = geometry.sweep(center(token, vision), target, radius(token));
        if (Math.hypot(hit.x - target.x, hit.y - target.y) > 1e-7) fail("Uma parede bloqueia o percurso.", 409);
        token.x = p.x; token.y = p.y;
      }
    } else {
      const door = vision.walls.find(w => w.id === action.doorId && w.kind === "door");
      if (!door) fail("Porta inexistente.", 404);
      const origin = center(token, vision);
      const midpoint = { x: (door.ax + door.bx) / 2, y: (door.ay + door.by) / 2 * vision.aspect };
      const reach = (Number(scene.grid?.cellFrac) || .05) + radius(token);
      if (!master && (!geometry.canReachDoor(origin, door.id, reach) || !geometry.canSee(origin, midpoint, token.facingDeg || 0))) {
        fail("Aproxime-se e olhe para uma porta destrancada.", 403);
      }
      door.doorState = master && action.close === true ? "closed" : "open";
      if (door.doorState === "closed") {
        const doorOnly = G.prepare({ walls: [door] }, vision.aspect);
        if (next.tokens.some(t => doorOnly.sweep(center(t, vision), center(t, vision), radius(t)).blocked)) fail("Ha um token na porta.", 409);
      }
    }
    next.vision = vision;
    return next;
  }
  root.MesaVisionRules = Object.freeze({ normalize, center, radius, own, apply });
})(globalThis);
