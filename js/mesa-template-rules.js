/* Shared measured-area contract. Lengths are fractions of stage width, not pixels. */
globalThis.MesaTemplateRules = (() => {
  function normalize(t) {
    if (!t || !['circle', 'cone', 'rect', 'line'].includes(t.kind)) return null;
    if (![t.x, t.y, t.length].every(Number.isFinite) || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1 || t.length < .0001 || t.length > 4) return null;
    const clean = { kind: t.kind, x: t.x, y: t.y, length: t.length };
    if (t.kind !== 'circle') {
      if (!Number.isFinite(t.direction)) return null;
      clean.direction = ((t.direction % 360) + 360) % 360;
      if (t.kind === 'cone') {
        if (!Number.isFinite(t.aperture) || t.aperture < 10 || t.aperture > 360) return null;
        clean.aperture = t.aperture;
      } else {
        if (!Number.isFinite(t.width) || t.width < .0001 || t.width > 4) return null;
        clean.width = t.width;
      }
    }
    return clean;
  }
  function outline(t, w, h) {
    const x = t.x * w, y = t.y * h, radius = t.length * w;
    if (t.kind === 'rect' || t.kind === 'line') {
      const a = t.direction * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), hh = t.width * w / 2, hw = radius / 2;
      const left = t.kind === 'line' ? 0 : -hw, right = t.kind === 'line' ? radius : hw;
      return [[left, -hh], [right, -hh], [right, hh], [left, hh]].map(([dx, dy]) => ({ x: x + dx * cs - dy * sn, y: y + dx * sn + dy * cs }));
    }
    if (t.kind === 'cone') {
      const a = (t.direction - t.aperture / 2) * Math.PI / 180, extent = t.aperture * Math.PI / 180;
      const count = Math.max(8, Math.ceil(t.aperture / 5));
      return [{ x, y }, ...Array.from({ length: count + 1 }, (_, i) => ({ x: x + Math.cos(a + extent * i / count) * radius, y: y + Math.sin(a + extent * i / count) * radius }))];
    }
    return Array.from({ length: 65 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 32) * radius, y: y + Math.sin(i * Math.PI / 32) * radius }));
  }
  function contains(t, px, py, w, h) {
    const dx = px - t.x * w, dy = py - t.y * h;
    if (t.kind === 'rect' || t.kind === 'line') {
      const a = t.direction * Math.PI / 180;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      return along >= (t.kind === 'line' ? 0 : -t.length * w / 2) && along <= t.length * w * (t.kind === 'line' ? 1 : .5) && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= t.width * w / 2;
    }
    if (Math.hypot(dx, dy) > t.length * w) return false;
    if (t.kind === 'circle') return true;
    const delta = ((Math.atan2(dy, dx) * 180 / Math.PI - t.direction + 540) % 360) - 180;
    return Math.abs(delta) <= t.aperture / 2;
  }
  return { normalize, outline, contains };
})();
