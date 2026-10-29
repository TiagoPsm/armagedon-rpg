const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let rules;
before(async () => { await import("../js/mesa-movement-rules.js"); rules = globalThis.MesaMovementRules; });
const origin = { x: 20, y: 45 }, path = [{ x: 20, y: 20 }, { x: 40, y: 20 }];
test("M2 contract copies only bounded motion data and gives clients deterministic duration", () => {
  const raw = rules.create("ana", origin, path, 10, 1);
  assert.equal(raw.duration, 450); assert.deepEqual(raw.path, path);
  const clean = rules.normalize({ ...raw, secret: "do not relay" }, { tokenId: "ana", from: origin, to: path.at(-1), version: 10 });
  assert.deepEqual(clean, raw); clean.path[0].x = 99; assert.equal(raw.path[0].x, 20);
  assert.equal(rules.create("ana", origin, [{ x: 21, y: 45 }], 10, 1).duration, 120);
});
test("M2 invalid, mismatched and oversized motion metadata is rejected", () => {
  const valid = rules.create("ana", origin, path, 10, 1);
  for (const patch of [{ path: [] }, { path: Array(257).fill(origin) }, { path: [{ x: Infinity, y: 1 }] },
    { origin: { x: -1, y: 0 } }, { duration: 451 }, { duration: 120.5 }, { sceneVersion: NaN }]) {
    assert.equal(rules.normalize({ ...valid, ...patch }), null);
  }
  for (const options of [{ tokenId: "bob" }, { from: { x: 0, y: 0 } }, { to: origin }, { version: 11 }]) {
    assert.equal(rules.normalize(valid, options), null);
  }
});
