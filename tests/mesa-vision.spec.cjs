const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect(page.locator("#mesaStage .mesa-token")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
});
async function editor(page, mode = "Wall", shape = "chain") {
  if (!await page.locator("#mesaVisionPanel").isVisible()) await page.locator("#mesaMapSettingsBtn").click();
  await expect(page.locator("#mesaVisionTitle")).toBeVisible();
  await page.locator(`#mesaVision${mode}`).click();
  await expect(page.locator(`#mesaVision${mode}`)).toHaveAttribute("aria-pressed", "true");
  if (mode === "Wall") await page.selectOption("#mesaBarrierShape", shape);
  await expect(page.locator("#mesaWallCanvas")).toBeVisible();
  return async (x, y, button = "left") => {
    await expect(page.locator("#mesaWallCanvas")).toBeVisible();
    const b = await page.locator("#mesaStageInner").boundingBox();
    await page.mouse.click(b.x + x * b.width, b.y + y * b.height, { button });
  };
}
async function fixture(page, player = true, door = false) {
  await page.evaluate(({ player, door }) => {
    const sample = state.tokens[0];
    state.tokens = [{ ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", name: "Ana", x: 20, y: 45, visionRadius: .025, facingDeg: 0 },
      { ...sample, id: "secret", characterKey: "secret", type: "npc", name: "Segredo", x: 70, y: 45, visionRadius: .025 }];
    const s = document.getElementById("mesaStage");
    applyMesaVisionSnapshot({ enabled: true, aspect: s.clientHeight / s.clientWidth, coneDeg: 120, revision: 0,
      walls: [{ id: "barrier", ax: .5, ay: 0, bx: .5, by: 1, kind: door ? "door" : "wall", doorState: door ? "closed" : null }] });
    state.role = player ? "player" : "master"; state.session = { username: "ana", role: state.role }; state.selectedTokenId = "ana";
    applyMesaRolePermissions(state.role); renderAll(); setInteractionMode("move");
  }, { player, door });
}
test("nova cadeia ignora cliques duplicados, desfaz/refaz e mantem dados no F5", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const click = await editor(page);
  await click(.25, .2); await click(.25, .2); await click(.25, .8);
  await expect(page.locator("#mesaVisionCount")).toHaveText("1 segmento");
  await click(.3, .8, "right");
  await expect(page.locator("#mesaWallCanvas")).toBeHidden();
  await page.locator("#mesaVisionUndo").click(); await expect(page.locator("#mesaVisionCount")).toHaveText("0 segmentos");
  await page.locator("#mesaVisionRedo").click();
  await page.reload(); await expect.poll(() => page.evaluate(() => mesaVision?.walls.length)).toBe(1);
  expect(errors).toEqual([]);
});
test("poligono fecha atomicamente; concluir preserva lados; Escape descarta rascunho", async ({ page }) => {
  const click = await editor(page, "Wall", "polygon");
  await click(.2, .2); await click(.4, .2); await click(.4, .4);
  await page.locator("#mesaBarrierClose").click();
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
  await page.locator("#mesaVisionUndo").click();
  await editor(page, "Wall", "polygon"); await click(.2, .2); await click(.4, .2); await click(.4, .4);
  await page.locator("#mesaVisionStop").click(); expect(await page.evaluate(() => mesaVision.walls.length)).toBe(2);
  await editor(page, "Wall", "polygon"); await click(.2, .6); await click(.4, .6); await page.keyboard.press("Escape");
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(2);
  await expect(page.locator("#mesaWallCanvas")).toBeHidden();
});
test("retangulo, apagar e desfazer mantem barreiras consistentes", async ({ page }) => {
  const click = await editor(page, "Wall", "rect");
  await click(.2, .2); await click(.2, .4); await click(.4, .5);
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(4);
  await editor(page, "Erase"); await click(.2, .35);
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
  await page.locator("#mesaVisionUndo").click(); expect(await page.evaluate(() => mesaVision.walls.length)).toBe(4);
});
test("poligono sem area nao fecha; botao direito conserva somente pontos confirmados", async ({ page }) => {
  const click = await editor(page, "Wall", "polygon");
  await click(.2, .2); await click(.3, .2); await click(.4, .2);
  await page.locator("#mesaBarrierClose").click();
  expect(await page.evaluate(() => mesaVision?.walls.length || 0)).toBe(0);
  await expect(page.locator("#mesaWallCanvas")).toBeVisible();
  await click(.4, .4, "right");
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(2);
  for (const [mode, shape] of [["Wall", "rect"], ["Door", "chain"], ["Erase", "chain"]]) {
    await editor(page, mode, shape);
    await click(.25, .5); await click(.4, .6, "right");
    await expect(page.locator("#mesaWallCanvas")).toBeHidden();
    expect(await page.evaluate(() => mesaVision.walls.length)).toBe(2);
  }
});
test("porta substitui trecho de parede sem parede sobreposta e desfaz de uma vez", async ({ page }) => {
  const click = await editor(page); await click(.5, .1); await click(.5, .9); await click(.5, .9, "right");
  await editor(page, "Door"); await click(.5, .4); await click(.5, .6);
  expect(await page.evaluate(() => mesaVision.walls.map(w => w.kind))).toEqual(["wall", "door", "wall"]);
  await page.locator("#mesaVisionStop").click(); await page.locator("#mesaVisionUndo").click();
  expect(await page.evaluate(() => mesaVision.walls.map(w => w.kind))).toEqual(["wall"]);
});
test("selecionar parede e porta e local, sem geometria, gravacao ou passo de desfazer", async ({ page }, info) => {
  const click = await editor(page);
  await click(.25, .2); await click(.25, .8); await click(.25, .8, "right");
  await editor(page, "Door"); await click(.25, .4); await click(.25, .6);
  await page.locator("#mesaVisionStop").click();
  const before = await page.evaluate(() => {
    window.selectionSaves = 0;
    const save = persistState;
    persistState = (...args) => { window.selectionSaves++; return save(...args); };
    return createMesaScenePayloadFromState();
  });
  const walls = before.vision.walls;
  await editor(page, "Select"); await click(.25, .3);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-wall", walls[0].id);
  await expect(page.locator("#mesaVisionHint")).toContainText("Parede selecionada");
  await click(.25, .5);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-wall", walls[1].id);
  await expect(page.locator("#mesaVisionHint")).toContainText("Porta selecionada");
  await page.screenshot({ path: info.outputPath("porta-selecionada.png") });
  await click(.35, .5);
  await expect(page.locator("#mesaWallCanvas")).toHaveAttribute("data-selected-wall", "");
  expect(await page.evaluate(() => createMesaScenePayloadFromState())).toEqual(before);
  expect(await page.evaluate(() => window.selectionSaves)).toBe(0);
  await page.locator("#mesaVisionUndo").click();
  expect(await page.evaluate(() => mesaVision.walls.map(w => w.kind))).toEqual(["wall"]);
});

test("selecao usa tolerancia em tela no zoom e limpa ao sair, trocar cena ou perder papel", async ({ page }, info) => {
  await fixture(page, false);
  await page.evaluate(() => {
    const v = getMesaVisionPayload(); v.walls[0].ay = .4; v.walls[0].by = .6;
    applyMesaVisionSnapshot(v); renderStage();
  });
  await editor(page, "Select");
  const canvas = page.locator("#mesaWallCanvas");
  for (const zoom of [.75, 1, 2.84]) {
    await page.evaluate(z => setStageZoom(z), zoom);
    const b = await canvas.boundingBox();
    await page.mouse.click(b.x + b.width * .5 + 10, b.y + b.height * .5);
    await expect(canvas).toHaveAttribute("data-selected-wall", "barrier");
    await page.mouse.click(b.x + b.width * .5 + 14, b.y + b.height * .5);
    await expect(canvas).toHaveAttribute("data-selected-wall", "");
  }
  let click = await editor(page, "Select"); await click(.5, .5);
  await page.screenshot({ path: info.outputPath("parede-selecionada-zoom.png") });
  await page.keyboard.press("Escape"); await expect(canvas).toBeHidden();
  await expect(canvas).toHaveAttribute("data-selected-wall", "");
  click = await editor(page, "Select"); await click(.5, .5); await click(.5, .5, "right");
  await expect(canvas).toBeHidden(); await expect(canvas).toHaveAttribute("data-selected-wall", "");
  await editor(page, "Select"); await click(.5, .5); await editor(page, "Wall");
  await expect(canvas).toHaveAttribute("data-selected-wall", "");
  await editor(page, "Select"); await click(.5, .5);
  await page.locator("#mesaMapSettingsBtn").click();
  await expect(canvas).toBeHidden(); await expect(canvas).toHaveAttribute("data-selected-wall", "");
  await editor(page, "Select"); await click(.5, .5);
  await page.evaluate(() => { state.sceneId = "other"; applyMesaVisionSnapshot(null); renderStage(); });
  await expect(canvas).toHaveAttribute("data-selected-wall", "");
  await fixture(page, false); await editor(page, "Select"); await click(.5, .5);
  await page.evaluate(() => { state.role = "player"; state.session.role = "player"; applyMesaRolePermissions("player"); renderAll(); });
  await expect(canvas).toBeHidden(); await expect(page.locator("#mesaVisionSelect")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-selected-wall", "");
});

test("abrir porta recortada libera visao e passagem, sem revelar fora do cone", async ({ page }) => {
  await fixture(page, false);
  const click = await editor(page, "Door"); await click(.5, .38); await click(.5, .65);
  await page.locator("#mesaVisionStop").click(); await page.locator("#mesaMapSettingsBtn").click();
  await page.evaluate(() => { state.role = "player"; state.session.role = "player"; findToken("ana").x = 42; applyMesaRolePermissions("player"); renderAll(); });
  await expect(page.locator('[data-token-id="secret"].mesa-token')).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir porta", exact: true }).click();
  await expect(page.locator('[data-token-id="secret"].mesa-token')).toHaveCount(1);
  expect((await page.evaluate(() => mesaVisionConstrain(findToken("ana"), 55, 45))).x).toBeCloseTo(55, 4);
});
test("edicao durante salvamento preserva cadeia nova contra eco atrasado", async ({ page }) => {
  const click = await editor(page);
  await page.evaluate(() => {
    window.wallSaves = []; window.AUTH.isBackendEnabled = () => true;
    window.APP.saveMesaScene = payload => new Promise(resolve => {
      window.wallSaves.push({ revision: payload.vision.revision, count: payload.vision.walls.length });
      if (!window.firstWallEcho) window.firstWallEcho = { ...payload, vision: { ...payload.vision, revision: payload.vision.revision + 1 } };
      window.resolveWalls = () => resolve({ data: { ...payload, vision: { ...payload.vision, revision: payload.vision.revision + 1 } } });
    });
  });
  for (const [x, y] of [[.2, .2], [.4, .2], [.4, .4], [.6, .4]]) await click(x, y);
  expect(await page.evaluate(() => window.wallSaves)).toEqual([{ revision: 0, count: 1 }]);
  await page.evaluate(() => applyRemoteMesaSceneSnapshot(window.firstWallEcho));
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
  await page.evaluate(() => window.resolveWalls());
  await expect.poll(() => page.evaluate(() => window.wallSaves)).toEqual([{ revision: 0, count: 1 }, { revision: 1, count: 3 }]);
  await page.evaluate(() => window.resolveWalls());
  await expect.poll(() => page.evaluate(() => mesaRemotePersistInFlight)).toBe(false);
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(3);
  expect(await page.evaluate(() => mesaDeferredVisionSnapshot)).toBeNull();
});
test("parede oculta tokens e bloqueia percurso; mestre desativa sem apagar", async ({ page }) => {
  await fixture(page);
  await expect(page.locator('[data-token-id="secret"].mesa-token')).toHaveCount(0);
  const stopped = await page.evaluate(() => mesaVisionConstrain(findToken("ana"), 70, 45));
  expect(stopped.x).toBeLessThan(45.0001);
  expect(await page.evaluate(() => MesaBarrierEditor.commit(v => { v.enabled = false; }))).toBe(false);
  await fixture(page, false); await page.locator("#mesaMapSettingsBtn").click();
  await page.uncheck("#mesaVisionToggle");
  expect(await page.evaluate(() => mesaVision.walls.length)).toBe(1);
  await expect(page.locator("#mesaFacingControls")).toBeHidden();
});
test("porta aparece no cone distante; proxima abre de costas; tranca e parede bloqueiam", async ({ page }) => {
  await fixture(page, true, true);
  await expect(page.getByRole("button", { name: "Abrir porta", exact: true })).toBeDisabled();
  await page.evaluate(() => { findToken("ana").facingDeg = 180; renderStage(); });
  await expect(page.locator(".mesa-door-button")).toHaveCount(0);
  await page.evaluate(() => { findToken("ana").x = 42; renderStage(); });
  await page.getByRole("button", { name: "Abrir porta", exact: true }).click();
  await expect.poll(() => page.evaluate(() => mesaVision.walls[0].doorState)).toBe("open");
  await page.evaluate(() => { const v = getMesaVisionPayload(); v.walls[0].doorState = "locked"; applyMesaVisionSnapshot(v); renderStage(); });
  await expect(page.getByRole("button", { name: "Porta trancada", exact: true })).toBeDisabled();
  await page.evaluate(() => { const v = getMesaVisionPayload(); v.walls.push({ id: "block", ax: .48, ay: 0, bx: .48, by: 1, kind: "wall" }); applyMesaVisionSnapshot(v); renderStage(); });
  await expect(page.locator(".mesa-door-button")).toHaveCount(0);
});
test("anel discreto gira a mascara antes de soltar e pode ser ocultado", async ({ page }, info) => {
  await fixture(page);
  await expect(page.locator("#mesaFacingControls")).toBeHidden();
  await page.locator('[data-token-id="ana"]').hover();
  const dot = page.locator("#mesaFacingHandle"); await expect(dot).toBeVisible();
  await dot.hover();
  const b = await dot.boundingBox(); expect(b.width).toBeGreaterThanOrEqual(18); expect(b.width).toBeLessThanOrEqual(32); expect(b.height).toBe(b.width);
  const ring = await page.locator("#mesaFacingControls").boundingBox();
  const sphere = await page.locator('.mesa-token[data-token-id="ana"]').boundingBox();
  expect(ring.width).toBeCloseTo(sphere.width, 1);
  expect(ring.x + ring.width / 2).toBeCloseTo(sphere.x + sphere.width / 2, 1);
  expect(ring.y + ring.height / 2).toBeCloseTo(sphere.y + sphere.height / 2, 1);
  const x = b.x + 12, y = b.y + 12;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(ring.x + ring.width / 2, ring.y, { steps: 6 });
  await expect(dot).toHaveAttribute("aria-valuenow", "270");
  const pixels = await page.evaluate(() => {
    const c = document.getElementById("mesaVisionCanvas"), p = MesaVisionRules.center(findToken("ana"), mesaVision);
    const r = c.getBoundingClientRect(), s = document.getElementById("mesaStageInner").getBoundingClientRect();
    const a = (x, y) => c.getContext("2d").getImageData(Math.floor((s.left + x * s.width - r.left) / r.width * c.width), Math.floor((s.top + y / mesaVision.aspect * s.height - r.top) / r.height * c.height), 1, 1).data[3];
    return [a(p.x + .12, p.y), a(p.x, p.y - .12)];
  });
  expect(pixels).toEqual([255, 0]); expect(await page.evaluate(() => findToken("ana").facingDeg)).toBe(0);
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => findToken("ana").facingDeg)).toBe(270);
  await page.screenshot({ path: info.outputPath("anel-direcao.png") });
  await page.locator('[data-facing-dot-token="ana"]').uncheck(); await expect(dot).toBeHidden();
  await page.reload(); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true); await fixture(page);
  await expect(dot).toBeHidden();
  await page.locator('[data-facing-dot-token="ana"]').check(); await page.locator('[data-token-id="ana"]').hover(); await expect(dot).toBeVisible();
});
test("cancelar giro e desligar cena descarta previa, sem mover o token", async ({ page }) => {
  await fixture(page);
  await page.locator('[data-token-id="ana"]').hover();
  const dot = page.locator("#mesaFacingHandle"); await dot.hover();
  const b = await dot.boundingBox();
  await page.mouse.move(b.x + 12, b.y + 12); await page.mouse.down(); await page.mouse.move(b.x + 57, b.y + 12);
  await dot.dispatchEvent("pointercancel"); await page.mouse.up();
  await expect(dot).toHaveAttribute("aria-valuenow", "0");
  expect(await page.evaluate(() => findToken("ana").x)).toBe(20);
  await dot.focus(); await page.keyboard.press("ArrowLeft"); await expect(dot).toHaveAttribute("aria-valuenow", "345");
  await page.evaluate(() => { applyMesaVisionSnapshot({ ...getMesaVisionPayload(), enabled: false }); renderStage(); });
  await expect(page.locator("#mesaFacingControls")).toBeHidden();
});
test("giro circular funciona nos sentidos horario e anti-horario", async ({ page }) => {
  await fixture(page);
  await page.locator('[data-token-id="ana"]').hover();
  const dot = page.locator("#mesaFacingHandle"); await dot.hover();
  const b = await page.locator("#mesaFacingControls").boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2, radius = b.width / 2;
  await dot.hover(); await page.mouse.down(); await page.mouse.move(cx, cy + radius, { steps: 6 });
  await expect(dot).toHaveAttribute("aria-valuenow", "90");
  await page.mouse.move(cx + radius, cy, { steps: 6 }); await page.mouse.move(cx, cy - radius, { steps: 6 });
  await expect(dot).toHaveAttribute("aria-valuenow", "270");
  await page.mouse.up(); await expect.poll(() => page.evaluate(() => findToken("ana").facingDeg)).toBeCloseTo(270, 4);
});
test("giro com rede lenta agrupa teclas e restaura estado em falha", async ({ page }) => {
  await fixture(page);
  await page.locator('[data-token-id="ana"]').hover();
  await page.evaluate(() => {
    window.facingCalls = []; const scene = createMesaScenePayloadFromState(); window.AUTH.isBackendEnabled = () => true;
    window.APP.mesaVisionAction = (id, rev, action) => new Promise(resolve => { window.facingCalls.push(action.facingDeg); window.resolveFacing = () => resolve({ data: { ...scene, tokens: scene.tokens.map(t => t.id === action.tokenId ? { ...t, facingDeg: action.facingDeg } : t) } }); });
  });
  await page.locator("#mesaFacingHandle").focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  await expect(page.locator("#mesaFacingHandle")).toHaveAttribute("aria-valuenow", "45");
  expect(await page.evaluate(() => window.facingCalls)).toEqual([15]);
  await page.evaluate(() => window.resolveFacing()); await expect.poll(() => page.evaluate(() => window.facingCalls)).toEqual([15, 45]);
  await page.evaluate(() => window.resolveFacing()); await expect.poll(() => page.evaluate(() => findToken("ana").facingDeg)).toBe(45);
  await page.evaluate(() => { window.APP.mesaVisionAction = async () => { throw new Error("Offline"); }; window.APP.getMesaScene = async () => { throw new Error("Offline"); }; });
  await page.keyboard.press("ArrowRight"); await expect.poll(() => page.evaluate(() => mesaVisionBusy)).toBe(false);
  await expect(page.locator("#mesaFacingHandle")).toHaveAttribute("aria-valuenow", "45");
});
test("barreiras e mascara acompanham resolucao no zoom alto", async ({ page }, info) => {
  const click = await editor(page);
  await click(.4, .5); await click(.6, .5);
  await page.evaluate(() => setStageZoom(4));
  await expect.poll(() => page.evaluate(() => {
    const c = document.getElementById("mesaWallCanvas"), r = c.getBoundingClientRect();
    return c.width / r.width;
  })).toBeGreaterThanOrEqual(1);
  expect(await page.locator("#mesaWallCanvas").evaluate(c => c.width * c.height)).toBeLessThan(1280 * 720 * 1.05);
  await page.screenshot({ path: info.outputPath("paredes-zoom-alto.png") });
  await fixture(page);
  await expect.poll(() => page.evaluate(() => {
    const c = document.getElementById("mesaVisionCanvas"), r = c.getBoundingClientRect();
    return c.width / r.width;
  })).toBeGreaterThanOrEqual(1);
});
test("painel compacto cabe nas secoes; olho proporcional com limites", async ({ page }, info) => {
  await editor(page);
  for (const width of [390, 600, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator("#mesaVisionPanel").evaluate(root => root.scrollWidth <= root.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: info.outputPath("painel-reconstruido.png") });
  await page.locator("#mesaMapSettingsBtn").click(); await fixture(page);
  for (const zoom of [.75, 1.5]) {
    await page.evaluate(z => { setStageZoom(z); requestMesaVisionRender(); }, zoom);
    await page.locator('[data-token-id="ana"]').hover();
    await expect.poll(() => page.evaluate(() => {
      const avatar = document.querySelector('[data-token-id="ana"] .mesa-token-avatar').getBoundingClientRect();
      const handle = document.getElementById("mesaFacingHandle").getBoundingClientRect();
      return Math.abs(handle.width - clamp(avatar.width * .22, 18, 32));
    })).toBeLessThan(.1);
  }
});
test("marca acompanha borda com scroll, pan e resize sem repintura manual", async ({ page }, info) => {
  await fixture(page);
  await page.locator('.mesa-token[data-token-id="ana"]').hover();
  await page.locator('#mesaFacingHandle').focus();
  const aligned = async () => {
    await expect.poll(() => page.evaluate(() => {
      const a = document.querySelector('.mesa-token[data-token-id="ana"] .mesa-token-avatar').getBoundingClientRect();
      const r = document.getElementById('mesaFacingControls').getBoundingClientRect();
      const h = document.getElementById('mesaFacingHandle').getBoundingClientRect();
      return Math.max(Math.abs(a.x + a.width / 2 - r.x - r.width / 2), Math.abs(a.y + a.height / 2 - r.y - r.height / 2), Math.abs(a.width - r.width), Math.abs(h.x + h.width / 2 - a.right), Math.abs(h.y + h.height / 2 - a.y - a.height / 2));
    })).toBeLessThan(1);
  };
  await aligned();
  await page.mouse.wheel(0, -250);
  await aligned();
  await page.evaluate(() => { setStageZoom(2.84); panStage(-30, 20); });
  await aligned();
  await page.setViewportSize({ width: 1600, height: 950 });
  await aligned();
  await expect(page.locator('#mesaFacingControls')).toHaveCSS('outline-style', 'none');
  await page.screenshot({ path: info.outputPath('marca-borda-zoom.png') });
});
test("nevoa manual permanece prioritaria e trocar cena limpa editor", async ({ page }) => {
  await fixture(page, true, true);
  await page.evaluate(() => { findToken("ana").x = 42; applyMesaSceneFogFromSnapshot({ enabled: true, base: "hidden", ops: [] }); renderStage(); });
  await expect(page.locator(".mesa-door-button")).toHaveCount(0);
  await page.evaluate(() => { state.sceneId = "other"; applyMesaVisionSnapshot(null); renderStage(); });
  await expect(page.locator("#mesaVisionCanvas")).toBeHidden();
  await expect(page.locator("#mesaFacingControls")).toBeHidden();
});
