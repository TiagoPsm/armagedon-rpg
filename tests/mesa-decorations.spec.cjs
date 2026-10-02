const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = []; errors.set(page, found); page.on('pageerror', e => found.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(() => {
    applyMesaSceneDrawingsFromSnapshot([{ id: 'decoration', tool: 'rect', color: '#a83028', width: 3, x1: .35, y1: .4, x2: .55, y2: .6, points: null, layer: 'tokens', author: 'gm' }]);
    setInteractionMode('select');
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
async function lockUI(page) {
  const r = await page.locator('#mesaStageInner').boundingBox();
  await page.mouse.click(r.x + r.width * .45, r.y + r.height * .5);
  expect(await page.evaluate(() => getSelectedStrokeIds().size)).toBe(1);
  await page.locator('#mesaDrawToggleBtn').click(); await page.locator('#mesaDecorationLock').click();
  expect(await page.evaluate(() => getDrawingsSnapshot()[0].locked)).toBe(true);
}
test('C3 master explicitly locks/unlocks; decoration ignores selection and erasing, survives F5', async ({ page }, info) => {
  await lockUI(page);
  expect(await page.evaluate(() => getSelectedStrokeIds().size)).toBe(0);
  const id = await page.evaluate(() => getDrawingsSnapshot()[0].id);
  expect(await page.evaluate(id => _tryClickSelectStroke(...(() => { const r = document.getElementById('mesaStageInner').getBoundingClientRect(); return [r.left + r.width * .45, r.top + r.height * .5]; })()), id)).toBe(false);
  await page.evaluate(id => deleteDrawingsById([id]), id); expect(await page.evaluate(() => getDrawingsSnapshot().length)).toBe(1);
  await page.locator('#mesaDecorationList').selectOption(id); await page.screenshot({ path: info.outputPath('decoracao-bloqueada.png') });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(mesaSceneStorageKey()))?.drawings?.[0]?.locked)).toBe(true);
  await page.reload(); await expect.poll(() => page.evaluate(() => getDrawingsSnapshot()[0]?.locked)).toBe(true);
  await page.locator('#mesaDrawToggleBtn').click(); await page.locator('#mesaDecorationList').selectOption(id); await page.locator('#mesaDecorationUnlock').click();
  expect(await page.evaluate(() => getDrawingsSnapshot()[0].locked)).toBeUndefined();
  const r = await page.locator('#mesaStageInner').boundingBox();
  expect(await page.evaluate(r => _tryClickSelectStroke(r.x + r.width * .45, r.y + r.height * .5), r)).toBe(true);
});
test('C3 blocked stale selection cannot move/resize and player cannot unlock', async ({ page }) => {
  await page.evaluate(() => setMesaDrawingLocks(['decoration'], true));
  const before = await page.evaluate(() => getDrawingsSnapshot());
  await page.evaluate(id => { _selectedStrokeIds.add(id); _applyMoveDelta(10, 10); _applyResizeDelta('se', { x1: 35, y1: 40, x2: 65, y2: 70 }, { x1: 35, y1: 40, x2: 55, y2: 60 }); }, before[0].id);
  expect(await page.evaluate(() => getDrawingsSnapshot())).toEqual(before);
  expect(await page.evaluate(id => { state.role = 'player'; state.session.role = 'player'; MesaDecorations.render(); return setMesaDrawingLocks([id], false); }, before[0].id)).toBe(false);
  await page.locator('#mesaDrawToggleBtn').click(); await expect(page.locator('#mesaDecorationTools')).toBeHidden();
});
