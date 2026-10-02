/* One editor state machine, independent from token gestures and scene transport. */
const MesaBarrierEditor = (() => {
  const draft = { points: [], cursor: null, undo: [], redo: [], recent: new Set(), selected: null, selection: new Set(), gesture: null, snap: null, action: null, clipboard: null };
  const tools = [["mesaVisionSelect", "select"], ["mesaVisionWall", "wall"], ["mesaVisionDoor", "door"], ["mesaVisionErase", "erase"]];
  let paint = null;
  const el = id => document.getElementById(id);
  const copy = value => structuredClone(value);
  function abortGesture() {
    const gesture = draft.gesture; draft.gesture = null; draft.snap = null;
    const canvas = el("mesaWallCanvas");
    if (gesture && canvas.hasPointerCapture(gesture.pointerId)) canvas.releasePointerCapture(gesture.pointerId);
  }
  function cancel() { abortGesture(); mesaVisionMode = "off"; draft.points = []; draft.cursor = null; draft.selected = null; draft.selection.clear(); draft.action = null; }
  function reset() { cancel(); draft.undo = []; draft.redo = []; draft.recent.clear(); }
  function commit(change) {
    if (!requireMesaMaster("vision.manage", "editar barreiras") || mesaVisionBusy) return false;
    const stage = el("mesaStage"), before = getMesaVisionPayload();
    const next = before || { schemaVersion: 1, enabled: false, aspect: stage.clientHeight / stage.clientWidth, coneDeg: 120, revision: 0, walls: [] };
    try {
      const candidate = copy(next); change(candidate);
      const normalized = MesaVisionRules.normalize(candidate);
      if (before && JSON.stringify(normalized) === JSON.stringify(before)) { requestMesaVisionRender(); return true; }
      const geometry = MesaVisionGeometry.prepare(normalized, normalized.aspect);
      draft.undo.push(before); if (draft.undo.length > 30) draft.undo.shift(); draft.redo = [];
      const oldIds = new Map(next.walls.map(w => [w.id, JSON.stringify(w)]));
      draft.recent = new Set(normalized.walls.filter(w => oldIds.get(w.id) !== JSON.stringify(w)).map(w => w.id));
      mesaVision = normalized; mesaVisionGeometry = geometry;
      if (normalized.enabled && !before?.enabled) state.tokens.forEach(t => { t.visionRadius = Math.max(.0001, Math.min(.45, 44 * (t.tokenScale || 1) / stage.clientWidth)); });
      if (!normalized.enabled) MesaFacingDot.reset();
      bumpMesaSceneVersion(); persistState({ immediate: true }); requestMesaVisionRender(); return true;
    } catch (error) { mesaVisionNotice(error.message); requestMesaVisionRender(); return false; }
  }
  function undo(redo = false) {
    abortGesture();
    if (!requireMesaMaster("vision.manage", "desfazer barreira") || mesaVisionBusy) return;
    const from = redo ? draft.redo : draft.undo, to = redo ? draft.undo : draft.redo;
    if (!from.length) return;
    to.push(getMesaVisionPayload());
    const next = from.pop() || { ...mesaVision, enabled: false, walls: [] };
    next.revision = mesaVision?.revision || 0;
    mesaVision = next; mesaVisionGeometry = MesaVisionGeometry.prepare(next, next.aspect);
    draft.points = []; draft.cursor = null; draft.recent.clear();
    draft.selected = null;
    draft.selection.clear();
    draft.action = null;
    if (!next.enabled) MesaFacingDot.reset();
    bumpMesaSceneVersion(); persistState({ immediate: true }); requestMesaVisionRender();
  }
  function tool(mode) {
    if (!requireMesaMaster("vision.manage", "editar barreiras")) return;
    window.MesaSceneSettings?.cancel(); window.MesaTemplates?.cancel();
    cancel(); mesaVisionPreview = false; mesaVisionMode = mode;
    setInteractionMode("move"); window.setMesaFogBrush?.(null); requestMesaVisionRender();
  }
  function segment(a, b, kind = "wall") { return { id: crypto.randomUUID(), ax: a.x, ay: a.y, bx: b.x, by: b.y, kind, doorState: kind === "door" ? "closed" : null }; }
  function project(p, w, rect) {
    const dx = (w.bx - w.ax) * rect.width, dy = (w.by - w.ay) * rect.height;
    const t = Math.max(0, Math.min(1, ((p.x - w.ax) * rect.width * dx + (p.y - w.ay) * rect.height * dy) / (dx * dx + dy * dy)));
    const x = w.ax + t * (w.bx - w.ax), y = w.ay + t * (w.by - w.ay);
    return { x, y, t, wallId: w.id, distance: Math.hypot((x - p.x) * rect.width, (y - p.y) * rect.height) };
  }
  function nearest(p, rect, filter = () => true) {
    return (mesaVision?.walls || []).filter(filter).map(w => ({ w, p: project(p, w, rect) })).filter(hit => hit.p.distance < 12).sort((a, b) => a.p.distance - b.p.distance)[0];
  }
  function point(event) {
    const rect = el("mesaStageInner").getBoundingClientRect();
    const p = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    if (mesaVisionMode === "door") {
      const start = draft.points[0];
      const hit = nearest(p, rect, w => w.kind === "wall" && (!start?.wallId || w.id === start.wallId));
      if (hit) return hit.p;
    }
    draft.snap = null;
    if (!event.altKey && (mesaVisionMode === "wall" || draft.gesture?.vertex) && el("mesaBarrierSnap").checked) {
      let distance = 10;
      const moving = draft.gesture?.vertex;
      for (const wall of mesaVision?.walls || []) for (const key of ["a", "b"]) {
        const target = { x: wall[key + "x"], y: wall[key + "y"] };
        if (moving && Math.hypot(target.x - moving.x, target.y - moving.y) < 1e-9) continue;
        const d = Math.hypot((target.x - p.x) * rect.width, (target.y - p.y) * rect.height);
        if (d < distance) { distance = d; draft.snap = target; }
      }
      if (draft.snap) return draft.snap;
    }
    return p;
  }
  function endpoint(p, wall, rect) {
    if (!wall) return null;
    const distances = ["a", "b"].map(key => ({ key, distance: Math.hypot((p.x - wall[key + "x"]) * rect.width, (p.y - wall[key + "y"]) * rect.height) }));
    const hit = distances.sort((a, b) => a.distance - b.distance)[0];
    return hit.distance <= 10 ? hit.key : null;
  }
  function move(event) {
    if (mesaVisionMode === "off") return;
    const p = point(event); draft.cursor = p;
    const gesture = draft.gesture;
    if (gesture && event.pointerId === gesture.pointerId) {
      if (gesture.kind === "box") { gesture.end = p; requestMesaVisionRender(); return; }
      if (gesture.kind === "translate") {
        const { bounds, start } = gesture;
        const dx = Math.max(-bounds.left, Math.min(1 - bounds.right, p.x - start.x));
        const dy = Math.max(-bounds.top, Math.min(1 - bounds.bottom, p.y - start.y));
        gesture.previews = gesture.originals.map(w => ({ ...w, ax: w.ax + dx, bx: w.bx + dx, ay: w.ay + dy, by: w.by + dy }));
        gesture.preview = gesture.previews.find(w => w.id === gesture.before.id);
        requestMesaVisionRender(); return;
      }
      gesture.previews = gesture.originals.map(w => {
        const next = { ...w };
        for (const key of ["a", "b"]) if (Math.hypot(w[key + "x"] - gesture.vertex.x, w[key + "y"] - gesture.vertex.y) < 1e-9) {
          next[key + "x"] = p.x; next[key + "y"] = p.y;
        }
        return next;
      });
      gesture.preview = gesture.previews.find(w => w.id === gesture.before.id);
    }
    requestMesaVisionRender();
  }
  function release(event) {
    const gesture = draft.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); move(event);
    if (gesture.kind === "box") {
      const bounds = { left: Math.min(gesture.start.x, gesture.end.x), right: Math.max(gesture.start.x, gesture.end.x), top: Math.min(gesture.start.y, gesture.end.y), bottom: Math.max(gesture.start.y, gesture.end.y) };
      for (const wall of mesaVision?.walls || []) if (intersectsBox(wall, bounds)) draft.selection.add(wall.id);
      draft.selected = [...draft.selection][0] || null;
      abortGesture(); requestMesaVisionRender(); return;
    }
    const current = mesaVision?.walls.find(w => w.id === gesture.before.id), preview = gesture.preview;
    abortGesture();
    const rect = el("mesaStageInner").getBoundingClientRect();
    const valid = gesture.originals.every(w => JSON.stringify(mesaVision?.walls.find(current => current.id === w.id)) === JSON.stringify(w));
    if (gesture.endpoint && Math.hypot((preview[gesture.endpoint + "x"] - gesture.before[gesture.endpoint + "x"]) * rect.width, (preview[gesture.endpoint + "y"] - gesture.before[gesture.endpoint + "y"]) * rect.height) < .25) { requestMesaVisionRender(); return; }
    if (gesture.kind === "translate" && Math.hypot((preview.ax - gesture.before.ax) * rect.width, (preview.ay - gesture.before.ay) * rect.height) < 3) { requestMesaVisionRender(); return; }
    if (isMaster() && mesaVisionMode === "select" && gesture.sceneId === state.sceneId && valid && JSON.stringify(preview) !== JSON.stringify(current)) {
      if (gesture.previews.some(w => Math.hypot((w.bx - w.ax) * rect.width, (w.by - w.ay) * rect.height) < 4)) mesaVisionNotice("Mantenha um comprimento mínimo para os trechos ligados.");
      else commit(v => { for (const w of gesture.previews) Object.assign(v.walls.find(saved => saved.id === w.id), w); });
    }
    requestMesaVisionRender();
  }
  function door(a, b) {
    return commit(v => {
      const wall = v.walls.find(w => w.id === a.wallId);
      if (!wall) { if (b.wallId) throw new Error("Comece e termine na mesma parede, ou num vão livre."); v.walls.push(segment(a, b, "door")); return; }
      if (b.wallId !== wall.id) throw new Error("Marque o fim da porta na mesma parede.");
      const [start, end] = a.t < b.t ? [a, b] : [b, a];
      const pieces = [];
      if (start.t > 1e-5) pieces.push(segment({ x: wall.ax, y: wall.ay }, start));
      pieces.push(segment(start, end, "door"));
      if (end.t < 1 - 1e-5) pieces.push(segment(end, { x: wall.bx, y: wall.by }));
      v.walls.splice(v.walls.indexOf(wall), 1, ...pieces);
    });
  }
  function split(p, rect) {
    const wall = mesaVision?.walls.find(w => w.id === draft.selected);
    if (!wall || wall.kind !== "wall") return;
    const hit = project(p, wall, rect);
    if (hit.distance >= 12) return;
    if (Math.min(hit.t, 1 - hit.t) * Math.hypot((wall.bx - wall.ax) * rect.width, (wall.by - wall.ay) * rect.height) < 4) {
      mesaVisionNotice("Divida longe das extremidades."); return;
    }
    if (commit(v => { const i = v.walls.findIndex(w => w.id === wall.id); v.walls.splice(i, 1, segment({ x: wall.ax, y: wall.ay }, hit), segment(hit, { x: wall.bx, y: wall.by })); })) {
      draft.action = null; draft.selected = null;
    }
  }
  function join(p, rect) {
    const first = mesaVision?.walls.find(w => w.id === draft.selected), second = nearest(p, rect, w => w.id !== first?.id)?.w;
    if (!first || !second) return;
    const eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
    const ends = w => [{ x: w.ax, y: w.ay }, { x: w.bx, y: w.by }];
    const a = ends(first), b = ends(second);
    const shared = a.flatMap((p, i) => b.map((q, j) => ({ p, i, j, same: eq(p, q) }))).find(pair => pair.same);
    const from = shared && a[1 - shared.i], to = shared && b[1 - shared.j];
    const dx = from && from.x - shared.p.x, dy = from && from.y - shared.p.y;
    const ex = to && to.x - shared.p.x, ey = to && to.y - shared.p.y;
    if (!shared || first.kind !== second.kind || first.doorState !== second.doorState || Math.abs(dx * ey - dy * ex) > 1e-9 || dx * ex + dy * ey >= 0) {
      mesaVisionNotice("Escolha trechos contíguos, alinhados e com as mesmas propriedades."); return;
    }
    const merged = { ...segment(from, to, first.kind), doorState: first.doorState };
    if (commit(v => { v.walls = v.walls.filter(w => ![first.id, second.id].includes(w.id)); v.walls.push(merged); })) {
      draft.selected = merged.id; draft.selection = new Set([merged.id]); draft.action = null;
    }
  }
  function doorState(value) {
    const selected = mesaVision?.walls.find(w => w.id === draft.selected);
    if (!selected || selected.kind !== "door" || !["open", "closed", "locked"].includes(value) || selected.doorState === value) return;
    commit(v => {
      const door = v.walls.find(w => w.id === selected.id); door.doorState = value;
      if (value !== "open") {
        const geometry = MesaVisionGeometry.prepare({ walls: [door] }, v.aspect);
        if (state.tokens.some(t => { const p = MesaVisionRules.center(t, v); return geometry.sweep(p, p, MesaVisionRules.radius(t)).blocked; })) throw new Error("Há um token no vão. Mova-o antes de fechar ou trancar.");
      }
    });
    requestMesaVisionRender();
  }
  function intersectsBox(wall, b) {
    let low = 0, high = 1;
    for (const [start, delta, min, max] of [[wall.ax, wall.bx - wall.ax, b.left, b.right], [wall.ay, wall.by - wall.ay, b.top, b.bottom]]) {
      if (Math.abs(delta) < 1e-12) { if (start < min || start > max) return false; }
      else { const a = (min - start) / delta, c = (max - start) / delta; low = Math.max(low, Math.min(a, c)); high = Math.min(high, Math.max(a, c)); }
    }
    return low <= high;
  }
  function copySelection() {
    const walls = mesaVision?.walls.filter(w => draft.selection.has(w.id));
    if (!walls?.length || !isMaster()) return;
    draft.clipboard = { walls: copy(walls), aspect: mesaVision.aspect };
    mesaVisionNotice(`${walls.length} ${walls.length === 1 ? "trecho copiado" : "trechos copiados"}.`); requestMesaVisionRender();
  }
  function pastePreview(p) {
    if (!draft.clipboard || !p) return [];
    const ratio = draft.clipboard.aspect / (mesaVision?.aspect || el("mesaStage").clientHeight / el("mesaStage").clientWidth);
    const walls = draft.clipboard.walls.map(w => ({ ...w, ay: w.ay * ratio, by: w.by * ratio }));
    const xs = walls.flatMap(w => [w.ax, w.bx]), ys = walls.flatMap(w => [w.ay, w.by]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (right - left > 1 || bottom - top > 1) return [];
    const dx = Math.max(-left, Math.min(1 - right, p.x - (left + right) / 2));
    const dy = Math.max(-top, Math.min(1 - bottom, p.y - (top + bottom) / 2));
    return walls.map(w => ({ ...w, ax: w.ax + dx, bx: w.bx + dx, ay: w.ay + dy, by: w.by + dy }));
  }
  function armPaste() {
    if (!draft.clipboard || !isMaster()) return;
    abortGesture(); draft.action = "paste"; draft.cursor = { x: .5, y: .5 };
    if (!pastePreview(draft.cursor).length) { draft.action = null; mesaVisionNotice("A estrutura não cabe nesta cena sem redimensionar."); }
    requestMesaVisionRender();
  }
  function finish(closed = false) {
    if (mesaVisionMode === "wall" && el("mesaBarrierShape").value === "polygon" && draft.points.length > 1) {
      const points = [...draft.points];
      if (closed && points.length < 3) return;
      if (closed) {
        const twiceArea = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
        if (Math.abs(twiceArea) < 1e-8) { mesaVisionNotice("Marque pontos que formem uma área para fechar o polígono."); return; }
      }
      if (closed) points.push(points[0]);
      if (!commit(v => points.slice(1).forEach((p, i) => v.walls.push(segment(points[i], p))))) return;
    }
    cancel(); requestMesaVisionRender();
  }
  function click(event) {
    if (!isMaster() || mesaVisionMode === "off" || event.button !== 0 || mesaVisionBusy) return;
    event.preventDefault(); event.stopPropagation();
    const p = point(event), rect = el("mesaStageInner").getBoundingClientRect();
    if (mesaVisionMode === "select") {
      if (draft.action === "paste") {
        const walls = pastePreview(p).map(w => ({ ...w, id: crypto.randomUUID() }));
        if (walls.length && commit(v => v.walls.push(...walls))) { draft.selection = new Set(walls.map(w => w.id)); draft.selected = walls[0].id; draft.action = null; }
        requestMesaVisionRender(); return;
      }
      if (draft.action === "split") { split(p, rect); requestMesaVisionRender(); return; }
      if (draft.action === "join") { join(p, rect); requestMesaVisionRender(); return; }
      const selected = mesaVision?.walls.find(w => w.id === draft.selected), end = !event.shiftKey && draft.selection.size === 1 && endpoint(p, selected, rect);
      if (end) {
        const vertex = { x: selected[end + "x"], y: selected[end + "y"] };
        const originals = copy(mesaVision.walls.filter(w => ["a", "b"].some(key => Math.hypot(w[key + "x"] - vertex.x, w[key + "y"] - vertex.y) < 1e-9)));
        draft.gesture = { pointerId: event.pointerId, endpoint: end, vertex, originals, previews: copy(originals), before: copy(selected), preview: copy(selected), sceneId: state.sceneId };
        el("mesaWallCanvas").setPointerCapture(event.pointerId);
        requestMesaVisionRender(); return;
      }
      const hit = nearest(p, rect)?.w;
      if (hit) {
        if (!event.shiftKey && draft.selection.has(hit.id)) {
          const originals = copy(mesaVision.walls.filter(w => draft.selection.has(w.id)));
          const xs = originals.flatMap(w => [w.ax, w.bx]), ys = originals.flatMap(w => [w.ay, w.by]);
          draft.gesture = { kind: "translate", start: p, pointerId: event.pointerId, originals, previews: copy(originals), before: copy(hit), preview: copy(hit), sceneId: state.sceneId,
            bounds: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } };
          el("mesaWallCanvas").setPointerCapture(event.pointerId); requestMesaVisionRender(); return;
        }
        if (event.shiftKey) { if (draft.selection.has(hit.id)) draft.selection.delete(hit.id); else draft.selection.add(hit.id); }
        else draft.selection = new Set([hit.id]);
        draft.selected = draft.selection.has(hit.id) ? hit.id : [...draft.selection][0] || null;
      } else {
        if (!event.shiftKey) { draft.selection.clear(); draft.selected = null; }
        draft.gesture = { kind: "box", pointerId: event.pointerId, start: p, end: p };
        el("mesaWallCanvas").setPointerCapture(event.pointerId);
      }
      requestMesaVisionRender(); return;
    }
    if (mesaVisionMode === "erase") {
      const hit = nearest(p, rect); if (hit) commit(v => { v.walls = v.walls.filter(w => w.id !== hit.w.id); }); return;
    }
    const shape = el("mesaBarrierShape").value;
    const previous = draft.points.at(-1);
    if (previous && Math.hypot((p.x - previous.x) * rect.width, (p.y - previous.y) * rect.height) < 4) return;
    if (mesaVisionMode === "wall" && shape === "polygon") {
      const first = draft.points[0];
      if (draft.points.length > 2 && Math.hypot((p.x - first.x) * rect.width, (p.y - first.y) * rect.height) < 10) finish(true);
      else draft.points.push(p);
    } else if (!previous) draft.points.push(p);
    else {
      let saved = false;
      if (mesaVisionMode === "door") saved = door(previous, p);
      else if (shape === "rect") {
        if (Math.min(Math.abs(p.x - previous.x) * rect.width, Math.abs(p.y - previous.y) * rect.height) < 4) return;
        const points = [previous, { x: p.x, y: previous.y }, p, { x: previous.x, y: p.y }];
        saved = commit(v => points.forEach((q, i) => v.walls.push(segment(q, points[(i + 1) % 4]))));
      } else saved = commit(v => v.walls.push(segment(previous, p)));
      if (saved) draft.points = mesaVisionMode === "wall" && shape === "chain" ? [p] : [];
    }
    draft.cursor = null; requestMesaVisionRender();
  }
  function render() {
    const canvas = el("mesaWallCanvas"), stage = el("mesaStage");
    if (!isMaster()) abortGesture();
    draft.selection = new Set([...draft.selection].filter(id => isMaster() && mesaVisionMode === "select" && mesaVision?.walls.some(w => w.id === id)));
    if (!draft.selection.has(draft.selected)) draft.selected = [...draft.selection][0] || null;
    const selected = isMaster() && mesaVisionMode === "select" && (draft.gesture?.preview || mesaVision?.walls.find(w => w.id === draft.selected));
    if (!selected) draft.selected = null;
    canvas.dataset.selectedWall = selected?.id || "";
    canvas.dataset.mode = mesaVisionMode;
    canvas.dataset.editing = String(!!draft.gesture);
    canvas.dataset.selectedCount = String(draft.selection.size);
    canvas.dataset.snapped = String(!!draft.snap);
    const rect = el("mesaStageInner").getBoundingClientRect();
    canvas.style.cursor = draft.gesture ? draft.gesture.kind === "box" ? "crosshair" : "grabbing" : mesaVisionMode === "select" ? endpoint(draft.cursor || {}, selected, rect) || nearest(draft.cursor || {}, rect, w => draft.selection.has(w.id)) ? "grab" : "default" : "crosshair";
    canvas.hidden = !isMaster() || mesaVisionMode === "off";
    if (!canvas.hidden) {
      const view = mesaCanvasViewport(canvas, stage), dpr = view.density, zoom = getStageZoom();
      const w = stage.clientWidth * dpr, h = stage.clientHeight * dpr;
      const hit = draft.cursor && ["erase", "select"].includes(mesaVisionMode) ? nearest(draft.cursor, rect)?.w.id : null;
      const key = JSON.stringify([view.key, mesaVisionMode, [...draft.selection], [...draft.recent], hit, draft.points,
        draft.points.length || draft.action === "paste" ? draft.cursor : null, draft.snap, draft.action,
        draft.gesture?.previews, draft.gesture?.start, draft.gesture?.end]);
      if (paint?.key !== key || paint.walls !== mesaVision?.walls) {
      const ctx = canvas.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineCap = "round";
      ctx.setTransform(1, 0, 0, 1, -view.left * dpr, -view.top * dpr);
      const stroke = (points, color, dashed, thick = 2) => {
        ctx.strokeStyle = color; ctx.lineWidth = thick * dpr / zoom; ctx.setLineDash(dashed ? [5 * dpr / zoom, 4 * dpr / zoom] : []); ctx.beginPath();
        points.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * w, p.y * h)); ctx.stroke();
      };
      for (const saved of mesaVision?.walls || []) {
        const wall = draft.gesture?.previews?.find(w => w.id === saved.id) || saved;
        stroke([{ x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by }], draft.selection.has(wall.id) || wall.id === hit ? "#fff" : wall.kind === "door" ? "#e2ba69" : "#ef777f", wall.doorState === "open", draft.recent.has(wall.id) || wall.id === hit || draft.selection.has(wall.id) ? 4 : 2);
      }
      if (selected && draft.selection.size === 1) {
        ctx.setLineDash([]); ctx.lineWidth = 1.5 * dpr / zoom; ctx.strokeStyle = "#fff"; ctx.fillStyle = "#141012";
        for (const p of [{ x: selected.ax, y: selected.ay }, { x: selected.bx, y: selected.by }]) {
          ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4 * dpr / zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      let preview = [...draft.points];
      if (draft.cursor && preview.length) {
        const first = preview[0], end = draft.cursor;
        preview = mesaVisionMode === "wall" && el("mesaBarrierShape").value === "rect" ? [first, { x: end.x, y: first.y }, end, { x: first.x, y: end.y }, first] : [...preview, end];
      }
      stroke(preview, "#fff", true);
      for (const p of draft.points) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3 * dpr / zoom, 0, Math.PI * 2); ctx.fill(); }
      if (draft.snap) { ctx.setLineDash([]); ctx.strokeStyle = "#99d7b2"; ctx.lineWidth = 2 * dpr / zoom; ctx.beginPath(); ctx.arc(draft.snap.x * w, draft.snap.y * h, 7 * dpr / zoom, 0, Math.PI * 2); ctx.stroke(); }
      if (draft.gesture?.kind === "box") {
        const { start, end } = draft.gesture;
        ctx.setLineDash([4 * dpr / zoom, 3 * dpr / zoom]); ctx.lineWidth = dpr / zoom; ctx.strokeStyle = "#fff"; ctx.fillStyle = "rgba(255,255,255,.06)";
        ctx.fillRect(start.x * w, start.y * h, (end.x - start.x) * w, (end.y - start.y) * h); ctx.strokeRect(start.x * w, start.y * h, (end.x - start.x) * w, (end.y - start.y) * h);
      }
      if (draft.action === "paste") for (const wall of pastePreview(draft.cursor)) stroke([{ x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by }], "#99d7b2", true, 3);
      paint = { key, walls: mesaVision?.walls };
      canvas.dataset.paints = String(Number(canvas.dataset.paints || 0) + 1);
      }
    }
    el("mesaVisionToggle").checked = mesaVisionActive(); el("mesaVisionCone").value = mesaVision?.coneDeg || 120;
    el("mesaDarknessToggle").checked = mesaVision?.darkness === true;
    el("mesaDarknessToggle").disabled = !mesaVisionActive() || mesaVisionBusy;
    const count = mesaVision?.walls.length || 0;
    el("mesaVisionCount").textContent = `${count} ${count === 1 ? "segmento" : "segmentos"}`;
    for (const [id, mode] of tools) el(id).setAttribute("aria-pressed", String(mesaVisionMode === mode));
    el("mesaBarrierShapeRow").hidden = mesaVisionMode !== "wall";
    el("mesaBarrierSnapRow").hidden = !["wall", "select"].includes(mesaVisionMode);
    el("mesaBarrierActions").hidden = !selected;
    el("mesaBarrierSplit").disabled = !selected || selected.kind !== "wall" || !!draft.gesture || draft.selection.size !== 1;
    el("mesaBarrierSplit").setAttribute("aria-pressed", String(draft.action === "split"));
    el("mesaBarrierJoin").disabled = !selected || !!draft.gesture || draft.selection.size !== 1;
    el("mesaBarrierJoin").setAttribute("aria-pressed", String(draft.action === "join"));
    el("mesaBarrierDoorRow").hidden = selected?.kind !== "door" || draft.selection.size !== 1;
    el("mesaBarrierDoorState").value = selected?.doorState || "closed";
    el("mesaBarrierDoorState").disabled = !!draft.gesture || mesaVisionBusy;
    el("mesaBarrierClipboard").hidden = mesaVisionMode !== "select";
    el("mesaBarrierCopy").disabled = !draft.selection.size || !!draft.gesture;
    el("mesaBarrierPaste").disabled = !draft.clipboard || !!draft.gesture;
    el("mesaBarrierPaste").setAttribute("aria-pressed", String(draft.action === "paste"));
    el("mesaVisionStop").hidden = mesaVisionMode === "off";
    el("mesaBarrierClose").hidden = mesaVisionMode !== "wall" || el("mesaBarrierShape").value !== "polygon";
    el("mesaBarrierClose").disabled = draft.points.length < 3;
    el("mesaVisionUndo").disabled = mesaVisionBusy || !draft.undo.length; el("mesaVisionRedo").disabled = mesaVisionBusy || !draft.redo.length;
    el("mesaVisionPreview").disabled = !mesaVisionActive(); el("mesaVisionPreview").setAttribute("aria-pressed", String(mesaVisionPreview));
    el("mesaVisionHint").textContent = { off: "Escolha uma ferramenta. As paredes ficam salvas mesmo com a visão desligada.", select: selected ? `${selected.kind === "door" ? "Porta" : "Parede"} selecionada. Clique em outro trecho para trocar ou numa área vazia para limpar.` : "Clique em uma parede ou porta para selecionar o trecho.", wall: "Clique para desenhar. Botão direito conclui; Escape cancela o rascunho.", door: draft.points.length ? "Marque o fim da porta na mesma parede ou no vão." : "Marque duas extremidades na parede para recortar a porta, ou num vão livre.", erase: "Clique no trecho destacado para apagar. Você pode desfazer." }[mesaVisionMode];
    if (draft.action === "split") el("mesaVisionHint").textContent = "Clique no ponto da parede onde deseja dividir. Escape cancela.";
    if (draft.action === "join") el("mesaVisionHint").textContent = "Clique no outro trecho alinhado para unir. Escape cancela.";
    if (draft.selection.size > 1) el("mesaVisionHint").textContent = `${draft.selection.size} trechos selecionados. Shift+clique adiciona ou remove; clique fora limpa.`;
    if (mesaVisionMode === "select" && !draft.action) el("mesaVisionHint").textContent = draft.selection.size > 1 ? `${draft.selection.size} trechos. Arraste para mover; Shift+clique ajusta a seleção.` : selected ? `${selected.kind === "door" ? "Porta" : "Parede"} selecionada. Arraste o trecho ou uma extremidade; Shift+clique adiciona.` : "Clique num trecho ou arraste uma área. Shift+clique adiciona à seleção.";
    if (draft.action === "paste") el("mesaVisionHint").textContent = "Posicione a cópia e clique para confirmar. Escape cancela.";
  }
  function init() {
    const bind = (id, event, fn) => { el(id).dataset.armed = "1"; el(id).addEventListener(event, fn); };
    bind("mesaVisionToggle", "change", e => { commit(v => { v.enabled = e.target.checked; }); requestMesaVisionRender(); });
    bind("mesaVisionCone", "change", e => commit(v => { v.coneDeg = Number(e.target.value); }));
    bind("mesaDarknessToggle", "change", e => commit(v => { v.darkness = e.target.checked; }));
    for (const [id, mode] of tools) bind(id, "click", () => tool(mode));
    bind("mesaBarrierShape", "change", () => { draft.points = []; draft.cursor = null; requestMesaVisionRender(); });
    bind("mesaBarrierSnap", "change", () => { draft.snap = null; requestMesaVisionRender(); });
    bind("mesaBarrierSplit", "click", () => { draft.action = draft.action === "split" ? null : "split"; requestMesaVisionRender(); });
    bind("mesaBarrierJoin", "click", () => { draft.action = draft.action === "join" ? null : "join"; requestMesaVisionRender(); });
    bind("mesaBarrierDoorState", "change", e => doorState(e.target.value));
    bind("mesaBarrierCopy", "click", copySelection); bind("mesaBarrierPaste", "click", armPaste);
    bind("mesaVisionStop", "click", () => finish()); bind("mesaBarrierClose", "click", () => finish(true));
    bind("mesaVisionUndo", "click", () => undo()); bind("mesaVisionRedo", "click", () => undo(true));
    bind("mesaVisionPreview", "click", () => { if (!requireMesaMaster("vision.manage", "simular visão")) return; cancel(); mesaVisionPreview = !mesaVisionPreview; requestMesaVisionRender(); });
    el("mesaWallCanvas").addEventListener("pointerdown", click);
    el("mesaWallCanvas").addEventListener("pointermove", move);
    el("mesaWallCanvas").addEventListener("pointerup", release);
    for (const event of ["pointercancel", "lostpointercapture"]) el("mesaWallCanvas").addEventListener(event, () => { abortGesture(); requestMesaVisionRender(); });
    window.addEventListener("blur", () => { abortGesture(); requestMesaVisionRender(); });
    el("mesaWallCanvas").addEventListener("pointerleave", () => { draft.cursor = null; requestMesaVisionRender(); });
    el("mesaStageWrap").addEventListener("contextmenu", e => { if (mesaVisionMode === "off" || !isMaster()) return; e.preventDefault(); e.stopImmediatePropagation(); finish(); }, true);
    document.addEventListener("keydown", e => { if (mesaVisionMode === "off" || e.target.closest("input,select,textarea")) return; if (e.key === "Escape") { e.preventDefault(); cancel(); requestMesaVisionRender(); } });
  }
  return { init, render, reset, cancel, commit };
})();
