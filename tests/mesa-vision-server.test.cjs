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
function env() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE mesa_scenes (id TEXT PRIMARY KEY, data_json TEXT NOT NULL, created_by_user_id TEXT, updated_by_user_id TEXT, created_at TEXT, updated_at TEXT)");
  return { DB: { prepare(sql) { return { bind(...values) { return {
    async first() { return db.prepare(sql).get(...values) || null; },
    async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
  }; } }; } }, close: () => db.close() };
}
test("ownership, lock, walls, cone and locked door are enforced by shared actions", () => {
  const s = scene();
  assert.throws(() => R.apply(s, { ...player, username: "bob" }, { kind: "face", tokenId: "ana", facingDeg: 90 }), /autorizado/);
  assert.throws(() => R.apply(s, player, { kind: "face", tokenId: "ana", facingDeg: 90 }, true), /travou/);
  assert.throws(() => R.apply(s, player, { kind: "move", tokenId: "ana", path: [{ x: 80, y: 45 }] }), /parede/);
  s.tokens[0].x = 39;
  assert.throws(() => R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }), /Aproxime/);
  s.tokens[0].x = 42;
  assert.equal(R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }).vision.walls[0].doorState, "open");
  s.tokens[0].facingDeg = 180;
  assert.throws(() => R.apply(s, player, { kind: "door", tokenId: "ana", doorId: "door" }), /Aproxime/);
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
