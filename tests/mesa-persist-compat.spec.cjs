const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
for (const field of ['template', 'locked']) test(`old server dropping ${field} never confirms the scene`, async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(field => {
    applyMesaSceneDrawingsFromSnapshot([{ id: 'drawing', tool: 'circle', color: '#e7c366', width: 2, author: 'gm', layer: 'tokens', x1: .2, y1: .2, x2: .6, y2: .6,
      ...(field === 'locked' ? { locked: true } : { template: { kind: 'circle', x: .4, y: .4, length: .2 } }) }]);
    window.AUTH.isBackendEnabled = () => true; window.attempts = 0; state.scenePersistence = 'remote';
    window.APP.saveMesaScene = async p => { attempts++; const data = JSON.parse(JSON.stringify(p)); for (const stroke of data.drawings) delete stroke[field]; return { data }; };
    persistState({ immediate: true });
  }, field);
  await expect.poll(() => page.evaluate(() => attempts)).toBe(1);
  await expect.poll(() => page.evaluate(() => !mesaRemotePersistInFlight && state.scenePersistence)).toBe('local');
  await expect(page.locator('.ui-toast').last()).toContainText('servidor precisa da atualização');
  expect(await page.evaluate(field => getDrawingsSnapshot()[0][field] != null, field)).toBe(true);
  expect(await page.evaluate(field => JSON.parse(localStorage.getItem(mesaSceneStorageKey())).drawings[0][field] != null, field)).toBe(true);
});
