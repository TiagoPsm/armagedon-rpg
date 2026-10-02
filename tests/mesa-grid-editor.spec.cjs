const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
const errorsByPage = new WeakMap();
test.afterEach(async ({ page }) => expect(errorsByPage.get(page)).toEqual([]));
test.beforeEach(async ({ page }) => {
  const errors = []; errorsByPage.set(page, errors); page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.locator("#mesaMapSettingsBtn").click();
  await page.evaluate(() => { window.gridSaves = 0; const save = persistState; persistState = (...args) => { window.gridSaves++; return save(...args); }; });
});
async function click(page, x, y, options) {
  const b = await page.locator("#mesaGridEditCanvas").boundingBox(); await page.mouse.click(b.x + x * b.width, b.y + y * b.height, options);
}
async function calibrate(page) {
  await page.locator("#mesaGridReferenceCells").fill("2"); await page.locator("#mesaGridCalibrate").click();
  await expect(page.locator("#mesaGridEditCanvas")).toBeVisible(); await click(page, .2, .6); await click(page, .4, .6);
  await expect(page.locator("#mesaGridDraftApply")).toBeEnabled();
}
test("G1 calibracao e apenas previa; aplicar preserva tokens, mapa, escala e colunas inteiras", async ({ page }, info) => {
  const before = await page.evaluate(() => ({ grid: getMesaGridState(), tokens: state.tokens, map: window.getMesaSceneMapPayload() }));
  await calibrate(page);
  expect(await page.evaluate(() => getMesaGridState())).toEqual(before.grid);
  expect(await page.evaluate(() => window.gridSaves)).toBe(0);
  await page.screenshot({ path: info.outputPath("calibracao-previa.png") });
  await page.locator("#mesaGridDraftApply").click();
  expect(await page.evaluate(() => getMesaGridState().cellFrac)).toBe(.1);
  expect(await page.evaluate(() => state.tokens)).toEqual(before.tokens);
  expect(await page.evaluate(() => window.getMesaSceneMapPayload())).toEqual(before.map);
  expect(await page.evaluate(() => getMesaGridState().metersPerCell)).toBe(before.grid.metersPerCell);
  expect(await page.evaluate(() => window.gridSaves)).toBe(1);
  await page.reload(); await expect.poll(() => page.evaluate(() => getMesaGridState().cellFrac)).toBe(.1);
});
for (const cancel of ["Escape", "button", "right", "panel", "remote", "role"]) test(`G1 ${cancel} descarta previa sem gravar`, async ({ page }) => {
  const original = await page.evaluate(() => getMesaGridState()); await calibrate(page);
  if (cancel === "Escape") await page.keyboard.press("Escape");
  if (cancel === "button") await page.locator("#mesaGridDraftCancel").click();
  if (cancel === "right") await click(page, .3, .6, { button: "right" });
  if (cancel === "panel") await page.locator("#mesaMapSettingsBtn").click();
  if (cancel === "remote") await page.evaluate(() => setMesaGridFromRemote({ enabled: true, cellFrac: .1 }));
  if (cancel === "role") await page.evaluate(() => { state.role = "player"; state.session = { role: "player", username: "a" }; applyMesaRolePermissions("player"); renderAll(); });
  await expect(page.locator("#mesaGridEditCanvas")).toBeHidden();
  expect(await page.evaluate(() => window.gridSaves)).toBe(0);
  if (cancel !== "remote") expect(await page.evaluate(() => getMesaGridState())).toEqual(original);
});
test("G2 origem tem previa, preserva objetos e desenha apenas celulas completas", async ({ page }, info) => {
  await page.evaluate(() => applyMesaSceneGridFromSnapshot({ enabled: true, cellFrac: .05 }));
  const before = await page.evaluate(() => state.tokens);
  await page.locator("#mesaGridOrigin").click(); await expect(page.locator("#mesaGridEditCanvas")).toBeVisible();
  await click(page, .2125, .6125);
  expect(await page.evaluate(() => getMesaGridState().offsetXFrac)).toBe(0);
  await page.screenshot({ path: info.outputPath("origem-previa.png") });
  const bounds = await page.locator("#mesaGridCanvas").evaluate(c => JSON.parse(c.dataset.gridBounds));
  expect((bounds.right - bounds.left) / bounds.cell).toBeCloseTo(19, 6);
  expect((bounds.bottom - bounds.top) / bounds.cell).toBeCloseTo(19, 6);
  await page.locator("#mesaGridDraftApply").click();
  expect(await page.evaluate(() => getMesaGridState().offsetXFrac)).toBeCloseTo(.25, 3);
  expect(await page.evaluate(() => getMesaGridState().offsetYFrac)).toBeCloseTo(.25, 3);
  expect(await page.evaluate(() => state.tokens)).toEqual(before);
  expect(await page.evaluate(() => window.gridSaves)).toBe(1);
});
