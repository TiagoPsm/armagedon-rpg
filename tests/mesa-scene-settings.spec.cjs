const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.locator('#mesaMapSettingsBtn').click();
  await page.evaluate(() => { updateMesaGrid({ enabled: true, snap: true, cellFrac: .1, metersPerCell: 5, offsetXFrac: .2 }, { conform: false }); });
  await page.locator('#mesaSettingsCopy').click();
  await page.evaluate(() => { state.sceneId = 'second'; applyMesaSceneGridFromSnapshot(null); });
});
test('C1 preview/apply reuse only declared settings and preserve all content', async ({ page }, info) => {
  const original = await page.evaluate(() => createMesaScenePayloadFromState());
  await page.locator('#mesaSettingsPreview').click(); await expect(page.locator('#mesaSettingsDraft')).toBeVisible();
  expect(await page.evaluate(() => getMesaGridState().enabled)).toBe(false);
  await page.locator('#mesaSettingsDraft').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('previa-ajustes.png') });
  await page.locator('#mesaSettingsApply').click();
  expect(await page.evaluate(() => getMesaGridState())).toMatchObject({ enabled: true, snap: true, cellFrac: .1, metersPerCell: 5, offsetXFrac: .2 });
  const next = await page.evaluate(() => createMesaScenePayloadFromState());
  for (const key of ['tokens', 'map', 'drawings', 'fog']) expect(next[key]).toEqual(original[key]);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(mesaSceneStorageKey()))?.grid?.enabled)).toBe(true);
});
for (const method of ['cancel', 'Escape', 'conflict', 'scene', 'calibration', 'templates']) test(`C1 ${method} cannot commit stale preview`, async ({ page }) => {
  await page.locator('#mesaSettingsPreview').click(); const original = await page.evaluate(() => getMesaGridState());
  if (method === 'cancel') await page.locator('#mesaSettingsCancel').click();
  if (method === 'Escape') await page.keyboard.press('Escape');
  if (method === 'conflict') await page.evaluate(() => { updateMesaGrid({ metersPerCell: 7 }, { conform: false }); });
  if (method === 'scene') await page.evaluate(() => { state.sceneId = 'third'; renderStage(); });
  if (method === 'calibration') await page.locator('#mesaGridCalibrate').click();
  if (method === 'templates') await page.evaluate(() => MesaTemplates.begin('circle'));
  await expect(page.locator('#mesaSettingsDraft')).toBeHidden(); if (method !== 'conflict') expect(await page.evaluate(() => getMesaGridState())).toEqual(original);
});
