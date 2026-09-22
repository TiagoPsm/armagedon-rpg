/* Mesa dynamic vision: local renderer/editor; validated actions through APP. */
let mesaVision = null;
let mesaVisionGeometry = null;
let mesaVisionMode = "off";
let mesaVisionStart = null;
let mesaVisionPoints = [];
let mesaVisionCursor = null;
let mesaVisionShape = "wall";
let mesaVisionPreview = false;
let mesaVisionBusy = false;
let mesaVisionFrame = 0;
let mesaVisionHistory = [];
let mesaVisionFuture = [];
let mesaVisionInitialized = false;
let mesaVisionSceneId = "";
let mesaVisionRecentIds = new Set();

function stopMesaVisionConstruction() {
  // Preserve clicked polygon edges, never invent a closing edge or commit the cursor preview.
  if (mesaVisionMode === "polygon" && mesaVisionPoints.length > 1) {
    const points = [...mesaVisionPoints];
    if (!mesaVisionEdit(v => points.slice(1).forEach((p, i) => v.walls.push(mesaVisionSegment(points[i], p))))) return;
  }
  closeMesaVisionEditor();
}
function mesaVisionHoveredWall(editor) {
  if (!mesaVisionCursor || !["erase", "lock"].includes(mesaVisionMode)) return null;
  const rect = editor.getBoundingClientRect();
  return (mesaVision?.walls || []).filter(w => mesaVisionMode !== "lock" || (w.kind === "door" && w.doorState !== "open"))
    .map(w => ({ wall: w, distance: mesaVisionProject(mesaVisionCursor, w, rect).distance }))
    .filter(hit => hit.distance < 10).sort((a, b) => a.distance - b.distance)[0]?.wall || null;
}

function mesaVisionActive() { return mesaVision?.enabled === true; }
function closeMesaVisionEditor() {
  mesaVisionMode = "off"; mesaVisionStart = null; mesaVisionPreview = false;
  mesaVisionPoints = []; mesaVisionCursor = null;
  requestMesaVisionRender();
}
function getMesaVisionPayload() { return mesaVision ? JSON.parse(JSON.stringify(mesaVision)) : null; }
function mesaVisionNotice(message) { window.UI?.toast?.(message, { kicker: "// Visão" }); }
function applyMesaVisionSnapshot(raw) {
  const nextSceneId = state.sceneId || "default";
  if (mesaVisionSceneId !== nextSceneId) {
    mesaVisionHistory = []; mesaVisionFuture = []; mesaVisionMode = "off"; mesaVisionPreview = false;
    mesaVisionPoints = []; mesaVisionStart = null; mesaVisionCursor = null;
    mesaVisionSceneId = nextSceneId;
    mesaVisionRecentIds.clear();
  }
  const previousShape = mesaVision ? JSON.stringify({ ...mesaVision, revision: 0 }) : "";
  try {
    mesaVision = MesaVisionRules.normalize(raw);
    mesaVisionGeometry = mesaVision ? MesaVisionGeometry.prepare(mesaVision, mesaVision.aspect) : null;
  } catch (error) {
    // Never reveal the map because a geometry payload was malformed.
    mesaVision = { enabled: true, walls: [], aspect: 1, coneDeg: 120, revision: 0 };
    mesaVisionGeometry = null;
    mesaVisionNotice("Geometria inválida: visão bloqueada. O mestre deve corrigir a cena.");
  }
  if (previousShape !== (mesaVision ? JSON.stringify({ ...mesaVision, revision: 0 }) : "")) {
    mesaVisionStart = null;
    mesaVisionPoints = []; mesaVisionCursor = null;
    mesaVisionHistory = []; mesaVisionFuture = [];
  }
  requestMesaVisionRender();
}
function mesaVisionSource() {
  const eligible = state.tokens.filter(t => t.layer !== "dm" && t.visibleToPlayers !== false && (isMaster() || isOwnPlayerToken(t)));
  return eligible.find(t => t.id === state.selectedTokenId) || eligible[0] || null;
}
function mesaVisionFogVisible(p) {
  const fog = window.getMesaFogScenePayload?.();
  if (!fog?.enabled) return true;
  const canvas = document.getElementById("mesaFogCanvas");
  if (!canvas?.width || !canvas?.height) return false;
  try {
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(p.x * canvas.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(p.y / mesaVision.aspect * canvas.height)));
    return canvas.getContext("2d").getImageData(x, y, 1, 1).data[3] < 128;
  } catch { return false; }
}
function mesaVisionTokenVisible(token) {
  if (!mesaVisionActive() || (isMaster() && !mesaVisionPreview)) return true;
  const source = mesaVisionSource();
  if (!source || !mesaVisionGeometry) return false;
  if (token.id === source.id) return true;
  const p = MesaVisionRules.center(token, mesaVision);
  return mesaVisionFogVisible(p) && mesaVisionGeometry.canSee(MesaVisionRules.center(source, mesaVision), p, source.facingDeg || 0);
}
function requestMesaVisionRender() {
  if (mesaVisionFrame) return;
  mesaVisionFrame = requestAnimationFrame(() => {
    mesaVisionFrame = 0;
    if (typeof state !== "undefined") {
      renderStage();
      if (mesaVisionActive()) { renderSummary(); if (typeof renderInitiative === "function") renderInitiative(); }
    }
  });
}
function mesaVisionTokenStyle(element, token) {
  if (!element) return;
  if (!mesaVisionActive()) { element.style.removeProperty("transform"); return; }
  const stage = document.getElementById("mesaStage");
  const r = MesaVisionRules.radius(token);
  element.style.transform = `scale(${2 * r * stage.clientWidth / 88}, ${2 * r * stage.clientHeight / mesaVision.aspect / 88})`;
}
function renderMesaVision() {
  const canvas = document.getElementById("mesaVisionCanvas"), editor = document.getElementById("mesaWallCanvas");
  const stage = document.getElementById("mesaStage");
  if (!canvas || !editor || !stage) return;
  const masked = mesaVisionActive() && (!isMaster() || mesaVisionPreview);
  canvas.hidden = !masked;
  editor.hidden = !isMaster() || mesaVisionMode === "off";
  editor.style.pointerEvents = editor.hidden ? "none" : "auto";
  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const el of [canvas, editor]) {
    const width = Math.max(1, Math.round(stage.clientWidth * dpr)), height = Math.max(1, Math.round(stage.clientHeight * dpr));
    if (el.width !== width) el.width = width;
    if (el.height !== height) el.height = height;
  }
  if (masked) {
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const source = mesaVisionSource();
    if (source && mesaVisionGeometry) {
      const polygon = mesaVisionGeometry.polygon(MesaVisionRules.center(source, mesaVision), source.facingDeg || 0);
      if (polygon.length > 2) {
        ctx.globalCompositeOperation = "destination-out"; ctx.beginPath();
        polygon.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * canvas.width, p.y / mesaVision.aspect * canvas.height));
        ctx.closePath(); ctx.fill();
        // Keep the character's own disk legible; no explored-area memory.
        const center = MesaVisionRules.center(source, mesaVision), radius = MesaVisionRules.radius(source);
        ctx.beginPath();
        ctx.ellipse(center.x * canvas.width, center.y / mesaVision.aspect * canvas.height, radius * canvas.width, radius / mesaVision.aspect * canvas.height, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.globalCompositeOperation = "source-over";
      }
    }
  }
  if (!editor.hidden) {
    const ctx = editor.getContext("2d"); ctx.clearRect(0, 0, editor.width, editor.height);
    const hovered = mesaVisionHoveredWall(editor);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = 2 * dpr;
    for (const w of mesaVision?.walls || []) {
      const emphasized = mesaVisionRecentIds.has(w.id) || hovered?.id === w.id;
      ctx.lineWidth = (emphasized ? 4 : 2) * dpr;
      ctx.shadowColor = "#000"; ctx.shadowBlur = emphasized ? 3 * dpr : 0;
      ctx.strokeStyle = w.kind === "door" ? (w.doorState === "open" ? "#7bc89a" : "#e2ba69") : "#ef777f";
      if (hovered?.id === w.id) ctx.strokeStyle = "#fff";
      ctx.setLineDash(w.doorState === "open" ? [6 * dpr, 4 * dpr] : []);
      ctx.beginPath(); ctx.moveTo(w.ax * editor.width, w.ay * editor.height); ctx.lineTo(w.bx * editor.width, w.by * editor.height); ctx.stroke();
      if (emphasized) for (const p of [{ x: w.ax, y: w.ay }, { x: w.bx, y: w.by }]) {
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(p.x * editor.width, p.y * editor.height, 4 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.shadowBlur = 0; ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([]);
    const draft = mesaVisionMode === "polygon" ? [...mesaVisionPoints] : mesaVisionStart ? [mesaVisionStart] : [];
    if (draft.length && mesaVisionCursor) {
      if (mesaVisionMode === "rect") draft.push({ x: mesaVisionCursor.x, y: mesaVisionStart.y }, mesaVisionCursor, { x: mesaVisionStart.x, y: mesaVisionCursor.y }, mesaVisionStart);
      else draft.push(mesaVisionCursor);
      if (mesaVisionMode === "polygon") draft.push(mesaVisionPoints[0]);
    }
    if (draft.length) {
      ctx.strokeStyle = mesaVisionMode === "door" ? "#e2ba69" : "#fff";
      ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.beginPath();
      draft.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * editor.width, p.y * editor.height)); ctx.stroke(); ctx.setLineDash([]);
      if (mesaVisionPoints.length > 1) {
        ctx.beginPath();
        mesaVisionPoints.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * editor.width, p.y * editor.height)); ctx.stroke();
      }
      for (const p of mesaVisionPoints) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x * editor.width, p.y * editor.height, 3 * dpr, 0, Math.PI * 2); ctx.fill(); }
    }
    if (mesaVisionStart) {
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(mesaVisionStart.x * editor.width, mesaVisionStart.y * editor.height, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    if (mesaVisionCursor) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(mesaVisionCursor.x * editor.width, mesaVisionCursor.y * editor.height, 6 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
  }
  document.getElementById("mesaVisionToggle").checked = mesaVisionActive();
  document.getElementById("mesaVisionCone").value = mesaVision?.coneDeg || 120;
  const wallTool = ["wall", "polygon", "rect"].includes(mesaVisionMode);
  document.getElementById("mesaVisionShapes").hidden = !wallTool;
  for (const [id, active] of [["mesaVisionWall", wallTool], ["mesaVisionDoor", mesaVisionMode === "door"], ["mesaVisionErase", mesaVisionMode === "erase"], ["mesaVisionLock", mesaVisionMode === "lock"]]) document.getElementById(id).setAttribute("aria-pressed", String(active));
  document.querySelectorAll("[data-vision-shape]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.visionShape === mesaVisionShape)));
  document.getElementById("mesaVisionHint").textContent = {
    off: "Crie paredes ou portas. Ative a visão individual para aplicar as barreiras.",
    wall: "Clique nos pontos da parede. Escape encerra a cadeia.",
    polygon: `${mesaVisionPoints.length} pontos • Clique para contornar. Feche no primeiro ponto ou use Finalizar polígono. Escape cancela.`,
    rect: "Clique em dois cantos opostos. A prévia mostra as quatro paredes. Escape cancela.",
    door: "Marque duas extremidades na mesma parede para abrir um vão, ou num vão livre. Jogadores próximos podem abrir a porta e enxergar através dela.",
    erase: "Clique no segmento que deseja remover.",
    lock: "Clique numa porta fechada para trancar ou destrancar."
  }[mesaVisionMode];
  const status = document.getElementById("mesaVisionStatus");
  status.hidden = mesaVisionMode === "off";
  status.textContent = `${{ wall: "Parede · ponto a ponto", polygon: "Parede · polígono", rect: "Parede · retângulo", door: "Porta · duas extremidades", erase: "Apagar · segmento destacado", lock: "Trancar · porta destacada" }[mesaVisionMode] || ""} — botão direito conclui`;
  const segmentCount = mesaVision?.walls.length || 0;
  document.getElementById("mesaVisionCount").textContent = `${segmentCount} ${segmentCount === 1 ? "segmento" : "segmentos"}`;
  document.getElementById("mesaVisionUndo").disabled = mesaVisionBusy || !mesaVisionHistory.length;
  document.getElementById("mesaVisionRedo").disabled = mesaVisionBusy || !mesaVisionFuture.length;
  const finish = document.getElementById("mesaVisionFinish");
  finish.hidden = !["wall", "polygon"].includes(mesaVisionMode);
  finish.textContent = mesaVisionMode === "polygon" ? "Finalizar polígono" : "Encerrar cadeia";
  finish.disabled = mesaVisionMode === "polygon" ? mesaVisionPoints.length < 3 : !mesaVisionStart;
  document.getElementById("mesaVisionStop").hidden = mesaVisionMode === "off";
  document.getElementById("mesaVisionPreview").setAttribute("aria-pressed", String(mesaVisionPreview));
  document.getElementById("mesaVisionPreview").disabled = !mesaVisionActive();
  for (const id of ["mesaFacingLeft", "mesaFacingRight"]) document.getElementById(id).disabled = mesaVisionBusy;
  const source = mesaVisionSource();
  const facing = document.getElementById("mesaFacingControls");
  facing.hidden = !mesaVisionActive() || !source;
  document.getElementById("mesaFacingValue").textContent = `${Math.round(source?.facingDeg || 0)}°`;
  const doors = document.getElementById("mesaVisionDoors"); doors.replaceChildren();
  if (mesaVisionActive() && source && mesaVisionGeometry && mesaVisionMode === "off") {
    for (const door of mesaVision.walls.filter(w => w.kind === "door")) {
      const origin = MesaVisionRules.center(source, mesaVision);
      const midpoint = { x: (door.ax + door.bx) / 2, y: (door.ay + door.by) / 2 * mesaVision.aspect };
      const allowed = isMaster() || (door.doorState !== "open" && mesaVisionGeometry.canReachDoor(origin, door.id, (window.getMesaGridScenePayload?.()?.cellFrac || .05) + MesaVisionRules.radius(source)) && mesaVisionGeometry.canSee(origin, midpoint, source.facingDeg || 0) && mesaVisionFogVisible(midpoint));
      if (!allowed) continue;
      const button = document.createElement("button"); button.type = "button";
      button.className = "mesa-door-button";
      button.textContent = door.doorState === "open" ? "Fechar" : "Abrir";
      button.setAttribute("aria-label", `${button.textContent} porta`);
      button.style.left = `${midpoint.x * 100}%`; button.style.top = `${midpoint.y / mesaVision.aspect * 100}%`;
      button.disabled = mesaVisionBusy;
      button.addEventListener("pointerdown", e => e.stopPropagation());
      button.addEventListener("click", e => { e.stopPropagation(); void mesaVisionAction({ kind: "door", tokenId: source.id, doorId: door.id, close: door.doorState === "open" }); });
      doors.append(button);
    }
  }
}
function mesaVisionEdit(mutator) {
  if (!requireMesaMaster("vision.manage", "editar paredes")) return;
  if (mesaVisionBusy || mesaRemotePersistInFlight) { mesaVisionNotice("Aguarde a confirmação da cena."); return; }
  const previous = getMesaVisionPayload();
  const stage = document.getElementById("mesaStage");
  const candidate = previous ? JSON.parse(JSON.stringify(previous)) : { schemaVersion: 1, enabled: false, coneDeg: 120, aspect: stage.clientHeight / stage.clientWidth, revision: 0, walls: [] };
  try {
    mutator(candidate);
    const normalized = MesaVisionRules.normalize(candidate);
    const geometry = MesaVisionGeometry.prepare(normalized, normalized.aspect);
    const oldWalls = new Map((previous?.walls || []).map(w => [w.id, JSON.stringify(w)]));
    mesaVisionRecentIds = new Set(normalized.walls.filter(w => oldWalls.get(w.id) !== JSON.stringify(w)).map(w => w.id));
    mesaVisionHistory.push(previous); if (mesaVisionHistory.length > 30) mesaVisionHistory.shift();
    mesaVisionFuture = []; mesaVision = normalized; mesaVisionGeometry = geometry;
    if (mesaVisionActive()) state.tokens.forEach(t => { if (!t.visionRadius || !previous?.enabled) t.visionRadius = Math.max(.0001, Math.min(.45, 44 * (t.tokenScale || 1) / stage.clientWidth)); });
    bumpMesaSceneVersion(); persistState({ immediate: true }); requestMesaVisionRender();
    return true;
  } catch (error) { mesaVisionNotice(error.message); }
}
function mesaVisionUndo(redo = false) {
  if (!requireMesaMaster("vision.manage", "desfazer parede") || mesaVisionBusy || mesaRemotePersistInFlight) return;
  const from = redo ? mesaVisionFuture : mesaVisionHistory, to = redo ? mesaVisionHistory : mesaVisionFuture;
  if (!from.length) return;
  to.push(getMesaVisionPayload()); const candidate = from.pop() || { schemaVersion: 1, enabled: false, coneDeg: 120, walls: [], aspect: mesaVision.aspect };
  candidate.revision = mesaVision?.revision || 0;
  mesaVision = candidate; mesaVisionGeometry = MesaVisionGeometry.prepare(candidate, candidate.aspect);
  mesaVisionPoints = []; mesaVisionCursor = null;
  mesaVisionStart = null; bumpMesaSceneVersion(); persistState({ immediate: true }); requestMesaVisionRender();
}
function mesaVisionConstrain(token, x, y) {
  if (!mesaVisionActive()) return { x, y };
  if (!mesaVisionGeometry || mesaVisionBusy) return { x: token.x, y: token.y };
  try {
    const hit = mesaVisionGeometry.sweep(MesaVisionRules.center(token, mesaVision), MesaVisionRules.center({ ...token, x, y }, mesaVision), MesaVisionRules.radius(token));
    return { x: (hit.x - MesaVisionRules.radius(token)) * 100, y: (hit.y - MesaVisionRules.radius(token)) / mesaVision.aspect * 100 };
  } catch { return { x: token.x, y: token.y }; }
}
async function mesaVisionAction(action, restoreToken = null) {
  if (!mesaVisionActive() || mesaVisionBusy) return;
  const sceneId = state.sceneId || "default";
  mesaVisionBusy = true;
  requestMesaVisionRender();
  try {
    if (window.AUTH?.isBackendEnabled?.()) {
      const saved = await window.APP.mesaVisionAction(sceneId, mesaVision.revision, action);
      if ((state.sceneId || "default") === sceneId) {
        applyMesaSceneSnapshot(saved.data, { keepSelection: true });
        rememberMesaSceneSignature(saved.data, { persisted: true, remote: true });
        localStorage.setItem(mesaSceneStorageKey(), JSON.stringify(saved.data));
      }
    } else {
      const scene = createMesaScenePayloadFromState();
      if (restoreToken) Object.assign(scene.tokens.find(t => t.id === action.tokenId), restoreToken);
      const next = MesaVisionRules.apply(scene, { role: state.role, username: state.session?.username }, action, state.playersMoveLocked);
      applyMesaSceneSnapshot(next, { keepSelection: true }); bumpMesaSceneVersion(); persistState({ immediate: true });
    }
  } catch (error) {
    if ((state.sceneId || "default") === sceneId) {
      if (restoreToken) Object.assign(findToken(action.tokenId) || {}, restoreToken);
      if (window.AUTH?.isBackendEnabled?.()) {
        try { const latest = await window.APP.getMesaScene(sceneId); if ((state.sceneId || "default") === sceneId) applyMesaSceneSnapshot(latest.data, { keepSelection: true }); } catch { /* keep the last accepted location */ }
      }
    }
    mesaVisionNotice(error.message || "Ação não confirmada.");
  } finally { mesaVisionBusy = false; requestMesaVisionRender(); }
}
function setMesaVisionTool(mode) {
  if (!requireMesaMaster("vision.manage", "editar paredes")) return;
  closeMesaVisionEditor(); mesaVisionMode = mode;
  if (["wall", "polygon", "rect"].includes(mode)) mesaVisionShape = mode;
  if (mode !== "off") { setInteractionMode("move"); window.setMesaFogBrush?.(null); }
  requestMesaVisionRender();
}
function mesaVisionSegment(a, b, kind = "wall") {
  return { id: crypto.randomUUID(), ax: a.x, ay: a.y, bx: b.x, by: b.y, kind, doorState: kind === "door" ? "closed" : null };
}
function finishMesaVisionPolygon() {
  if (mesaVisionPoints.length < 3) return;
  const points = [...mesaVisionPoints];
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
  if (Math.abs(area) < 1e-8) { mesaVisionNotice("Marque pelo menos três pontos formando uma área."); return; }
  if (mesaVisionEdit(v => points.forEach((p, i) => v.walls.push(mesaVisionSegment(p, points[(i + 1) % points.length]))))) {
    mesaVisionPoints = []; mesaVisionStart = null; mesaVisionCursor = null;
  }
  requestMesaVisionRender();
}
function mesaVisionProject(p, w, rect) {
  const dx = (w.bx - w.ax) * rect.width, dy = (w.by - w.ay) * rect.height;
  const t = Math.max(0, Math.min(1, ((p.x - w.ax) * rect.width * dx + (p.y - w.ay) * rect.height * dy) / (dx * dx + dy * dy)));
  const q = { x: w.ax + (w.bx - w.ax) * t, y: w.ay + (w.by - w.ay) * t };
  return { ...q, t, wallId: w.id, distance: Math.hypot((p.x - q.x) * rect.width, (p.y - q.y) * rect.height) };
}
function mesaVisionEditorPoint(event, editor) {
  const rect = editor.getBoundingClientRect();
  let p = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  if (mesaVisionMode === "door") {
    const walls = (mesaVision?.walls || []).filter(w => w.kind === "wall" && (!mesaVisionStart?.wallId || w.id === mesaVisionStart.wallId));
    const hit = walls.map(w => mesaVisionProject(p, w, rect)).sort((a, b) => a.distance - b.distance)[0];
    if (hit?.distance < 12) return !mesaVisionStart && (hit.t < 1e-5 || hit.t > 1 - 1e-5) ? { x: hit.x, y: hit.y } : hit;
  }
  for (const w of mesaVision?.walls || []) for (const [x, y] of [[w.ax, w.ay], [w.bx, w.by]]) {
    if (Math.hypot((p.x - x) * rect.width, (p.y - y) * rect.height) < 8) p = { x, y };
  }
  return p;
}
function createMesaVisionDoor(start, end) {
  return mesaVisionEdit(v => {
    // Endpoints can also delimit an existing gap. Only cut when both points
    // lie on the same wall; otherwise preserve the adjoining wall segments.
    if (!start.wallId) {
      for (const w of v.walls.filter(w => w.kind === "wall")) {
        const a = mesaVisionProject(start, w, { width: 1, height: 1 });
        const b = mesaVisionProject(end, w, { width: 1, height: 1 });
        if (a.distance < 1e-7 && b.distance < 1e-7) { start = a; end = b; break; }
      }
    }
    if (start.wallId) {
      const wall = v.walls.find(w => w.id === start.wallId);
      if (!wall || end.wallId !== wall.id) throw new Error("Marque a segunda extremidade na mesma parede.");
      const [a, b] = start.t < end.t ? [start, end] : [end, start];
      if (b.t - a.t < 1e-5) throw new Error("A porta precisa de duas extremidades diferentes.");
      const pieces = [];
      if (a.t > 1e-5) pieces.push(mesaVisionSegment({ x: wall.ax, y: wall.ay }, a));
      pieces.push(mesaVisionSegment(a, b, "door"));
      if (b.t < 1 - 1e-5) pieces.push(mesaVisionSegment(b, { x: wall.bx, y: wall.by }));
      v.walls.splice(v.walls.indexOf(wall), 1, ...pieces);
    } else {
      if (end.wallId && end.t > 1e-5 && end.t < 1 - 1e-5) throw new Error("Comece na parede para recortar um vão, ou use as extremidades de um vão livre.");
      v.walls.push(mesaVisionSegment(start, end, "door"));
    }
  });
}
function initMesaVision() {
  if (mesaVisionInitialized) return;
  mesaVisionInitialized = true;
  const bind = (id, event, fn) => { const el = document.getElementById(id); el.addEventListener(event, fn); el.dataset.armed = "1"; };
  bind("mesaVisionToggle", "change", e => mesaVisionEdit(v => { v.enabled = e.target.checked; }));
  bind("mesaVisionPanel", "toggle", e => {
    if (e.target.id === "mesaVisionPanel" && !e.target.open) closeMesaVisionEditor();
  });
  bind("mesaVisionCone", "change", e => mesaVisionEdit(v => { v.coneDeg = Number(e.target.value); }));
  bind("mesaVisionWall", "click", () => setMesaVisionTool(mesaVisionShape));
  bind("mesaVisionDoor", "click", () => setMesaVisionTool("door"));
  bind("mesaVisionErase", "click", () => setMesaVisionTool("erase"));
  bind("mesaVisionLock", "click", () => setMesaVisionTool("lock"));
  bind("mesaVisionStop", "click", closeMesaVisionEditor);
  document.querySelectorAll("[data-vision-shape]").forEach(el => {
    el.dataset.armed = "1"; el.addEventListener("click", () => setMesaVisionTool(el.dataset.visionShape));
  });
  bind("mesaVisionPreview", "click", () => {
    if (!requireMesaMaster("vision.manage", "simular visão")) return;
    const preview = !mesaVisionPreview; closeMesaVisionEditor(); mesaVisionPreview = preview; requestMesaVisionRender();
  });
  bind("mesaVisionUndo", "click", () => mesaVisionUndo());
  bind("mesaVisionRedo", "click", () => mesaVisionUndo(true));
  bind("mesaVisionFinish", "click", () => {
    if (mesaVisionMode === "polygon") finishMesaVisionPolygon();
    else { mesaVisionStart = null; mesaVisionCursor = null; requestMesaVisionRender(); }
  });
  for (const [id, delta] of [["mesaFacingLeft", -15], ["mesaFacingRight", 15]]) bind(id, "click", () => {
    const token = mesaVisionSource(); if (token) void mesaVisionAction({ kind: "face", tokenId: token.id, facingDeg: (token.facingDeg || 0) + delta });
  });
  const editor = document.getElementById("mesaWallCanvas");
  document.getElementById("mesaStageWrap").addEventListener("contextmenu", event => {
    if (!isMaster() || mesaVisionMode === "off") return;
    event.preventDefault(); event.stopImmediatePropagation();
    stopMesaVisionConstruction();
  }, true);
  editor.addEventListener("pointerdown", event => {
    if (isMaster() && mesaVisionMode !== "off" && event.button === 2) { event.preventDefault(); event.stopPropagation(); return; }
    if (!isMaster() || mesaVisionMode === "off" || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    if (mesaVisionBusy || mesaRemotePersistInFlight) { mesaVisionNotice("Aguarde a confirmação da cena."); return; }
    const rect = editor.getBoundingClientRect();
    const p = mesaVisionEditorPoint(event, editor);
    if (mesaVisionMode === "polygon") {
      const first = mesaVisionPoints[0];
      if (mesaVisionPoints.length >= 3 && Math.hypot((p.x - first.x) * rect.width, (p.y - first.y) * rect.height) < 10) finishMesaVisionPolygon();
      else if (!mesaVisionPoints.some(q => Math.hypot((p.x - q.x) * rect.width, (p.y - q.y) * rect.height) < 3)) {
        mesaVisionPoints.push(p); mesaVisionStart = p;
      }
      requestMesaVisionRender(); return;
    }
    if (["erase", "lock"].includes(mesaVisionMode)) {
      mesaVisionCursor = p;
      const nearest = mesaVisionHoveredWall(editor);
      if (nearest) mesaVisionEdit(v => {
        if (mesaVisionMode === "erase") v.walls = v.walls.filter(w => w.id !== nearest.id);
        else { const w = v.walls.find(w => w.id === nearest.id); if (w.kind === "door" && w.doorState !== "open") w.doorState = w.doorState === "locked" ? "closed" : "locked"; }
      });
    } else if (!mesaVisionStart) { mesaVisionStart = p; requestMesaVisionRender(); }
    else {
      const start = mesaVisionStart;
      let saved;
      if (mesaVisionMode === "door") saved = createMesaVisionDoor(start, p);
      else if (mesaVisionMode === "rect") saved = mesaVisionEdit(v => {
        const points = [start, { x: p.x, y: start.y }, p, { x: start.x, y: p.y }];
        points.forEach((q, i) => v.walls.push(mesaVisionSegment(q, points[(i + 1) % 4])));
      });
      else saved = mesaVisionEdit(v => v.walls.push(mesaVisionSegment(start, p)));
      if (saved) { mesaVisionStart = mesaVisionMode === "wall" ? p : null; mesaVisionCursor = null; }
      requestMesaVisionRender();
    }
  });
  editor.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
  editor.addEventListener("pointermove", e => {
    if (mesaVisionMode === "off" || !isMaster()) return;
    mesaVisionCursor = mesaVisionEditorPoint(e, editor); requestMesaVisionRender();
  });
  editor.addEventListener("pointerleave", () => { mesaVisionCursor = null; requestMesaVisionRender(); });
  document.addEventListener("keydown", e => {
    if (mesaVisionMode === "off" || e.target.closest?.("input,select,textarea,[contenteditable]")) return;
    if (e.key === "Enter" && e.target.closest?.("button")) return;
    if (e.key === "Enter" && mesaVisionMode === "polygon") { e.preventDefault(); finishMesaVisionPolygon(); }
    if (e.key === "Escape") { mesaVisionStart = null; mesaVisionPoints = []; mesaVisionCursor = null; requestMesaVisionRender(); }
  });
  new ResizeObserver(requestMesaVisionRender).observe(document.getElementById("mesaStage"));
  requestMesaVisionRender();
}
