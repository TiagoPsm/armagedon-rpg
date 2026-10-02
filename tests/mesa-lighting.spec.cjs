const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
const errorsByPage = new WeakMap();
test.afterEach(async ({ page }) => expect(errorsByPage.get(page) || []).toEqual([]));
test.beforeEach(async ({ page }) => {
  const errors = []; errorsByPage.set(page, errors); page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
});

async function clickLight(page, x, y) {
  const r = await page.locator("#mesaStageInner").boundingBox(); await page.mouse.click(r.x + r.width * x, r.y + r.height * y);
}
async function createLight(page) {
  await page.locator("#mesaMapSettingsBtn").click(); await page.locator("#mesaVisionToggle").check();
  await page.locator("#mesaLightCreate").click(); await expect(page.locator("#mesaLightCanvas")).toBeVisible(); await clickLight(page, .4, .5);
  await expect.poll(() => page.evaluate(() => getMesaVisionPayload().lights?.length)).toBe(1);
}
test("V3 light creation, properties, drag preview, undo/remove and F5", async ({ page }, info) => {
  await createLight(page);
  await page.locator("#mesaLightRadius").fill("12"); await page.locator("#mesaLightIntensity").fill("70"); await page.locator("#mesaLightHint").click();
  expect(await page.evaluate(() => getMesaVisionPayload().lights[0].intensity)).toBe(.7);
  const original = await page.evaluate(() => getMesaVisionPayload().lights[0]);
  const r = await page.locator("#mesaStageInner").boundingBox();
  await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .6 * r.width, r.y + .55 * r.height);
  expect(await page.evaluate(() => getMesaVisionPayload().lights[0])).toEqual(original);
  await page.screenshot({ path: info.outputPath("luz-previa.png") });
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => getMesaVisionPayload().lights[0].x)).toBeCloseTo(.6, 3);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => getMesaVisionPayload().lights[0])).toEqual(original);
  if (await page.locator("#mesaLightSelect").getAttribute("aria-pressed") !== "true") await page.locator("#mesaLightSelect").click();
  await clickLight(page, .4, .5); await page.locator("#mesaLightRemove").click();
  expect(await page.evaluate(() => getMesaVisionPayload().lights.length)).toBe(0);
  await page.locator("#mesaVisionUndo").click(); await page.reload(); await expect.poll(() => page.evaluate(() => getMesaVisionPayload()?.lights?.length)).toBe(1);
});
test('QA Enter restores rejected light values and unchanged values do not consume history', async ({ page }) => {
  await createLight(page);
  const before = await page.evaluate(() => getMesaVisionPayload());
  const radius = page.locator('#mesaLightRadius'), intensity = page.locator('#mesaLightIntensity');
  await radius.fill('0'); await radius.press('Enter'); await expect(radius).toHaveValue('3.6');
  await intensity.fill('101'); await intensity.press('Enter'); await expect(intensity).toHaveValue('100');
  expect(await page.evaluate(() => getMesaVisionPayload())).toEqual(before);
  await intensity.fill('100.0'); await intensity.press('Enter');
  await page.locator('#mesaVisionUndo').click();
  expect(await page.evaluate(() => getMesaVisionPayload().lights?.length || 0)).toBe(0);
});
for (const cancel of ["Escape", "blur", "remote", "panel", "grid"]) test(`V3 ${cancel} discards moving draft`, async ({ page }) => {
  await createLight(page); const original = await page.evaluate(() => getMesaVisionPayload().lights[0]);
  const r = await page.locator("#mesaStageInner").boundingBox(); await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .6 * r.width, r.y + .55 * r.height);
  if (cancel === "Escape") await page.keyboard.press("Escape");
  if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  if (cancel === "remote") await page.evaluate(() => { const v = getMesaVisionPayload(); v.lights[0].intensity = .5; applyMesaVisionSnapshot(v); });
  if (cancel === "panel") await page.locator("#mesaMapSettingsBtn").evaluate(b => b.click());
  if (cancel === "grid") await page.locator("#mesaGridCalibrate").evaluate(b => b.click());
  await expect(page.locator("#mesaLightCanvas")).toBeHidden(); await page.mouse.up();
  expect(await page.evaluate(() => getMesaVisionPayload().lights[0].x)).toBeCloseTo(original.x, 5);
});
test("V3 light obeys door occlusion and individual cone; default vision stays unchanged", async ({ page }, info) => {
  await playerScene(page, true);
  await page.evaluate(() => {
    const v = getMesaVisionPayload(); v.walls = [{ id: "door", ax: .5, ay: 0, bx: .5, by: 1, kind: "door", doorState: "closed" }];
    v.lights = [{ id: "light", x: .4, y: .475, radius: .4, intensity: 1 }]; applyMesaVisionSnapshot(v); renderStage();
  });
  await expect(page.locator('[data-token-id="npc"].mesa-token')).toHaveCount(1);
  const pixels = () => page.evaluate(() => {
    renderMesaVision(); const c = document.getElementById("mesaVisionCanvas"), r = c.getBoundingClientRect(), s = document.getElementById("mesaStageInner").getBoundingClientRect();
    return [.44, .68].map(x => c.getContext("2d").getImageData(Math.floor((s.left + x * s.width - r.left) / r.width * c.width), Math.floor((s.top + .475 * s.height - r.top) / r.height * c.height), 1, 1).data[3]);
  });
  expect((await pixels())[0]).toBeLessThan(100); expect((await pixels())[1]).toBe(255);
  await page.evaluate(() => { findToken("ana").facingDeg = 180; renderStage(); });
  await expect(page.locator('[data-token-id="npc"].mesa-token')).toHaveCount(0); expect((await pixels())[0]).toBe(255);
  await page.evaluate(() => { findToken("ana").facingDeg = 0; const v = getMesaVisionPayload(); v.walls[0].doorState = "open"; applyMesaVisionSnapshot(v); renderStage(); });
  expect((await pixels())[1]).toBeLessThan(245);
  await page.screenshot({ path: info.outputPath("luz-cone-porta.png") });
});
async function playerScene(page, darkness) {
  await page.evaluate(darkness => {
    const sample = state.tokens[0]; state.tokens = [{ ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", x: 20, y: 45, visionRadius: .025, facingDeg: 0 },
      { ...sample, id: "npc", type: "npc", x: 40, y: 45, visionRadius: .025 }];
    state.role = "player"; state.session = { role: "player", username: "ana" }; state.selectedTokenId = "ana";
    applyMesaVisionSnapshot({ enabled: true, aspect: 1, walls: [], ...(darkness == null ? {} : { darkness }) });
    applyMesaRolePermissions("player"); renderAll();
  }, darkness);
}
test("V2 existing scene keeps vision; darkness hides terrain/others but keeps own token", async ({ page }, info) => {
  await playerScene(page, null); await expect(page.locator('[data-token-id="npc"].mesa-token')).toHaveCount(1);
  await playerScene(page, true); await expect(page.locator('[data-token-id="npc"].mesa-token')).toHaveCount(0);
  await expect(page.locator('[data-token-id="ana"].mesa-token')).toHaveCount(1);
  expect(await page.locator("#mesaVisionCanvas").evaluate(c => {
    const r = c.getBoundingClientRect(), s = document.getElementById("mesaStageInner").getBoundingClientRect();
    return c.getContext("2d").getImageData(Math.floor((s.left + .425 * s.width - r.left) / r.width * c.width), Math.floor((s.top + .475 * s.height - r.top) / r.height * c.height), 1, 1).data[3];
  })).toBe(255);
  expect(await page.evaluate(() => MesaBarrierEditor.commit(v => { v.darkness = false; }))).toBe(false);
  await page.screenshot({ path: info.outputPath("escuridao.png") });
  await playerScene(page, false); await expect(page.locator('[data-token-id="npc"].mesa-token')).toHaveCount(1);
});
test("V2 master toggles darkness in scene settings, undo and F5 preserve it", async ({ page }) => {
  await page.locator("#mesaMapSettingsBtn").click(); await page.locator("#mesaVisionToggle").check();
  await page.locator("#mesaDarknessToggle").check(); expect(await page.evaluate(() => getMesaVisionPayload().darkness)).toBe(true);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => !!getMesaVisionPayload().darkness)).toBe(false);
  await page.locator("#mesaVisionRedo").click(); await page.reload();
  await expect.poll(() => page.evaluate(() => getMesaVisionPayload()?.darkness)).toBe(true);
});

test('V3 a second player client consumes confirmed light snapshots, never the master draft', async ({ page, context }) => {
  await createLight(page);
  const other = await context.newPage(); await other.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => other.evaluate(() => state.bootCompleted)).toBe(true);
  const payload = await page.evaluate(() => createMesaScenePayloadFromState());
  await other.evaluate(payload => { state.role = 'player'; state.session = { username: 'ana', role: 'player' }; applyMesaSceneSnapshot(payload); }, payload);
  expect(await other.evaluate(() => getMesaVisionPayload().lights)).toEqual(payload.vision.lights);
  const r = await page.locator('#mesaStageInner').boundingBox(); await page.mouse.move(r.x + .4 * r.width, r.y + .5 * r.height); await page.mouse.down(); await page.mouse.move(r.x + .6 * r.width, r.y + .5 * r.height);
  expect(await other.evaluate(() => getMesaVisionPayload().lights)).toEqual(payload.vision.lights);
  await page.mouse.up(); const next = await page.evaluate(() => createMesaScenePayloadFromState());
  await other.evaluate(next => applyMesaSceneSnapshot(next), next);
  expect(await other.evaluate(() => getMesaVisionPayload().lights)).toEqual(next.vision.lights); await other.close();
});
