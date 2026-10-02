/* Grid preparation is a local draft: it never moves the map or tokens. */
window.MesaGridEditor = (() => {
  const el = id => document.getElementById(id);
  let active = false, mode = "calibrate", start = null, end = null, candidate = null, original = null, scene = null;
  function reset() {
    active = false; start = end = candidate = original = null;
    previewMesaGrid(null); render();
  }
  function begin(nextMode = "calibrate") {
    if (!isMaster()) return;
    window.MesaSceneSettings?.cancel(); window.MesaTemplates?.cancel();
    MesaBarrierEditor.cancel(); if (typeof MesaLighting !== "undefined") MesaLighting.cancel(); requestMesaVisionRender(); setInteractionMode("move"); window.setMesaFogBrush?.(null);
    active = true; mode = nextMode; start = end = candidate = null; original = getMesaGridState(); scene = state.sceneId; render();
  }
  function point(e) {
    const b = el("mesaGridEditCanvas").getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width, 0, 1), y: clamp((e.clientY - b.top) / b.height, 0, 1) };
  }
  function click(e) {
    if (!active || !isMaster() || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); const p = point(e);
    if (mode === "origin") {
      const s = el("mesaStage"), surface = getMesaMapSurfaceFrac(), cell = original.cellFrac * surface.width * s.clientWidth;
      const frac = n => ((n % 1) + 1) % 1;
      start = end = p;
      candidate = normalizeMesaGridState({ ...original, offsetXFrac: frac((p.x - surface.left) * s.clientWidth / cell), offsetYFrac: frac((p.y - surface.top) * s.clientHeight / cell) });
      previewMesaGrid(candidate); render(); return;
    }
    if (!start || candidate) { start = p; end = p; candidate = null; previewMesaGrid(null); }
    else {
      end = p;
      const s = el("mesaStage"), surface = getMesaMapSurfaceFrac();
      const length = Math.hypot((p.x - start.x) * s.clientWidth, (p.y - start.y) * s.clientHeight);
      if (length < 4) return;
      const count = clamp(Math.round(Number(el("mesaGridReferenceCells").value) || 1), 1, 100);
      candidate = normalizeMesaGridState({ ...original, enabled: true, cellFrac: length / count / (surface.width * s.clientWidth), offsetXFrac: 0, offsetYFrac: 0 });
      previewMesaGrid(candidate);
    }
    render();
  }
  function apply() {
    if (!active || !candidate || !isMaster() || scene !== state.sceneId || JSON.stringify(original) !== JSON.stringify(getMesaGridState())) { reset(); return; }
    const next = candidate; reset(); updateMesaGrid(next, { conform: false });
  }
  function render() {
    const canvas = el("mesaGridEditCanvas");
    if (!canvas) return;
    if (active && (!isMaster() || scene !== state.sceneId || el("mesaMapTransform").hidden || mesaVisionMode !== "off")) {
      active = false; candidate = null; previewMesaGrid(null);
    }
    canvas.hidden = !active;
    el("mesaGridCalibrate").setAttribute("aria-pressed", String(active && mode === "calibrate"));
    el("mesaGridOrigin").setAttribute("aria-pressed", String(active && mode === "origin"));
    el("mesaGridOrigin").disabled = !getMesaGridState().enabled;
    el("mesaGridReferenceRow").hidden = active && mode === "origin";
    el("mesaGridDraftControls").hidden = !active;
    el("mesaGridDraftApply").disabled = !candidate;
    el("mesaGridDraftHint").textContent = candidate ? `Prévia: ${Math.round(1 / candidate.cellFrac)} colunas inteiras. Ajuste aproximado à referência; confirme para aplicar.` : start ? "Marque o outro extremo da aresta. A referência deve cobrir o número de casas indicado." : "Marque os dois extremos de uma aresta no mapa.";
    if (mode === "origin") el("mesaGridDraftHint").textContent = candidate ? "Prévia da origem. Mapa e tokens permanecem no lugar. Confirme ou ajuste com outro clique." : "Clique numa interseção do desenho do mapa para alinhar a origem da grade.";
    if (!active) return;
    const s = el("mesaStage"), density = getMesaRenderScale(s.clientWidth, s.clientHeight), zoom = getStageZoom();
    const w = Math.round(s.clientWidth * density), h = Math.round(s.clientHeight * density);
    if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, w, h);
    if (!start || !end) return;
    ctx.strokeStyle = "#99d7b2"; ctx.lineWidth = 2 * density / zoom; ctx.beginPath(); ctx.moveTo(start.x * w, start.y * h); ctx.lineTo(end.x * w, end.y * h); ctx.stroke();
    for (const p of [start, end]) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4 * density / zoom, 0, Math.PI * 2); ctx.fillStyle = "#141012"; ctx.fill(); ctx.stroke(); }
  }
  const bind = (id, event, fn) => { const node = el(id); node.dataset.armed = "1"; node.addEventListener(event, fn); };
  bind("mesaGridCalibrate", "click", () => begin()); bind("mesaGridOrigin", "click", () => begin("origin")); bind("mesaGridDraftApply", "click", apply); bind("mesaGridDraftCancel", "click", reset);
  bind("mesaGridReferenceCells", "change", () => { if (active) { start = end = candidate = null; previewMesaGrid(null); render(); } });
  el("mesaGridEditCanvas").addEventListener("pointerdown", click);
  el("mesaGridEditCanvas").addEventListener("pointermove", e => { if (active && start && !candidate) { end = point(e); render(); } });
  el("mesaGridEditCanvas").addEventListener("contextmenu", e => { if (active) { e.preventDefault(); e.stopPropagation(); reset(); } });
  window.addEventListener("blur", () => { if (active) reset(); });
  document.addEventListener("keydown", e => { if (active && e.key === "Escape") { e.preventDefault(); reset(); } });
  new ResizeObserver(render).observe(el("mesaStage"));
  return { reset, render };
})();
