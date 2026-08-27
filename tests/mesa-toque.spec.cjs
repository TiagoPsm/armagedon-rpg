/* Etapa 129 — a Mesa no DEDO.
 *
 * Por que este arquivo existe separado: todo o resto da suite dirige a Mesa
 * com mouse. Ate aqui, desenho e selecao ouviam `mousedown`, e num tablet
 * simplesmente NAO funcionavam — o navegador nao entrega mouse ao dedo antes
 * de decidir que o gesto nao e rolagem, e quando entrega (compatibilidade) o
 * comeco do traco ja se perdeu. Nenhum teste pegava isso porque nenhum teste
 * tocava na tela.
 *
 * Aqui o toque e REAL: `Input.dispatchTouchEvent` do CDP, o mesmo caminho de
 * um dedo de verdade, com `hasTouch` ligado no contexto. Evento sintetico
 * (`new PointerEvent`) nao serviria: ele nao passa pela decisao de gesto do
 * navegador, que e justamente onde o defeito morava.
 */
const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.use({ hasTouch: true });

const TOKENS = [
  { id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", name: "Ana Rubra",
    x: 20, y: 20, order: 1, tokenScale: 1, layer: "tokens", visibleToPlayers: true, statsVisibleToPlayers: true }
];

function semearMestre(page) {
  return page.addInitScript(tokens => {
    if (localStorage.getItem("__mesa_toque_seeded")) return;
    localStorage.clear();
    localStorage.setItem("__mesa_toque_seeded", "1");
    localStorage.setItem("tc_session", JSON.stringify({
      username: "mestre", role: "master", token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", charname: "Ana Rubra" }]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana: { charName: "Ana Rubra", vidaAtual: "8", vidaMax: "12", integAtual: "4", integMax: "6" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3, selectedTokenId: "", tokens
    }));
  }, TOKENS);
}

async function abrirMesa(page) {
  await semearMestre(page);
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);
  await page.waitForFunction(() =>
    document.getElementById("mesaStageWrap")?.dataset.drawReady === "true");
}

/** Mão de verdade: cada dedo é um ponto de toque do CDP. */
function criarMao(cdp) {
  let dedos = [];
  const enviar = (type, changed) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? changed : dedos.map(d => ({ x: d.x, y: d.y, id: d.id }))
  });
  return {
    async encostar(id, x, y) {
      dedos.push({ id, x, y });
      await enviar("touchStart");
    },
    async arrastar(pontos) {
      // pontos: [{ id, x, y }, ...] — atualiza só quem foi citado
      pontos.forEach(p => {
        const dedo = dedos.find(d => d.id === p.id);
        if (dedo) { dedo.x = p.x; dedo.y = p.y; }
      });
      await enviar("touchMove");
    },
    async soltarTudo() {
      dedos = [];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
  };
}

async function armarFerramenta(page, nome) {
  const aberto = await page.evaluate(() => !document.getElementById("mesaDrawFlyout").hidden);
  if (!aberto) await page.click("#mesaDrawToggleBtn");
  await page.click(`[data-draw-tool="${nome}"]`);
}

const palco = page => page.locator("#mesaStageWrap").boundingBox();

test.describe("Mesa no toque (Etapa 129)", () => {
  test("o palco entrega os gestos ao app, nao ao navegador", async ({ page }) => {
    await abrirMesa(page);
    // Sem `touch-action: none` o navegador rola a pagina no primeiro
    // movimento do dedo e CANCELA o ponteiro no meio do traco. Nenhum dos
    // testes abaixo passaria de forma confiavel sem isto.
    const acao = await page.evaluate(() =>
      getComputedStyle(document.getElementById("mesaStageWrap")).touchAction);
    expect(acao, "o palco devolveu o gesto do dedo para o navegador").toBe("none");
  });

  test("um dedo desenha a lapis", async ({ page, context }) => {
    const erros = [];
    page.on("pageerror", e => erros.push(String(e)));
    await abrirMesa(page);
    await armarFerramenta(page, "pencil");

    const caixa = await palco(page);
    const cdp = await context.newCDPSession(page);
    const mao = criarMao(cdp);

    const x0 = caixa.x + caixa.width * 0.3;
    const y0 = caixa.y + caixa.height * 0.4;
    await mao.encostar(1, x0, y0);
    for (let i = 1; i <= 12; i += 1) {
      await mao.arrastar([{ id: 1, x: x0 + i * 12, y: y0 + Math.sin(i / 2) * 20 }]);
    }
    await mao.soltarTudo();

    const traco = await page.evaluate(() => {
      const s = _strokes[0];
      return { total: _strokes.length, tool: s?.tool, pontos: s?.points?.length || 0 };
    });

    expect(traco.total, "o dedo nao desenhou nada no palco").toBe(1);
    expect(traco.tool).toBe("pencil");
    expect(traco.pontos, "o traco do dedo saiu sem trajeto").toBeGreaterThan(2);
    expect(erros, "erro de pagina durante o traco a dedo").toEqual([]);
  });

  test("um dedo puxa a faixa de selecao e pega os tracos", async ({ page, context }) => {
    await abrirMesa(page);

    // Dois traços conhecidos, no meio do palco.
    await page.evaluate(() => {
      const meu = _drawAuthorKey();
      _strokes = [
        { id: "a", tool: "line", color: "#ffffff", width: 3, layer: "tokens", author: meu,
          x1: 0.35, y1: 0.35, x2: 0.45, y2: 0.45, points: null },
        { id: "b", tool: "rect", color: "#ffffff", width: 3, layer: "tokens", author: meu,
          x1: 0.5, y1: 0.4, x2: 0.6, y2: 0.5, points: null }
      ];
      renderDrawings();
    });
    await page.click('[data-interaction-tool="select"]');

    const caixa = await palco(page);
    const cdp = await context.newCDPSession(page);
    const mao = criarMao(cdp);

    // Faixa cobrindo os dois traços, começando em espaço vazio.
    await mao.encostar(1, caixa.x + caixa.width * 0.25, caixa.y + caixa.height * 0.25);
    for (let i = 1; i <= 8; i += 1) {
      await mao.arrastar([{
        id: 1,
        x: caixa.x + caixa.width * (0.25 + 0.05 * i),
        y: caixa.y + caixa.height * (0.25 + 0.045 * i)
      }]);
    }
    await mao.soltarTudo();

    const selecionados = await page.evaluate(() => [..._selectedStrokeIds].sort());
    expect(selecionados, "a faixa de selecao nao respondeu ao dedo").toEqual(["a", "b"]);
    await expect(page.locator("#mesaSelectionBox"),
      "a caixa da selecao nao apareceu depois do gesto").toBeVisible();
  });

  test("dois dedos dao zoom e arrastam o palco — e nao deixam traco", async ({ page, context }) => {
    await abrirMesa(page);
    await armarFerramenta(page, "pencil");   // pior caso: ferramenta armada

    const caixa = await palco(page);
    const cdp = await context.newCDPSession(page);
    const mao = criarMao(cdp);
    const antes = await page.evaluate(() => ({ zoom: _stageZoom, pan: { ..._stagePan } }));

    const cx = caixa.x + caixa.width / 2;
    const cy = caixa.y + caixa.height / 2;

    // O primeiro dedo começa um traço; o segundo transforma o gesto em câmera.
    await mao.encostar(1, cx - 40, cy);
    await mao.arrastar([{ id: 1, x: cx - 45, y: cy + 5 }]);
    await mao.encostar(2, cx + 40, cy);

    // Afasta os dedos e desloca o centro: zoom + pan no mesmo gesto.
    for (let i = 1; i <= 6; i += 1) {
      await mao.arrastar([
        { id: 1, x: cx - 40 - i * 12, y: cy + i * 4 },
        { id: 2, x: cx + 40 + i * 12, y: cy + i * 4 }
      ]);
    }
    await mao.soltarTudo();

    const depois = await page.evaluate(() => ({
      zoom: _stageZoom, pan: { ..._stagePan }, tracos: _strokes.length
    }));

    expect(depois.zoom, "afastar os dedos nao deu zoom").toBeGreaterThan(antes.zoom * 1.2);
    expect(depois.pan.y, "o centro dos dedos nao arrastou o palco")
      .toBeGreaterThan(antes.pan.y + 5);
    // O traço que o primeiro dedo começou tem de ser DESCARTADO: metade de um
    // risco que o usuario nao quis nao pode ficar no quadro de todo mundo.
    expect(depois.tracos, "a pinca deixou um traco pela metade no quadro").toBe(0);
  });

  test("o token se move no dedo, e o traco de outro dedo nao o arrasta junto", async ({ page, context }) => {
    await abrirMesa(page);

    const antes = await page.evaluate(() => {
      const t = state.tokens.find(x => x.id === "ana");
      return { x: t.x, y: t.y };
    });

    const el = await page.locator('.mesa-token[data-token-id="ana"]').boundingBox();
    const caixa = await palco(page);
    const cdp = await context.newCDPSession(page);
    const mao = criarMao(cdp);

    await mao.encostar(1, el.x + el.width / 2, el.y + el.height / 2);
    for (let i = 1; i <= 8; i += 1) {
      await mao.arrastar([{ id: 1, x: el.x + el.width / 2 + i * 10, y: el.y + el.height / 2 + i * 6 }]);
    }
    await mao.soltarTudo();

    const depois = await page.evaluate(() => {
      const t = state.tokens.find(x => x.id === "ana");
      return { x: t.x, y: t.y, tracos: _strokes.length };
    });

    expect(depois.x, "o token nao andou no dedo").toBeGreaterThan(antes.x + 1);
    expect(depois.y, "o token nao andou no dedo").toBeGreaterThan(antes.y + 1);
    // Sem ferramenta armada, arrastar token nao pode virar desenho.
    expect(depois.tracos, "arrastar o token no dedo criou traco").toBe(0);
    expect(caixa.width).toBeGreaterThan(0);
  });
});
