const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect(page.locator("#mesaStage .mesa-token")).toHaveCount(3);
});
test("mestre desenha cadeia, desfaz, refaz e restaura paredes no F5", async ({ page }, info) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.locator("#mesaMapSettingsBtn").click();
  await page.locator("#mesaVisionPanel > summary").click();
  await expect(page.locator("#mesaVisionUndo")).toBeDisabled();
  await page.locator("#mesaVisionWall").click();
  await expect(page.locator("#mesaVisionFinish")).toBeDisabled();
  const b = await page.locator("#mesaWallCanvas").boundingBox();
  await page.mouse.click(b.x + b.width * .45, b.y + b.height * .2);
  await page.mouse.click(b.x + b.width * .45, b.y + b.height * .8);
  await expect(page.locator("#mesaVisionCount")).toHaveText("1 segmento");
  await page.screenshot({ path: info.outputPath("editor-paredes.png") });
  await page.locator("#mesaVisionUndo").click();
  await expect(page.locator("#mesaVisionCount")).toHaveText("0 segmentos");
  await page.locator("#mesaVisionRedo").click();
  await expect(page.locator("#mesaVisionCount")).toHaveText("1 segmento");
  await page.locator("#mesaVisionStop").click();
  await page.check("#mesaVisionToggle");
  await page.locator("#mesaVisionWall").click();
  await page.locator("#mesaMapSettingsBtn").click();
  await expect(page.locator("#mesaWallCanvas")).toBeHidden();
  expect(await page.evaluate(() => mesaVisionMode)).toBe("off");
  await page.reload();
  await expect(page.locator("#mesaVisionToggle")).toBeChecked();
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(1);
  expect(errors).toEqual([]);
});

test("editor mantem controles e textos dentro das secoes em diferentes larguras", async ({ page }, info) => {
  await page.locator("#mesaMapSettingsBtn").click();
  await page.locator("#mesaVisionPanel > summary").click();
  await page.locator("#mesaVisionWall").click();
  for (const width of [1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const textSize of ["100%", "150%"]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, textSize);
      await page.locator(".mesa-vision-options").evaluate(el => { el.open = true; });
      const issues = await page.evaluate(() => {
        const panel = document.getElementById("mesaMapTransform"), root = document.getElementById("mesaVisionPanel");
        const errors = [];
        if (panel.scrollWidth > panel.clientWidth + 1) errors.push("rolagem horizontal");
        for (const el of root.querySelectorAll("button,select,.mesa-vision-tools,.mesa-vision-shapes,.mesa-vision-field,.mesa-btn-pair,p")) {
          if (!el.getClientRects().length || el.hidden) continue;
          const b = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
          if (b.left < p.left - 1 || b.right > p.right + 1) errors.push(`${el.id || el.className}: fora da secao`);
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) errors.push(`${el.id || el.className}: conteudo excede caixa`);
        }
        for (const selector of [".mesa-vision-tools", ".mesa-vision-shapes"]) {
          const boxes = [...root.querySelectorAll(`${selector} button`)].map(el => el.getBoundingClientRect());
          if (Math.max(...boxes.map(b => b.height)) - Math.min(...boxes.map(b => b.height)) > 1) errors.push("alturas desalinhadas");
        }
        return errors;
      });
      expect(issues, `${width}px / texto ${textSize}`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; document.querySelector(".mesa-vision-options").open = false; document.getElementById("mesaMapTransform").scrollTop = 0; });
  await page.screenshot({ path: info.outputPath("editor-organizado.png") });
  await page.locator(".mesa-vision-options > summary").click();
  await page.locator("#mesaVisionPreview").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("ajustes-organizados.png") });
});
async function fixture(page, player = true, door = false) {
  await page.evaluate(({ player, door }) => {
    const sample = state.tokens[0];
    state.tokens = [
      { ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", name: "Ana", x: 20, y: 45, visionRadius: .025, facingDeg: 0 },
      { ...sample, id: "hidden", characterKey: "hidden", type: "npc", name: "Segredo", x: 70, y: 45, visionRadius: .025 }
    ];
    const stage = document.getElementById("mesaStage");
    applyMesaVisionSnapshot({ enabled: true, coneDeg: 120, aspect: stage.clientHeight / stage.clientWidth, revision: 0,
      walls: [{ id: "barrier", ax: .5, ay: 0, bx: .5, by: 1, kind: door ? "door" : "wall", doorState: door ? "closed" : null }] });
    state.role = player ? "player" : "master"; state.session = { username: "ana", role: state.role };
    state.selectedTokenId = "ana";
    applyMesaRolePermissions(state.role); renderAll();
    setInteractionMode("move");
  }, { player, door });
}

test("botao direito encerra todos os modos preservando somente pontos confirmados", async ({ page }, info) => {
  await page.locator("#mesaMapSettingsBtn").click();
  await page.locator("#mesaVisionPanel > summary").click();
  await page.locator("#mesaVisionWall").click();
  const b = await page.locator("#mesaWallCanvas").boundingBox();
  const click = (x, y, button = "left") => page.mouse.click(b.x + b.width * x, b.y + b.height * y, { button });
  await click(.2, .2); await click(.4, .2);
  await click(.5, .3, "right");
  await expect(page.locator("#mesaWallCanvas")).toBeHidden();
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(1);
  await page.locator("#mesaVisionWall").click();
  await page.locator('[data-vision-shape="polygon"]').click();
  await click(.2, .4); await click(.4, .4); await click(.4, .6);
  await page.mouse.move(b.x + b.width * .25, b.y + b.height * .7);
  await expect(page.locator("#mesaVisionStatus")).toContainText("botão direito conclui");
  await page.screenshot({ path: info.outputPath("construcao-destacada.png") });
  await click(.25, .7, "right");
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
  await page.locator("#mesaVisionUndo").click();
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(1);
  await page.locator("#mesaVisionRedo").click();
  for (const mode of ["rect", "door", "erase", "lock"]) {
    await page.evaluate(mode => setMesaVisionTool(mode), mode);
    await expect(page.locator("#mesaWallCanvas")).toBeVisible();
    if (["rect", "door"].includes(mode)) await click(.2, .8);
    await click(.4, .9, "right");
    await expect(page.locator("#mesaWallCanvas")).toBeHidden();
    expect(await page.evaluate(() => ({ mode: mesaVisionMode, count: mesaVision.walls.length }))).toEqual({ mode: "off", count: 3 });
  }
  await page.reload();
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
});

test("poligono com previa fecha de uma vez; Escape cancela e retangulo gera quatro lados", async ({ page }, info) => {
  await page.locator("#mesaMapSettingsBtn").click();
  await page.locator("#mesaVisionPanel > summary").click();
  await page.locator("#mesaVisionWall").click();
  await page.locator('[data-vision-shape="polygon"]').click();
  const toolBox = await page.locator("#mesaVisionWall").boundingBox();
  expect(toolBox.width).toBeGreaterThan(90);
  const shapeBox = await page.locator('[data-vision-shape="polygon"]').boundingBox();
  expect(shapeBox.width).toBeGreaterThan(60);
  const b = await page.locator("#mesaWallCanvas").boundingBox();
  const click = (x, y) => page.mouse.click(b.x + b.width * x, b.y + b.height * y);
  await click(.2, .3); await click(.5, .3); await click(.4, .7);
  expect(await page.evaluate(() => mesaVision?.walls.length || 0)).toBe(0);
  await page.mouse.move(b.x + b.width * .25, b.y + b.height * .6);
  await page.screenshot({ path: info.outputPath("previa-poligono.png") });
  await click(.2, .3);
  await expect(page.locator("#mesaVisionCount")).toHaveText("3 segmentos");
  await page.locator("#mesaVisionUndo").click();
  await expect(page.locator("#mesaVisionCount")).toHaveText("0 segmentos");
  await click(.2, .3); await click(.4, .3);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => mesaVisionPoints.length)).toBe(0);
  await page.locator('[data-vision-shape="rect"]').click();
  await click(.2, .3); await click(.5, .7);
  await expect(page.locator("#mesaVisionCount")).toHaveText("4 segmentos");
});

test("porta recorta parede, desfaz atomicamente e jogador abre o vao para enxergar", async ({ page }) => {
  await fixture(page, false);
  await page.locator("#mesaMapSettingsBtn").click();
  await page.locator("#mesaVisionPanel > summary").click();
  await page.locator("#mesaVisionDoor").click();
  const b = await page.locator("#mesaWallCanvas").boundingBox();
  const click = (x, y) => page.mouse.click(b.x + b.width * x, b.y + b.height * y);
  await click(.5, .35); await click(.5, .65);
  await expect(page.locator("#mesaVisionCount")).toHaveText("3 segmentos");
  expect(await page.evaluate(() => mesaVision.walls.map(w => w.kind))).toEqual(["wall", "door", "wall"]);
  await page.locator("#mesaVisionUndo").click();
  await expect(page.locator("#mesaVisionCount")).toHaveText("1 segmento");
  await page.locator("#mesaVisionRedo").click();
  await page.locator("#mesaVisionStop").click();
  await page.locator("#mesaMapSettingsBtn").click();
  await page.evaluate(() => {
    state.role = "player"; state.session.role = "player"; findToken("ana").x = 42;
    applyMesaRolePermissions("player"); renderAll();
  });
  await expect(page.locator('#mesaStage [data-token-id="hidden"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir porta", exact: true }).click();
  await expect(page.locator('#mesaStage [data-token-id="hidden"]')).toHaveCount(1);
  const movement = await page.evaluate(() => mesaVisionConstrain(findToken("ana"), 55, 45));
  expect(movement.x).toBeCloseTo(55, 4);
});
test("jogador ve so o proprio cone, sem DOM oculto nem controle do mestre", async ({ page }, info) => {
  await fixture(page);
  await expect(page.locator("#mesaVisionPanel")).toBeHidden();
  await expect(page.locator("#mesaVisionCanvas")).toBeVisible();
  await expect(page.locator('#mesaStage [data-token-id="hidden"]')).toHaveCount(0);
  const alpha = await page.evaluate(() => {
    const c = document.getElementById("mesaVisionCanvas"), ctx = c.getContext("2d");
    return [ctx.getImageData(c.width * .7, c.height * .5, 1, 1).data[3], ctx.getImageData(c.width * .35, c.height * .5, 1, 1).data[3]];
  });
  expect(alpha).toEqual([255, 0]);
  await page.screenshot({ path: info.outputPath("visao-jogador.png") });
  await page.locator("#mesaFacingRight").click();
  await expect(page.locator("#mesaFacingValue")).toHaveText("15°");
});

test("porta entre extremidades recorta parede inteira ou preserva vao livre", async ({ page }) => {
  const result = await page.evaluate(() => {
    applyMesaVisionSnapshot({ enabled: false, aspect: 1, walls: [
      { id: "left", ax: .2, ay: .5, bx: .4, by: .5 },
      { id: "right", ax: .6, ay: .5, bx: .8, by: .5 }
    ] });
    createMesaVisionDoor({ x: .4, y: .5 }, { x: .6, y: .5, wallId: "right", t: 0 });
    const gap = mesaVision.walls.map(w => w.kind);
    createMesaVisionDoor({ x: .2, y: .5 }, { x: .4, y: .5 });
    const replaced = mesaVision.walls.map(w => w.kind);
    const before = JSON.stringify(mesaVision);
    createMesaVisionDoor({ x: .7, y: .5, wallId: "right", t: .5 }, { x: .7, y: .5, wallId: "right", t: .5 });
    return { gap, replaced, unchanged: before === JSON.stringify(mesaVision) };
  });
  expect(result.gap).toEqual(["wall", "wall", "door"]);
  expect(result.replaced).toEqual(["door", "wall", "door"]);
  expect(result.unchanged).toBe(true);
});
test("arrasto rapido para na parede sem teleporte ao soltar", async ({ page }) => {
  await fixture(page);
  const token = page.locator('#mesaStage [data-token-id="ana"]');
  const b = await token.boundingBox(), s = await page.locator("#mesaStage").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * .8, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => mesaVisionBusy)).toBe(false);
  const x = await page.evaluate(() => findToken("ana").x);
  expect(x).toBeGreaterThan(20); expect(x).toBeLessThanOrEqual(45.00001);
});
test("porta proxima abre; origem distante nao ve o botao", async ({ page }) => {
  await fixture(page, true, true);
  await expect(page.locator(".mesa-door-button")).toHaveCount(0);
  await page.evaluate(() => { findToken("ana").x = 42; renderStage(); });
  await page.getByRole("button", { name: "Abrir porta", exact: true }).click();
  await expect.poll(() => page.evaluate(() => mesaVision.walls[0].doorState)).toBe("open");
  await expect(page.locator('#mesaStage [data-token-id="hidden"]')).toHaveCount(1);
});
test("snapshot sem visao limpa mascara e paredes da cena anterior", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { applyMesaVisionSnapshot(null); renderStage(); });
  await expect(page.locator("#mesaVisionCanvas")).toBeHidden();
  expect(await page.evaluate(() => getMesaVisionPayload())).toBeNull();
});

test("recusa remota restaura posicao e pede snapshot, sem salvar pela via antiga", async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    let requests = 0, gets = 0, oldSaves = 0;
    const snapshot = createMesaScenePayloadFromState();
    const auth = window.AUTH, app = window.APP;
    window.AUTH = { ...auth, isBackendEnabled: () => true };
    window.APP = { ...app,
      mesaVisionAction: async () => { requests++; throw Object.assign(new Error("Conflito"), { status: 409 }); },
      getMesaScene: async () => { gets++; return { data: snapshot }; },
      saveMesaScene: async () => { oldSaves++; }
    };
    findToken("ana").x = 35;
    await mesaVisionAction({ kind: "move", tokenId: "ana", path: [{ x: 35, y: 45 }] }, { x: 20, y: 45 });
    window.AUTH = auth; window.APP = app;
    return { requests, gets, oldSaves, x: findToken("ana").x, busy: mesaVisionBusy };
  });
  expect(result).toEqual({ requests: 1, gets: 1, oldSaves: 0, x: 20, busy: false });
});

test("fog manual oculta botoes de porta e nomes da iniciativa fora da visao", async ({ page }) => {
  await fixture(page, true, true);
  await page.evaluate(() => {
    findToken("ana").x = 42;
    applyInitiativeState({ active: true, phase: "order", round: 1, currentIndex: 0,
      order: [{ id: "hidden", characterKey: "hidden", type: "npc", name: "Segredo", rolled: true }] });
    applyMesaSceneFogFromSnapshot({ enabled: true, base: "hidden", ops: [] });
    renderStage();
  });
  await expect(page.locator(".mesa-door-button")).toHaveCount(0);
  await expect(page.locator("#initiativeTracker")).not.toContainText("Segredo");
});

test("zoom e resize mantem o centro do token alinhado ao cone", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => setStageZoom(1.5));
  await page.waitForTimeout(100);
  const difference = await page.evaluate(() => {
    const token = findToken("ana"), el = document.querySelector('[data-token-id="ana"]'), stage = document.getElementById("mesaStage");
    const t = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const center = MesaVisionRules.center(token, mesaVision);
    return { x: (t.x + t.width / 2 - s.x) / s.width - center.x, y: (t.y + t.height / 2 - s.y) / s.height - center.y / mesaVision.aspect };
  });
  expect(Math.abs(difference.x)).toBeLessThan(.002);
  expect(Math.abs(difference.y)).toBeLessThan(.002);
});

test("mede recalculo no navegador em contornos de 500, 2000 e 5000 segmentos", async ({ page }, info) => {
  const samples = await page.evaluate(() => {
    return [500, 2000, 5000].map(count => {
      const points = Array.from({ length: count }, (_, i) => {
        const a = i * Math.PI * 2 / count, r = .35 + .02 * Math.sin(a * 31);
        return { x: .5 + r * Math.cos(a), y: .5 + r * Math.sin(a) };
      });
      const walls = points.map((p, i) => { const q = points[(i + 1) % count]; return { id: `w${i}`, ax: p.x, ay: p.y, bx: q.x, by: q.y }; });
      const start = performance.now();
      const prepared = MesaVisionGeometry.prepare({ walls });
      const preparationMs = performance.now() - start, timings = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now(); prepared.polygon({ x: .5 + .02 * Math.sin(i), y: .5 }, i * 3); timings.push(performance.now() - t);
      }
      timings.sort((a, b) => a - b);
      return { count, preparationMs, p95: timings[Math.floor(timings.length * .95)], max: timings.at(-1) };
    });
  });
  console.log("VISION_BENCHMARK", JSON.stringify(samples));
  await info.attach("geometry-browser-timings", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
});
