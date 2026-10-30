const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.ARMAGEDON_CONFIG = { mesaLocalScenes: true }; });
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
});

test('movimento nao importa escala de outro viewport', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const token = { ...buildRoster()[0], id: 'scale-test', x: 20, y: 20, tokenScale: .5, layer: 'tokens' };
    state.tokens = [token]; renderStage();
    await MesaLocalSession.commitMove(token, { path: [{ x: 35.123456, y: 20 }], tokenScale: 1.5 });
    return { scale: token.tokenScale, x: token.x };
  });
  expect(result).toEqual({ scale: .5, x: 35.123456 });
});
test('cenas locais salvam, recarregam e importam backup sem imagens ou chamadas D1', async ({ page }) => {
  const requests = []; page.on('request', request => { if (/\/api\/mesa\/scene/.test(request.url())) requests.push(request.url()); });
  const id = await page.evaluate(async () => {
    const scene = await APP.createMesaScene('Sala de teste'); await APP.activateMesaScene(scene.id);
    state.tokens = [{ ...buildRoster()[0], id: 'saved', characterKey: buildRoster()[0].id, x: 25, y: 35, layer: 'tokens', imageUrl: 'data:image/png;base64,AA==' }];
    updateMesaGrid({ enabled: true, cellFrac: .1, metersPerCell: 3 }, { conform: false });
    persistState({ immediate: true });
    return scene.id;
  });
  await expect.poll(() => page.evaluate(async id => (await MesaLocalStore.read(id))?.data?.tokens?.[0]?.x, id)).toBe(25);
  const backup = await page.evaluate(id => MesaLocalStore.exportScene(id), id);
  expect(backup).not.toContain('data:image');
  await page.reload(); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  expect(await page.evaluate(() => ({ id: state.sceneId, x: state.tokens[0].x, grid: getMesaGridState().metersPerCell }))).toEqual({ id, x: 25, grid: 3 });
  const imported = await page.evaluate(async text => {
    const scene = await MesaLocalStore.importScene(text); await APP.activateMesaScene(scene.id); return scene;
  }, backup);
  expect(imported.id).not.toBe(id); expect(imported.data.tokens[0].x).toBe(25);
  expect(requests).toEqual([]);
});
test('escritas simultaneas nao sobrescrevem revisoes e backup invalido nao altera dados', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const scene = await APP.createMesaScene('Concorrencia');
    const outcomes = await Promise.allSettled([MesaLocalStore.write({ ...scene, name: 'A' }, scene.revision), MesaLocalStore.write({ ...scene, name: 'B' }, scene.revision)]);
    const before = JSON.stringify(await MesaLocalStore.list()); let rejected = false;
    try { await MesaLocalStore.importScene('{"format":"armagedom-scene","version":1,"scene":{"name":"invalida","data":{"tokens":"bad"}}}'); } catch { rejected = true; }
    return { successes: outcomes.filter(x => x.status === 'fulfilled').length, rejected, unchanged: before === JSON.stringify(await MesaLocalStore.list()) };
  });
  expect(result).toEqual({ successes: 1, rejected: true, unchanged: true });
});

test('troca imediata de cena conclui salvamento e isola tokens secretos', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const first = await APP.createMesaScene('Primeira'), second = await APP.createMesaScene('Segunda');
    await APP.activateMesaScene(first.id);
    state.tokens = [{ id: 'secret-first', characterKey: 'npc:secret-first', type: 'npc', name: 'Reservado', layer: 'dm', x: 10, y: 20, tokenScale: .5 }];
    bumpMesaSceneVersion(); persistState();
    await APP.activateMesaScene(second.id);
    const secondTokens = state.tokens.length;
    await APP.activateMesaScene(first.id);
    const saved = await MesaLocalStore.read(first.id);
    const newest = saved.data.sceneVersion;
    await APP.saveMesaScene({ tokens: [], sceneVersion: newest - 1 }, { sceneId: first.id });
    return { secondTokens, restored: state.tokens.map(t => t.id), saved: (await MesaLocalStore.read(first.id)).data.tokens.map(t => t.id) };
  });
  expect(result).toEqual({ secondTokens: 0, restored: ['secret-first'], saved: ['secret-first'] });
});

test('fechar a pagina e abrir outra recupera a cena do computador', async ({ page, context }) => {
  const scene = await page.evaluate(async () => {
    const scene = await APP.createMesaScene('Sobrevive ao fechamento'); await APP.activateMesaScene(scene.id);
    await APP.saveMesaScene({ tokens: [], grid: { enabled: true, cellFrac: .1, metersPerCell: 5 } }, { sceneId: scene.id }); return scene;
  });
  await page.close();
  const reopened = await context.newPage();
  await reopened.addInitScript(() => { window.ARMAGEDON_CONFIG = { mesaLocalScenes: true }; });
  await reopened.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => reopened.evaluate(() => state.bootCompleted)).toBe(true);
  expect(await reopened.evaluate(() => state.sceneId)).toBe(scene.id);
  expect(await reopened.evaluate(() => getMesaGridState().metersPerCell)).toBe(5);
});

test('mapas e referencias permanecem separados por cena, incluindo backup e recarga', async ({ page }, info) => {
  const ids = await page.evaluate(async () => {
    const scenes = [];
    for (const [index, color] of ['red', 'blue'].entries()) {
      const scene = await APP.createMesaScene('Mapa ' + color); await APP.activateMesaScene(scene.id);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 4);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const map = { id: 'map-' + index, name: color, blob, hash: await computeBlobHash(blob), createdAt: new Date().toISOString() };
      await saveMesaMapToDB(map); await setActiveMapFromLibrary(map.id); scenes.push({ id: scene.id, map: map.id });
    }
    return scenes;
  });
  await expect.poll(() => page.evaluate(async id => (await MesaLocalStore.read(id))?.data?.map?.id, ids[1].id)).toBe(ids[1].map);
  await page.evaluate(id => APP.activateMesaScene(id), ids[0].id);
  await expect.poll(() => page.evaluate(() => mesaMapState.activeMapId)).toBe(ids[0].map);
  const backup = JSON.parse(await page.evaluate(id => MesaLocalStore.exportScene(id), ids[0].id));
  expect(backup.scene.data.map).toMatchObject({ id: ids[0].map, localOnly: true });
  expect(backup.scene.data.map).not.toHaveProperty('blob'); expect(backup.scene.data.map).not.toHaveProperty('url');
  await page.reload(); await expect.poll(() => page.evaluate(() => mesaMapState._initDone)).toBe(true);
  await expect.poll(() => page.evaluate(() => mesaMapState.activeMapId)).toBe(ids[0].map);
  await page.locator('#mesaMapSettingsBtn').click();
  await expect(page.locator('.mesa-local-scenes-controls')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar cena JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Importar backup JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copiar cenas antigas do servidor' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('ajustes-sem-painel-local.png') });
});

test('movimento do mestre salva o destino antes de animar, inclusive na camada secreta', async ({ page }) => {
  const result = await page.evaluate(async () => {
    state.tokens = [{ id: 'private', characterKey: 'npc:private', type: 'npc', name: 'Segredo', layer: 'dm', x: 10, y: 20, tokenScale: .5 }];
    const token = state.tokens[0];
    await APP.saveMesaScene(createMesaScenePayloadFromState(), { sceneId: state.sceneId });
    await MesaLocalSession.commitMove(token, { path: [{ x: 30, y: 20 }], tokenScale: .5 });
    const saved = await MesaLocalStore.read(state.sceneId);
    return { x: saved.data.tokens[0].x, layer: saved.data.tokens[0].layer, visual: MesaMovement.visual(token).x };
  });
  expect(result.x).toBe(30); expect(result.layer).toBe('dm'); expect(result.visual).toBeLessThan(30);
});

test('rascunho sincronico recupera fechamento antes da gravacao IndexedDB', async ({ page }) => {
  await page.evaluate(async () => {
    const scene = await APP.createMesaScene('Recuperacao'); await APP.activateMesaScene(scene.id);
    MesaLocalSession.journal({ tokens: [], sceneVersion: Date.now(), grid: { enabled: true, cellFrac: .1, metersPerCell: 7 } });
  });
  await page.reload(); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  expect(await page.evaluate(() => getMesaGridState().metersPerCell)).toBe(7);
  expect(await page.evaluate(async () => (await MesaLocalStore.read(state.sceneId)).data.grid.metersPerCell)).toBe(7);
});

test('transmissao atrasada de outra cena guarda o cache sem substituir o mapa atual', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const hash = await computeBlobHash(blob);
    await _reassembleAndApply({ sceneId: 'cena-antiga', hash, name: 'Atrasado', chunks: [await blob.arrayBuffer()] });
    return { cached: Boolean(await findCachedMapByHash(hash)), visible: !document.getElementById('mesaMapLayer').hidden };
  });
  expect(result).toEqual({ cached: true, visible: false });
});

test('cache cheio nao impede IndexedDB e nao ressuscita tokens secretos removidos', async ({ page }) => {
  await page.evaluate(async () => {
    const scene = await APP.createMesaScene('Cache cheio'); await APP.activateMesaScene(scene.id);
    const token = { id: 'kept', characterKey: 'npc:kept', type: 'npc', name: 'Mantido', layer: 'dm', x: 10, y: 20, tokenScale: .5 };
    await APP.saveMesaScene({ tokens: [token] }, { sceneId: scene.id });
    localStorage.setItem(mesaSceneStorageKey(), JSON.stringify({ tokens: [token, { ...token, id: 'removed' }] }));
  });
  await page.reload(); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  expect(await page.evaluate(() => state.tokens.map(t => t.id))).toEqual(['kept']);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === mesaSceneStorageKey() || key.startsWith('armagedom-local-journal:')) throw new DOMException('Cheio', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    state.tokens[0].x = 35; bumpMesaSceneVersion(); persistState({ immediate: true });
  });
  await expect.poll(() => page.evaluate(async () => (await MesaLocalStore.read(state.sceneId)).data.tokens[0].x)).toBe(35);
  await page.reload(); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  expect(await page.evaluate(() => state.tokens[0].x)).toBe(35);
});
