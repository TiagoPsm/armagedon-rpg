const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => { await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true); });
test('U1 contextual shortcuts match buttons and never fire inside fields', async ({ page }, info) => {
  await page.keyboard.press('w'); expect(await page.evaluate(() => mesaVisionMode)).toBe('off');
  await page.locator('#mesaMapSettingsBtn').click(); await page.keyboard.press('w'); await expect(page.locator('#mesaVisionWall')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('d'); await expect(page.locator('#mesaVisionDoor')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await page.locator('#mesaGridReferenceCells').focus(); await page.keyboard.press('w');
  expect(await page.evaluate(() => mesaVisionMode)).toBe('off'); await page.locator('#mesaGridReferenceCells').blur();
  await page.keyboard.press('?'); expect(await page.locator('#mesaToolsHelp').evaluate(d => d.open)).toBe(true);
  await expect(page.locator('#mesaToolsHelp summary')).toBeFocused(); await page.screenshot({ path: info.outputPath('atalhos.png') });
});
test('U1 template Ctrl Z/Y uses its history and typing does not erase drawings', async ({ page }) => {
  await page.locator('#mesaDrawToggleBtn').click(); await page.locator('#mesaTemplateCircle').click();
  const r = await page.locator('#mesaStageInner').boundingBox(); await page.mouse.move(r.x + r.width * .4, r.y + r.height * .5); await page.mouse.down(); await page.mouse.move(r.x + r.width * .6, r.y + r.height * .5); await page.mouse.up();
  await page.locator('#mesaTemplateLength').focus(); await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => getDrawingsSnapshot().filter(s => s.template).length)).toBe(1);
  await page.locator('#mesaTemplateLength').blur(); await page.keyboard.press('Control+z'); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '0');
  await page.keyboard.press('Control+y'); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '1');
  await page.keyboard.press('Delete'); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '0');
});
