const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/mesa-vision-geometry.js"), "utf8"), context);
const G = context.MesaVisionGeometry;
const wall = (id, ax, ay, bx, by, extra = {}) => ({ id, ax, ay, bx, by, ...extra });
const vertical = wall("wall", .5, 0, .5, 1);
const build = (walls = [], aspect = 1) => G.prepare({ enabled: true, walls }, aspect);
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const plain = a => JSON.parse(JSON.stringify(a));

test("same file loads as a native module without browser globals", async () => {
  await import("../js/mesa-vision-geometry.js");
  assert.deepEqual(globalThis.MesaVisionGeometry.normalizeVision(null), plain(G.normalizeVision(null)));
});

test("default contract is disabled, versioned and individual-cone ready", () => {
  assert.deepEqual(plain(G.normalizeVision(null)), { schemaVersion: 1, enabled: false, coneDeg: 120, walls: [] });
  const source = { enabled: true, walls: [vertical] };
  const normalized = G.normalizeVision(source);
  normalized.walls[0].ax = .2;
  assert.equal(source.walls[0].ax, .5);
});

test("invalid data is rejected instead of removing opaque barriers silently", () => {
  const invalid = [
    { schemaVersion: 2 }, { enabled: "false" }, { coneDeg: 0 }, { coneDeg: Infinity },
    { walls: null, enabled: 1 }, { walls: {} }, { walls: [vertical, vertical] },
    { walls: [wall("", 0, 0, 1, 1)] }, { walls: [wall("x", 0, 0, 0, 0)] },
    { walls: [wall("x", -.1, 0, 1, 1)] }, { walls: [wall("x", NaN, 0, 1, 1)] },
    { walls: [wall("x", "0", 0, 1, 1)] }, { walls: [wall("x", 0, 0, 1, 1, { kind: "window" })] },
    { walls: [wall("x", 0, 0, 1, 1, { kind: "door", doorState: "unknown" })] },
    { walls: Array(G.MAX_WALLS + 1).fill(vertical) }
  ];
  for (const input of invalid) assert.throws(() => G.normalizeVision(input));
  assert.throws(() => build([], 0));
  assert.throws(() => build().polygon({ x: NaN, y: 0 }));
  assert.throws(() => build().sweep({ x: .2, y: .2 }, { x: .3, y: .3 }, 0));
});

test("direction is clockwise from east; cone boundaries and angle wrap are stable", () => {
  const scene = build(), o = { x: .5, y: .5 };
  assert.equal(scene.canSee(o, { x: .8, y: .5 }, 0), true);
  assert.equal(scene.canSee(o, { x: .2, y: .5 }, 0), false);
  assert.equal(scene.canSee(o, { x: .5, y: .8 }, 90), true);
  assert.equal(scene.canSee(o, { x: .2, y: .5 }, 180), true);
  assert.equal(scene.canSee(o, { x: .8, y: .5 }, 720), true);
  assert.equal(scene.canSee(o, { x: .8, y: .5 }, -360), true);
  for (const angle of [-60, 60]) {
    const rad = angle * Math.PI / 180;
    assert.equal(scene.canSee(o, { x: .5 + .2 * Math.cos(rad), y: .5 + .2 * Math.sin(rad) }, 0), true);
  }
  assert.equal(scene.canSee(o, { x: .2, y: .5 }, 0, 360), true);
});

test("full wall occludes while finite wall allows vision past its endpoint", () => {
  const o = { x: .25, y: .5 };
  const scene = build([vertical]);
  assert.equal(scene.canSee(o, { x: .75, y: .5 }), false);
  assert.equal(scene.canSee(o, { x: .49, y: .5 }), true);
  assert.ok(scene.polygon(o).every(p => p.x <= .5 + 1e-8));
  const finite = build([wall("w", .5, .4, .5, .6)]);
  assert.equal(finite.canSee({ x: .25, y: .2 }, { x: .75, y: .2 }), true);
});

test("closed and locked doors block both vision and motion; open doors do neither", () => {
  const from = { x: .25, y: .5 }, to = { x: .75, y: .5 };
  for (const doorState of ["closed", "locked", "open"]) {
    const scene = build([{ ...vertical, kind: "door", doorState }]);
    assert.equal(scene.canSee(from, to), doorState === "open");
    assert.equal(scene.sweep(from, to, .05).blocked, doorState !== "open");
  }
});

test("rapid movement stops one token radius BEFORE wall, also in reverse", () => {
  const scene = build([vertical]);
  const forward = scene.sweep({ x: .1, y: .5 }, { x: .9, y: .5 }, .08);
  close(forward.x, .42); assert.equal(forward.blocked, true);
  const backward = scene.sweep({ x: .9, y: .5 }, { x: .1, y: .5 }, .08);
  close(backward.x, .58); assert.equal(backward.blocked, true);
});

test("disk collisions include endpoints, diagonal walls, and narrow passages", () => {
  const tip = build([wall("tip", .5, .5, .5, .9)]);
  const hit = tip.sweep({ x: .2, y: .46 }, { x: .8, y: .46 }, .05);
  close(hit.x, .47); assert.equal(hit.blocked, true);
  const diagonal = build([wall("diag", 0, 0, 1, 1)]);
  const diagonalHit = diagonal.sweep({ x: .8, y: .2 }, { x: .2, y: .8 }, .05);
  close((diagonalHit.x - diagonalHit.y) / Math.sqrt(2), .05);
  const gap = build([wall("a", .5, 0, .5, .46), wall("b", .5, .54, .5, 1)]);
  assert.equal(gap.sweep({ x: .2, y: .5 }, { x: .8, y: .5 }, .05).blocked, true);
  assert.equal(gap.sweep({ x: .2, y: .5 }, { x: .8, y: .5 }, .03).blocked, false);
});

test("touching wall permits sliding and retreat, but not crossing", () => {
  const scene = build([vertical]), from = { x: .45, y: .3 };
  assert.equal(scene.sweep(from, { x: .45, y: .7 }, .05).blocked, false);
  assert.equal(scene.sweep(from, { x: .2, y: .3 }, .05).blocked, false);
  close(scene.sweep(from, { x: .7, y: .3 }, .05).fraction, 0);
  assert.equal(scene.sweep(from, from, .05).blocked, false);
});

test("invalid origins fail closed, including disk initially embedded in wall", () => {
  const scene = build([vertical]);
  for (const origin of [{ x: .5, y: .5 }, { x: 0, y: .5 }, { x: -.1, y: .5 }]) {
    assert.equal(scene.polygon(origin).length, 0);
    assert.equal(scene.canSee(origin, { x: .8, y: .5 }), false);
  }
  assert.equal(scene.sweep({ x: .48, y: .5 }, { x: .2, y: .5 }, .05).fraction, 0);
  assert.equal(scene.sweep({ x: .48, y: .5 }, { x: .48, y: .5 }, .05).fraction, 0);
  assert.equal(scene.sweep({ x: .01, y: .5 }, { x: .2, y: .5 }, .05).fraction, 0);
});

test("map boundary blocks disk, rectangular maps preserve physical distances", () => {
  const scene = build([], 2);
  const result = scene.sweep({ x: .5, y: 1 }, { x: .5, y: 3 }, .1);
  close(result.y, 1.9);
  const horizontal = build([wall("h", 0, .5, 1, .5)], 2);
  close(horizontal.sweep({ x: .5, y: .4 }, { x: .5, y: 1.4 }, .1).y, .9);
  assert.equal(horizontal.canSee({ x: .5, y: .4 }, { x: .5, y: 1.4 }, 90), false);
});

test("movement can route around a corner using a sequence of legal segments", () => {
  const scene = build([wall("partial", .5, .4, .5, 1)]), radius = .03;
  const path = [{ x: .3, y: .7 }, { x: .3, y: .3 }, { x: .7, y: .3 }, { x: .7, y: .7 }];
  assert.equal(scene.sweep(path[0], path[3], radius).blocked, true);
  for (let i = 1; i < path.length; i++) assert.equal(scene.sweep(path[i - 1], path[i], radius).blocked, false);
});

test("door proximity uses shortest distance and cannot reach through another wall", () => {
  const door = { ...vertical, kind: "door", doorState: "closed" };
  const near = { x: .4, y: .5 };
  assert.equal(build([door]).canReachDoor(near, door.id, .11), true);
  assert.equal(build([door]).canReachDoor(near, door.id, .09), false);
  assert.equal(build([door]).canReachDoor(near, "missing", .5), false);
  assert.equal(build([{ ...door, doorState: "locked" }]).canReachDoor(near, door.id, .5), false);
  assert.equal(build([door, wall("block", .45, 0, .45, 1)]).canReachDoor(near, door.id, .2), false);
  assert.equal(build([door, wall("overlap", .5, .4, .5, .6)]).canReachDoor(near, door.id, .2), false);
});

test("intersecting and collinear walls produce finite bounded polygons", () => {
  const scene = build([vertical, wall("h", 0, .5, 1, .5), wall("overlap", .5, .2, .5, .8)]);
  const polygon = scene.polygon({ x: .25, y: .25 }, 45, 270);
  assert.ok(polygon.length > 3);
  for (const p of polygon) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.x >= -1e-7 && p.x <= 1 + 1e-7 && p.y >= -1e-7 && p.y <= 1 + 1e-7);
    assert.ok(p.x <= .5 + 1e-7 && p.y <= .5 + 1e-7);
  }
});

test("prepared geometry does not retain the caller's mutable wall data", () => {
  const walls = [{ ...vertical }], scene = build(walls);
  walls[0].ax = 0; walls[0].bx = 0; walls.length = 0;
  assert.equal(scene.canSee({ x: .2, y: .5 }, { x: .8, y: .5 }), false);
  assert.equal(Object.isFrozen(scene.vision.walls[0]), true);
  assert.equal(Object.isFrozen(scene.vision.walls), true);
  assert.equal(Object.isFrozen(scene.vision), true);
});

test("polygon membership agrees with direct line-of-sight for irregular crossing walls", () => {
  const scene = build([
    wall("a", .3, .4, .8, .7), wall("b", .6, .2, .4, .9),
    wall("c", .6, .1, .9, .4), wall("d", .7, .6, .95, .6)
  ]);
  const origin = { x: .2, y: .2 };
  function inside(p, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  for (const cone of [45, 120, 270, 360]) {
    const polygon = scene.polygon(origin, 30, cone);
    // Non-aligned samples avoid points exactly on a polygon/wall boundary.
    for (let x = .01317; x < 1; x += .03091) for (let y = .01719; y < 1; y += .02897) {
      assert.equal(inside({ x, y }, polygon), scene.canSee(origin, { x, y }, 30, cone), `cone=${cone} x=${x} y=${y}`);
    }
  }
});

test("swept disk never tunnels through random segments (independent distance sampling)", () => {
  let seed = 2345;
  const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  function distance(p, w) {
    const dx = w.bx - w.ax, dy = w.by - w.ay;
    const t = Math.max(0, Math.min(1, ((p.x - w.ax) * dx + (p.y - w.ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - w.ax - t * dx, p.y - w.ay - t * dy);
  }
  for (let i = 0; i < 500; i++) {
    const w = wall("w", rand(), rand(), rand(), rand()), radius = .02;
    const from = { x: .03 + rand() * .94, y: .03 + rand() * .94 };
    if (distance(from, w) <= radius) continue;
    const target = { x: rand(), y: rand() }, result = build([w]).sweep(from, target, radius);
    for (let step = 0; step <= 100; step++) {
      const p = { x: from.x + (result.x - from.x) * step / 100, y: from.y + (result.y - from.y) * step / 100 };
      assert.ok(distance(p, w) >= radius - 1e-8, `sample ${i}, step ${step}`);
    }
  }
});

test("BVH visibility agrees with independent brute-force intersection oracle", () => {
  let seed = 1234567;
  const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const walls = Array.from({ length: 80 }, (_, i) => wall(`w${i}`, rand(), rand(), rand(), rand()));
  const scene = build(walls);
  for (let i = 0; i < 1000; i++) {
    const a = { x: rand(), y: rand() }, b = { x: rand(), y: rand() };
    const dx = b.x - a.x, dy = b.y - a.y;
    const blocked = walls.some(w => {
      const ex = w.bx - w.ax, ey = w.by - w.ay;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-12) return false;
      const t = ((w.ax - a.x) * ey - (w.ay - a.y) * ex) / det;
      const u = ((w.ax - a.x) * dy - (w.ay - a.y) * dx) / det;
      return t >= 0 && t < 1 && u >= 0 && u <= 1;
    });
    assert.equal(scene.canSee(a, b, 0, 360), !blocked, `sample ${i}`);
  }
});

test("resource guard rejects excessive intersections without returning partial geometry", () => {
  const walls = Array.from({ length: 203 }, (_, i) => {
    const angle = Math.PI * i / 203, dx = Math.cos(angle) * .4, dy = Math.sin(angle) * .4;
    return wall(`w${i}`, .5 - dx, .5 - dy, .5 + dx, .5 + dy);
  });
  assert.throws(() => build(walls), /Too many wall intersections/);
});

test("5000-segment irregular contour loads without truncation (not a frame-time benchmark)", () => {
  const count = G.MAX_WALLS;
  const vertices = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2, radius = .35 + .02 * Math.sin(angle * 31);
    return { x: .5 + radius * Math.cos(angle), y: .5 + radius * Math.sin(angle) };
  });
  const walls = vertices.map((p, i) => {
    const q = vertices[(i + 1) % count];
    return wall(`w${i}`, p.x, p.y, q.x, q.y);
  });
  const scene = build(walls);
  assert.equal(scene.vision.walls.length, count);
  assert.equal(scene.canSee({ x: .5, y: .5 }, { x: .99, y: .5 }), false);
  assert.equal(scene.canSee({ x: .5, y: .5 }, { x: .6, y: .5 }), true);
});
