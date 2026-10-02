/* Movement has three separate states: draft destination, accepted position,
 * and visual interpolation. A draft never enters the scene or reveals terrain. */
const MesaMovement = (() => {
  const motions = new Map();
  const planned = new Map();
  let frame = 0, scene = null, canvas = null, label = null;
  const sceneId = () => state.sceneId || "default";
  const different = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > 1e-6;
  function geometry() {
    const stage = getMesaDomRef("stage"), grid = getMesaGridState();
    const surface = getMesaMapSurfaceFrac();
    const width = stage.clientWidth, height = stage.clientHeight;
    const cell = Math.max(2, grid.cellFrac * surface.width * width);
    return { width, height, cell, grid,
      ox: surface.left * width + grid.offsetXFrac * cell,
      oy: surface.top * height + grid.offsetYFrac * cell };
  }
  function size(token, g) {
    return mesaVisionActive()
      ? { width: MesaVisionRules.radius(token) * 2 * g.width, height: MesaVisionRules.radius(token) * 2 * g.height / mesaVision.aspect }
      : { width: 88 * (token.tokenScale || 1), height: 88 * (token.tokenScale || 1) };
  }
  function destination(drag, requested) {
    const token = findToken(drag.tokenId), g = geometry();
    const candidate = { ...token, ...requested };
    // Resizing is not part of a move with vision enabled. Without vision,
    // retain the existing grid-size contract, using a disconnected size proxy.
    if (!mesaVisionActive()) mesaFitTokenToGrid(candidate, { offsetWidth: 88, offsetHeight: 88 });
    const s = size(candidate, g);
    if (g.grid.enabled) {
      candidate.x = (Math.round((candidate.x / 100 * g.width - g.ox) / g.cell) * g.cell + g.ox) / g.width * 100;
      candidate.y = (Math.round((candidate.y / 100 * g.height - g.oy) / g.cell) * g.cell + g.oy) / g.height * 100;
    }
    candidate.x = clamp(candidate.x, 0, Math.max(0, 100 - s.width / g.width * 100));
    candidate.y = clamp(candidate.y, 0, Math.max(0, 100 - s.height / g.height * 100));
    if (g.grid.enabled) {
      // Offset grids have ungridded margins. Keep a released footprint inside
      // complete cells instead of clamping it to a fractional border position.
      for (const [axis, extent, occupied, origin] of [["x", g.width, s.width, g.ox], ["y", g.height, s.height, g.oy]]) {
        const min = origin + Math.ceil(-origin / g.cell - 1e-7) * g.cell;
        const max = origin + Math.floor((extent - occupied - origin) / g.cell + 1e-7) * g.cell;
        if (max >= min) candidate[axis] = clamp(candidate[axis] / 100 * extent, min, max) / extent * 100;
      }
    }
    const path = [drag.origin, ...(drag.waypoints || [])];
    if (different(path.at(-1), candidate)) path.push(candidate);
    let safe = drag.origin;
    const accepted = [];
    for (const point of path.slice(1)) {
      safe = mesaVisionConstrain({ ...token, ...safe }, point.x, point.y);
      accepted.push({ x: safe.x, y: safe.y });
      if (different(safe, point)) break;
    }
    return { ...candidate, ...safe, path: accepted, blocked: different(safe, candidate) };
  }
  // Direct shortest route, including diagonals. Preview, distance and animation
  // share the same segment; collision still constrains it before confirmation.
  function route(a, b) {
    const points = [{ x: a.x, y: a.y }];
    if (different(a, b)) points.push({ x: b.x, y: b.y });
    return points;
  }
  function footprints(points, footprint, grid) {
    // Sample using the same integer footprint that will be drawn. Sampling
    // a fractional token size then rounding each stamp creates uneven gaps.
    if (grid) {
      const original = footprint;
      footprint = { width: Math.max(1, Math.round(original.width / grid.cell)) * grid.cell,
        height: Math.max(1, Math.round(original.height / grid.cell)) * grid.cell };
      points = points.map(p => ({
        x: grid.ox + Math.round((p.x - original.width / 2 - grid.ox) / grid.cell) * grid.cell + footprint.width / 2,
        y: grid.oy + Math.round((p.y - original.height / 2 - grid.oy) / grid.cell) * grid.cell + footprint.height / 2 }));
    }
    const result = [{ ...points[0], ...footprint }];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const stride = length / Math.max(Math.abs(dx) / footprint.width, Math.abs(dy) / footprint.height);
      if (length < 1e-6) continue;
      for (let d = Math.max(1, stride); d < length - 1e-6; d += Math.max(1, stride)) result.push({ x: a.x + dx * d / length, y: a.y + dy * d / length, ...footprint });
      result.push({ ...b, ...footprint });
    }
    if (!grid) return result;
    const width = Math.max(1, Math.round(footprint.width / grid.cell)) * grid.cell;
    const height = Math.max(1, Math.round(footprint.height / grid.cell)) * grid.cell;
    const snapped = new Map();
    for (const p of result) {
      const left = grid.ox + Math.round((p.x - footprint.width / 2 - grid.ox) / grid.cell) * grid.cell;
      const top = grid.oy + Math.round((p.y - footprint.height / 2 - grid.oy) / grid.cell) * grid.cell;
      snapped.set(`${left}:${top}`, { x: left + width / 2, y: top + height / 2, width, height });
    }
    return [...snapped.values()];
  }
  function ensureOverlay() {
    if (canvas) return;
    const inner = document.getElementById("mesaStageInner");
    canvas = document.createElement("canvas"); canvas.id = "mesaMovementCanvas";
    canvas.setAttribute("aria-hidden", "true"); canvas.hidden = true; inner.append(canvas);
    label = document.createElement("div"); label.id = "mesaMovementLabel";
    label.setAttribute("role", "status"); label.hidden = true; inner.append(label);
  }
  function clearPreview() { if (canvas) canvas.hidden = true; if (label) label.hidden = true; }
  // Traverse intervals where footprint edges cross grid lines. Includes every
  // occupied cell even when pointer events skip cells, not the route bounding box.
  function cellsBetween(a, b, g, footprint = { width: 0, height: 0 }) {
    const cuts = [0, 1], dx = b.x - a.x, dy = b.y - a.y;
    const hw = footprint.width / 2, hh = footprint.height / 2;
    for (const [v, d, offset] of [[a.x - hw, dx, g.ox], [a.x + hw, dx, g.ox], [a.y - hh, dy, g.oy], [a.y + hh, dy, g.oy]]) {
      if (Math.abs(d) < 1e-8) continue;
      const first = Math.floor((Math.min(v, v + d) - offset) / g.cell) + 1;
      const last = Math.floor((Math.max(v, v + d) - offset) / g.cell);
      for (let i = first; i <= last && i - first < 10000; i++) cuts.push((offset + i * g.cell - v) / d);
    }
    cuts.sort((x, y) => x - y);
    const cells = new Map();
    const add = t => {
      const x = a.x + dx * t - g.ox, y = a.y + dy * t - g.oy;
      // Half-open footprint: touching a grid edge does not occupy its neighbour.
      const left = Math.floor((x - hw) / g.cell + 1e-7), top = Math.floor((y - hh) / g.cell + 1e-7);
      const right = Math.max(left, Math.ceil((x + hw) / g.cell - 1e-7) - 1);
      const bottom = Math.max(top, Math.ceil((y + hh) / g.cell - 1e-7) - 1);
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        cells.set(`${col}:${row}`, { x: g.ox + col * g.cell, y: g.oy + row * g.cell });
      }
    };
    add(0); add(1);
    for (let i = 1; i < cuts.length; i++) if (cuts[i] - cuts[i - 1] > 1e-9) add((cuts[i] + cuts[i - 1]) / 2);
    return [...cells.values()];
  }
  function preview(drag, requested) {
    if (!findToken(drag.tokenId) || drag.sceneId !== sceneId()) { cancelTokenDrag(); return; }
    drag.requested = requested; drag.destination = destination(drag, requested);
    draw(drag);
  }
  function draw(drag, pending = false) {
    ensureOverlay();
    const g = geometry(), next = drag.destination, s = size(next, g);
    const a = { x: drag.origin.x / 100 * g.width + s.width / 2, y: drag.origin.y / 100 * g.height + s.height / 2 };
    const b = { x: next.x / 100 * g.width + s.width / 2, y: next.y / 100 * g.height + s.height / 2 };
    if (!next.path.length && !next.blocked && !pending) { clearPreview(); return; }
    const zoom = getStageZoom(), density = (devicePixelRatio || 1) * zoom;
    // Crop to the visible playfield: zoom must increase pixel density, not
    // allocate an enormous bitmap for the invisible portion of the map.
    const bounds = document.getElementById("mesaStageInner").getBoundingClientRect();
    const viewport = document.getElementById("mesaStageWrap").getBoundingClientRect();
    const left = clamp((Math.max(0, viewport.left) - bounds.left) / zoom, 0, g.width);
    const top = clamp((Math.max(0, viewport.top) - bounds.top) / zoom, 0, g.height);
    const visibleWidth = Math.max(1 / density, clamp((Math.min(innerWidth, viewport.right) - bounds.left) / zoom, left, g.width) - left);
    const visibleHeight = Math.max(1 / density, clamp((Math.min(innerHeight, viewport.bottom) - bounds.top) / zoom, top, g.height) - top);
    canvas.style.left = `${left}px`; canvas.style.top = `${top}px`;
    canvas.style.width = `${visibleWidth}px`; canvas.style.height = `${visibleHeight}px`;
    const width = Math.max(1, Math.ceil(visibleWidth * density)), height = Math.max(1, Math.ceil(visibleHeight * density));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.setTransform(width / visibleWidth, 0, 0, height / visibleHeight, -left * width / visibleWidth, -top * height / visibleHeight);
    const color = next.blocked ? "#ef777f" : "#e2ba69";
    ctx.fillStyle = next.blocked ? "rgba(239,119,127,.48)" : "rgba(226,186,105,.48)";
    const points = [drag.origin, ...next.path].map(p => ({ x: p.x / 100 * g.width + s.width / 2, y: p.y / 100 * g.height + s.height / 2 }));
    const blocks = g.grid.enabled ? footprints(points, s, g) : [];
    // One fill operation prevents overlapping footprints from darkening the trail.
    ctx.beginPath();
    for (const block of blocks) ctx.rect(block.x - block.width / 2, block.y - block.height / 2, block.width, block.height);
    ctx.fill();
    if (g.grid.enabled) {
      const occupied = new Set();
      for (const block of blocks) {
        const col = Math.round((block.x - block.width / 2 - g.ox) / g.cell);
        const row = Math.round((block.y - block.height / 2 - g.oy) / g.cell);
        for (let y = 0; y < Math.round(block.height / g.cell); y++)
          for (let x = 0; x < Math.round(block.width / g.cell); x++) occupied.add(`${col + x}:${row + y}`);
      }
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([]);
      for (const key of occupied) {
        const [col, row] = key.split(":").map(Number), x = g.ox + col * g.cell, y = g.oy + row * g.cell;
        for (const [dx, dy, ax, ay, bx, by] of [[0,-1,x,y,x+g.cell,y],[1,0,x+g.cell,y,x+g.cell,y+g.cell],[0,1,x,y+g.cell,x+g.cell,y+g.cell],[-1,0,x,y,x,y+g.cell]]) {
          if (!occupied.has(`${col + dx}:${row + dy}`)) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
        }
      }
      ctx.stroke();
    }
    canvas.dataset.cells = String(blocks.length);
    canvas.dataset.blocks = String(blocks.length);
    canvas.dataset.mode = g.grid.enabled ? "grid" : "free";
    ctx.strokeStyle = color; ctx.lineWidth = 2 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]);
    if (!g.grid.enabled) {
      ctx.beginPath();
      points.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x, p.y));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    canvas.dataset.waypoints = String(drag.waypoints?.length || 0);
    for (const p of drag.waypoints || []) {
      ctx.beginPath(); ctx.arc(p.x / 100 * g.width + s.width / 2, p.y / 100 * g.height + s.height / 2, 3 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#141012"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5 / zoom; ctx.stroke();
    }
    const measure = points.slice(1).reduce((sum, p, i) => {
      const part = measureMesaRuler(points[i].x / g.width, points[i].y / g.height, p.x / g.width, p.y / g.height);
      return { cells: sum.cells + part.cells, meters: sum.meters + part.meters };
    }, { cells: 0, meters: 0 });
    label.textContent = _formatRulerDistance(measure.meters);
    label.setAttribute("aria-busy", String(pending));
    label.dataset.blocked = String(next.blocked);
    label.style.setProperty("--movement-zoom", String(zoom));
    label.style.left = `${clamp(b.x, Math.min(30 / zoom, g.width / 2), Math.max(g.width / 2, g.width - 30 / zoom))}px`;
    label.style.top = `${clamp(b.y + s.height / 2 + 8 / zoom, 4, g.height - 44 / zoom)}px`;
    canvas.hidden = false; label.hidden = false;
  }
  function visual(token) {
    if (!token) return token;
    const motion = motions.get(token.id);
    if (!motion || motion.sceneId !== sceneId() || different(token, motion.to)) return token;
    const t = clamp((performance.now() - motion.started) / motion.duration, 0, 1);
    let remaining = motion.distance * t;
    for (let i = 1; i < motion.points.length; i++) {
      const a = motion.points[i - 1], b = motion.points[i], length = motion.lengths[i - 1];
      if (remaining <= length || i === motion.points.length - 1) {
        const fraction = length ? clamp(remaining / length, 0, 1) : 1;
        return { ...token, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      }
      remaining -= length;
    }
    return token;
  }
  function isAnimating(token) { return token ? motions.has(token.id) : motions.size > 0; }
  function tick() {
    frame = 0;
    for (const [id, motion] of motions) {
      const token = findToken(id);
      if (!token || motion.sceneId !== sceneId() || different(token, motion.to) || performance.now() - motion.started >= motion.duration) motions.delete(id);
    }
    renderStage();
    if (typeof _refreshSelectionBox === "function") _refreshSelectionBox();
    if (mesaVisionActive()) { renderSummary(); renderInitiative(); }
    if (motions.size) frame = requestAnimationFrame(tick);
  }
  function animate(from, to, path, duration) {
    if (!from || !to || !Number.isFinite(to.x) || !Number.isFinite(to.y) || (!different(from, to) && !path?.length)) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { motions.delete(to.id); return; }
    const g = geometry(), points = path?.length ? [{ x: from.x, y: from.y }, ...path] : route(from, to);
    const lengths = points.slice(1).map((p, i) => Math.hypot((p.x - points[i].x) / 100 * g.width, (p.y - points[i].y) / 100 * g.height));
    const distance = lengths.reduce((sum, n) => sum + n, 0);
    motions.set(to.id, { points, lengths, distance, to: { x: to.x, y: to.y }, sceneId: sceneId(), started: performance.now(), duration: duration ?? MesaMovementRules.duration(from, points.slice(1), g.height / g.width) });
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function beforeSnapshot(saved, movement) {
    const id = sceneId(), sameScene = scene === id; scene = id;
    if (!sameScene) { motions.clear(); planned.clear(); cancelTokenDrag(); clearPreview(); return; }
    const dragged = state.drag && saved?.tokens?.find(t => t.id === state.drag.tokenId);
    if (state.drag && (!dragged || different(dragged, state.drag.origin) || !!saved?.vision?.enabled !== state.drag.vision)) cancelTokenDrag();
    if (!state.bootCompleted) return;
    for (const next of saved?.tokens || []) {
      const previous = findToken(next.id);
      const plan = planned.get(next.id);
      if (previous && (different(previous, next) || plan)) {
        const matches = plan && !different(plan.origin, previous) && !different(plan.path.at(-1), next);
        const shared = MesaMovementRules.normalize(movement, { tokenId: next.id, from: previous, to: next, version: saved.sceneVersion });
        animate(visual(previous), next, shared?.path || (matches ? plan.path : undefined), shared?.duration);
        planned.delete(next.id);
      }
    }
  }
  async function commit(drag) {
    const token = findToken(drag.tokenId);
    clearPreview();
    if (!token || drag.sceneId !== sceneId() || !canMoveTokens(token) || different(token, drag.origin) || drag.vision !== mesaVisionActive()) return;
    const next = destination(drag, drag.requested || drag.origin);
    if (!next.path.length) return;
    if (drag.vision) {
      drag.destination = next; draw(drag, true);
      planned.set(token.id, { origin: drag.origin, path: next.path });
      try { await mesaVisionAction({ kind: "move", tokenId: token.id, path: next.path }); }
      finally { planned.delete(token.id); }
      if (drag.sceneId === sceneId() && !state.drag) clearPreview();
    } else {
      const origin = { x: token.x, y: token.y };
      Object.assign(token, { x: next.x, y: next.y, tokenScale: next.tokenScale, order: getNextOrder() });
      bumpMesaSceneVersion();
      const movement = MesaMovementRules.create(token.id, origin, next.path, state.sceneVersion, geometry().height / geometry().width);
      animate(origin, token, movement?.path, movement?.duration);
      broadcastMesaTokenMove(token, movement); persistState({ immediate: true });
    }
    scheduleMesaRender({ stage: true, inspector: true });
  }
  function init() {
    scene = sceneId();
    new ResizeObserver(refreshPreview).observe(document.getElementById("mesaStage"));
    window.addEventListener("blur", cancelTokenDrag);
    window.addEventListener("keydown", e => {
      if (!state.drag || e.target.closest?.("input,textarea,select,[contenteditable='true']")) return;
      if (e.key === "Escape") { e.preventDefault(); cancelTokenDrag(); }
      if (e.key === "Backspace") {
        e.preventDefault(); e.stopImmediatePropagation(); flushPendingDragPosition();
        if (state.drag?.waypoints?.length) { state.drag.waypoints.pop(); preview(state.drag, state.drag.requested || state.drag.origin); }
      }
    }, true);
    document.getElementById("mesaStageWrap").addEventListener("contextmenu", e => {
      if (!state.drag) return;
      e.preventDefault(); e.stopImmediatePropagation();
      flushPendingDragPosition();
      const drag = state.drag, next = drag?.destination;
      if (!next || next.blocked) return;
      const last = drag.waypoints?.at(-1) || drag.origin;
      if (!different(last, next)) return;
      if ((drag.waypoints?.length || 0) >= 255) { mesaVisionNotice("Limite de pontos do percurso atingido."); return; }
      (drag.waypoints ||= []).push({ x: next.x, y: next.y });
      draw(drag);
    }, true);
  }
  function refreshPreview() { if (state.drag?.destination) draw(state.drag); }
  return { preview, commit, clearPreview, refreshPreview, visual, animate, beforeSnapshot, isAnimating, cellsBetween, route, footprints, init };
})();
