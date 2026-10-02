const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
});
async function setup(page, vision = false, door = false) {
  await page.evaluate(({ vision, door }) => {
    const sample = state.tokens[0];
    state.tokens = [{ ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", name: "Ana", x: 20, y: 45, tokenScale: .5, visionRadius: .025, facingDeg: 0 },
      { ...sample, id: "secret", characterKey: "secret", type: "npc", name: "Segredo", x: 70, y: 45, visionRadius: .025 }];
    const stage = document.getElementById("mesaStage");
    applyMesaVisionSnapshot({ enabled: vision, aspect: stage.clientHeight / stage.clientWidth, coneDeg: 120, walls: [{ id: "wall", ax: .5, ay: 0, bx: .5, by: 1, kind: door ? "door" : "wall", doorState: door ? "closed" : null }] });
    state.role = "player"; state.session = { username: "ana", role: "player" }; state.selectedTokenId = "ana";
    applyMesaRolePermissions("player"); renderAll(); setInteractionMode("move");
    window.moveMessages = []; sendMesaRealtimeDelta = (type, data) => { window.moveMessages.push({ type, data }); return true; };
  }, { vision, door });
}
async function dragTo(page, x, y) {
  const token = page.locator('.mesa-token[data-token-id="ana"]'); await token.hover();
  const b = await token.boundingBox(), stage = await page.locator("#mesaStage").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * x / 100 + b.width / 2, stage.y + stage.height * y / 100 + b.height / 2, { steps: 8 });
  await expect(page.locator("#mesaMovementCanvas")).toBeVisible();
}

test("M2 dois clientes percorrem a mesma curva e ignoram duplicata/atraso", async ({ page, context }) => {
  await setup(page);
  const other = await context.newPage();
  await other.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => other.evaluate(() => state.bootCompleted)).toBe(true); await setup(other);
  await dragTo(page, 20, 20);
  await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" });
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-waypoints", "1");
  const stage = await page.locator("#mesaStage").boundingBox(), token = await page.locator('.mesa-token[data-token-id="ana"]').boundingBox();
  await page.mouse.move(stage.x + stage.width * .4 + token.width / 2, stage.y + stage.height * .2 + token.height / 2);
  await page.mouse.up();
  const message = await page.evaluate(() => window.moveMessages.find(m => m.type === "mesa:token:move"));
  expect(message.data.movement.path).toHaveLength(2);
  for (const [i, p] of message.data.movement.path.entries()) { expect(p.x).toBeCloseTo(i ? 40 : 20, 4); expect(p.y).toBeCloseTo(20, 4); }
  const mid = await other.evaluate(async msg => {
    window.motionClock = 1000; performance.now = () => window.motionClock;
    await applyMesaRealtimeDelta({ ...msg.data, sceneVersion: msg.data.movement.sceneVersion, type: msg.type, actor: { role: "player", username: "ana" } });
    window.motionClock += msg.data.movement.duration / 2;
    return MesaMovement.visual(findToken("ana"));
  }, message);
  expect(mid.x).toBeCloseTo(20, 3); expect(mid.y).toBeCloseTo(22.5, 3);
  const same = await other.evaluate(async msg => {
    await applyMesaRealtimeDelta({ ...msg.data, sceneVersion: msg.data.movement.sceneVersion, type: msg.type, actor: { role: "player", username: "ana" } });
    await applyMesaRealtimeDelta({ ...msg.data, x: 10, sceneVersion: 1, type: msg.type, actor: { role: "player", username: "ana" } });
    return { visual: MesaMovement.visual(findToken("ana")), token: findToken("ana") };
  }, message);
  expect(same.visual.x).toBeCloseTo(mid.x, 5); expect(same.visual.y).toBeCloseTo(mid.y, 5);
  expect(same.token.x).toBe(40); expect(same.token.y).toBe(20);
  await other.close();
});

test("M2 snapshot aceita curva apenas para origem, destino e versao correspondentes", async ({ page }) => {
  await setup(page, true);
  const result = await page.evaluate(() => {
    window.motionClock = 1000; performance.now = () => window.motionClock;
    const data = createMesaScenePayloadFromState(); data.sceneVersion = 100;
    const path = [{ x: 20, y: 20 }, { x: 40, y: 20 }];
    const motion = MesaMovementRules.create("ana", { x: 20, y: 45 }, path, 100, 1);
    Object.assign(data.tokens.find(t => t.id === "ana"), path.at(-1));
    applyMesaSceneSnapshot(data, { keepSelection: true, movement: motion }); window.motionClock += 225;
    return { visual: MesaMovement.visual(findToken("ana")), payload: createMesaScenePayloadFromState() };
  });
  expect(result.visual.x).toBeCloseTo(20, 3); expect(result.visual.y).toBeCloseTo(22.5, 3);
  expect(result.payload.movement).toBeUndefined();
});

test("rastro mantem resolucao de tela ao ampliar durante arrasto", async ({ page }, info) => {
  await setup(page);
  await dragTo(page, 40, 50);
  for (const zoom of [1, 2.84, 4]) {
    await page.evaluate(z => setStageZoom(z), zoom);
    const resolution = await page.locator("#mesaMovementCanvas").evaluate(c => {
      const r = c.getBoundingClientRect();
      return { x: c.width / r.width, y: c.height / r.height, dpr: devicePixelRatio,
        pixels: c.width * c.height, budget: innerWidth * innerHeight * devicePixelRatio ** 2 };
    });
    expect(resolution.x).toBeGreaterThanOrEqual(resolution.dpr - .01);
    expect(resolution.y).toBeGreaterThanOrEqual(resolution.dpr - .01);
    expect(resolution.pixels).toBeLessThan(resolution.budget * 1.05);
  }
  await page.screenshot({ path: info.outputPath("rastro-zoom-alto.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
});

test("rastro longo usa passos regulares mesmo com tamanho fracionario", async ({ page }) => {
  const blocks = await page.evaluate(() => MesaMovement.footprints(
    [{ x: 24.2, y: 24.2 }, { x: 624.2, y: 624.2 }],
    { width: 48.4, height: 48.4 }, { cell: 10, ox: 0, oy: 0 }));
  expect(blocks).toHaveLength(13);
  for (let i = 1; i < blocks.length; i++) {
    expect(blocks[i].x - blocks[i - 1].x).toBe(50);
    expect(blocks[i].y - blocks[i - 1].y).toBe(50);
    expect(blocks[i].width).toBe(50);
  }
});

test("controles da grade usam colunas inteiras e escalas fechadas", async ({ page }) => {
  const result = await page.evaluate(() => {
    state.role = "master"; state.session = { role: "master", username: "mestre-local" };
    applyMesaSceneGridFromSnapshot({ enabled: true, cellFrac: .095, metersPerCell: 3.1 });
    adjustMesaGridCell(1);
    const columns = 1 / getMesaGridState().cellFrac;
    adjustMesaGridScale(-1); const first = getMesaGridState().metersPerCell;
    adjustMesaGridScale(1); const second = getMesaGridState().metersPerCell;
    adjustMesaGridScale(1); const third = getMesaGridState().metersPerCell;
    return { columns, first, second, third, label: formatMesaGridScale(second) };
  });
  expect(result).toEqual({ columns: 12, first: 1, second: 5, third: 10, label: "5" });
});
test("G2 mover para borda com origem deslocada continua numa celula completa", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => applyMesaSceneGridFromSnapshot({ enabled: true, cellFrac: .05, offsetXFrac: .25, offsetYFrac: .25 }));
  await dragTo(page, -5, -5);
  const destination = await page.evaluate(() => state.drag.destination);
  expect(destination.x).toBeCloseTo(1.25, 5); expect(destination.y).toBeCloseTo(1.25, 5);
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeCloseTo(1.25, 5);
});

for (const n of [1, 2, 3]) {
  test(`trajeto cobre a area inteira do token ${n}x${n}`, async ({ page }, info) => {
    await setup(page);
    await page.evaluate(n => {
      applyMesaSceneGridFromSnapshot({ enabled: true, snap: true, cellFrac: .05, metersPerCell: 1.5 });
      const cell = _gridCellStagePx(), token = findToken("ana");
      Object.assign(token, { x: 20, y: 40, tokenScale: n * cell / 88 });
      renderStage();
    }, n);
    await dragTo(page, 40, 40);
    await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-blocks", String(Math.ceil(4 / n) + 1));
    const result = await page.evaluate(n => {
      const g = { cell: 20, ox: 7, oy: 13 };
      const s = { width: n * 20, height: n * 20 };
      const a = { x: 7 + s.width / 2, y: 13 + s.height / 2 };
      const b = { x: a.x + 80, y: a.y };
      const forward = MesaMovement.cellsBetween(a, b, g, s);
      const reverse = MesaMovement.cellsBetween(b, a, g, s);
      const diagonal = MesaMovement.cellsBetween(a, { x: a.x + 80, y: a.y + 80 }, g, s);
      return { count: forward.length, rows: new Set(forward.map(c => c.y)).size,
        stationary: MesaMovement.cellsBetween(a, a, g, s).length,
        reverse: JSON.stringify(reverse.map(c => `${c.x}:${c.y}`).sort()) === JSON.stringify(forward.map(c => `${c.x}:${c.y}`).sort()),
        diagonal: diagonal.length, saved: findToken("ana").x };
    }, n);
    expect(result.count).toBe((n + 4) * n);
    expect(result.rows).toBe(n);
    expect(result.stationary).toBe(n * n);
    expect(result.reverse).toBe(true);
    expect(result.diagonal).toBeLessThan((n + 4) ** 2);
    expect(result.saved).toBe(20);
    await page.screenshot({ path: info.outputPath(`trajeto-${n}x${n}.png`) });
    await page.keyboard.press("Escape"); await page.mouse.up();
  });
}
test("rota direta permite diagonal com blocos inteiros e animacao correspondente", async ({ page }, info) => {
  await setup(page);
  await page.evaluate(() => {
    applyMesaSceneGridFromSnapshot({ enabled: true, snap: true, cellFrac: .05, metersPerCell: 1.5 });
    Object.assign(findToken("ana"), { x: 20, y: 40, tokenScale: 2 * _gridCellStagePx() / 88 }); renderStage();
  });
  await dragTo(page, 40, 60);
  const preview = await page.evaluate(() => ({ path: state.drag.destination.path, origin: state.drag.origin }));
  expect(preview.path).toEqual([{ x: 40, y: 60 }]);
  await expect(page.locator("#mesaMovementLabel")).toContainText("8,5 m");
  const blocks = await page.evaluate(() => MesaMovement.footprints([{ x: 0, y: 0 }, { x: 80, y: 80 }], { width: 40, height: 40 }));
  expect(blocks).toHaveLength(3);
  expect(blocks.every(b => b.width === 40 && b.height === 40)).toBe(true);
  expect(blocks.every(b => b.x === b.y)).toBe(true);
  await page.screenshot({ path: info.outputPath("caminho-diagonal-2x2.png") });
  await page.mouse.up();
  const samples = await page.evaluate(async () => {
    const points = [];
    while (MesaMovement.isAnimating(findToken("ana"))) {
      const p = MesaMovement.visual(findToken("ana")); points.push({ x: p.x, y: p.y });
      await new Promise(requestAnimationFrame);
    }
    return points;
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(p => Math.abs((p.y - 40) - (p.x - 20)) < .001)).toBe(true);
});
test("visao valida diagonal e interrompe na parede", async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => {
    applyMesaSceneGridFromSnapshot({ enabled: true, cellFrac: .05 });
    const original = mesaVisionAction;
    mesaVisionAction = async action => { window.lastMovePath = action.path; return original(action); };
  });
  await dragTo(page, 35, 60); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => findToken("ana").y)).toBeCloseTo(60, 3);
  expect(await page.evaluate(() => window.lastMovePath)).toEqual([{ x: 35, y: 60 }]);
  await expect.poll(() => page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
  await dragTo(page, 70, 75);
  const d = await page.evaluate(() => state.drag.destination);
  expect(d.blocked).toBe(true); expect(d.x).toBeLessThan(45.001); expect(d.y).toBeGreaterThan(60);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => mesaVisionBusy)).toBe(false);
  expect(await page.evaluate(() => findToken("ana").y)).toBeCloseTo(d.y, 3);
});
test("rastro alinha blocos ao grid e oculta olho desde o inicio do arrasto", async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => applyMesaSceneGridFromSnapshot({ enabled: true, cellFrac: .05, offsetXFrac: .3, offsetYFrac: .6 }));
  const token = page.locator('.mesa-token[data-token-id="ana"]');
  await token.hover(); await expect(page.locator('#mesaFacingControls')).toBeVisible();
  await page.mouse.down(); await expect(page.locator('#mesaFacingControls')).toBeHidden();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => !mesaVisionBusy && !MesaMovement.isAnimating(findToken("ana")))).toBe(true);
  await dragTo(page, 33, 61);
  await expect(page.locator('#mesaFacingControls')).toBeHidden();
  await expect(page.locator('#mesaMovementLabel')).toHaveText(/^\d+,\d m$/);
  const aligned = await page.evaluate(() => {
    const g = { cell: 20, ox: 7, oy: 13 };
    return [1, 2, 3].every(n => MesaMovement.footprints([{ x: 28, y: 39 }, { x: 153, y: 106 }], { width: n * 20, height: n * 20 }, g).every(p => {
      const col = (p.x - p.width / 2 - g.ox) / g.cell, row = (p.y - p.height / 2 - g.oy) / g.cell;
      return Math.abs(col - Math.round(col)) < 1e-6 && Math.abs(row - Math.round(row)) < 1e-6 && p.width === n * 20 && p.height === n * 20;
    }));
  });
  expect(aligned).toBe(true);
  await page.mouse.up();
});
test("grade alterna casas e contorno circular com medicao livre", async ({ page }, info) => {
  await setup(page);
  await page.evaluate(() => {
    applyMesaSceneGridFromSnapshot({ enabled: false, snap: true, cellFrac: .05, metersPerCell: 3 });
    window.previewCalls = [];
    for (const method of ["rect", "strokeRect", "ellipse"]) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas.id === "mesaMovementCanvas") window.previewCalls.push(method);
        return original.apply(this, args);
      };
    }
  });
  await dragTo(page, 37, 45);
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-mode", "free");
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-cells", "0");
  await expect(page.locator("#mesaMovementLabel")).toHaveText("10,2 m");
  expect(await page.evaluate(() => window.previewCalls)).toEqual([]);
  expect(await page.evaluate(() => state.drag.destination.x)).toBeCloseTo(37, 3);
  await page.screenshot({ path: info.outputPath("movimento-livre.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await page.evaluate(() => {
    applyMesaSceneGridFromSnapshot({ enabled: true, snap: false, cellFrac: .05, metersPerCell: 3 });
    window.previewCalls = [];
  });
  await dragTo(page, 37, 45);
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-mode", "grid");
  expect(await page.evaluate(() => state.drag.destination.x)).toBeCloseTo(35, 3);
  const calls = await page.evaluate(() => window.previewCalls);
  expect(calls).toContain("rect"); expect(calls).not.toContain("ellipse"); expect(calls).not.toContain("strokeRect");
  await page.screenshot({ path: info.outputPath("movimento-grade.png") });
  await page.mouse.up();
  expect(await page.evaluate(() => findToken("ana").x)).toBeCloseTo(35, 3);
});
test("configuracoes mostram barreiras diretamente, sem janela ou acordeao extra", async ({ page }, info) => {
  await page.locator("#mesaMapSettingsBtn").click();
  await expect(page.locator("#mesaVisionWall")).toBeVisible();
  await expect(page.locator("#mesaVisionPanel")).toHaveJSProperty("tagName", "SECTION");
  for (const width of [390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator("#mesaVisionPanel").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: info.outputPath("configuracoes-diretas.png") });
});
test("arrastar apenas planeja; soltar anima em linha reta e envia uma unica posicao", async ({ page }, info) => {
  await setup(page); await dragTo(page, 50, 65);
  expect(await page.evaluate(() => ({ x: findToken("ana").x, y: findToken("ana").y }))).toEqual({ x: 20, y: 45 });
  expect(await page.evaluate(() => window.moveMessages.filter(m => m.type === "mesa:token:move").length)).toBe(0);
  await expect(page.locator("#mesaMovementLabel")).toContainText("m");
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-cells", "0");
  await page.screenshot({ path: info.outputPath("trajeto-planejado.png") });
  await page.mouse.up();
  const visual = await page.evaluate(() => { const t = findToken("ana"); return { real: t.x, shown: MesaMovement.visual(t).x, animated: MesaMovement.isAnimating(t) }; });
  expect(visual.real).toBeCloseTo(50, 1); expect(visual.shown).toBeLessThan(visual.real); expect(visual.animated).toBe(true);
  await expect.poll(() => page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
  expect(await page.evaluate(() => window.moveMessages.filter(m => m.type === "mesa:token:move").length)).toBe(1);
  await expect(page.locator("#mesaMovementCanvas")).toBeHidden();
  await page.reload(); await expect.poll(() => page.evaluate(() => findToken("ana")?.x)).toBeCloseTo(50, 1);
});
test("parede limita destino; previa nao desloca a visao nem revela tokens", async ({ page }, info) => {
  await setup(page, true); await dragTo(page, 70, 45);
  await expect(page.locator("#mesaMovementLabel")).toHaveAttribute("data-blocked", "true");
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await expect(page.locator('.mesa-token[data-token-id="secret"]')).toHaveCount(0);
  expect(await page.evaluate(() => state.drag.destination.x)).toBeLessThan(45.0001);
  await page.screenshot({ path: info.outputPath("trajeto-bloqueado.png") });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeGreaterThan(40);
  expect(await page.evaluate(() => findToken("ana").x)).toBeLessThan(45.0001);
  await expect.poll(() => page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
});
test("porta aberta permite confirmar destino alem da barreira", async ({ page }) => {
  await setup(page, true, true);
  await page.evaluate(() => { findToken("ana").x = 42; renderStage(); });
  await page.getByRole("button", { name: "Abrir porta", exact: true }).click();
  await expect.poll(() => page.evaluate(() => mesaVisionBusy)).toBe(false);
  await dragTo(page, 65, 45); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeCloseTo(65, 1);
});
for (const cancel of ["Escape", "pointercancel", "blur"]) {
  test(`cancelamento ${cancel} nao move, nao grava e limpa percurso`, async ({ page }) => {
    await setup(page, true); await dragTo(page, 35, 55);
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else if (cancel === "right") await page.mouse.click(500, 480, { button: "right" });
    else await page.evaluate(type => window.dispatchEvent(new Event(type)), cancel);
    await page.mouse.up();
    expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
    expect(await page.evaluate(() => state.drag)).toBeNull();
    await expect(page.locator("#mesaMovementCanvas")).toBeHidden();
  });
}

for (const vision of [false, true]) {
  test(`botao direito fixa curvas e preserva caminho, visao ${vision}`, async ({ page }) => {
    await setup(page, vision);
    await page.evaluate(() => {
      if (mesaVisionActive()) {
        applyMesaVisionSnapshot({ ...mesaVision, walls: [{ id: "wall", ax: .5, ay: .35, bx: .5, by: .65, kind: "wall" }] });
        const original = mesaVisionAction;
        mesaVisionAction = async a => { window.lastPath = a.path; return original(a); };
      }
    });
    await dragTo(page, 35, 20);
    await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" });
    const fixed = await page.evaluate(() => state.drag.waypoints);
    expect(fixed).toHaveLength(1); expect(fixed[0].x).toBeCloseTo(35, 3); expect(fixed[0].y).toBeCloseTo(20, 3);
    expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
    const stage = await page.locator("#mesaStage").boundingBox();
    const token = await page.locator('.mesa-token[data-token-id="ana"]').boundingBox();
    const move = async (x, y) => page.mouse.move(stage.x + stage.width * x / 100 + token.width / 2, stage.y + stage.height * y / 100 + token.height / 2, { steps: 5 });
    await move(65, 20);
    await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" });
    await move(65, 45);
    await expect.poll(() => page.evaluate(() => state.drag.destination.path.length)).toBe(3);
    const path = await page.evaluate(() => state.drag.destination.path);
    for (const [i, expected] of [{ x: 35, y: 20 }, { x: 65, y: 20 }, { x: 65, y: 45 }].entries()) {
      expect(path[i].x).toBeCloseTo(expected.x, 3); expect(path[i].y).toBeCloseTo(expected.y, 3);
    }
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeCloseTo(65, 2);
    await expect.poll(() => page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
    if (vision) expect(await page.evaluate(() => window.lastPath)).toEqual(path);
  });
}
test("grade com offset, snap e escala em metros usa a mesma medida da regua", async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => { applyMesaSceneGridFromSnapshot({ enabled: true, snap: true, cellFrac: .05, metersPerCell: 3, offsetXFrac: .5 }); setStageZoom(1.25); });
  await dragTo(page, 34, 45);
  const measure = await page.evaluate(() => {
    const d = state.drag, m = measureMesaRuler(d.origin.x / 100, d.origin.y / 100, d.destination.x / 100, d.destination.y / 100);
    return { x: d.destination.x, text: _formatRulerDistance(m.meters) };
  });
  expect(measure.x).toBeCloseTo(32.5, 3);
  await expect(page.locator("#mesaMovementLabel")).toContainText(measure.text);
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeCloseTo(32.5, 3);
});
for (const vision of [false, true]) test(`M1 Backspace remove so ultimo ponto e recalcula metros, visao ${vision}`, async ({ page }, info) => {
  await setup(page, vision);
  await dragTo(page, 30, 20);
  await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" });
  const stage = await page.locator("#mesaStage").boundingBox(), token = await page.locator('.mesa-token[data-token-id="ana"]').boundingBox();
  const move = async (x, y) => page.mouse.move(stage.x + stage.width * x / 100 + token.width / 2, stage.y + stage.height * y / 100 + token.height / 2, { steps: 4 });
  await move(35, 20); await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" });
  await move(35, 40);
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-waypoints", "2");
  const before = await page.locator("#mesaMovementLabel").textContent();
  await page.keyboard.press("Backspace");
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-waypoints", "1");
  expect(await page.evaluate(() => state.drag.destination.path.length)).toBe(2);
  expect(await page.locator("#mesaMovementLabel").textContent()).not.toBe(before);
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await page.screenshot({ path: info.outputPath("ponto-removido.png") });
  await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
  await expect(page.locator("#mesaMovementCanvas")).toHaveAttribute("data-waypoints", "0");
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => findToken("ana").x)).toBeCloseTo(35, 2);
});
test("servidor rejeita movimento sem revelar destino e sem animacao falsa", async ({ page }) => {
  await setup(page, true);
  await page.evaluate(() => {
    window.AUTH.isBackendEnabled = () => true;
    window.APP.mesaVisionAction = () => new Promise((_, reject) => { window.rejectMove = () => reject(new Error("Revisao desatualizada")); });
    window.APP.getMesaScene = async () => { throw new Error("Offline"); };
  });
  await dragTo(page, 35, 55); await page.mouse.up();
  await expect(page.locator("#mesaMovementLabel")).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await page.evaluate(() => window.rejectMove());
  await expect.poll(() => page.evaluate(() => mesaVisionBusy)).toBe(false);
  expect(await page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await expect(page.locator("#mesaMovementCanvas")).toBeHidden();
});
test("movimento reduzido aplica destino sem animar; troca de cena cancela rascunho", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await setup(page);
  await dragTo(page, 40, 45); await page.mouse.up();
  expect(await page.evaluate(() => MesaMovement.isAnimating(findToken("ana")))).toBe(false);
  await dragTo(page, 60, 45);
  await page.evaluate(() => { state.sceneId = "other"; applyMesaSceneSnapshot({ tokens: [], vision: null }); renderAll(); });
  await page.mouse.up(); await expect(page.locator("#mesaMovementCanvas")).toBeHidden();
  expect(await page.evaluate(() => state.drag)).toBeNull();
});
test("repinturas preservam captura e a trava recebida durante o gesto impede confirmar", async ({ page }) => {
  await setup(page, true); await dragTo(page, 35, 45);
  await page.evaluate(() => { renderStage(); renderStage(); renderStage(); });
  expect(await page.evaluate(() => state.drag.tokenElement.hasPointerCapture(state.drag.pointerId))).toBe(true);
  await page.evaluate(() => { state.playersMoveLocked = true; });
  await page.mouse.up();
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await expect(page.locator("#mesaMovementCanvas")).toBeHidden();
});
test("movimento remoto confirmado anima sem alterar seu destino salvo", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { applyMesaTokenMoveDelta({ tokenId: "ana", x: 60, y: 45, actor: { role: "master" } }); renderStage(); });
  const positions = await page.evaluate(() => ({ saved: findToken("ana").x, visual: MesaMovement.visual(findToken("ana")).x }));
  expect(positions.saved).toBe(60); expect(positions.visual).toBeLessThan(60);
  await expect.poll(() => page.evaluate(() => MesaMovement.visual(findToken("ana")).x)).toBe(60);
});
