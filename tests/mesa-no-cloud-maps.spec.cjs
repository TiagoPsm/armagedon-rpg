const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
});
test('mapas nao usam a rede para upload ou exclusao, preservando a copia local', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let requests = 0; const original = fetch;
    window.fetch = (...args) => { requests++; return original(...args); };
    const blob = new Blob(['original local'], { type: 'image/webp' });
    mesaMapState.activeEntry = { id: 'preserved', name: 'Mapa local', hash: 'hash', blob };
    mesaMapState.activeMapR2Key = 'maps/master/existing.webp';
    _ensureActiveMapPersisted(); await deleteActiveMapFromR2();
    const failures = [];
    for (const fn of [() => APP.uploadMesaMap(blob, 'test'), () => APP.deleteMesaMap('maps/master/existing.webp')]) {
      try { await fn(); } catch (error) { failures.push(error.message); }
    }
    return { requests, failures, text: await mesaMapState.activeEntry.blob.text(), key: mesaMapState.activeMapR2Key };
  });
  expect(result.requests).toBe(0); expect(result.failures).toHaveLength(2);
  expect(result.text).toBe('original local'); expect(result.key).toBe('maps/master/existing.webp');
});
test('falha de entrega exibe aviso sem recorrer ao R2', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => {
    window.uploads = 0; APP.uploadMesaMap = async () => { uploads++; };
    _sendRealtime = () => true;
    mesaMapState.playersOnline = true; mesaMapAckSet.clear();
    announceMapToPlayers({ id: 'test', name: 'Mapa', hash: 'hash', blob: new Blob(['original']) });
  });
  await page.clock.fastForward(31000);
  expect(await page.evaluate(() => uploads)).toBe(0);
  await expect(page.locator('.ui-toast').last()).toContainText('nao foi enviado para a nuvem');
});

test('confirmacao de um jogador nao esconde a falha de entrega ao outro', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => {
    _sendRealtime = () => true; mesaMapState.playersOnline = true;
    state.onlineUsers = [{ username: 'a', role: 'player' }, { username: 'b', role: 'player' }];
    announceMapToPlayers({ id: 'test', name: 'Mapa', hash: 'hash', blob: new Blob(['original']) });
    mesaMapAckSet.add('a');
  });
  await page.clock.fastForward(31000);
  await expect(page.locator('.ui-toast').last()).toContainText('nao foi enviado para a nuvem');
});
