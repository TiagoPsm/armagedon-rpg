/* Local light editor and mask composition. Drafts never modify scene visibility. */
const MesaLighting = (() => {
  const el = id => document.getElementById(id);
  let mode = "off", selected = null, gesture = null, scene = null, geometry = null, paintKey = '';
  const polygons = new Map();
  const lights = () => mesaVision?.lights || [];
  const current = () => lights().find(light => light.id === selected);
  const sceneId = () => state.sceneId || "default";
  function cancel() {
    const old = gesture; gesture = null; mode = "off"; selected = null;
    const c = el("mesaLightCanvas"); if (old && c.hasPointerCapture(old.pointerId)) c.releasePointerCapture(old.pointerId);
  }
  function begin(nextMode) {
    if (!isMaster() || !mesaVisionActive()) return;
    window.MesaSceneSettings?.cancel(); window.MesaTemplates?.cancel();
    const toggleOff = mode === nextMode; cancel(); MesaBarrierEditor.cancel(); window.MesaGridEditor?.reset();
    mesaVisionPreview = false; setInteractionMode("move"); window.setMesaFogBrush?.(null);
    mode = toggleOff ? "off" : nextMode; scene = sceneId(); requestMesaVisionRender();
  }
  function point(e) {
    const r = el("mesaStageInner").getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  }
  function down(e) {
    if (!isMaster() || mode === "off" || e.button !== 0 || mesaVisionBusy) return;
    e.preventDefault(); e.stopPropagation(); const p = point(e);
    if (mode === "create") {
      const id = crypto.randomUUID();
      if (MesaBarrierEditor.commit(v => { (v.lights ||= []).push({ id, ...p, radius: .12, intensity: 1 }); })) { selected = id; mode = "select"; }
    } else {
      const r = el("mesaStageInner").getBoundingClientRect();
      selected = lights().find(light => Math.hypot((p.x - light.x) * r.width, (p.y - light.y) * r.height) <= 12)?.id || null;
      if (selected) { gesture = { pointerId: e.pointerId, original: structuredClone(current()), preview: structuredClone(current()), snapshot: JSON.stringify(lights()), sceneId: sceneId() }; el("mesaLightCanvas").setPointerCapture(e.pointerId); }
    }
    requestMesaVisionRender();
  }
  function release(e) {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const old = gesture; gesture = null;
    if (el("mesaLightCanvas").hasPointerCapture(e.pointerId)) el("mesaLightCanvas").releasePointerCapture(e.pointerId);
    if (isMaster() && old.sceneId === sceneId() && old.snapshot === JSON.stringify(lights())) {
      const r = el("mesaStageInner").getBoundingClientRect();
      if (Math.hypot((old.preview.x - old.original.x) * r.width, (old.preview.y - old.original.y) * r.height) >= 3)
        MesaBarrierEditor.commit(v => Object.assign(v.lights.find(light => light.id === old.original.id), old.preview));
    }
    requestMesaVisionRender();
  }
  function scale() { return getMesaGridState().metersPerCell / (getMesaGridState().cellFrac * getMesaMapSurfaceFrac().width); }
  function update(field, event) {
    const light = current(); if (!light || !isMaster()) return;
    const value = event.target.value;
    const next = field === "radius" ? Number(value) / scale() : Number(value) / 100;
    const min = field === 'radius' ? .001 : .05, max = field === 'radius' ? 4 : 1;
    if (value.trim() === '' || !Number.isFinite(next) || next < min || next > max) {
      mesaVisionNotice('Valor inválido. O ajuste anterior da luz foi mantido.');
    } else {
      const displayed = field === 'radius' ? +(light.radius * scale()).toFixed(2) : Math.round(light.intensity * 100);
      if (Number(value) !== displayed && Math.abs(next - light[field]) > 1e-9)
        MesaBarrierEditor.commit(v => { v.lights.find(l => l.id === light.id)[field] = next; });
    }
    const saved = current();
    event.target.value = saved ? (field === 'radius' ? +(saved.radius * scale()).toFixed(2) : Math.round(saved.intensity * 100)) : '';
    requestMesaVisionRender();
  }
  function polygon(light) {
    if (geometry !== mesaVisionGeometry) { geometry = mesaVisionGeometry; polygons.clear(); }
    const key = `${light.id}:${light.x}:${light.y}`;
    if (!polygons.has(key)) {
      if (polygons.size >= 128) polygons.clear();
      polygons.set(key, geometry.polygon({ x: light.x, y: light.y * mesaVision.aspect }, 0, 360));
    }
    return polygons.get(key);
  }
  function isLit(target) {
    if (!mesaVision?.darkness) return true;
    if (!mesaVisionGeometry) return false;
    let opacity = 1;
    for (const light of lights()) {
      const origin = { x: light.x, y: light.y * mesaVision.aspect }, distance = Math.hypot(origin.x - target.x, origin.y - target.y);
      if (distance < light.radius && mesaVisionGeometry.canSee(origin, target, 0, 360)) opacity *= 1 - light.intensity * (1 - distance / light.radius);
    }
    return opacity < .98;
  }
  function paint(ctx, cone, w, h) {
    const path = points => { ctx.beginPath(); points.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * w, p.y / mesaVision.aspect * h)); ctx.closePath(); };
    ctx.save(); path(cone); ctx.clip();
    for (const light of lights()) {
      const contour = polygon(light); if (contour.length < 3) continue;
      ctx.save(); path(contour); ctx.clip();
      const x = light.x * w, y = light.y * h, radius = light.radius * w;
      ctx.translate(x, y); ctx.scale(1, h / (w * mesaVision.aspect));
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${light.intensity})`); gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient; ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.restore();
    }
    ctx.restore();
  }
  function render() {
    if (mode !== "off" && (!isMaster() || !mesaVisionActive() || scene !== sceneId() || el("mesaMapTransform").hidden || mesaVisionMode !== "off" ||
        (gesture && gesture.snapshot !== JSON.stringify(lights())))) cancel();
    if (!current()) selected = null;
    const light = current(); el("mesaLightCreate").disabled = el("mesaLightSelect").disabled = !mesaVisionActive() || mesaVisionBusy;
    el("mesaLightCreate").setAttribute("aria-pressed", String(mode === "create")); el("mesaLightSelect").setAttribute("aria-pressed", String(mode === "select"));
    el("mesaLightProperties").hidden = !light || mode === "off";
    el("mesaLightHint").textContent = mode === "create" ? "Clique no mapa para colocar uma luz. Escape cancela." : mode === "select" ? "Arraste o centro de uma luz para mover. Escape cancela." : `${lights().length} ${lights().length === 1 ? "luz" : "luzes"}. Revelam somente dentro do cone individual quando a escuridão está ativa.`;
    if (light && document.activeElement !== el("mesaLightRadius")) el("mesaLightRadius").value = Number((light.radius * scale()).toFixed(2));
    if (light && document.activeElement !== el("mesaLightIntensity")) el("mesaLightIntensity").value = Math.round(light.intensity * 100);
    const c = el("mesaLightCanvas"); c.hidden = !isMaster() || mode === "off";
    if (c.hidden) { if (c.width !== 1 || c.height !== 1) c.width = c.height = 1; paintKey = ''; return; }
    const s = el("mesaStage"), v = mesaCanvasViewport(c, s), w = s.clientWidth * v.density, h = s.clientHeight * v.density, zoom = getStageZoom();
    const key = JSON.stringify([v.key, lights(), selected, gesture?.preview]);
    if (key === paintKey) return; paintKey = key;
    const ctx = c.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.setTransform(1, 0, 0, 1, -v.left * v.density, -v.top * v.density);
    for (const saved of lights()) {
      const l = gesture?.preview.id === saved.id ? gesture.preview : saved;
      ctx.strokeStyle = l.id === selected ? "#fff" : "#e2ba69"; ctx.lineWidth = 1.5 * v.density / zoom;
      if (l.id === selected) { ctx.setLineDash([4 * v.density / zoom, 4 * v.density / zoom]); ctx.beginPath(); ctx.arc(l.x * w, l.y * h, l.radius * w, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]); ctx.fillStyle = "#141012"; ctx.beginPath(); ctx.arc(l.x * w, l.y * h, 6 * v.density / zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(l.x * w - 3 * v.density / zoom, l.y * h); ctx.lineTo(l.x * w + 3 * v.density / zoom, l.y * h); ctx.moveTo(l.x * w, l.y * h - 3 * v.density / zoom); ctx.lineTo(l.x * w, l.y * h + 3 * v.density / zoom); ctx.stroke();
    }
  }
  function init() {
    for (const [id, fn] of [["mesaLightCreate", () => begin("create")], ["mesaLightSelect", () => begin("select")], ["mesaLightRemove", () => {
      if (current()) MesaBarrierEditor.commit(v => { v.lights = v.lights.filter(l => l.id !== selected); }); selected = null; requestMesaVisionRender();
    }]]) { el(id).dataset.armed = "1"; el(id).addEventListener("click", fn); }
    for (const [id, field] of [["mesaLightRadius", "radius"], ["mesaLightIntensity", "intensity"]]) { el(id).dataset.armed = '1'; el(id).addEventListener("change", e => update(field, e)); }
    el("mesaLightCanvas").addEventListener("pointerdown", down);
    el("mesaLightCanvas").addEventListener("pointermove", e => { if (gesture?.pointerId === e.pointerId) { Object.assign(gesture.preview, point(e)); requestMesaVisionRender(); } });
    el("mesaLightCanvas").addEventListener("pointerup", release);
    for (const type of ["pointercancel", "lostpointercapture"]) el("mesaLightCanvas").addEventListener(type, () => { if (gesture) { cancel(); requestMesaVisionRender(); } });
    el("mesaLightCanvas").addEventListener("contextmenu", e => { e.preventDefault(); cancel(); requestMesaVisionRender(); });
    window.addEventListener("blur", () => { if (gesture) { cancel(); requestMesaVisionRender(); } });
    document.addEventListener("keydown", e => { if (mode !== "off" && e.key === "Escape" && !e.target.closest("input,textarea,select")) { e.preventDefault(); cancel(); requestMesaVisionRender(); } });
  }
  return { init, render, cancel, isLit, paint };
})();
