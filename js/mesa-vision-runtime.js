/* Scene vision runtime. The v1 data contract and shared collision rules remain
 * compatible with saved campaigns; UI/editor state never enters that contract. */
let mesaVision = null;
let mesaVisionGeometry = null;
let mesaVisionMode = "off";
let mesaVisionPreview = false;
let mesaVisionBusy = false;
let mesaVisionFrame = 0;
let mesaVisionSceneId = "";
let mesaVisionInitialized = false;
let mesaVisionPaint = null;
let mesaVisionPanelKey = null;
let mesaVisionPanelTokens = [];

function mesaVisionActive() { return mesaVision?.enabled === true; }
function getMesaVisionPayload() { return mesaVision ? structuredClone(mesaVision) : null; }
function mesaVisionNotice(message) { window.UI?.toast?.(message, { kicker: "// Barreiras" }); }
function mesaVisionSource() {
  const tokens = state.tokens.filter(t => t.layer !== "dm" && t.visibleToPlayers !== false && (isMaster() || isOwnPlayerToken(t)));
  return tokens.find(t => t.id === state.selectedTokenId) || tokens[0] || null;
}
function applyMesaVisionSnapshot(raw) {
  mesaVisionPanelKey = null;
  const sceneId = state.sceneId || "default";
  const changedScene = sceneId !== mesaVisionSceneId;
  const oldWalls = JSON.stringify(mesaVision?.walls);
  try {
    mesaVision = MesaVisionRules.normalize(raw);
    mesaVisionGeometry = mesaVision ? MesaVisionGeometry.prepare(mesaVision, mesaVision.aspect) : null;
  } catch {
    mesaVision = { enabled: true, walls: [], aspect: 1, coneDeg: 120, revision: 0 };
    mesaVisionGeometry = null;
    mesaVisionNotice("Não foi possível ler as barreiras. A visão foi bloqueada por segurança.");
  }
  if (changedScene || oldWalls !== JSON.stringify(mesaVision?.walls)) MesaBarrierEditor.reset();
  if (changedScene || !mesaVisionActive()) MesaFacingDot.reset();
  if (changedScene) mesaVisionPreview = false;
  mesaVisionSceneId = sceneId;
  requestMesaVisionRender();
}
function requestMesaVisionRender() {
  if (mesaVisionFrame) return;
  mesaVisionFrame = requestAnimationFrame(() => {
    mesaVisionFrame = 0;
    renderStage();
    if (mesaVisionActive()) {
      // Camera/facing frames must not rebuild unchanged initiative buttons:
      // it loses keyboard focus and spends work unrelated to the playfield.
      // Visibility is still checked every frame; player lists/counts refresh
      // immediately when a token enters/leaves the individual cone.
      const tokens = getRenderedTokens();
      const key = JSON.stringify([state.sceneId, state.role, state.session?.username,
        state.scenePersistence, state.realtimeStatus, tokens.map(token => token.id)]);
      // Compare avatar values directly, without serializing potentially large
      // data URLs on every frame. Async roster hydration may replace a portrait
      // without changing token IDs or initiative state.
      const portraitsChanged = tokens.length !== mesaVisionPanelTokens.length || tokens.some((token, i) => {
        const previous = mesaVisionPanelTokens[i];
        return token.id !== previous.id || token.imageUrl !== previous.imageUrl || token.initials !== previous.initials;
      });
      if (key !== mesaVisionPanelKey || portraitsChanged) {
        mesaVisionPanelKey = key;
        mesaVisionPanelTokens = tokens.map(({ id, imageUrl, initials }) => ({ id, imageUrl, initials }));
        renderSummary();
        if (typeof renderInitiative === "function") renderInitiative();
      }
    }
  });
}
function mesaVisionFogVisible(point) {
  if (!window.getMesaFogScenePayload?.()?.enabled) return true;
  const canvas = document.getElementById("mesaFogCanvas");
  if (!canvas?.width || !canvas.height) return false;
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(point.x * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(point.y / mesaVision.aspect * canvas.height)));
  try { return canvas.getContext("2d").getImageData(x, y, 1, 1).data[3] < 128; } catch { return false; }
}
function mesaVisionTokenVisible(token) {
  if (!mesaVisionActive() || (isMaster() && !mesaVisionPreview)) return true;
  const source = MesaMovement.visual(mesaVisionSource());
  if (!source || !mesaVisionGeometry) return false;
  if (source.id === token.id) return true;
  const target = MesaVisionRules.center(MesaMovement.visual(token), mesaVision);
  return MesaLighting.isLit(target) && mesaVisionFogVisible(target) && mesaVisionGeometry.canSee(MesaVisionRules.center(source, mesaVision), target, MesaFacingDot.angle(source));
}
function mesaVisionTokenStyle(element, token) {
  if (!mesaVisionActive()) { element.style.removeProperty("transform"); element.style.removeProperty("transition-property"); return; }
  // Vision geometry is authoritative; interpolating scale desynchronizes the
  // token hit area and facing ring from the mask and collision radius.
  element.style.transitionProperty = "box-shadow, border-color, opacity";
  const stage = document.getElementById("mesaStage"), r = MesaVisionRules.radius(token);
  element.style.transform = `scale(${2 * r * stage.clientWidth / 88}, ${2 * r * stage.clientHeight / mesaVision.aspect / 88})`;
}
function mesaVisionConstrain(token, x, y) {
  if (!mesaVisionActive()) return { x, y };
  if (!mesaVisionGeometry || mesaVisionBusy) return { x: token.x, y: token.y };
  try {
    const r = MesaVisionRules.radius(token);
    const hit = mesaVisionGeometry.sweep(MesaVisionRules.center(token, mesaVision), MesaVisionRules.center({ ...token, x, y }, mesaVision), r);
    return { x: (hit.x - r) * 100, y: (hit.y - r) / mesaVision.aspect * 100 };
  } catch { return { x: token.x, y: token.y }; }
}
function renderMesaVision() {
  const canvas = document.getElementById("mesaVisionCanvas"), stage = document.getElementById("mesaStage");
  if (!canvas || !stage) return;
  canvas.hidden = !mesaVisionActive() || (isMaster() && !mesaVisionPreview);
  const source = MesaMovement.visual(mesaVisionSource());
  if (!canvas.hidden) {
    const view = mesaCanvasViewport(canvas, stage), dpr = view.density;
    const w = stage.clientWidth * dpr, h = stage.clientHeight * dpr;
    const origin = source && MesaVisionRules.center(source, mesaVision);
    const key = [view.key, source?.id, origin?.x, origin?.y, source && MesaFacingDot.angle(source), source && MesaVisionRules.radius(source), mesaVision.coneDeg, mesaVision.darkness, JSON.stringify(mesaVision.lights)].join(":");
    if (mesaVisionPaint?.key !== key || mesaVisionPaint.geometry !== mesaVisionGeometry) {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, -view.left * dpr, -view.top * dpr);
      if (source && mesaVisionGeometry) {
        const center = MesaVisionRules.center(source, mesaVision), radius = MesaVisionRules.radius(source);
        const polygon = mesaVisionGeometry.polygon(center, MesaFacingDot.angle(source));
        if (polygon.length > 2) {
          ctx.globalCompositeOperation = "destination-out"; ctx.beginPath();
          polygon.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * w, p.y / mesaVision.aspect * h));
          ctx.closePath(); if (!mesaVision.darkness) ctx.fill(); else MesaLighting.paint(ctx, polygon, w, h);
          ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.ellipse(center.x * w, center.y / mesaVision.aspect * h, radius * w, radius / mesaVision.aspect * h, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
      }
      mesaVisionPaint = { key, geometry: mesaVisionGeometry };
      canvas.dataset.paints = String(Number(canvas.dataset.paints || 0) + 1);
    }
  }
  MesaBarrierEditor.render();
  window.MesaGridEditor?.render();
  MesaLighting.render();
  window.MesaTemplates?.render();
  window.MesaSceneSettings?.render();
  renderMesaDoorControls(source);
  MesaFacingDot.render(source);
}
function renderMesaDoorControls(source) {
  const root = document.getElementById("mesaVisionDoors");
  const old = new Map([...root.children].map(el => [el.dataset.doorId, el]));
  if (mesaVisionActive() && source && mesaVisionGeometry && mesaVisionMode === "off") {
    const origin = MesaVisionRules.center(source, mesaVision);
    for (const door of mesaVision.walls.filter(w => w.kind === "door")) {
      const target = mesaVisionGeometry.doorTarget(origin, door);
      const reach = (window.getMesaGridScenePayload?.()?.cellFrac || .05) + MesaVisionRules.radius(source);
      const near = mesaVisionGeometry.canReachDoor(origin, door.id, reach, true);
      const seen = MesaLighting.isLit(target) && mesaVisionGeometry.canSee(origin, target, MesaFacingDot.angle(source));
      if (!isMaster() && (!(near || seen) || !mesaVisionFogVisible(target))) continue;
      let button = old.get(door.id);
      if (!button) {
        button = document.createElement("button"); button.type = "button"; button.className = "mesa-door-button"; button.dataset.doorId = door.id;
        button.append(document.querySelector("#mesaVisionDoor svg").cloneNode(true));
        button.addEventListener("pointerdown", e => e.stopPropagation()); root.append(button);
      }
      old.delete(door.id);
      const label = door.doorState === "open" ? (isMaster() ? "Fechar porta" : "Porta aberta") : door.doorState === "locked" && !isMaster() ? "Porta trancada" : "Abrir porta";
      button.setAttribute("aria-label", label); button.title = !isMaster() && !near ? `${label} · aproxime-se` : label;
      button.dataset.state = door.doorState;
      button.style.left = `${target.x * 100}%`; button.style.top = `${target.y / mesaVision.aspect * 100}%`;
      button.disabled = mesaVisionBusy || MesaMovement.isAnimating(source) || (!isMaster() && (!near || door.doorState !== "closed" || state.playersMoveLocked));
      button.onclick = e => { e.stopPropagation(); void mesaVisionAction({ kind: "door", tokenId: source.id, doorId: door.id, close: door.doorState === "open" }); };
    }
  }
  old.forEach(el => el.remove());
}
async function mesaVisionAction(action, restoreToken = null) {
  if (!mesaVisionActive() || mesaVisionBusy) return false;
  const sceneId = state.sceneId || "default";
  mesaVisionBusy = true; requestMesaVisionRender();
  try {
    if (window.AUTH?.isBackendEnabled?.()) {
      const saved = await window.APP.mesaVisionAction(sceneId, mesaVision.revision, action);
      if (sceneId !== (state.sceneId || "default")) return false;
      applyMesaSceneSnapshot(saved.data, { keepSelection: true, movement: saved.movement });
      rememberMesaSceneSignature(saved.data, { persisted: true, remote: true });
      localStorage.setItem(mesaSceneStorageKey(), JSON.stringify(saved.data));
    } else {
      const scene = createMesaScenePayloadFromState();
      if (restoreToken) Object.assign(scene.tokens.find(t => t.id === action.tokenId) || {}, restoreToken);
      const data = MesaVisionRules.apply(scene, { role: state.role, username: state.session?.username }, action, state.playersMoveLocked);
      applyMesaSceneSnapshot(data, { keepSelection: true }); bumpMesaSceneVersion(); persistState({ immediate: true });
    }
    return true;
  } catch (error) {
    if (sceneId === (state.sceneId || "default")) {
      if (restoreToken) Object.assign(findToken(action.tokenId) || {}, restoreToken);
      if (window.AUTH?.isBackendEnabled?.()) {
        try { const latest = await window.APP.getMesaScene(sceneId); if (sceneId === (state.sceneId || "default")) applyMesaSceneSnapshot(latest.data, { keepSelection: true }); } catch { /* retain last accepted state */ }
      }
    }
    mesaVisionNotice(error.message || "Não foi possível confirmar a ação."); return false;
  } finally { mesaVisionBusy = false; requestMesaVisionRender(); }
}
function closeMesaVisionEditor() { MesaBarrierEditor.cancel(); MesaLighting.cancel(); mesaVisionPreview = false; requestMesaVisionRender(); }
function initMesaVision() {
  if (mesaVisionInitialized) return;
  mesaVisionInitialized = true;
  MesaBarrierEditor.init(); MesaFacingDot.init(); MesaMovement.init(); MesaLighting.init();
  new ResizeObserver(requestMesaVisionRender).observe(document.getElementById("mesaStage"));
  requestMesaVisionRender();
}
