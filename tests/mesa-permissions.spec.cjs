/* ============================================================
 * mesa-permissions.spec.cjs — Regressao das permissoes da Mesa
 * (Etapa 75, 2026-08-02).
 *
 * O bug que originou esta suite: controles exclusivos do mestre
 * apareciam para o JOGADOR — escalacao (ESCAL.), tracker de
 * iniciativa com "Proximo/Reiniciar/Encerrar", chrome do mapa
 * ("Sem mapa", "Abrir mapa", engrenagem) — porque o showPanel()
 * inline do mesa.html revelava blocos inteiros sem olhar o papel.
 *
 * Regra que esta suite protege:
 *   1. jogador NUNCA ve nada marcado com data-mesa-master-only,
 *      nem no boot, nem depois de clicar em toda a barra, nem
 *      com combate ativo;
 *   2. as funcoes exclusivas do mestre sao no-op para o jogador
 *      (esconder o botao nao basta: sao funcoes globais);
 *   3. o MESTRE continua com tudo — a trava nao pode custar
 *      funcionalidade para quem tem direito.
 * ============================================================ */
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

const SHEETS = {
  ana:    { charName: "Ana Rubra",   attrAgilidade: "3", vidaAtual: "8",  vidaMax: "12", integAtual: "4", integMax: "6" },
  bruno:  { charName: "Bruno Cinza", attrAgilidade: "2", vidaAtual: "10", vidaMax: "10", integAtual: "5", integMax: "5" }
};

const SCENE_TOKENS = [
  { id: "ana",   characterKey: "ana",   x: 9,  y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 1 },
  { id: "bruno", characterKey: "bruno", x: 29, y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 2 }
];

function seedSession(page, username, role) {
  return page.addInitScript(([user, papel, sheets, tokens]) => {
    localStorage.clear();
    // mesaRolePreview espelha o papel de proposito: garante que o teste
    // exercita o MESMO caminho de resolucao usado em producao.
    localStorage.setItem("mesaRolePreview", papel);
    localStorage.setItem("tc_session", JSON.stringify({ username: user, role: papel, token: "", backend: false }));
    localStorage.setItem("tc_players", JSON.stringify([
      { username: "ana", charname: "Ana Rubra" },
      { username: "bruno", charname: "Bruno Cinza" }
    ]));
    localStorage.setItem("tc_sheets", JSON.stringify(sheets));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 5, selectedTokenId: "", tokens
    }));
  }, [username, role, SHEETS, SCENE_TOKENS]);
}

async function waitForMesaSettled(page) {
  await page.waitForSelector("#mesaStageWrap");
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);
}

/** Lista os elementos master-only que estao REALMENTE visiveis na tela. */
function listMasterOnlyLeaks(page) {
  return page.evaluate(() => {
    const visivel = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    return [...document.querySelectorAll("[data-mesa-master-only]")]
      .filter(visivel)
      .map(el => el.id || el.className || el.tagName);
  });
}

test.describe("Permissoes da Mesa (Etapa 75)", () => {
  test("jogador: nenhum controle de mestre visivel no boot", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    expect(await page.evaluate(() => document.body.dataset.role)).toBe("player");
    expect(await listMasterOnlyLeaks(page)).toEqual([]);

    // Os tres da denuncia original, por id, um a um.
    // ESCAL. saiu da barra na Etapa 112; o bloco que ele abria continua
    // master-only e e conferido logo abaixo por #vttRosterBlock.
    await expect(page.locator("#mesaInitiativeBtn")).toBeHidden();               // INIC.
    await expect(page.locator("#mesaLayerDmBtn")).toBeHidden();                  // MESTRE
    await expect(page.locator("#mesaLayerMapBtn")).toBeHidden();                 // MAPA
    await expect(page.locator("#mapLibFolderBtn")).toBeHidden();                 // CONECTAR PASTA
    await expect(page.locator("#mesaMapLabel")).toBeHidden();                    // SEM MAPA
    /* A engrenagem SAIU desta lista na Etapa 134, por decisao do Tiago: ela e
       a unica coisa que o jogador ve no canto do mapa, e o painel dela deixou
       de ser master-only. O que continua valendo — e esta conferido no
       mesa-audit — e que nada do MESTRE aparece dentro dele: os grupos de
       Grade e Nevoa seguem master-only, cada um pela propria checagem. */
    await expect(page.locator("#mesaMapSettingsBtn")).toBeVisible();             // engrenagem: agora e do jogador tambem
    await expect(page.locator("#moveLockBtn")).toBeHidden();                     // TRAVAR MOVIMENTO
    await expect(page.locator("#resetMesaBtn")).toBeHidden();                    // LIMPAR CENA
    await expect(page.locator("#initMasterControls")).toBeHidden();              // Voltar/Passar/Encerrar
    await expect(page.locator("#vttInspectorBlock")).toBeHidden();               // inspetor
  });

  test("jogador: clicar em toda a barra nao revela controle de mestre (o bug do showPanel)", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.evaluate(() => {
      document.querySelectorAll(".vtt-tb-btn, .vtt-layer-btn").forEach(b => b.click());
    });

    expect(await listMasterOnlyLeaks(page)).toEqual([]);
  });

  test("jogador: com combate ativo ve a ordem, nunca os controles do mestre", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Delta que o mestre transmitiria com a ordem de turno pronta.
    await page.evaluate(() => applyInitiativeState({
      active: true, phase: "order", round: 1, currentIndex: 0,
      order: [{ id: "bruno", characterKey: "bruno", ownerUsername: "bruno", type: "player",
        name: "Bruno Cinza", secret: false, auto: false, roll: 15, modifier: 0, total: 15, rolled: true }]
    }));

    await expect(page.locator("#initiativeTracker")).toBeVisible();
    await expect(page.locator("#initMasterControls")).toBeHidden();
    expect(await listMasterOnlyLeaks(page)).toEqual([]);
  });

  test("jogador: funcoes exclusivas do mestre sao no-op mesmo chamadas direto", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const resultado = await page.evaluate(() => {
      activateInitiative();
      const combateLigou = getInitiativeState().active;
      /* toggleMapSettings deixou de ser master-only na Etapa 134 — o painel
         ABRE para o jogador de proposito. O que ele nao pode e conter
         controle de mestre, e e isso que se confere aqui. */
      toggleMapSettings();
      const painel = document.getElementById("mesaMapTransform");
      const painelAbriu = !painel.hidden;
      const vazouDoMestre = Array.from(painel.querySelectorAll("[data-mesa-master-only]"))
        .filter(el => !el.hidden && el.offsetParent !== null)
        .map(el => el.id || el.className);
      const grade = document.getElementById("mesaGridGroup");
      const nevoa = document.getElementById("mesaFogGroup");
      return {
        combateLigou,
        painelAbriu,
        vazouDoMestre,
        gradeVisivel: Boolean(grade && !grade.hidden),
        nevoaVisivel: Boolean(nevoa && !nevoa.hidden)
      };
    });

    expect(resultado.combateLigou).toBe(false);
    expect(resultado.painelAbriu, "a engrenagem do jogador deixou de abrir").toBe(true);
    expect(resultado.vazouDoMestre, "controle de mestre vazou para dentro do painel do jogador").toEqual([]);
    expect(resultado.gradeVisivel, "grupo Grade apareceu para o jogador").toBe(false);
    expect(resultado.nevoaVisivel, "grupo Nevoa apareceu para o jogador").toBe(false);
  });

  test("mesaCan: capacidade desconhecida e negada para jogador (fail-closed)", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const caps = await page.evaluate(() => ({
      // compartilhadas: o jogador PRECISA continuar podendo
      desenhar:   mesaCan("draw"),
      dados:      mesaCan("dice"),
      ping:       mesaCan("ping"),
      rolarInic:  mesaCan("initiative.roll"),
      // exclusivas do mestre
      escalacao:  mesaCan("roster.stage"),
      mapa:       mesaCan("map.manage"),
      combate:    mesaCan("initiative.control"),
      limparCena: mesaCan("scene.clear"),
      // nome que ninguem cadastrou: default tem de ser NEGADO
      inventada:  mesaCan("capacidade.que.nao.existe")
    }));

    expect(caps).toEqual({
      desenhar: true, dados: true, ping: true, rolarInic: true,
      escalacao: false, mapa: false, combate: false, limparCena: false,
      inventada: false
    });
  });

  test("mestre: continua com todos os controles (a trava nao custa funcionalidade)", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "mestre", "master");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    expect(await page.evaluate(() => document.body.dataset.role)).toBe("master");

    await expect(page.locator("#mesaInitiativeBtn")).toBeVisible();
    await expect(page.locator("#mesaLayerDmBtn")).toBeVisible();
    await expect(page.locator("#mesaLayerMapBtn")).toBeVisible();
    await expect(page.locator("#mesaMapSettingsBtn")).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeVisible();
    await expect(page.locator("#vttInspectorBlock")).toBeVisible();
    await expect(page.locator(".vtt-roster-tabs")).toBeVisible();
    await expect(page.locator("#rosterSearchField")).toBeVisible();

    // Etapa 100: com "Abrir mapa" removido, quem poe mapa na cena e a
    // biblioteca — que vive no bloco revelado pelo botao de camada MAPA
    // (`data-panel="map"`), nao na barra do palco. Este trecho existe para
    // provar que o mestre AINDA CHEGA la: se o caminho quebrar, o mestre
    // fica sem nenhuma forma de definir mapa, que e o risco real da remocao.
    await page.locator("#mesaLayerMapBtn").click();
    await expect(page.locator("#vttMapLibraryBlock")).toBeVisible();
    await expect(page.locator("#mapLibFolderBtn")).toBeVisible();   // conectar pasta
    await expect(page.locator("#mapLibImportBtn")).toBeVisible();   // importar imagem
  });

  test("mestre: iniciar combate abre a rolagem e, depois dela, os controles de conducao", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "mestre", "master");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.locator("#mesaInitiativeBtn").click();

    // Fase 1: modal central de rolagem, com o escape hatch do mestre.
    expect(await page.evaluate(() => getInitiativeState().active)).toBe(true);
    await expect(page.locator("#initiativeOverlay")).toBeVisible();
    await expect(page.locator("#initForceRollsBtn")).toBeVisible();

    // Fase 2: fechada a rolagem, entra a ordem de turno com Voltar/Passar.
    await page.locator("#initForceRollsBtn").click();
    await page.waitForFunction(() => getInitiativeState().phase === "order");
    await expect(page.locator("#initiativeTracker")).toBeVisible();
    await expect(page.locator("#initMasterControls")).toBeVisible();
  });

  /* ── DESENHO: cada um apaga so o seu (Etapa 76) ─────────────────────
   * O quadro segue unico e compartilhado — todos desenham no mesmo lugar.
   * O que mudou e o APAGAR: antes a borracha e o Ctrl+Z de um jogador
   * levavam junto o desenho tatico do mestre.
   */

  test("desenho: jogador apaga o proprio traco, nao o dos outros", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const resultado = await page.evaluate(() => {
      // Traco do mestre, traco de outro jogador, traco antigo sem autor e o meu.
      setDrawingsFromRemote([
        { id: "t-mestre", tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "mestre", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
        { id: "t-bruno",  tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "bruno",  x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
        { id: "t-orfao",  tool: "rect", color: "#fff", width: 3, layer: "tokens",                   x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
        { id: "t-ana",    tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "ana",    x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 }
      ]);
      // Tenta apagar todos de uma vez pelo caminho por id.
      deleteDrawingsById(["t-mestre", "t-bruno", "t-orfao", "t-ana"]);
      return getDrawingsSnapshot().map(s => s.id);
    });

    // So o dela sai; traco alheio e traco antigo sem autor (orfao) ficam.
    expect(resultado.sort()).toEqual(["t-bruno", "t-mestre", "t-orfao"]);
  });

  test("desenho: 'limpar tudo' e master-only", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const restaram = await page.evaluate(() => {
      setDrawingsFromRemote([
        { id: "t-1", tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "ana", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 }
      ]);
      clearAllDrawings();
      return getDrawingsSnapshot().length;
    });

    expect(restaram).toBe(1);
    await expect(page.locator("#mesaDrawClearBtn")).toBeHidden();
  });

  test("desenho: estado completo vindo de jogador e ignorado (nao da para limpar o quadro alheio)", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const resultado = await page.evaluate(() => {
      setDrawingsFromRemote([
        { id: "t-1", tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "mestre", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 }
      ]);
      // Jogador mal-intencionado mandando estado completo VAZIO pelo socket.
      setDrawingsFromRemote([], { username: "bruno", role: "player" });
      const aposJogador = getDrawingsSnapshot().length;
      // O mesmo payload vindo do mestre vale.
      setDrawingsFromRemote([], { username: "mestre", role: "master" });
      return { aposJogador, aposMestre: getDrawingsSnapshot().length };
    });

    expect(resultado.aposJogador).toBe(1);
    expect(resultado.aposMestre).toBe(0);
  });

  test("desenho: remocao pela rede so alcanca traco do proprio autor", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const resultado = await page.evaluate(() => {
      const cena = () => ([
        { id: "t-mestre", tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "mestre", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
        { id: "t-bruno",  tool: "rect", color: "#fff", width: 3, layer: "tokens", author: "bruno",  x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 }
      ]);

      setDrawingsFromRemote(cena());
      // Bruno mandando os ids dos DOIS tracos: so o dele pode sair.
      applyMesaDrawingRemoveFromRemote(["t-mestre", "t-bruno"], { username: "bruno", role: "player" });
      const aposJogador = getDrawingsSnapshot().map(s => s.id);

      setDrawingsFromRemote(cena());
      applyMesaDrawingRemoveFromRemote(["t-mestre", "t-bruno"], { username: "mestre", role: "master" });
      const aposMestre = getDrawingsSnapshot().map(s => s.id);

      return { aposJogador, aposMestre };
    });

    expect(resultado.aposJogador).toEqual(["t-mestre"]);
    expect(resultado.aposMestre).toEqual([]);
  });

  test("desenho: autoria sobrevive ao round-trip do Worker", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const cena = normalizeMesaScene({
      drawings: [
        { id: "t-1", tool: "rect", color: "#e84040", width: 3, layer: "tokens", author: "Ana", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
        { id: "t-2", tool: "rect", color: "#e84040", width: 3, layer: "tokens", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 }
      ]
    });

    // Sem isto, todo traco volta do banco como orfao depois de um F5 e o
    // jogador perde o direito de apagar o proprio desenho.
    expect(cena.drawings[0].author).toBe("ana");   // normalizado para minusculo
    expect(cena.drawings[1].author).toBe("");      // traco antigo vira orfao
  });

  /* ── CONTRATO DO BACKEND ────────────────────────────────────────────
   * A UI e conforto; a barreira real e o Worker + o Durable Object.
   * Estes dois testes nao precisam de navegador: protegem invariantes do
   * servidor que, se quebradas, viram escalada de privilegio silenciosa.
   */

  test("backend: identidade do socket e sobrescrita pelo JWT (nao pelo header do cliente)", () => {
    const fs = require("fs");
    const path = require("path");
    const fonte = fs.readFileSync(
      path.join(__dirname, "..", "cloudflare", "src", "index.js"),
      "utf8"
    );

    // O DO confia 100% em x-armagedon-role para decidir papel. O Worker copia
    // os headers do cliente (o upgrade de WebSocket precisa) e SO DEPOIS
    // sobrescreve os dois com o que veio do token verificado. Se alguem
    // inverter a ordem, trocar set por append ou condicionar o set, qualquer
    // jogador vira mestre no realtime mandando o header na mao.
    const posCopia    = fonte.indexOf("new Headers(request.headers)");
    const posUsername = fonte.indexOf('headers.set("x-armagedon-username"');
    const posRole     = fonte.indexOf('headers.set("x-armagedon-role"');

    expect(posCopia).toBeGreaterThan(-1);
    expect(posUsername).toBeGreaterThan(posCopia);
    expect(posRole).toBeGreaterThan(posCopia);
    expect(fonte).toContain('headers.set("x-armagedon-role", session.role || "player")');
    expect(fonte).not.toContain('headers.append("x-armagedon-role"');
    expect(fonte).not.toContain('headers.append("x-armagedon-username"');
  });

  test("backend: MASTER_ONLY_TYPES cobre tudo que altera a cena de todos", async () => {
    const regras = await import("../cloudflare/src/mesa-realtime-rules.js");
    const masterOnly = [...regras.MASTER_ONLY_TYPES];

    // Se um tipo sair desta lista, jogador passa a poder transmitir a
    // mudanca para a mesa inteira. Adicionar tipo novo aqui e proposital;
    // remover tem que ser uma decisao consciente, nao um descuido.
    ["mesa:token:move", "mesa:token:upsert", "mesa:token:remove",
     "mesa:scene:clear", "mesa:initiative:update", "mesa:grid:update",
     "mesa:fog:update"].forEach(tipo => {
      expect(masterOnly).toContain(tipo);
    });

    const mapaMasterOnly = [...regras.MASTER_ONLY_MAP_SIGNAL_TYPES];
    ["mesa:map:announce", "mesa:map:set", "mesa:map:clear",
     "mesa:map:offer", "mesa:map:ws:start", "mesa:map:ws:end"].forEach(tipo => {
      expect(mapaMasterOnly).toContain(tipo);
    });
  });

  test("todo elemento data-mesa-master-only continua coberto pelo CSS de permissao", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await seedSession(page, "ana", "player");
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Guarda-corpo do futuro: se alguem marcar um elemento novo, ele ja
    // nasce coberto; se alguem REMOVER a folha de permissoes, isto quebra.
    const semCss = await page.evaluate(() => {
      return [...document.querySelectorAll("[data-mesa-master-only]")]
        .filter(el => getComputedStyle(el).display !== "none")
        .map(el => el.id || el.className);
    });
    expect(semCss).toEqual([]);
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("[data-mesa-master-only]")].length
    )).toBeGreaterThan(8);
  });
});
