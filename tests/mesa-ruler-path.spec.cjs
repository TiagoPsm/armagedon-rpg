const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(() => {
    window.__rulerMessages = [];
    window.APP = { ...window.APP, sendRealtime: v => { __rulerMessages.push(v); return true; } };
    window.AUTH = { ...window.AUTH, isBackendEnabled: () => true };
  });
});
test('T5 right click fixes a bend, Backspace removes it, release concludes', async ({ page }, info) => {
  const r = await page.locator('#mesaStageInner').boundingBox();
  await page.keyboard.down('Shift'); await page.mouse.move(r.x + r.width * .2, r.y + r.height * .3); await page.mouse.down();
  await page.mouse.move(r.x + r.width * .4, r.y + r.height * .3); await page.mouse.click(r.x + r.width * .4, r.y + r.height * .3, { button: 'right' });
  await page.mouse.move(r.x + r.width * .4, r.y + r.height * .6);
  await expect(page.locator('.mesa-ruler.is-self')).toHaveAttribute('data-waypoints', '1');
  const sent = await page.evaluate(() => __rulerMessages.filter(v => v.active).at(-1));
  expect(sent.points).toHaveLength(3);
  const measure = await page.evaluate(() => measureMesaRulerPath([_rulerStart, ..._rulerWaypoints, _rulerEnd]));
  expect(measure.cells).toBeCloseTo(10, 1);
  await page.screenshot({ path: info.outputPath('regua-curva.png') });
  await page.keyboard.press('Backspace'); await expect(page.locator('.mesa-ruler.is-self')).toHaveAttribute('data-waypoints', '0');
  await page.mouse.up(); await page.keyboard.up('Shift'); await expect(page.locator('.mesa-ruler.is-self')).toHaveCount(0);
  expect(await page.evaluate(() => __rulerMessages.at(-1).active)).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(createMesaScenePayloadFromState()).includes('ruler'))).toBe(false);
});
test('T5 remote bends, malformed payload rejection and legacy straight ruler', async ({ page }) => {
  await page.evaluate(() => applyMesaRulerFromRemote({ active: true, u1: .2, v1: .3, u2: .4, v2: .6, space: 'stage', actor: { username: 'Ana' }, points: [{ u: .2, v: .3 }, { u: .4, v: .3 }, { u: .4, v: .6 }] }));
  await expect(page.locator('.mesa-ruler-path')).toBeVisible();
  const label = await page.locator('.mesa-ruler-label').textContent();
  await page.evaluate(() => applyMesaRulerFromRemote({ active: true, u1: .2, v1: .3, u2: .4, v2: .6, actor: { username: 'Ana' }, points: [{ u: NaN, v: .3 }, { u: .4, v: .6 }] }));
  expect(await page.locator('.mesa-ruler-label').textContent()).toBe(label);
  await page.evaluate(() => applyMesaRulerFromRemote({ active: true, u1: .2, v1: .3, u2: .4, v2: .6, actor: { username: 'Ana' } }));
  await expect(page.locator('line.mesa-ruler-line')).toBeVisible(); await expect(page.locator('.mesa-ruler-path')).toBeHidden();
  await page.evaluate(() => applyMesaRulerFromRemote({ active: false, actor: { username: 'Ana' } }));
  await expect(page.locator('.mesa-ruler')).toHaveCount(0);
});
for (const method of ['Escape', 'blur', 'scene']) test(`T5 ${method} cancels an ephemeral path`, async ({ page }) => {
  const r = await page.locator('#mesaStageInner').boundingBox(); await page.keyboard.down('Shift');
  await page.mouse.move(r.x + r.width * .2, r.y + r.height * .3); await page.mouse.down(); await page.mouse.move(r.x + r.width * .4, r.y + r.height * .3);
  if (method === 'Escape') await page.keyboard.press('Escape');
  if (method === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  if (method === 'scene') { await page.evaluate(() => { state.sceneId = 'other'; }); await page.mouse.move(r.x + r.width * .5, r.y + r.height * .3); }
  await expect(page.locator('.mesa-ruler.is-self')).toHaveCount(0); await page.mouse.up(); await page.keyboard.up('Shift');
});
