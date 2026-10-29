/* One finite, idempotent grid contract for browser and authoritative scene storage. */
globalThis.MesaGridRules = (() => {
  const defaults = Object.freeze({ enabled: false, snap: false, cellFrac: .05, offsetXFrac: 0, offsetYFrac: 0, color: '#ffffff', opacity: .18, metersPerCell: 1.5 });
  function normalize(grid) {
    if (!grid || typeof grid !== 'object') return { ...defaults };
    const n = (value, min, max, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; };
    return {
      enabled: grid.enabled === true, snap: grid.snap === true,
      cellFrac: 1 / Math.round(1 / n(grid.cellFrac, .01, .25, defaults.cellFrac)),
      offsetXFrac: Math.round(n(grid.offsetXFrac, 0, 1, 0) * 10000) / 10000,
      offsetYFrac: Math.round(n(grid.offsetYFrac, 0, 1, 0) * 10000) / 10000,
      color: /^#[0-9a-f]{3,8}$/i.test(String(grid.color || '')) ? String(grid.color) : defaults.color,
      opacity: Math.round(n(grid.opacity, .05, .8, defaults.opacity) * 100) / 100,
      // Preserve old campaign scales; the UI stepper offers only closed presets.
      metersPerCell: Math.round(n(grid.metersPerCell, .1, 5000, defaults.metersPerCell) * 100) / 100
    };
  }
  return { defaults, normalize };
})();
