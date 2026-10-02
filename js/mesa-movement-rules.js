/* Pure, ephemeral motion contract shared by browser and Worker. Never scene data. */
(function (root) {
  "use strict";
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
  const near = (a, b) => point(a) && point(b) && Math.abs(a.x - b.x) <= .025 && Math.abs(a.y - b.y) <= .025;
  const copy = p => ({ x: p.x, y: p.y });
  function duration(origin, path, aspect = 1) {
    const points = [origin, ...path];
    const distance = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, (p.y - points[i].y) * aspect), 0);
    return Math.round(Math.max(120, Math.min(450, distance * 20)));
  }
  function normalize(raw, { tokenId, to, from, version } = {}) {
    if (!raw || typeof raw.tokenId !== "string" || !raw.tokenId || raw.tokenId.length > 160 ||
        !point(raw.origin) || !Array.isArray(raw.path) || !raw.path.length || raw.path.length > 256 || !raw.path.every(point) ||
        !Number.isSafeInteger(raw.sceneVersion) || raw.sceneVersion < 0 ||
        !Number.isInteger(raw.duration) || raw.duration < 120 || raw.duration > 450) return null;
    if ((tokenId != null && raw.tokenId !== tokenId) || (version != null && raw.sceneVersion !== version) ||
        (from && !near(raw.origin, from)) || (to && !near(raw.path.at(-1), to))) return null;
    return { tokenId: raw.tokenId, origin: copy(raw.origin), path: raw.path.map(copy), duration: raw.duration, sceneVersion: raw.sceneVersion };
  }
  function create(tokenId, origin, path, sceneVersion, aspect) {
    return normalize({ tokenId, origin, path, sceneVersion, duration: duration(origin, path, aspect) });
  }
  root.MesaMovementRules = Object.freeze({ create, normalize, duration });
})(globalThis);
