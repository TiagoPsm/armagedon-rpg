/* Measured areas reuse drawings, scale and authorship; drafts and history are local. */
window.MesaTemplates = (() => {
  const el = id => document.getElementById(id), clone = v => v ? JSON.parse(JSON.stringify(v)) : null;
  let mode = null, selected = null, gesture = null, scene = null, paintKey = '';
  const undoStack = [], redoStack = [];
  const list = () => getDrawingsSnapshot().filter(s => s.template);
  const current = () => list().find(s => s.id === selected);
  const allowed = s => !!s && _canEraseStroke(s);
  function abort() {
    const old = gesture; gesture = null;
    const c = el('mesaTemplateCanvas');
    if (old && c.hasPointerCapture(old.pointerId)) c.releasePointerCapture(old.pointerId);
  }
  function cancel() { abort(); mode = null; selected = null; requestMesaVisionRender(); }
  function begin(next) {
    window.MesaSceneSettings?.cancel();
    const toggle = mode === next; cancel(); MesaBarrierEditor.cancel(); MesaLighting.cancel(); MesaGridEditor.reset();
    setDrawTool(null); clearMesaInteractionMode(); window.setMesaFogBrush?.(null);
    mode = toggle ? null : next; scene = state.sceneId; render();
  }
  function point(e) {
    const r = el('mesaStageInner').getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  }
  function metersPerWidth() {
    const g = getMesaGridState(), s = getMesaMapSurfaceFrac();
    return g.metersPerCell / (g.cellFrac * s.width);
  }
  function make(t) {
    const stage = el('mesaStageInner'), pts = MesaTemplateRules.outline(t, stage.offsetWidth, stage.offsetHeight);
    return { id: 'draft', tool: t.kind, color: '#e7c366', width: 2, layer: 'tokens', author: _drawAuthorKey(), points: null, template: t,
      x1: clamp(Math.min(...pts.map(p => p.x)) / stage.offsetWidth, 0, 1), y1: clamp(Math.min(...pts.map(p => p.y)) / stage.offsetHeight, 0, 1),
      x2: clamp(Math.max(...pts.map(p => p.x)) / stage.offsetWidth, 0, 1), y2: clamp(Math.max(...pts.map(p => p.y)) / stage.offsetHeight, 0, 1) };
  }
  function commit(next, before = null) {
    const result = changeMesaMeasuredDrawing(next, before);
    if (result === false) { window.UI?.toast?.('O molde mudou ou não pode ser editado.', 'Mesa', 'error'); render(); return false; }
    undoStack.push({ current: clone(result), target: clone(before) }); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0;
    selected = result?.id || null; render(); return true;
  }
  function history(redo = false) {
    abort(); const source = redo ? redoStack : undoStack, target = redo ? undoStack : redoStack, action = source.pop(); if (!action) return;
    const result = changeMesaMeasuredDrawing(action.target, action.current);
    if (result === false) { source.push(action); return; }
    target.push({ current: clone(result), target: clone(action.current) }); selected = result?.id || null; render();
  }
  function updateField(event, field) {
    const s = current(), n = Number(event.target.value), dimensional = ['length', 'width'].includes(field);
    const next = s && event.target.value.trim() !== '' && Number.isFinite(n)
      ? MesaTemplateRules.normalize({ ...s.template, [field]: n / (dimensional ? metersPerWidth() : 1) }) : null;
    if (next && allowed(s)) {
      // A formatting-only confirmation (6 -> 6.0 or 0 -> 360 degrees) must
      // not send a replacement or consume an undo step.
      const displayed = +(s.template[field] * (dimensional ? metersPerWidth() : 1)).toFixed(field === 'length' ? 2 : 1);
      const changed = n !== displayed && Math.abs(next[field] - s.template[field]) > 1e-9;
      if (changed) commit({ ...s, template: next }, s);
    } else if (s) window.UI?.toast?.('Medida inválida. O valor anterior foi mantido.', 'Mesa', 'error');
    const saved = current();
    // Enter confirms change without blurring. render() intentionally skips the
    // focused input while typing, so synchronize this confirmed field here.
    event.target.value = saved ? +(saved.template[field] * (dimensional ? metersPerWidth() : 1)).toFixed(field === 'length' ? 2 : 1) : '';
    render();
  }
  function handle(t, w, h) {
    const a = (t.direction || 0) * Math.PI / 180, dx = t.length * w * (t.kind === 'rect' ? .5 : 1), dy = t.kind === 'rect' ? t.width * w / 2 : 0;
    return { x: t.x * w + Math.cos(a) * dx - Math.sin(a) * dy, y: t.y * h + Math.sin(a) * dx + Math.cos(a) * dy };
  }
  function down(e) {
    if (!mode || e.button !== 0 || !e.isPrimary || gesture) return;
    e.preventDefault(); e.stopPropagation(); const p = point(e), stage = el('mesaStageInner'), w = stage.offsetWidth, h = stage.offsetHeight, zoom = stage.getBoundingClientRect().width / w;
    let before = current(), type = 'move';
    if (['circle', 'cone', 'rect', 'line'].includes(mode)) { before = null; type = 'size'; }
    else {
      const handlePoint = before && handle(before.template, w, h);
      if (handlePoint && Math.hypot(p.x * w - handlePoint.x, p.y * h - handlePoint.y) * zoom <= 10) type = 'size';
      else {
        before = list().filter(allowed).reverse().find(s => {
          return MesaTemplateRules.contains(s.template, p.x * w, p.y * h, w, h);
        }); selected = before?.id || null;
        if (!before) { render(); return; }
      }
    }
    const template = before ? clone(before.template) : { kind: mode, x: p.x, y: p.y, length: .0001, ...(mode === 'cone' ? { direction: 0, aperture: 90 } : mode === 'rect' ? { direction: 0, width: .0001 } : mode === 'line' ? { direction: 0, width: getMesaGridState().cellFrac * getMesaMapSurfaceFrac().width } : {}) };
    gesture = { type, before: clone(before), next: template, start: p, pointerId: e.pointerId, scene: state.sceneId, clientX: e.clientX, clientY: e.clientY };
    el('mesaTemplateCanvas').setPointerCapture(e.pointerId); render();
  }
  function move(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const p = point(e), stage = el('mesaStageInner'), g = gesture;
    if (g.type === 'move') { g.next.x = clamp(g.before.template.x + p.x - g.start.x, 0, 1); g.next.y = clamp(g.before.template.y + p.y - g.start.y, 0, 1); }
    else {
      const dx = (p.x - g.next.x) * stage.offsetWidth, dy = (p.y - g.next.y) * stage.offsetHeight;
      if (g.next.kind === 'rect') {
        const a = g.next.direction * Math.PI / 180;
        g.next.length = clamp(2 * Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) / stage.offsetWidth, .0001, 4);
        g.next.width = clamp(2 * Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) / stage.offsetWidth, .0001, 4);
      } else {
        g.next.length = clamp(Math.hypot(dx, dy) / stage.offsetWidth, .0001, 4);
        if (g.next.kind !== 'circle') g.next.direction = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      }
    }
    render();
  }
  function up(e) {
    if (!gesture || e.pointerId !== gesture.pointerId || e.button !== 0) return;
    move(e); const g = gesture; abort();
    if (g.scene !== state.sceneId || Math.hypot(e.clientX - g.clientX, e.clientY - g.clientY) < 3) { render(); return; }
    const stroke = { ...make(g.next), ...(g.before ? { author: g.before.author, color: g.before.color } : {}) };
    if (commit(stroke, g.before)) mode = 'edit'; render();
  }
  function render() {
    const c = el('mesaTemplateCanvas'); if (!c || typeof getDrawingsSnapshot !== 'function') return;
    if (scene !== state.sceneId) { abort(); mode = null; selected = null; undoStack.length = redoStack.length = 0; scene = state.sceneId; }
    if (mode && (mesaVisionMode !== 'off' || _activeTool || window._mesaInteractionMode)) { abort(); mode = null; selected = null; }
    if (gesture?.before && (JSON.stringify(current()) !== JSON.stringify(gesture.before) || !allowed(current()))) abort();
    if (current() && !allowed(current())) selected = null;
    const items = list(), s = current();
    c.hidden = !items.length && !mode; c.dataset.active = String(!!mode); c.dataset.mode = mode || ''; c.dataset.count = String(items.length);
    c.dataset.gesture = gesture?.type || '';
    const view = c.hidden ? null : mesaCanvasViewport(c, el('mesaStageInner'));
    if (c.hidden) { if (c.width !== 1 || c.height !== 1) c.width = c.height = 1; paintKey = ''; }
    const ctx = c.getContext('2d'), stage = el('mesaStageInner'), w = stage.offsetWidth, h = stage.offsetHeight, zoom = stage.getBoundingClientRect().width / w;
    const key = view && JSON.stringify([view.key, mode, selected, items, gesture?.next, gesture?.before?.id, metersPerWidth()]);
    if (view && key !== paintKey) {
      paintKey = key; c.dataset.paintCount = String(Number(c.dataset.paintCount || 0) + 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(view.density, 0, 0, view.density, -view.left * view.density, -view.top * view.density);
      const visible = items.filter(item => item.id !== gesture?.before?.id);
      if (gesture) visible.push(make(gesture.next));
      for (const item of visible) {
        const t = item.template, pts = MesaTemplateRules.outline(t, w, h); ctx.beginPath();
        if (t.kind === 'circle') ctx.arc(t.x * w, t.y * h, t.length * w, 0, Math.PI * 2);
        else if (t.kind === 'cone') { ctx.moveTo(t.x * w, t.y * h); ctx.arc(t.x * w, t.y * h, t.length * w, (t.direction - t.aperture / 2) * Math.PI / 180, (t.direction + t.aperture / 2) * Math.PI / 180); }
        else pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = '#e7c36624'; ctx.strokeStyle = item.color; ctx.lineWidth = (item.id === selected || item.id === 'draft' ? 2 : 1.5) / zoom; ctx.fill(); ctx.stroke();
        ctx.font = `${11 / zoom}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const fmt = n => (n * metersPerWidth()).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        const label = `${fmt(t.length)}${['rect', 'line'].includes(t.kind) ? ` × ${fmt(t.width)}` : ''} m`, x = t.x * w, y = t.y * h;
        const tw = ctx.measureText(label).width; ctx.fillStyle = '#100b0deb'; ctx.fillRect(x - tw / 2 - 4 / zoom, y - 9 / zoom, tw + 8 / zoom, 18 / zoom); ctx.fillStyle = '#f4e8c4'; ctx.fillText(label, x, y);
        if (mode && (item.id === selected || item.id === 'draft')) {
          const hp = handle(t, w, h); ctx.beginPath(); ctx.arc(hp.x, hp.y, 4 / zoom, 0, Math.PI * 2); ctx.fillStyle = '#101013'; ctx.fill(); ctx.strokeStyle = '#fff3c7'; ctx.stroke();
        }
      }
    }
    for (const kind of ['circle', 'cone', 'rect', 'line', 'edit']) el(`mesaTemplate${kind[0].toUpperCase() + kind.slice(1)}`).setAttribute('aria-pressed', String(mode === kind));
    el('mesaTemplateProperties').hidden = !s || !mode;
    if (document.activeElement !== el('mesaTemplateLength')) el('mesaTemplateLength').value = s ? +(s.template.length * metersPerWidth()).toFixed(2) : '';
    el('mesaTemplateLengthLabel').textContent = s?.template.kind === 'cone' ? 'Alcance (m)' : s?.template.kind === 'rect' ? 'Largura (m)' : s?.template.kind === 'line' ? 'Comprimento (m)' : 'Raio (m)';
    el('mesaTemplateWidthLabel').textContent = s?.template.kind === 'line' ? 'Largura (m)' : 'Altura (m)';
    el('mesaTemplateDirectionRow').hidden = !s || s.template.kind === 'circle'; el('mesaTemplateApertureRow').hidden = s?.template.kind !== 'cone'; el('mesaTemplateWidthRow').hidden = !['rect', 'line'].includes(s?.template.kind);
    for (const [id, field] of [['mesaTemplateDirection', 'direction'], ['mesaTemplateAperture', 'aperture'], ['mesaTemplateWidth', 'width']]) if (document.activeElement !== el(id)) el(id).value = s?.template[field] == null ? '' : +(s.template[field] * (field === 'width' ? metersPerWidth() : 1)).toFixed(1);
    el('mesaTemplateUndo').disabled = !undoStack.length; el('mesaTemplateRedo').disabled = !redoStack.length;
    el('mesaTemplateHint').textContent = ['circle', 'cone', 'rect', 'line'].includes(mode) ? 'Arraste da origem até a borda. Escape cancela.' : mode === 'edit' ? 'Clique no molde; arraste o centro ou o ponto da borda.' : 'Áreas com medida; não aplicam dano ou selecionam alvos.';
  }
  function init() {
    const bind = (id, event, fn) => { const b = el(id); b.addEventListener(event, fn); b.dataset.armed = '1'; };
    bind('mesaTemplateCircle', 'click', () => begin('circle')); bind('mesaTemplateEdit', 'click', () => begin('edit'));
    bind('mesaTemplateCone', 'click', () => begin('cone'));
    bind('mesaTemplateRect', 'click', () => begin('rect'));
    bind('mesaTemplateLine', 'click', () => begin('line'));
    bind('mesaTemplateRemove', 'click', () => { if (current()) commit(null, current()); });
    bind('mesaTemplateUndo', 'click', () => history()); bind('mesaTemplateRedo', 'click', () => history(true));
    for (const [id, field] of [['mesaTemplateLength', 'length'], ['mesaTemplateDirection', 'direction'], ['mesaTemplateAperture', 'aperture'], ['mesaTemplateWidth', 'width']]) bind(id, 'change', e => updateField(e, field));
    const c = el('mesaTemplateCanvas'); c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    for (const event of ['pointercancel', 'lostpointercapture']) c.addEventListener(event, () => { abort(); render(); });
    c.addEventListener('contextmenu', e => { if (mode) { e.preventDefault(); cancel(); } });
    window.addEventListener('blur', () => { abort(); render(); });
    window.addEventListener('keydown', e => { if (!mode || e.target.closest('input,select,textarea,[contenteditable]')) return; if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
    new ResizeObserver(render).observe(el('mesaStageInner')); render();
  }
  document.addEventListener('DOMContentLoaded', init, { once: true });
  return { render, cancel, begin };
})();
