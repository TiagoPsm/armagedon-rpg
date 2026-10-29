const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');

test.afterAll(closeMesaTestServer);

for (const version of [3, 4]) {
  test(`banco de mapas v${version} preserva dados e inicializa controles do mestre`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = await getMesaBaseUrl();
    await page.goto(`${base}/favicon.ico`);
    await page.evaluate(version => new Promise((resolve, reject) => {
      const request = indexedDB.open('armagedom_maps', version);
      request.onupgradeneeded = () => {
        const db = request.result;
        const maps = db.createObjectStore('maps', { keyPath: 'id' });
        maps.createIndex('createdAt', 'createdAt');
        db.createObjectStore('settings', { keyPath: 'key' });
        if (version === 4) db.createObjectStore('catalog', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([...db.objectStoreNames], 'readwrite');
        tx.objectStore('maps').put({ id: 'preserved', name: 'Mapa preservado', createdAt: 1, blob: new Blob(['mapa original']) });
        tx.objectStore('settings').put({ key: 'preserved', value: 'preferencia original' });
        if (version === 4) tx.objectStore('catalog').put({ id: 'preserved-catalog', name: 'Catalogo preservado' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), version);

    await page.goto(`${base}/mesa.html`);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect.poll(() => page.evaluate(() => !!mesaMapState.db && mesaMapState._initDone)).toBe(true);
      await expect(page.locator('#mesaMapSettingsBtn')).toBeVisible();
      await expect(page.locator('#mesaLayerDmBtn')).toBeVisible();
      await expect(page.locator('#mesaLayerMapBtn')).toBeVisible();
      await page.locator('#mesaMapSettingsBtn').click();
      await expect(page.locator('#mesaGridCalibrate')).toBeVisible();
      await expect(page.locator('#mesaVisionPanel, #mesaVisionCanvas, #mesaWallCanvas')).toHaveCount(0);
      const data = await page.evaluate(async () => {
        const db = mesaMapState.db;
        const read = (store, key) => new Promise((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const map = await read('maps', 'preserved');
        return { role: state.role, version: db.version, map: map.name, blob: await map.blob.text(),
          setting: (await read('settings', 'preserved')).value, catalog: await read('catalog', 'preserved-catalog') };
      });
      expect(data).toMatchObject({ role: 'master', version: 4, map: 'Mapa preservado', blob: 'mapa original', setting: 'preferencia original' });
      if (version === 4) expect(data.catalog.name).toBe('Catalogo preservado');
      if (attempt === 0) await page.reload();
    }
    await page.screenshot({ path: info.outputPath(`mestre-banco-v${version}.png`) });
    expect(errors).toEqual([]);
  });
}
