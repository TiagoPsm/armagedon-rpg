// Interacao com o token na Mesa (Etapa 63): caixa de selecao com 8 alcas,
// resize ancorado que segue o ponteiro e hover sem brilho branco.
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

const SELECTED_RING = "rgba(214, 92, 92, 0.95)";
// Maior que a transicao de 150ms do anel: sem isso a leitura pega uma cor
// interpolada no meio do caminho, nao a cor final.
const RING_SETTLE_MS = 300;

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Token: selecao e redimensionamento (Etapa 63)", () => {
  test.beforeEach(async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStage .mesa-token.is-minimal").first()).toBeVisible();
  });

  test("token selecionado mostra a caixa com as 8 alcas", async ({ page }) => {
    // Fixa o token por id: a Mesa re-renderiza ao selecionar e um .first()
    // poderia reapontar para outro elemento no meio do caminho.
    const id = await page.locator("#mesaStage .mesa-token").first().getAttribute("data-token-id");
    const token = page.locator(`#mesaStage .mesa-token[data-token-id="${id}"]`);
    await token.click();

    await expect(token).toHaveClass(/is-selected/);
    await expect(token.locator(".mesa-token-selbox")).toHaveCSS("opacity", "1");
    await expect(token.locator(".mesa-token-handle")).toHaveCount(8);

    const dirs = await token.locator(".mesa-token-handle").evaluateAll(
      els => els.map(el => el.dataset.handle).sort()
    );
    expect(dirs).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);

    // Exatamente um token exibe a caixa por vez.
    const visiveis = await page.locator(".mesa-token-selbox").evaluateAll(
      els => els.filter(el => getComputedStyle(el).opacity === "1").length
    );
    expect(visiveis).toBe(1);
  });

  test("anel de selecao e carmesim e volta a cor do tipo ao desmarcar", async ({ page }) => {
    const result = await page.evaluate(async settleMs => {
      const wait = () => new Promise(r => setTimeout(r, settleMs));
      const out = [];
      for (const t of document.querySelectorAll("#mesaStage .mesa-token")) {
        const avatar = t.querySelector(".mesa-token-avatar");
        const read = () => getComputedStyle(avatar).borderTopColor;
        t.classList.remove("is-selected");
        await wait();
        const base = read();
        t.classList.add("is-selected");
        await wait();
        const selected = read();
        t.classList.remove("is-selected");
        await wait();
        out.push({ type: t.dataset.type, base, selected, back: read() });
      }
      return out;
    }, RING_SETTLE_MS);

    expect(result.length).toBeGreaterThan(0);
    for (const row of result) {
      expect(row.selected, `${row.type} selecionado`).toBe(SELECTED_RING);
      expect(row.base, `${row.type} nao selecionado`).not.toBe(SELECTED_RING);
      expect(row.back, `${row.type} volta a cor do tipo`).toBe(row.base);
    }
  });

  test("hover nao desloca o token nem acende brilho branco", async ({ page }) => {
    const token = page.locator("#mesaStage .mesa-token").nth(1);
    const before = await token.evaluate(el => getComputedStyle(el).transform);
    await token.hover();
    await page.waitForTimeout(RING_SETTLE_MS);

    // Sem translateY: a matriz de transform nao muda no hover.
    expect(await token.evaluate(el => getComputedStyle(el).transform)).toBe(before);

    // O halo branco de 3px da versao antiga nao existe mais.
    const shadow = await token.locator(".mesa-token-avatar").evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).not.toContain("255, 248, 236");
  });

  test("resize segue o ponteiro e mantem parada a alca oposta", async ({ page }) => {
    const measurements = await page.evaluate(() => {
      // altKey no move: ignora o ima da grade, isolando o rastreio puro do
      // ponteiro (o encaixe em celulas e coberto pelos testes de grade).
      const fire = (type, x, y, target) => {
        (target || document).dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: 1, button: 0, isPrimary: true, altKey: type === "pointermove"
        }));
      };

      const first = document.querySelector("#mesaStage .mesa-token");
      first.click();
      const tokenId = first.dataset.tokenId;

      const run = (dir, dx, dy) => {
        // Re-consulta a cada rodada: o pointerup persiste a escala e dispara
        // um render, que pode trocar o elemento no DOM.
        const token = document.querySelector(`#mesaStage .mesa-token[data-token-id="${CSS.escape(tokenId)}"]`);
        // Nao mexer em --token-scale aqui: o inline dessincronizaria o DOM do
        // estado (token.tokenScale) e o resize partiria de uma base errada.
        token.style.transition = "none";
        const handle = token.querySelector(`[data-handle="${dir}"]`);
        const hr = handle.getBoundingClientRect();
        const px = hr.left + hr.width / 2;
        const py = hr.top + hr.height / 2;
        const before = token.getBoundingClientRect();

        fire("pointerdown", px, py, handle);
        const onGrab = token.getBoundingClientRect().width;
        fire("pointermove", px + dx, py + dy);
        const after = token.getBoundingClientRect();
        const tag = token.querySelector(".mesa-token-sizetag").textContent;
        const resizing = token.classList.contains("is-resizing");
        fire("pointerup", px + dx, py + dy);

        return {
          dir,
          grabJump: Math.round(onGrab - before.width),
          growth: Math.round(after.width - before.width),
          movedLeft: Math.round(after.left - before.left) || 0,
          movedTop: Math.round(after.top - before.top) || 0,
          movedRight: Math.round(after.right - before.right) || 0,
          movedBottom: Math.round(after.bottom - before.bottom) || 0,
          tag,
          resizing,
          cursorCleared: !document.body.dataset.resizeDir
        };
      };

      return { se: run("se", 60, 60), nw: run("nw", -40, -40) };
    });

    const { se, nw } = measurements;

    // Agarrar a alca nao muda o tamanho: nada de pulo no clique.
    expect(se.grabJump).toBe(0);
    expect(nw.grabJump).toBe(0);

    // O canto arrastado acompanha o ponteiro 1:1...
    expect(se.growth).toBe(60);
    expect(nw.growth).toBe(40);

    // ...e o canto oposto (a ancora) fica parado.
    expect(se.movedLeft).toBe(0);
    expect(se.movedTop).toBe(0);
    expect(nw.movedRight).toBe(0);
    expect(nw.movedBottom).toBe(0);

    // Etiqueta de tamanho visivel durante o arrasto; cursor liberado no fim.
    expect(se.resizing).toBe(true);
    expect(se.tag).toMatch(/^(\d+×\d+|\d+%)$/);
    expect(se.cursorCleared).toBe(true);
  });
});
