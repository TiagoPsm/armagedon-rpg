const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let R;
before(async () => { await import('../js/mesa-template-rules.js'); R = globalThis.MesaTemplateRules; });
test('T1 measured circle is finite, bounded and round regardless of scene aspect', () => {
  const t = { kind: 'circle', x: .4, y: .5, length: .2 }, clean = R.normalize({ ...t, unknown: true });
  assert.deepEqual(clean, t); const pts = R.outline(clean, 1000, 400);
  for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x - 400, p.y - 200) - 200) < 1e-8);
  for (const patch of [{ length: NaN }, { length: 0 }, { x: 2 }, { kind: 'unknown' }]) assert.equal(R.normalize({ ...t, ...patch }), null);
});
test('T2 cone normalizes direction and clips hits to opening', () => {
  const t = R.normalize({ kind: 'cone', x: .5, y: .5, length: .3, direction: -270, aperture: 90 });
  assert.equal(t.direction, 90); assert.equal(R.contains(t, 500, 300, 1000, 400), true); assert.equal(R.contains(t, 700, 200, 1000, 400), false);
  assert.equal(R.normalize({ ...t, aperture: 1 }), null);
});
test('T3 rotated rectangle has exact physical side lengths and hit bounds', () => {
  const t = R.normalize({ kind: 'rect', x: .5, y: .5, length: .2, width: .1, direction: 45 });
  const p = R.outline(t, 1000, 400);
  assert.ok(Math.abs(Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) - 200) < 1e-8);
  assert.ok(Math.abs(Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y) - 100) < 1e-8);
  assert.equal(R.contains(t, 500, 200, 1000, 400), true); assert.equal(R.contains(t, 700, 200, 1000, 400), false);
  assert.equal(R.normalize({ ...t, width: 0 }), null);
});
test('T4 line is a finite width area from origin to endpoint', () => {
  const t = R.normalize({ kind: 'line', x: .5, y: .5, length: .3, width: .1, direction: 0 });
  assert.deepEqual(R.outline(t, 1000, 400), [{ x: 500, y: 150 }, { x: 800, y: 150 }, { x: 800, y: 250 }, { x: 500, y: 250 }]);
  assert.equal(R.contains(t, 600, 200, 1000, 400), true); assert.equal(R.contains(t, 490, 200, 1000, 400), false);
});
