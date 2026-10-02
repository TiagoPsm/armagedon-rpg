/* Optional per-token handle. Preferences affect presentation, never permissions. */
const MesaFacingDot = (() => {
  let preview = null, drag = null, queued = null, sending = null, epoch = 0;
  const preferences = new Map();
  let hovered = null, hideTimer = 0;
  const key = token => `tc_mesa_facing_dot:${state.session?.username || "local"}:${state.sceneId || "default"}:${token.id}`;
  function visible(token) {
    const id = key(token);
    if (!preferences.has(id)) { try { preferences.set(id, localStorage.getItem(id) !== "hidden"); } catch { preferences.set(id, true); } }
    return preferences.get(id);
  }
  function reset() { epoch++; preview = null; drag = null; queued = null; hovered = null; clearTimeout(hideTimer); }
  function angle(token) { return preview?.tokenId === token.id && preview.epoch === epoch ? preview.angle : token.facingDeg || 0; }
  const allowed = token => token && visible(token) && mesaVisionActive() && mesaVisionMode === "off" && !state.drag && !MesaMovement.isAnimating(token) &&
    (typeof _activeTool === 'undefined' || !_activeTool) &&
    document.getElementById('mesaLightCanvas')?.hidden !== false && document.getElementById('mesaGridEditCanvas')?.hidden !== false &&
    document.getElementById('mesaTemplateCanvas')?.dataset.active !== 'true' &&
    (isMaster() || (isOwnPlayerToken(token) && !state.playersMoveLocked)) && (!mesaVisionBusy || sending?.epoch === epoch) && !mesaRemotePersistInFlight;
  function setPreview(token, degrees) { preview = { tokenId: token.id, angle: ((degrees % 360) + 360) % 360, epoch }; requestMesaVisionRender(); }
  async function save() {
    if (!preview) return;
    queued = preview; if (sending) return;
    while (queued) {
      const job = queued; queued = null; if (job.epoch !== epoch) break;
      sending = job;
      const ok = await mesaVisionAction({ kind: "face", tokenId: job.tokenId, facingDeg: job.angle });
      sending = null;
      if (job.epoch !== epoch) break;
      if (!ok) { reset(); break; }
      if (preview === job) preview = null;
    }
    requestMesaVisionRender();
  }
  function cancel() { if (!drag) return; drag = null; preview = queued || (sending?.epoch === epoch ? sending : null); requestMesaVisionRender(); }
  function render(token) {
    const root = document.getElementById("mesaFacingControls"), dot = document.getElementById("mesaFacingHandle");
    if (!root || !dot) return;
    token = findToken(drag?.tokenId || hovered) || token;
    const tokenEl = token && document.querySelector(`.mesa-token[data-token-id="${CSS.escape(token.id)}"]`);
    const show = !!tokenEl && allowed(token) && (!!drag || hovered === token.id || document.activeElement === dot);
    root.hidden = !show;
    dot.hidden = !token || !visible(token);
    if (drag && (!show || drag.tokenId !== token?.id || !allowed(token))) cancel();
    if (!show) return;
    root.dataset.facingToken = token.id; root.classList.toggle("is-turning", !!drag);
    dot.disabled = !allowed(token); dot.style.setProperty("--facing-angle", `${angle(token)}deg`);
    dot.setAttribute("aria-valuenow", String(Math.round(angle(token)) % 360)); dot.setAttribute("aria-valuetext", `${Math.round(angle(token)) % 360} graus`);
    if (!root.offsetParent) return;
    const container = root.offsetParent, parent = container.getBoundingClientRect();
    const avatar = tokenEl.querySelector(".mesa-token-avatar") || tokenEl;
    const r = avatar.getBoundingClientRect();
    const x = r.left + r.width / 2 - parent.left - container.clientLeft + container.scrollLeft;
    const y = r.top + r.height / 2 - parent.top - container.clientTop + container.scrollTop;
    const radius = Math.max(r.width, r.height) / 2;
    dot.style.setProperty("--facing-size", `${clamp(radius * 2 * .22, 18, 32)}px`);
    root.style.left = `${x}px`; root.style.top = `${y}px`;
    root.style.width = root.style.height = `${radius * 2}px`;
    const radians = angle(token) * Math.PI / 180;
    dot.style.left = `${radius + Math.cos(radians) * radius}px`;
    dot.style.top = `${radius + Math.sin(radians) * radius}px`;
  }
  function init() {
    const root = document.getElementById("mesaFacingControls"), dot = document.getElementById("mesaFacingHandle"); dot.dataset.armed = "1";
    new ResizeObserver(() => requestMesaVisionRender()).observe(document.getElementById("mesaStage"));
    window.addEventListener("scroll", () => { if (!root.hidden) render(mesaVisionSource()); }, true);
    const leave = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!drag) { hovered = null; requestMesaVisionRender(); } }, 300); };
    document.getElementById("mesaStage").addEventListener("pointerover", e => {
      const el = e.target.closest(".mesa-token[data-token-id]");
      const token = el && findToken(el.dataset.tokenId);
      if (!drag && allowed(token)) { clearTimeout(hideTimer); hovered = token.id; requestMesaVisionRender(); }
    });
    document.getElementById("mesaStage").addEventListener("pointerout", e => {
      const el = e.target.closest(".mesa-token[data-token-id]");
      if (el && !el.contains(e.relatedTarget)) leave();
    });
    dot.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    dot.addEventListener("pointerleave", leave); dot.addEventListener("blur", leave);
    for (const name of ["pointerdown", "mousedown", "click", "dblclick"]) root.addEventListener(name, e => e.stopPropagation());
    dot.addEventListener("pointerdown", e => {
      const token = findToken(root.dataset.facingToken); if (e.button !== 0 || drag || !allowed(token)) return;
      e.preventDefault(); dot.setPointerCapture(e.pointerId);
      const r = root.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      drag = { id: e.pointerId, tokenId: token.id, cx, cy };
      requestMesaVisionRender();
    });
    const update = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const token = findToken(drag.tokenId); if (!allowed(token)) { cancel(); return; }
      // Zoom/pan/resize can move the pivot during the gesture.
      render(token);
      const bounds = root.getBoundingClientRect();
      drag.cx = bounds.left + bounds.width / 2; drag.cy = bounds.top + bounds.height / 2;
      if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
      setPreview(token, Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180 / Math.PI);
    };
    dot.addEventListener("pointermove", update);
    dot.addEventListener("pointerup", e => { if (drag?.id !== e.pointerId) return; update(e); drag = null; void save(); });
    dot.addEventListener("pointercancel", cancel); dot.addEventListener("lostpointercapture", cancel); window.addEventListener("blur", cancel);
    window.addEventListener("keydown", e => { if (e.key === "Escape" && drag) { e.preventDefault(); cancel(); } }, true);
    dot.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); return; }
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const token = findToken(root.dataset.facingToken); if (!allowed(token) || drag) return;
      e.preventDefault(); e.stopPropagation(); setPreview(token, angle(token) + (e.key === "ArrowLeft" ? -15 : 15)); void save();
    });
    document.addEventListener("change", e => {
      const input = e.target.closest("[data-facing-dot-token]"); if (!input) return;
      const token = findToken(input.dataset.facingDotToken); if (!token || (!isMaster() && !isOwnPlayerToken(token))) return;
      preferences.set(key(token), input.checked);
      try { localStorage.setItem(key(token), input.checked ? "shown" : "hidden"); } catch { /* preference remains in memory */ }
      if (!input.checked) cancel(); requestMesaVisionRender();
    });
  }
  return { reset, angle, render, init, visible };
})();
function renderMesaFacingPreference(token) {
  if (!token) return "";
  return `<label class="mesa-grid-check mesa-facing-preference"><input type="checkbox" data-facing-dot-token="${escapeAttribute(token.id)}"${MesaFacingDot.visible(token) ? " checked" : ""}> Mostrar controle de direção</label><p class="mesa-map-settings-hint">Só neste token e na sua tela.</p>`;
}
