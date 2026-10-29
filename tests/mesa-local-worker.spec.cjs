const { test, expect } = require('@playwright/test');
const API = process.env.ARMAGEDON_LOCAL_WORKER;
const SITE = process.env.ARMAGEDON_LOCAL_SITE;
test.skip(!API || !SITE, 'Exige Worker local e contas descartaveis do runner.');
test('mestre salva localmente e confirma dois jogadores; reconexao recupera estado sem PUT de cenas', async ({ browser, request }) => {
  test.setTimeout(90000);
  const login = async (username, password) => {
    const response = await request.post(`${API}/auth/login`, { data: { username, password } });
    expect(response.status()).toBe(200); return response.json();
  };
  const master = await login('mestre', process.env.ARMAGEDON_LOCAL_MASTER_PASSWORD);
  const username = 'localplayer2', password = process.env.ARMAGEDON_LOCAL_PLAYER_PASSWORD;
  expect((await request.post(`${API}/directory/players`, { headers: { authorization: `Bearer ${master.token}` }, data: { username, password, charName: 'Segundo jogador' } })).status()).toBe(201);
  const player1 = await login('jogador1', password), player2 = await login(username, password);
  const writes = [], contexts = [], sentSceneChunks = [], browserErrors = [];
  async function open(session, role) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', frame => {
      try { const message = JSON.parse(String(frame.payload)); if (message.type === 'mesa:host:chunk') sentSceneChunks.push(message.text); } catch {}
    }));
    page.on('request', r => { if (/\/api\/mesa\/scene/.test(r.url()) || (/\/api\/mesa\/map/.test(r.url()) && r.method() !== 'GET')) writes.push(r.url()); });
    await page.addInitScript(({ api, session, role }) => {
      window.ARMAGEDON_CONFIG = { mesaLocalScenes: true, apiBaseUrl: api, realtimeEnabled: true };
      localStorage.setItem('tc_session', JSON.stringify({ username: session.user.username, role, token: session.token, backend: true }));
    }, { api: API, session, role });
    await page.goto(`${SITE}/mesa.html`);
    await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
    await expect.poll(() => page.evaluate(() => state.realtimeStatus)).toBe('online');
    return page;
  }
  try {
    const host = await open(master, 'master');
    await expect.poll(() => host.evaluate(() => MesaLocalSession.isHost)).toBe(true);
    await host.evaluate(async () => {
      state.tokens = ['jogador1', 'localplayer2'].map((id, i) => ({ id, characterKey: id, type: 'player', ownerUsername: id, name: id, x: 20, y: 20 + i * 20, tokenScale: .5, order: i + 1, layer: 'tokens', visibleToPlayers: true }));
      state.tokens.push({ ...state.tokens[0], id: 'private', characterKey: 'npc:private', name: 'Segredo', layer: 'dm' });
      applyMesaSceneDrawingsFromSnapshot(Array.from({ length: 120 }, (_, index) => ({ id: 'stroke-' + index, tool: 'pencil', color: '#ffffff', width: 2, layer: index === 119 ? 'dm' : 'tokens', author: 'mestre', x1: 0, y1: 0, x2: .49, y2: .49, points: Array.from({ length: 50 }, (_, p) => [p / 100, (index % 50) / 100]) })));
      if (state.playersMoveLocked) toggleMesaMoveLock();
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#802020'; ctx.fillRect(0, 0, 240, 160);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await saveMesaMapToDB({ id: 'host-test-map', name: 'Mapa transmitido', hash: await computeBlobHash(blob), blob });
      await setActiveMapFromLibrary('host-test-map');
      persistState({ immediate: true });
    });
    await expect.poll(() => host.evaluate(async () => (await MesaLocalStore.read('default')).data.tokens.length)).toBe(3);
    const duplicate = await open(master, 'master');
    await expect(duplicate.locator('.ui-toast').last()).toContainText('outro mestre anfitriao');
    expect(await duplicate.evaluate(async () => { try { await APP.createMesaScene('Recusada'); return false; } catch { return true; } })).toBe(true);
    await duplicate.close();
    const a = await open(player1, 'player'), b = await open(player2, 'player');
    for (const page of [a, b]) {
      await expect.poll(() => page.evaluate(() => state.tokens.length)).toBe(2);
      expect(await page.evaluate(() => state.tokens.some(t => t.id === 'private'))).toBe(false);
      // O editor atual tem camada unica de desenhos e normaliza todos como compartilhados.
      await expect.poll(() => page.evaluate(() => getDrawingsSnapshot().length)).toBe(120);
      expect(await page.evaluate(() => getDrawingsSnapshot().some(s => s.layer === 'dm'))).toBe(false);
      await expect.poll(() => page.evaluate(() => Boolean(mesaMapState.activeMapId && !document.getElementById('mesaMapLayer').hidden)), { timeout: 15000 }).toBe(true);
      expect(await page.evaluate(async () => (await loadMesaMapFromDB(mesaMapState.activeMapId)).hash)).toBe(await host.evaluate(() => mesaMapState.activeEntry.hash));
    }
    async function move(page, id, x) {
      await page.evaluate(async ({ id, x }) => {
        const token = findToken(id); await MesaLocalSession.requestMove(token, { path: [{ x, y: token.y }], tokenScale: token.tokenScale });
      }, { id, x });
    }
    await Promise.all([move(a, 'jogador1', 40), move(b, username, 60)]);
    for (const page of [host, a, b]) {
      await expect.poll(() => page.evaluate(() => findToken('jogador1')?.x)).toBeCloseTo(40, 2);
      await expect.poll(() => page.evaluate(() => findToken('localplayer2')?.x)).toBeCloseTo(60, 2);
    }
    await a.evaluate(() => APP.sendRealtime({ type: 'mesa:host:move', requestId: 'forged', sceneId: 'default', tokenId: 'localplayer2', origin: { x: 60, y: 40 }, path: [{ x: 90, y: 40 }] }));
    await host.waitForTimeout(250);
    expect(await host.evaluate(() => findToken('localplayer2').x)).toBe(60);
    const other = await host.evaluate(async () => { const s = await APP.createMesaScene('Outra cena'); await APP.activateMesaScene(s.id); return s.id; });
    for (const page of [a, b]) {
      await expect.poll(() => page.evaluate(() => state.sceneId)).toBe(other);
      expect(await page.evaluate(() => state.tokens.length)).toBe(0);
      expect(await page.locator('#mesaMapLayer').isHidden()).toBe(true);
    }
    await host.evaluate(() => APP.activateMesaScene('default'));
    for (const page of [a, b]) {
      await expect.poll(() => page.evaluate(() => findToken('jogador1')?.x)).toBe(40);
      await expect(page.locator('#mesaMapLayer')).toBeVisible();
    }
    await host.reload();
    await expect.poll(() => host.evaluate(() => MesaLocalSession.isHost)).toBe(true);
    expect(await host.evaluate(() => findToken('jogador1').x)).toBe(40);
    await b.reload();
    await expect.poll(() => b.evaluate(() => findToken('localplayer2')?.x)).toBe(60);
    await host.close();
    await expect(a.locator('.ui-toast').last()).toContainText('Mestre anfitriao desconectado');
    await move(a, 'jogador1', 70);
    await expect(a.locator('.ui-toast').last()).toContainText('Mestre anfitriao desconectado');
    expect(await a.evaluate(() => findToken('jogador1').x)).toBe(40);
    expect(writes).toEqual([]);
    expect(sentSceneChunks.length).toBeGreaterThan(1);
    expect(sentSceneChunks.join('')).not.toContain('Segredo');
    expect(sentSceneChunks.join('')).not.toContain('"id":"private"');
    expect(browserErrors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});
