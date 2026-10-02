const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
const wall = { id: "wall", ax: .25, ay: .3, bx: .5, by: .3, kind: "wall", doorState: null };
const errorsByPage = new WeakMap();
test.afterEach(async ({ page }) => expect(errorsByPage.get(page)).toEqual([]));
async function seed(page, walls = [wall]) {
  await page.evaluate(walls => {
    const s = document.getElementById("mesaStage");
    applyMesaVisionSnapshot({ enabled: false, aspect: s.clientHeight / s.clientWidth, coneDeg: 120, revision: 0, walls });
    renderStage();
    window.editorSaves = 0;
    window.editorOriginalPersist ||= persistState;
    persistState = (...args) => { window.editorSaves++; return window.editorOriginalPersist(...args); };
  }, walls);
}
async function at(page, x, y) {
  const b = await page.locator("#mesaStageInner").boundingBox();
  return { x: b.x + x * b.width, y: b.y + y * b.height };
}
async function click(page, x, y, options) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y, options); }
async function select(page, x = .375, y = .3) {
  await page.locator("#mesaVisionSelect").click();
  await expect(page.locator("#mesaWallCanvas")).toBeVisible(); await click(page, x, y);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-wall", "wall");
}
async function drag(page, x = .6, y = .45) {
  const p = await at(page, .5, .3); await page.mouse.move(p.x, p.y); await page.mouse.down();
  const q = await at(page, x, y); await page.mouse.move(q.x, q.y, { steps: 4 });
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-editing", "true");
}
test.beforeEach(async ({ page }) => {
  const errors = []; errorsByPage.set(page, errors); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.locator("#mesaMapSettingsBtn").click(); await seed(page); await select(page);
});
test("W2 arrasto e previa local; soltar salva uma vez e historico restaura", async ({ page }, info) => {
  const before = await page.evaluate(() => getMesaVisionPayload());
  await drag(page);
  expect(await page.evaluate(() => getMesaVisionPayload())).toEqual(before);
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  await page.screenshot({ path: info.outputPath("extremidade-previa.png") });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => mesaVision.walls[0].bx)).toBeCloseTo(.6, 3);
  expect(await page.evaluate(() => window.editorSaves)).toBe(1);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls)).toEqual([wall]);
  await page.locator("#mesaVisionRedo").click(); expect(await page.evaluate(() => mesaVision.walls[0].by)).toBeCloseTo(.45, 3);
});
test("W2 clicar numa extremidade sem arrastar nao grava ruido de coordenadas", async ({ page }) => {
  await click(page, .5, .3);
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  expect(await page.evaluate(() => mesaVision.walls)).toEqual([wall]);
});
for (const reason of ["Escape", "pointercancel", "blur", "remote", "zero"]) {
  test(`W2 ${reason} nao confirma um arrasto invalido`, async ({ page }) => {
    await drag(page, reason === "zero" ? .25 : .6, reason === "zero" ? .3 : .45);
    if (reason === "Escape") await page.keyboard.press("Escape");
    if (reason === "pointercancel") await page.locator("#mesaWallCanvas").dispatchEvent("pointercancel");
    if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (reason === "remote") await page.evaluate(() => applyMesaVisionSnapshot({ ...getMesaVisionPayload(), walls: [{ ...mesaVision.walls[0], by: .6 }] }));
    await page.mouse.up();
    expect(await page.evaluate(() => window.editorSaves)).toBe(0);
    expect(await page.evaluate(() => mesaVision.walls[0].bx)).toBe(.5);
    expect(await page.evaluate(() => mesaVision.walls[0].by)).toBe(reason === "remote" ? .6 : .3);
    await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-editing", "false");
  });
}
test("W2 arrasto acompanha zoom e pan sem usar coordenadas antigas", async ({ page }) => {
  await drag(page);
  await page.evaluate(() => { setStageZoom(2); panStage(20, -20); });
  const p = await at(page, .55, .4); await page.mouse.move(p.x, p.y); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => mesaVision.walls[0].bx)).toBeCloseTo(.55, 3);
  expect(await page.evaluate(() => mesaVision.walls[0].by)).toBeCloseTo(.4, 3);
});
test("W3 encaixe exato e mover juncao preserva todos os trechos ligados", async ({ page }, info) => {
  await seed(page, [wall, { ...wall, id: "linked", ax: .5, ay: .3, bx: .5, by: .6 }, { ...wall, id: "target", ax: .6, ay: .45, bx: .65, by: .55 }]);
  await select(page); await drag(page, .605, .45);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-snapped", "true");
  await page.screenshot({ path: info.outputPath("juncao-encaixada.png") });
  await page.mouse.up();
  const walls = await page.evaluate(() => mesaVision.walls);
  expect(walls[0].bx).toBe(.6); expect(walls[0].by).toBe(.45);
  expect(walls[1].ax).toBe(.6); expect(walls[1].ay).toBe(.45);
  expect(await page.evaluate(() => window.editorSaves)).toBe(1);
  await page.locator("#mesaVisionUndo").click();
  expect(await page.evaluate(() => mesaVision.walls[1].ax)).toBe(.5);
});
test("W3 Alt permite desenho livre sem desligar permanentemente o encaixe", async ({ page }) => {
  await seed(page, [wall, { ...wall, id: "target", ax: .6, ay: .45, bx: .65, by: .55 }]);
  await select(page); await page.keyboard.down("Alt"); await drag(page, .605, .45);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-snapped", "false");
  await page.mouse.up(); await page.keyboard.up("Alt");
  expect(await page.evaluate(() => mesaVision.walls[0].bx)).toBeCloseTo(.605, 3);
  await expect(page.locator("#mesaBarrierSnap")).toBeChecked();
});
test("W4 divide no ponto projetado com um unico desfazer, sem fresta", async ({ page }) => {
  await page.locator("#mesaBarrierSplit").click();
  await expect(page.locator("#mesaBarrierSplit")).toHaveAttribute("aria-pressed", "true");
  await click(page, .35, .305);
  const walls = await page.evaluate(() => mesaVision.walls);
  expect(walls).toHaveLength(2); expect(walls[0].bx).toBeCloseTo(.35, 3);
  expect(walls[0].by).toBe(.3); expect(walls[1].ax).toBe(walls[0].bx); expect(walls[1].ay).toBe(walls[0].by);
  expect(await page.evaluate(() => window.editorSaves)).toBe(1);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls)).toEqual([wall]);
});
test("W4 evita corte nas extremidades e nao divide porta", async ({ page }) => {
  await page.locator("#mesaBarrierSplit").click(); await click(page, .25, .3);
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  await seed(page, [{ ...wall, kind: "door", doorState: "closed" }]); await select(page);
  await expect(page.locator("#mesaBarrierSplit")).toBeDisabled();
});
test("W5 une segmentos contiguos sem mudar contorno; desfaz atomicamente", async ({ page }) => {
  const parts = [{ ...wall, bx: .4 }, { ...wall, id: "other", ax: .4 }];
  await seed(page, parts); await select(page, .3, .3);
  await page.locator("#mesaBarrierJoin").click(); await expect(page.locator("#mesaBarrierJoin")).toHaveAttribute("aria-pressed", "true");
  await click(page, .45, .3);
  const walls = await page.evaluate(() => mesaVision.walls);
  expect(walls).toHaveLength(1); expect(walls[0].ax).toBe(.25); expect(walls[0].bx).toBe(.5);
  expect(await page.evaluate(() => window.editorSaves)).toBe(1);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls)).toEqual(parts);
});
for (const mismatch of ["bend", "gap", "door"]) test(`W5 recusa uniao com ${mismatch}`, async ({ page }) => {
  const other = { ...wall, id: "other", ax: mismatch === "gap" ? .405 : .4, by: mismatch === "bend" ? .45 : .3, kind: mismatch === "door" ? "door" : "wall", doorState: mismatch === "door" ? "closed" : null };
  await seed(page, [{ ...wall, bx: .4 }, other]); await select(page, .3, .3);
  await page.locator("#mesaBarrierJoin").click();
  await expect(page.locator("#mesaBarrierJoin")).toHaveAttribute("aria-pressed", "true");
  await click(page, (other.ax + other.bx) / 2, (other.ay + other.by) / 2);
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(2);
});
test("W6 mestre altera estado da porta; oclusao e historico seguem estado", async ({ page }) => {
  await seed(page, [{ ...wall, kind: "door", doorState: "closed" }]); await select(page);
  const visible = () => page.evaluate(() => mesaVisionGeometry.canSee({ x: .35, y: .2 }, { x: .35, y: .4 }, 90));
  expect(await visible()).toBe(false);
  await page.selectOption("#mesaBarrierDoorState", "open"); expect(await visible()).toBe(true);
  await page.selectOption("#mesaBarrierDoorState", "locked"); expect(await visible()).toBe(false);
  expect(await page.evaluate(() => mesaVision.walls[0].doorState)).toBe("locked");
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls[0].doorState)).toBe("open");
  await page.reload(); await expect.poll(() => page.evaluate(() => mesaVision?.walls[0].doorState)).toBe("open");
});
test("W6 nao fecha nem tranca uma porta ocupada", async ({ page }) => {
  await seed(page, [{ ...wall, kind: "door", doorState: "open" }]); await select(page);
  await page.evaluate(() => { state.tokens = [{ ...state.tokens[0], x: 32.5, y: 27.5, visionRadius: .025 }]; });
  for (const value of ["closed", "locked"]) {
    await page.selectOption("#mesaBarrierDoorState", value);
    await expect(page.locator("#mesaBarrierDoorState")).toHaveValue("open");
    expect(await page.evaluate(() => mesaVision.walls[0].doorState)).toBe("open");
  }
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
});
test("W7 selecao aditiva e por area nao grava nem interfere com regua", async ({ page }, info) => {
  const walls = [wall, { ...wall, id: "other", ay: .5, by: .5 }];
  await seed(page, walls); await select(page);
  await page.keyboard.down("Shift"); await click(page, .375, .5); await page.keyboard.up("Shift");
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-count", "2");
  await expect(page.locator("#mesaRulerOverlay .mesa-ruler")).toHaveCount(0);
  await page.keyboard.down("Shift"); await click(page, .375, .5); await page.keyboard.up("Shift");
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-count", "1");
  const p = await at(page, .2, .25), q = await at(page, .55, .55);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-editing", "true");
  await page.screenshot({ path: info.outputPath("selecao-area.png") }); await page.mouse.up();
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-count", "2");
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  expect(await page.evaluate(() => mesaVision.walls)).toEqual(walls);
  await page.keyboard.press("Escape"); await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-count", "0");
});
test("W8 move conjunto rigidamente; borda limita grupo e um desfazer restaura", async ({ page }) => {
  const walls = [wall, { ...wall, id: "other", ay: .5, by: .5 }];
  await seed(page, walls); await select(page);
  await page.keyboard.down("Shift"); await click(page, .375, .5); await page.keyboard.up("Shift");
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-count", "2");
  const p = await at(page, .375, .3), q = await at(page, .9, .45);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y);
  expect(await page.evaluate(() => mesaVision.walls)).toEqual(walls);
  await page.mouse.up();
  const moved = await page.evaluate(() => mesaVision.walls);
  expect(moved[0].bx).toBe(1); expect(moved[1].bx).toBe(1);
  expect(moved[0].ax).toBe(.75); expect(moved[1].ay - moved[0].ay).toBeCloseTo(.2, 8);
  expect(await page.evaluate(() => window.editorSaves)).toBe(1);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls)).toEqual(walls);
});
test("W8 cancelar translacao nao grava nem desfaz selecao", async ({ page }) => {
  const p = await at(page, .375, .3), q = await at(page, .5, .45);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y);
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.mouse.up();
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  expect(await page.evaluate(() => mesaVision.walls)).toEqual([wall]);
});
test("W9 copia previa sem gravar, cola com novos IDs e conserva propriedades", async ({ page }, info) => {
  const walls = [wall, { ...wall, id: "door", ay: .5, by: .5, kind: "door", doorState: "locked" }];
  await seed(page, walls); await select(page);
  await page.keyboard.down("Shift"); await click(page, .375, .5); await page.keyboard.up("Shift");
  await page.locator("#mesaBarrierCopy").click(); await page.locator("#mesaBarrierPaste").click();
  await expect(page.locator("#mesaBarrierPaste")).toHaveAttribute("aria-pressed", "true");
  const p = await at(page, .55, .6); await page.mouse.move(p.x, p.y);
  await page.screenshot({ path: info.outputPath("estrutura-copia.png") });
  expect(await page.evaluate(() => window.editorSaves)).toBe(0);
  await click(page, .55, .6);
  const result = await page.evaluate(() => mesaVision.walls);
  expect(result).toHaveLength(4); expect(result.slice(0, 2)).toEqual(walls);
  expect(new Set(result.map(w => w.id)).size).toBe(4);
  expect(result[3].doorState).toBe("locked"); expect(result[3].ay - result[2].ay).toBeCloseTo(.2, 8);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls)).toEqual(walls);
});
test("W9 cancelar colagem preserva original e permite nova previa", async ({ page }) => {
  await page.locator("#mesaBarrierCopy").click(); await page.locator("#mesaBarrierPaste").click(); await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.editorSaves)).toBe(0); expect(await page.evaluate(() => mesaVision.walls)).toEqual([wall]);
  await select(page); await expect(page.locator("#mesaBarrierPaste")).toBeEnabled();
});
