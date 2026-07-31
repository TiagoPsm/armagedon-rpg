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

  test("apos o resize com snap a caixa do token cai sobre as linhas da grade", async ({ page }) => {
    const medida = await page.evaluate(() => {
      updateMesaGrid({ enabled: true, snap: true });
      const el = document.querySelector("#mesaStage .mesa-token");
      const id = el.dataset.tokenId;
      selectToken(id);

      const fire = (tipo, x, y, alvo) => {
        (alvo || document).dispatchEvent(new PointerEvent(tipo, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: 1, button: 0, isPrimary: true
        }));
      };
      const handle = el.querySelector('[data-handle="se"]');
      const hr = handle.getBoundingClientRect();
      const px = hr.left + hr.width / 2;
      const py = hr.top + hr.height / 2;
      fire("pointerdown", px, py, handle);
      fire("pointermove", px + 150, py + 150);
      fire("pointerup", px + 150, py + 150);

      const alvo = document.querySelector(`#mesaStage .mesa-token[data-token-id="${CSS.escape(id)}"]`);
      const r = alvo.getBoundingClientRect();
      const caixa = alvo.querySelector(".mesa-token-selbox").getBoundingClientRect();
      const palco = document.getElementById("mesaStage").getBoundingClientRect();
      const cellPx = getMesaGridState().cellFrac * getMesaMapSurfaceFrac().width * palco.width;
      // Distancia de uma borda ate a linha de grade mais proxima.
      const desvio = v => {
        const m = ((v % cellPx) + cellPx) % cellPx;
        return Math.min(m, cellPx - m);
      };

      return {
        celulas: r.width / cellPx,
        bordas: [
          desvio(r.left - palco.left), desvio(r.top - palco.top),
          desvio(r.right - palco.left), desvio(r.bottom - palco.top)
        ],
        // A caixa de selecao tem que ser a caixa do token, senao ela nao
        // coincide com a grade (o inset -6px antigo era escalado pelo token).
        folgaCaixa: [
          Math.abs(caixa.left - r.left), Math.abs(caixa.top - r.top),
          Math.abs(caixa.right - r.right), Math.abs(caixa.bottom - r.bottom)
        ]
      };
    });

    // Token ocupa um numero INTEIRO de celulas...
    expect(Math.abs(medida.celulas - Math.round(medida.celulas))).toBeLessThan(0.02);
    expect(Math.round(medida.celulas)).toBeGreaterThanOrEqual(2);
    // ...e cada borda cai em cima de uma linha da grade.
    for (const d of medida.bordas) expect(d).toBeLessThan(0.5);
    // A caixa de selecao nao sobra por fora do token.
    for (const f of medida.folgaCaixa) expect(f).toBeLessThan(0.5);
  });

  test("botao de marcadores tem tamanho de tela constante e icone centrado", async ({ page }) => {
    const medidas = await page.evaluate(async () => {
      const assentar = () => new Promise(r => setTimeout(r, 300)); // > transicao de 150ms
      const el = document.querySelector("#mesaStage .mesa-token");
      selectToken(el.dataset.tokenId);
      const out = [];
      for (const escala of [1, 2, 4]) {
        el.style.setProperty("--token-scale", String(escala));
        await assentar();
        const botao = el.querySelector(".mesa-token-markers-btn").getBoundingClientRect();
        const icone = el.querySelector(".mesa-token-markers-btn svg").getBoundingClientRect();
        out.push({
          escala,
          largura: botao.width,
          desvioX: (icone.left + icone.width / 2) - (botao.left + botao.width / 2),
          desvioY: (icone.top + icone.height / 2) - (botao.top + botao.height / 2)
        });
      }
      return out;
    });

    for (const m of medidas) {
      // Nao encolhe nem cresce junto do token.
      expect(m.largura, `escala ${m.escala}`).toBeCloseTo(medidas[0].largura, 0);
      expect(Math.abs(m.desvioX), `centragem X na escala ${m.escala}`).toBeLessThan(0.5);
      expect(Math.abs(m.desvioY), `centragem Y na escala ${m.escala}`).toBeLessThan(0.5);
    }
  });

  test("com celula maior que o token, o resize vai ate o teto em celulas e nunca para num tamanho quebrado", async ({ page }) => {
    // Cenario do print do Tiago: celula (126px) MAIOR que a base do token
    // (88px). Com o teto antigo de 4,0 o encaixe em 4 celulas exigiria escala
    // ~5,7; o clamp cortava em 4,0 e o token travava em ~2,8 celulas — fora
    // das linhas da grade. Etapa 69: o limite deixou de ser a escala e passou
    // a ser o mapa (metade do menor lado, em celulas), entao o teste cobra o
    // TETO EM CELULAS — arrastar sem parar leva ate ele, sempre inteiro.
    await page.setViewportSize({ width: 1400, height: 900 });
    const passos = await page.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms));
      updateMesaGrid({ enabled: true, snap: true, cellFrac: 0.12 });
      await esperar(300);

      const el = document.querySelector("#mesaStage .mesa-token");
      const id = el.dataset.tokenId;
      selectToken(id);

      const fire = (tipo, x, y, alvo) => {
        (alvo || document).dispatchEvent(new PointerEvent(tipo, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: 1, button: 0, isPrimary: true
        }));
      };
      const palco = document.getElementById("mesaStage").getBoundingClientRect();
      const cellPx = getMesaGridState().cellFrac * getMesaMapSurfaceFrac().width * palco.width;

      const out = [];
      for (const arrasto of [200, 400, 700]) {
        const alvo = document.querySelector(`#mesaStage .mesa-token[data-token-id="${CSS.escape(id)}"]`);
        const h = alvo.querySelector('[data-handle="se"]');
        const hr = h.getBoundingClientRect();
        fire("pointerdown", hr.left + hr.width / 2, hr.top + hr.height / 2, h);
        fire("pointermove", hr.left + hr.width / 2 + arrasto, hr.top + hr.height / 2 + arrasto);
        fire("pointerup", hr.left + hr.width / 2 + arrasto, hr.top + hr.height / 2 + arrasto);
        await esperar(250);
        const r = document.querySelector(`#mesaStage .mesa-token[data-token-id="${CSS.escape(id)}"]`).getBoundingClientRect();
        const desvio = v => { const m = ((v % cellPx) + cellPx) % cellPx; return Math.min(m, cellPx - m); };
        out.push({
          celulas: r.width / cellPx,
          desvioEsq: desvio(r.left - palco.left),
          desvioBaixo: desvio(r.bottom - palco.top)
        });
      }
      return { cellPx, out, maxCells: window.mesaGridMaxCells() };
    });

    expect(passos.cellPx).toBeGreaterThan(88); // celula maior que a base do token
    for (const p of passos.out) {
      // Sempre um numero INTEIRO de celulas — nunca 3,06 como no bug.
      expect(Math.abs(p.celulas - Math.round(p.celulas))).toBeLessThan(0.02);
      expect(p.desvioEsq).toBeLessThan(0.5);
      expect(p.desvioBaixo).toBeLessThan(0.5);
    }
    // Cresce ate o teto em celulas do mapa (e nao para antes, num valor
    // quebrado). Com o clamp antigo de 4,0 travaria em ~2,8 celulas.
    expect(passos.maxCells).toBeGreaterThan(1);
    expect(Math.round(passos.out[passos.out.length - 1].celulas)).toBe(passos.maxCells);
  });

  test("token fica ACIMA da grade e dos desenhos, e abaixo da nevoa", async ({ page }) => {
    const camadas = await page.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms));
      updateMesaGrid({ enabled: true, snap: true });
      await esperar(300);

      const z = sel => {
        const el = document.querySelector(sel);
        return el ? Number(getComputedStyle(el).zIndex) : NaN;
      };
      // Quem o mouse encontra no centro do token: tem que ser o token, nao
      // a grade (era esse o bug — as linhas passavam por cima do token).
      const tk = document.querySelector("#mesaStage .mesa-token");
      const r = tk.getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);

      return {
        mapa: z("#mesaMapLayer"),
        grade: z("#mesaGridCanvas"),
        desenhos: z("#mesaDrawCanvas"),
        tokens: z("#mesaStage"),
        marquee: z("#mesaRubberBand"),
        nevoa: z("#mesaFogCanvas"),
        dentroDoToken: !!(topo && topo.closest(".mesa-token"))
      };
    });

    expect(camadas.tokens).toBeGreaterThan(camadas.grade);
    expect(camadas.tokens).toBeGreaterThan(camadas.desenhos);
    expect(camadas.tokens).toBeGreaterThan(camadas.mapa);
    // O marquee da selecao por area precisa aparecer por cima dos tokens...
    expect(camadas.marquee).toBeGreaterThan(camadas.tokens);
    // ...e a nevoa tambem, senao ela nao esconderia token nenhum.
    expect(camadas.nevoa).toBeGreaterThan(camadas.tokens);
    expect(camadas.dentroDoToken).toBe(true);
  });
});
