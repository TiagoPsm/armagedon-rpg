const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = []; errors.set(page, found); page.on('pageerror', e => found.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.locator('#mesaDrawToggleBtn').click();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
async function circle(page) {
  await page.locator('#mesaTemplateCircle').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const r = await page.locator('#mesaStageInner').boundingBox();
  expect(await page.evaluate(r => document.elementFromPoint(r.x + .4 * r.width, r.y + .5 * r.height)?.id, r)).toBe('mesaTemplateCanvas');
  await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down();
  await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-gesture', 'size');
  await page.mouse.move(r.x + .6 * r.width, r.y + .5 * r.height);
  expect(await page.evaluate(() => getDrawingsSnapshot().filter(s => s.template).length)).toBe(0);
  await page.mouse.up(); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '1'); return r;
}
test('T1 circle uses the scene scale, preview/resize, undo/remove and F5', async ({ page }, info) => {
  const r = await circle(page);
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.length)).toBeCloseTo(.2, 3);
  await expect(page.locator('#mesaTemplateLength')).toHaveValue('6');
  await page.locator('#mesaTemplateLength').fill('12'); await page.locator('#mesaTemplateHint').click();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.length)).toBeCloseTo(.4, 3);
  await page.locator('#mesaTemplateUndo').click(); await expect(page.locator('#mesaTemplateLength')).toHaveValue('6');
  await page.screenshot({ path: info.outputPath('molde-circular.png') });
  await page.mouse.move(r.x + .6 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .55 * r.width, r.y + .5 * r.height); await page.mouse.up();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.length)).toBeCloseTo(.15, 3);
  await page.locator('#mesaTemplateRemove').click(); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '0');
  await page.locator('#mesaTemplateUndo').click(); await page.reload(); await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '1');
});
for (const kind of ['Escape', 'blur', 'cancel', 'remote']) test(`T1 ${kind} discards a circle draft`, async ({ page }) => {
  await page.locator('#mesaTemplateCircle').click(); const r = await page.locator('#mesaStageInner').boundingBox();
  await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .6 * r.width, r.y + .5 * r.height);
  if (kind === 'Escape') await page.keyboard.press('Escape');
  if (kind === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  if (kind === 'cancel') await page.locator('#mesaTemplateCanvas').dispatchEvent('pointercancel');
  if (kind === 'remote') await page.evaluate(() => { state.sceneId = 'new'; MesaTemplates.render(); });
  await page.mouse.up(); expect(await page.evaluate(() => getDrawingsSnapshot().filter(s => s.template))).toEqual([]);
});
test('T1 zoom keeps a circular shape sharp and remote metadata survives snapshot', async ({ page, context }) => {
  await circle(page); const payload = await page.evaluate(() => createMesaScenePayloadFromState());
  await page.evaluate(() => { mesaMapState.zoom = 4; _applyStageTransform(); });
  expect(await page.locator('#mesaTemplateCanvas').evaluate(c => c.width / c.getBoundingClientRect().width)).toBeGreaterThanOrEqual(.99);
  const other = await context.newPage(); await other.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => other.evaluate(() => state.bootCompleted)).toBe(true);
  await other.evaluate(p => applyMesaSceneSnapshot(p), payload);
  expect(await other.evaluate(() => getDrawingsSnapshot().filter(s => s.template))).toEqual(payload.drawings.filter(s => s.template)); await other.close();
});

test('measured overlay releases empty bitmap and caches unchanged paint', async ({ page }) => {
  expect(await page.locator('#mesaTemplateCanvas').evaluate(c => c.width * c.height)).toBe(1);
  await circle(page);
  const paints = await page.locator('#mesaTemplateCanvas').getAttribute('data-paint-count');
  await page.evaluate(() => { for (let i = 0; i < 5; i++) MesaTemplates.render(); });
  await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-paint-count', paints);
});

test('T2 cone drag defines direction/reach, inputs change opening and undo restores it', async ({ page }, info) => {
  await page.locator('#mesaTemplateCone').click(); const r = await page.locator('#mesaStageInner').boundingBox();
  await page.mouse.move(r.x + .4 * r.width, r.y + .4 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .4 * r.width, r.y + .6 * r.height); await page.mouse.up();
  await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '1');
  const t = await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template);
  expect(t.kind).toBe('cone'); expect(t.direction).toBeCloseTo(90); expect(t.length).toBeCloseTo(.2, 3);
  await page.locator('#mesaTemplateAperture').fill('60'); await page.locator('#mesaTemplateDirection').fill('180'); await page.locator('#mesaTemplateHint').click();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template)).toMatchObject({ direction: 180, aperture: 60 });
  await page.locator('#mesaTemplateUndo').click(); expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.direction)).toBeCloseTo(90);
  await page.screenshot({ path: info.outputPath('molde-cone.png') });
  await page.locator('#mesaTemplateAperture').fill('1'); await page.locator('#mesaTemplateHint').click();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.aperture)).toBe(60);
});

test('T3 rectangle dimensions and rotation stay proportionate in zoom and one undo', async ({ page }, info) => {
  await page.locator('#mesaTemplateRect').click(); const r = await page.locator('#mesaStageInner').boundingBox();
  await page.mouse.move(r.x + .5 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .6 * r.width, r.y + .55 * r.height); await page.mouse.up();
  await expect(page.locator('#mesaTemplateLength')).toHaveValue('6'); await expect(page.locator('#mesaTemplateWidth')).toHaveValue('3');
  await page.locator('#mesaTemplateDirection').fill('45'); await page.locator('#mesaTemplateHint').click();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template)).toMatchObject({ kind: 'rect', direction: 45 });
  await page.evaluate(() => setStageZoom(2)); await page.screenshot({ path: info.outputPath('molde-retangular.png') });
  await page.locator('#mesaTemplateUndo').click(); expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.direction)).toBe(0);
  await page.locator('#mesaTemplateWidth').fill('4'); await page.locator('#mesaTemplateHint').click();
  await expect(page.locator('#mesaTemplateWidth')).toHaveValue('4');
});
test('T4 line area has length/width, direction, remote shape and no automatic targets', async ({ page }, info) => {
  await page.locator('#mesaTemplateLine').click(); const r = await page.locator('#mesaStageInner').boundingBox();
  await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .7 * r.width, r.y + .5 * r.height); await page.mouse.up();
  await expect(page.locator('#mesaTemplateLength')).toHaveValue('9'); await expect(page.locator('#mesaTemplateWidth')).toHaveValue('1.5');
  await page.locator('#mesaTemplateWidth').fill('3'); await page.locator('#mesaTemplateDirection').fill('30'); await page.locator('#mesaTemplateHint').click();
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template)).toMatchObject({ kind: 'line', direction: 30, width: .1 });
  await page.screenshot({ path: info.outputPath('molde-linha.png') });
  await page.locator('#mesaTemplateUndo').click(); expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template).template.direction)).toBe(0);
  expect(await page.evaluate(() => state.drag)).toBeFalsy();
});

test('QA Enter restores a rejected measurement and identical edits do not add undo steps', async ({ page }) => {
  await circle(page);
  const original = await page.evaluate(() => getDrawingsSnapshot().find(s => s.template));
  const field = page.locator('#mesaTemplateLength');
  await field.fill('0'); await field.press('Enter');
  await expect(field).toHaveValue('6');
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template))).toEqual(original);
  await field.fill('6.0'); await field.press('Enter');
  expect(await page.evaluate(() => getDrawingsSnapshot().find(s => s.template))).toEqual(original);
  await page.locator('#mesaTemplateUndo').click();
  await expect(page.locator('#mesaTemplateCanvas')).toHaveAttribute('data-count', '0');
});
