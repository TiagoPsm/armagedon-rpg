const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture(source = fs.readFileSync('js/api.js', 'utf8')) {
  const calls = [], deferred = [];
  let hold = false, status = 200;
  const window = { ARMAGEDON_CONFIG: { apiBaseUrl: 'https://local/api', realtimeEnabled: true }, location: { href: 'https://local/' }, setTimeout, clearTimeout };
  class Socket extends EventTarget { static OPEN = 1; static CONNECTING = 0; readyState = 1; close() {} }
  window.WebSocket = Socket;
  vm.runInNewContext(source, { window, localStorage: { getItem() {}, setItem() {} }, EventTarget, CustomEvent, WebSocket: Socket, URL, AbortController, structuredClone, console, fetch: async (url, options) => {
    calls.push({ url, options }); const auth = options.headers.Authorization;
    if (hold) await new Promise(resolve => deferred.push(resolve));
    return { ok: status >= 200 && status < 300, status, json: async () => ({ auth, players: [{ name: 'Original' }] }) };
  } });
  return { app: window.APP, calls, status: value => { status = value; }, hold: () => { hold = true; }, release: () => { hold = false; deferred.splice(0).forEach(r => r()); } };
}
test('GET concorrentes compartilham rede mas nao objetos; listas tem cache curto', async () => {
  const f = fixture(); f.app.setToken('one'); f.hold();
  const first = f.app.getDirectory(), second = f.app.getDirectory();
  assert.equal(f.calls.length, 1); f.release(); const [a, b] = await Promise.all([first, second]);
  a.players[0].name = 'Changed'; assert.equal(b.players[0].name, 'Original');
  assert.equal((await f.app.getDirectory()).players[0].name, 'Original'); assert.equal(f.calls.length, 1);
});
test('falhas de permissao nao sao cacheadas nem repetidas automaticamente', async () => {
  const f = fixture(); f.status(403);
  await assert.rejects(f.app.getDirectory(), { status: 403 });
  assert.equal(f.calls.length, 1);
  f.status(200); await f.app.getDirectory(); assert.equal(f.calls.length, 2);
});
test('escritas, logout e troca de API invalidam cache; escritas nunca sao deduplicadas', async () => {
  const f = fixture(); await f.app.getDirectory();
  await Promise.all([f.app.createNpc({ name: 'A' }), f.app.createNpc({ name: 'A' })]);
  await f.app.getDirectory(); assert.equal(f.calls.length, 4);
  f.app.clearToken(); await f.app.getDirectory(); assert.equal(f.calls.length, 5);
  f.app.setBaseUrl('https://other/api'); await f.app.getDirectory(); assert.equal(f.calls.length, 6);
});
test('resposta de sessao anterior nao e entregue nem reaproveitada', async () => {
  const f = fixture(); f.app.setToken('old'); f.hold();
  const pending = f.app.getDirectory(); f.app.setToken('new'); f.release();
  await assert.rejects(pending, /sessao mudou/);
  assert.equal((await f.app.getDirectory()).auth, 'Bearer new'); assert.equal(f.calls.length, 2);
});
test('resposta antiga em voo durante escrita nao preenche o cache novo', async () => {
  const f = fixture(); f.hold(); const old = f.app.getDirectory();
  const write = f.app.createNpc({ name: 'B' }); f.release(); await Promise.all([old, write]);
  await f.app.getDirectory(); assert.equal(f.calls.length, 3);
});
test('eventos de ficha invalidam listagens', async () => {
  const f = fixture(); f.app.setToken('one'); await f.app.init(); const socket = await f.app.connectRealtime();
  await f.app.getDirectory(); const before = f.calls.length;
  socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'sheet:changed' }) }));
  await f.app.getDirectory(); assert.equal(f.calls.length, before + 1);
});
test('medicao reproduzivel: cinco leituras iguais passam de cinco requests para uma', async () => {
  const { execFileSync } = require('node:child_process');
  const before = fixture(execFileSync('git', ['show', '44400f6:js/api.js'], { encoding: 'utf8' })), after = fixture();
  for (const f of [before, after]) {
    f.hold(); const batch = [f.app.getDirectory(), f.app.getDirectory(), f.app.getDirectory()]; f.release();
    await Promise.all(batch); await f.app.getDirectory(); await f.app.getDirectory();
  }
  assert.equal(before.calls.length, 5); assert.equal(after.calls.length, 1);
  console.log(JSON.stringify({ operation: 'directory-five-reads', before: before.calls.length, after: after.calls.length }));
});
