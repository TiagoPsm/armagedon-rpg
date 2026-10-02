const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
let api, R;
before(async () => { api = await import("../cloudflare/src/mesa.js"); R = globalThis.MesaVisionRules; });
const master = { role: "master", username: "gm", sub: "gm" }, player = { role: "player", username: "ana", sub: "ana" };
function scene() {
  return { tokens: [{ id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", x: 40, y: 45, visionRadius: .025, facingDeg: 0, layer: "tokens" }],
    vision: { enabled: true, coneDeg: 120, aspect: 1, revision: 0, walls: [{ id: "door", ax: .5, ay: 0, bx: .5, by: 1, kind: "door", doorState: "closed" }] } };
}

test("door interaction uses reachable point rather than distant midpoint", () => {
  const s = scene(); s.tokens[0].x = 42; s.tokens[0].y = 5;
  const action = { kind: "door", tokenId: "ana", doorId: "door" };
  assert.equal(R.apply(s, player, action).vision.walls[0].doorState, "open");
  s.tokens[0].facingDeg = 180;
  assert.equal(R.apply(s, player, action).vision.walls[0].doorState, "open");
  s.tokens[0].facingDeg = 0;
  s.vision.walls.push({ id: "obstacle", ax: .48, ay: 0, bx: .48, by: 1, kind: "wall" });
  assert.throws(() => R.apply(s, player, action), /Aproxime/);
});
function env() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE mesa_scenes (id TEXT PRIMARY KEY, data_json TEXT NOT NULL, created_by_user_id TEXT, updated_by_user_id TEXT, created_at TEXT, updated_at TEXT)");
  return { DB: { prepare(sql) { return { bind(...values) { return {
    async first() { return db.prepare(sql).get(...values) || null; },
    async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
  }; } }; } }, close: () => db.close() };
}
test("ownership, movement lock, walls and locked door are enforced regardless of facing", () => {
  const s = scene();
  assert.throws(() => R.apply(s, { ...player, username: "bob" }, { kind: "face", tokenId: "ana", facingDeg: 90 }), /autorizado/);
  assert.throws(() => R.apply(s, player, { kind: "face", tokenId: "ana", facingDeg: 90 }, true), /travou/);
  assert.throws(() => R.apply(s, player, { kind: "move", tokenId: "ana", path: [{ x: 80, y: 45 }] }), /parede/);
  s.tokens[0].x = 39;
  assert.throws(() => R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }), /Aproxime/);
  s.tokens[0].x = 42;
  assert.equal(R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }).vision.walls[0].doorState, "open");
  s.tokens[0].facingDeg = 180;
  assert.equal(R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }).vision.walls[0].doorState, "open");
  s.tokens[0].facingDeg = 0; s.vision.walls[0].doorState = "locked";
  assert.throws(() => R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }), /Aproxime/);
});
test("SQL action persists without master online and rejects stale full snapshots", async () => {
  const e = env();
  try {
    let saved = await api.saveMesaScene(e, master, scene());
    const old = structuredClone(saved.data);
    saved = await api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision, action: { kind: "face", tokenId: "ana", facingDeg: 45 } }, false);
    assert.equal(saved.data.tokens[0].facingDeg, 45);
    assert.equal(saved.data.vision.revision, 2);
    await assert.rejects(api.saveMesaScene(e, master, old), e => e.status === 409);
    await assert.rejects(api.applyMesaVisionAction(e, player, { sceneId: "other", revision: 2, action: {} }, false), e => e.status === 403);
    const reloaded = await api.getMesaScene(e, player);
    assert.equal(reloaded.data.tokens[0].facingDeg, 45);
  } finally { e.close(); }
});
test("concurrent actions cannot overwrite each other (real SQLite CAS)", async () => {
  const e = env();
  try {
    const saved = await api.saveMesaScene(e, master, scene());
    const body = angle => ({ sceneId: "default", revision: saved.data.vision.revision, action: { kind: "face", tokenId: "ana", facingDeg: angle } });
    const results = await Promise.allSettled([api.applyMesaVisionAction(e, player, body(45), false), api.applyMesaVisionAction(e, player, body(90), false)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  } finally { e.close(); }
});
test("secret tokens and stats do not appear in action response to player", async () => {
  const e = env();
  try {
    const s = scene(); s.tokens.push({ ...s.tokens[0], id: "secret", layer: "dm", currentLife: 999 });
    s.tokens[0].currentLife = 20;
    const saved = await api.saveMesaScene(e, master, s);
    const result = await api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision, action: { kind: "face", tokenId: "ana", facingDeg: 45 } }, false);
    assert.equal(result.data.tokens.length, 1); assert.equal(result.data.tokens[0].currentLife, null);
  } finally { e.close(); }
});

test("Durable Object rejects legacy player movement and filters scene broadcasts by role", async () => {
  const rules = await import("../cloudflare/src/mesa-realtime-rules.js");
  const source = fs.readFileSync(path.join(__dirname, "../cloudflare/src/mesa-realtime.js"), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
    .replace(/^export\s*\{[^}]+\};?\s*$/gm, "");
  const Room = new Function("DurableObject", "getMesaScene", ...Object.keys(rules), `${source}\nreturn MesaRealtimeRoom;`)(class {}, api.getMesaScene, ...Object.values(rules));
  const e = env();
  try {
    const saved = await api.saveMesaScene(e, master, scene());
    const messages = [];
    const playerSocket = { deserializeAttachment: () => player, send: data => messages.push(JSON.parse(data)) };
    const masterMessages = [];
    const masterSocket = { deserializeAttachment: () => master, send: data => masterMessages.push(JSON.parse(data)) };
    const room = new Room({ getWebSockets: () => [playerSocket, masterSocket] }, e);
    await room.handleRealtimeRelay(playerSocket, { type: "mesa:token:move", tokenId: "ana", characterKey: "ana", x: 90, y: 45 });
    assert.equal(messages[0].ok, false); assert.equal(masterMessages.length, 0);
    messages.length = 0;
    saved.data.tokens.push({ id: "secret", layer: "dm" });
    saved.data.tokens[0].currentLife = 999;
    saved.data.drawings = [{ id: "dm", layer: "dm" }];
    room.broadcast({ type: "mesa:scene", scene: saved });
    assert.equal(messages[0].scene.data.tokens.length, 1);
    assert.equal(messages[0].scene.data.tokens[0].currentLife, null);
    assert.equal(messages[0].scene.data.drawings.length, 0);
    assert.equal(masterMessages[0].scene.data.tokens.length, 2);
  } finally { e.close(); }
});

test("door cannot close across a token and no partial path writes occur", () => {
  const s = scene(); s.vision.walls[0].doorState = "open"; s.tokens[0].x = 48;
  assert.throws(() => R.apply(s, master, { kind: "door", tokenId: "ana", doorId: "door", close: true }), /token na porta/);
  const old = scene(), before = JSON.stringify(old);
  assert.throws(() => R.apply(old, player, { kind: "move", tokenId: "ana", path: [{ x: 42, y: 45 }, { x: 80, y: 45 }] }));
  assert.equal(JSON.stringify(old), before);
});

test("M2 approved curves are ephemeral and F5 restores only the final position", async () => {
  const e = env();
  try {
    const saved = await api.saveMesaScene(e, master, scene());
    const path = [{ x: 40, y: 20 }, { x: 20, y: 20 }];
    const result = await api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision,
      action: { kind: "move", tokenId: "ana", path } }, false);
    assert.deepEqual(result.movement.origin, { x: 40, y: 45 });
    assert.deepEqual(result.movement.path, path); assert.equal(result.movement.sceneVersion, result.data.sceneVersion);
    assert.equal(result.movement.duration, 450); assert.equal(result.data.movement, undefined);
    const reloaded = await api.getMesaScene(e, player);
    assert.equal(reloaded.movement, undefined); assert.equal(reloaded.data.tokens[0].x, 20);
    await assert.rejects(api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision,
      action: { kind: "move", tokenId: "ana", path } }, false), err => err.status === 409);
  } finally { e.close(); }
});

test("M2 DO filters secret or stale paths and sanitizes optional legacy move metadata", async () => {
  const rules = await import("../cloudflare/src/mesa-realtime-rules.js");
  const source = fs.readFileSync(path.join(__dirname, "../cloudflare/src/mesa-realtime.js"), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "").replace(/^export\s*\{[^}]+\};?\s*$/gm, "");
  const Room = new Function("DurableObject", "getMesaScene", ...Object.keys(rules), `${source}\nreturn MesaRealtimeRoom;`)(class {}, api.getMesaScene, ...Object.values(rules));
  const messages = [], masterMessages = [];
  const playerSocket = { deserializeAttachment: () => player, send: v => messages.push(JSON.parse(v)) };
  const masterSocket = { deserializeAttachment: () => master, send: v => masterMessages.push(JSON.parse(v)) };
  const room = new Room({ getWebSockets: () => [playerSocket, masterSocket] }, {});
  const movement = globalThis.MesaMovementRules.create("secret", { x: 40, y: 45 }, [{ x: 20, y: 45 }], 10, 1);
  const scene = { id: "default", data: { sceneVersion: 10, tokens: [{ id: "secret", x: 20, y: 45, layer: "dm" }] } };
  room.broadcast({ type: "mesa:scene", scene, movement });
  assert.equal(messages[0].movement, null); assert.equal(messages[0].scene.data.tokens.length, 0);
  assert.deepEqual(masterMessages[0].movement, movement);
  scene.data.sceneVersion = 11; room.broadcast({ type: "mesa:scene", scene, movement });
  assert.equal(masterMessages[1].movement, null);
  await room.handleRealtimeRelay(masterSocket, { type: "mesa:token:move", tokenId: "ana", x: 10, y: 20, sceneVersion: 12, movement });
  assert.equal(messages.at(-1).movement, undefined);
});

test("V2 darkness is optional, master-controlled and survives authoritative actions", async () => {
  assert.throws(() => R.normalize({ darkness: "true" }), /darkness/);
  const e = env();
  try {
    const s = scene(); s.vision.darkness = true;
    const saved = await api.saveMesaScene(e, master, s);
    assert.equal(saved.data.vision.darkness, true);
    await assert.rejects(api.saveMesaScene(e, player, { ...saved.data, vision: { ...saved.data.vision, darkness: false } }), err => err.status === 403);
    const moved = await api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision,
      action: { kind: "face", tokenId: "ana", facingDeg: 90 } }, false);
    assert.equal(moved.data.vision.darkness, true);
  } finally { e.close(); }
});

test("V3 local lights survive server roundtrip and reject invalid shapes/counts", async () => {
  const light = { id: "light", x: .4, y: .5, radius: .2, intensity: .7 };
  for (const lights of [Array(65).fill(light), [light, light], [{ ...light, radius: 0 }], [{ ...light, intensity: 5 }], [{ ...light, x: NaN }]]) {
    assert.throws(() => R.normalize({ lights }));
  }
  const e = env();
  try {
    const s = scene(); s.vision.lights = [light]; s.vision.darkness = true;
    const saved = await api.saveMesaScene(e, master, s);
    const faced = await api.applyMesaVisionAction(e, player, { sceneId: "default", revision: saved.data.vision.revision,
      action: { kind: "face", tokenId: "ana", facingDeg: 90 } }, false);
    assert.deepEqual(faced.data.vision.lights, [light]); assert.equal(faced.data.vision.darkness, true);
    assert.deepEqual((await api.getMesaScene(e, player)).data.vision.lights, [light]);
  } finally { e.close(); }
});

test("T5 DO sanitizes ruler paths, relays player bends and rejects invalid paths", async () => {
  const rules = await import("../cloudflare/src/mesa-realtime-rules.js");
  assert.equal(rules.sanitizeRulerPoints([{ u: 0, v: 0 }, { u: Infinity, v: 0 }]), null);
  assert.equal(rules.sanitizeRulerPoints(Array(257).fill({ u: 0, v: 0 })), null);
  const source = fs.readFileSync(path.join(__dirname, "../cloudflare/src/mesa-realtime.js"), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "").replace(/^export\s*\{[^}]+\};?\s*$/gm, "");
  const Room = new Function("DurableObject", "getMesaScene", ...Object.keys(rules), `${source}\nreturn MesaRealtimeRoom;`)(class {}, api.getMesaScene, ...Object.values(rules));
  const messages = [], acks = [];
  const playerSocket = { deserializeAttachment: () => player, send: v => acks.push(JSON.parse(v)) };
  const masterSocket = { deserializeAttachment: () => master, send: v => messages.push(JSON.parse(v)) };
  const room = new Room({ getWebSockets: () => [playerSocket, masterSocket] }, {});
  const points = [{ u: .2, v: .3, ignored: true }, { u: .4, v: .3 }, { u: .4, v: .6 }];
  await room.handleRealtimeRelay(playerSocket, { type: 'mesa:ruler', active: true, u1: .2, v1: .3, u2: .4, v2: .6, points });
  assert.deepEqual(messages.at(-1).points, points.map(({ u, v }) => ({ u, v })));
  const count = messages.length;
  await room.handleRealtimeRelay(playerSocket, { type: 'mesa:ruler', active: true, points: [] });
  assert.equal(messages.length, count); assert.equal(acks.at(-1).ok, false);
});

test('T1 measured drawing metadata survives authoritative save/get', async () => {
  const e = env();
  try {
    const s = scene(); s.drawings = [{ id: 'area', tool: 'circle', color: '#e7c366', width: 2, author: 'ana', locked: true, x1: .2, y1: .3, x2: .6, y2: .7,
      template: { kind: 'circle', x: .4, y: .5, length: .2 } }];
    const saved = await api.saveMesaScene(e, master, s);
    assert.deepEqual(saved.data.drawings[0].template, s.drawings[0].template);
    assert.deepEqual((await api.getMesaScene(e, player)).data.drawings[0].template, s.drawings[0].template);
    assert.equal((await api.getMesaScene(e, player)).data.drawings[0].locked, true);
  } finally { e.close(); }
});

test('C3 relay only accepts master locking and rejects malformed lock metadata', async () => {
  const rules = await import('../cloudflare/src/mesa-realtime-rules.js');
  assert.equal(rules.sanitizeRelayDrawingStroke({ id: 'decor', locked: 'true' }), null);
  const source = fs.readFileSync(path.join(__dirname, '../cloudflare/src/mesa-realtime.js'), 'utf8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, '').replace(/^export\s*\{[^}]+\};?\s*$/gm, '');
  const Room = new Function('DurableObject', 'getMesaScene', ...Object.keys(rules), `${source}\nreturn MesaRealtimeRoom;`)(class {}, api.getMesaScene, ...Object.values(rules));
  const messages = [], acks = [];
  const playerSocket = { deserializeAttachment: () => player, send: v => acks.push(JSON.parse(v)) };
  const masterSocket = { deserializeAttachment: () => master, send: v => messages.push(JSON.parse(v)) };
  const room = new Room({ getWebSockets: () => [playerSocket, masterSocket] }, {});
  const stroke = { id: 'decor', tool: 'rect', locked: true };
  await room.handleRealtimeRelay(playerSocket, { type: 'mesa:drawings:add', stroke });
  assert.equal(messages.length, 0); assert.equal(acks.at(-1).ok, false);
  await room.handleRealtimeRelay(masterSocket, { type: 'mesa:drawings:add', stroke });
  assert.equal(acks.at(-1).stroke.locked, true); assert.equal(acks.at(-1).stroke.author, 'gm');
});

test('integer grid normalization survives authoritative roundtrip without spacing drift', async () => {
  const grid = globalThis.MesaGridRules.normalize({ enabled: true, snap: true, cellFrac: .08, offsetXFrac: .31415, metersPerCell: 5 });
  assert.equal(grid.cellFrac, 1 / 13); assert.deepEqual(globalThis.MesaGridRules.normalize(grid), grid);
  const e = env();
  try {
    const saved = await api.saveMesaScene(e, master, { ...scene(), grid });
    assert.deepEqual(saved.data.grid, grid); assert.deepEqual((await api.getMesaScene(e, player)).data.grid, grid);
  } finally { e.close(); }
});
