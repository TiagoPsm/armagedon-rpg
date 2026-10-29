const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted && Boolean(mesaMapState.db))).toBe(true);
});
async function seed(page, count = 400) {
  return page.evaluate(async count => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    canvas.getContext('2d').fillRect(0, 0, 512, 256);
    const blob = await new Promise(r => canvas.toBlob(r));
    const start = performance.now();
    await new Promise((resolve, reject) => {
      const tx = mesaMapState.db.transaction([MESA_MAP_STORE, MESA_MAP_CATALOG_STORE], 'readwrite');
      for (let i = 0; i < count; i++) {
        const map = { id: `fixture-${i}`, name: i === 0 ? 'Cavérna Ártica' : `Mapa ${i}`, createdAt: count - i, blob };
        tx.objectStore(MESA_MAP_STORE).put(map); tx.objectStore(MESA_MAP_CATALOG_STORE).put(mesaMapCatalogEntry(map));
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    window.sourceReads = 0; const load = loadMesaMapFromDB;
    loadMesaMapFromDB = (...args) => { window.sourceReads++; return load(...args); };
    await renderMapLibrary(); return performance.now() - start;
  }, count);
}
test('C2 catalog of 400 maps reads originals only when visible; search is accent insensitive', async ({ page }, info) => {
  const duration = await seed(page);
  expect(await page.evaluate(() => sourceReads)).toBe(0);
  await page.locator('#mesaLayerMapBtn').click();
  await expect(page.locator('[data-lib-thumb="fixture-0"]')).toHaveAttribute('data-thumb-state', 'ready');
  expect(await page.evaluate(() => sourceReads)).toBeLessThan(20);
  console.log(`C2 catalog: 400 entries, metadata seed+render ${duration.toFixed(1)}ms, visible original reads ${await page.evaluate(() => sourceReads)}`);
  await page.locator('#mesaMapSearch').fill('caverna artica');
  await expect(page.locator('#mapLibraryList .map-lib-entry')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('biblioteca-busca.png') });
  expect(await page.evaluate(() => sourceReads)).toBeLessThan(20);
  await expect.poll(() => page.evaluate(async () => (await listMesaMapCatalog()).find(m => m.id === 'fixture-0')?.thumbnail?.size > 0)).toBe(true);
  await page.locator('[data-lib-action="set"]').click(); await expect.poll(() => page.evaluate(() => mesaMapState.activeMapId)).toBe('fixture-0');
  expect(await page.evaluate(async () => (await loadMesaMapFromDB('fixture-0')).blob.size)).toBeGreaterThan(0);
  await page.locator('#mesaMapSearch').fill('nenhumresultado'); await expect(page.locator('#mapLibraryList')).toContainText('Nenhum resultado');
  await info.attach('catalog-metrics', { body: JSON.stringify({ maps: 400, seedAndRenderMs: duration, sourceReads: await page.evaluate(() => sourceReads) }), contentType: 'application/json' });
});
test('C2 v3 upgrade keeps original file and builds metadata; missing/corrupt images have feedback', async ({ page }) => {
  await page.evaluate(async () => {
    mesaMapState.db.close();
    await new Promise((resolve, reject) => { const req = indexedDB.deleteDatabase(MESA_MAP_DB_NAME); req.onsuccess = resolve; req.onerror = () => reject(req.error); });
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(MESA_MAP_DB_NAME, 3);
      req.onupgradeneeded = () => { req.result.createObjectStore('maps', { keyPath: 'id' }); req.result.createObjectStore('settings', { keyPath: 'key' }); };
      req.onsuccess = () => { const tx = req.result.transaction('maps', 'readwrite'); tx.objectStore('maps').put({ id: 'legacy', name: 'Mapa antigo', createdAt: 1, blob: new Blob(['invalid']) }); tx.oncomplete = () => { req.result.close(); resolve(); }; }; req.onerror = () => reject(req.error);
    });
    mesaMapState.db = await openMesaMapDB(); await renderMapLibrary();
  });
  expect(await page.evaluate(async () => (await loadMesaMapFromDB('legacy')).blob.text())).toBe('invalid');
  expect(await page.evaluate(async () => (await listMesaMapCatalog())[0].name)).toBe('Mapa antigo');
  await page.locator('#mesaLayerMapBtn').click();
  await expect(page.locator('[data-lib-thumb="legacy"]')).toHaveAttribute('data-thumb-state', 'error');
  await page.locator('[data-lib-action="set"]').click(); await expect(page.locator('.ui-toast').last()).toContainText('indisponível');
  await page.evaluate(() => setActiveMapFromLibrary('missing')); await expect(page.locator('.ui-toast').last()).toContainText('indisponível');
  expect(await page.evaluate(() => mesaMapState.activeMapId)).toBeFalsy();
});
test('C2 connected folder reads only visible files, searches nested paths and preserves source', async ({ page }) => {
  await page.evaluate(() => {
    window.fileReads = 0;
    connectedFolder.handle = {}; connectedFolder.name = 'Local'; connectedFolder.permissionState = 'granted';
    connectedFolder.entries = Array.from({ length: 100 }, (_, i) => ({ path: `Cavérnas/Nível ${i}.png`, fullName: `Cavérnas / Nível ${i}.png`, size: 10, lastModified: 1, handle: { getFile: async () => { fileReads++; throw new Error('missing fixture'); } } }));
    renderConnectedFolderUI();
  });
  await page.locator('#mesaLayerMapBtn').click(); expect(await page.evaluate(() => fileReads)).toBe(0);
  await page.locator('#mesaMapSearch').fill('cavernas nivel 99');
  await expect(page.locator('[data-cf-path="Cavérnas/Nível 99.png"].map-lib-thumb')).toHaveAttribute('data-thumb-state', 'error');
  expect(await page.evaluate(() => fileReads)).toBe(1);
  expect(await page.evaluate(() => connectedFolder.entries.length)).toBe(100);
  await page.locator('[data-cf-action="set"]').click(); await expect(page.locator('.ui-toast').last()).toContainText('indisponível');
});

for (const kind of ['scene', 'newer']) test(`C2 pending image cannot replace a ${kind} selection`, async ({ page }) => {
  await seed(page, 2);
  await page.evaluate(() => {
    const original = loadMesaMapFromDB;
    window.originalMapLoad = original;
    loadMesaMapFromDB = id => id === 'fixture-0' ? new Promise(resolve => { window.releaseMap = async () => resolve(await original(id)); }) : original(id);
    window.pendingMap = setActiveMapFromLibrary('fixture-0');
  });
  await expect.poll(() => page.evaluate(() => typeof releaseMap)).toBe('function');
  if (kind === 'scene') await page.evaluate(() => { state.sceneId = 'other'; });
  else await page.evaluate(() => setActiveMapFromLibrary('fixture-1'));
  await page.evaluate(async () => { await releaseMap(); await pendingMap; });
  expect(await page.evaluate(() => mesaMapState.activeMapId)).toBe(kind === 'scene' ? '' : 'fixture-1');
});

test('QA thumbnail eviction reloads old visible rows instead of leaving revoked URLs', async ({ page }) => {
  test.setTimeout(90000);
  await seed(page, 140); await page.locator('#mesaLayerMapBtn').click();
  const first = page.locator('[data-lib-thumb="fixture-0"]');
  await expect(first).toHaveAttribute('data-thumb-state', 'ready');
  const oldURL = await first.evaluate(e => e.style.backgroundImage.slice(5, -2));
  for (let i = 0; i < 140; i += 3) {
    const item = page.locator(`[data-lib-thumb="fixture-${i}"]`);
    await item.scrollIntoViewIfNeeded(); await expect(item).toHaveAttribute('data-thumb-state', 'ready');
  }
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-lib-thumb]')].filter(e => e.dataset.thumbState === 'ready').length)).toBeGreaterThanOrEqual(128);
  await first.scrollIntoViewIfNeeded(); await expect(first).toHaveAttribute('data-thumb-state', 'ready');
  const imageLoads = await first.evaluate(e => new Promise(resolve => {
    const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false);
    image.src = e.style.backgroundImage.slice(5, -2);
  }));
  expect(imageLoads, `Returning to the first map must not use a revoked URL (${oldURL})`).toBe(true);
});
