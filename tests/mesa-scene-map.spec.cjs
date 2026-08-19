/* ============================================================
 * mesa-scene-map.spec.cjs — Cada cena tem o SEU mapa (Etapa 90)
 *
 * O vazamento medido antes da correcao, no MESTRE:
 *
 *   cena A (mapa A)   → palco: mapa A   | payload: mapa A   ✔
 *   cena B (sem mapa) → palco: mapa A   | payload: mapa A   ✘
 *   cena C (mapa C)   → palco: mapa A   | payload: mapa A   ✘
 *
 * O jogador ja estava correto nos tres casos. A coluna do payload e a
 * grave: era por ela que o mapa da cena A virava o mapa OFICIAL das cenas
 * B e C no D1, no primeiro persist depois da troca — e dali alcancava os
 * jogadores e os cartoes da gaveta.
 *
 * Causa: duas guardas de mesa-map.js escritas quando existia uma cena so
 * ("mestre nunca limpa" e "o local manda"), sem nocao de a QUE cena o mapa
 * local pertence.
 * ============================================================ */
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

const MAPA_A = { id: "mapaA", url: "logo-rpg-site.webp",     transform: { xFrac: 0, yFrac: 0, scale: 1 } };
const MAPA_C = { id: "mapaC", url: "logo-rpg-armagedon.webp", transform: { xFrac: 0, yFrac: 0, scale: 1 } };

function seed(page, role) {
  return page.addInitScript(papel => {
    if (localStorage.getItem("__mesa_scene_map_seeded")) return;
    localStorage.clear();
    localStorage.setItem("__mesa_scene_map_seeded", "1");
    if (papel === "player") localStorage.setItem("mesaRolePreview", "player");
    localStorage.setItem("tc_session", JSON.stringify({
      username: papel === "player" ? "ana" : "mestre", role: papel, token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", charname: "Ana Rubra" }]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana: { charName: "Ana Rubra", vidaAtual: "8", vidaMax: "12", integAtual: "4", integMax: "6" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3, selectedTokenId: "", tokens: []
    }));
  }, role);
}

async function waitForMesaSettled(page) {
  await page.waitForSelector("#mesaStageWrap");
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);
}

/** Aplica uma cena (com id proprio) e devolve o que o palco e o persist dizem. */
async function entrarNaCena(page, sceneId, map, sceneVersion) {
  return page.evaluate(async ({ sceneId: id, map: mapa, sceneVersion: versao }) => {
    state.sceneId = id;
    applyMesaSceneSnapshot({ sceneVersion: versao, tokens: [], map: mapa });
    await new Promise(resolve => setTimeout(resolve, 350));
    const layer = document.getElementById("mesaMapLayer");
    const payload = typeof window.getMesaSceneMapPayload === "function"
      ? window.getMesaSceneMapPayload()
      : null;
    return {
      noPalco: layer ? (layer.style.backgroundImage || "").replace(/^url\(["']?|["']?\)$/g, "") : "",
      visivel: layer ? !layer.hidden : false,
      idNoPersist: payload?.id || "",
      urlNoPersist: payload?.url || ""
    };
  }, { sceneId, map, sceneVersion });
}

test.describe("Mapa por cena (Etapa 90)", () => {
  test("mestre: cena sem mapa nao herda o mapa da cena anterior", async ({ page }) => {
    await seed(page, "master");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const cenaA = await entrarNaCena(page, "cenaA", MAPA_A, 10);
    expect(cenaA.noPalco, "a cena A deveria mostrar o proprio mapa").toContain("logo-rpg-site.webp");
    expect(cenaA.idNoPersist, "o persist da cena A deveria levar o mapa A").toBe("mapaA");

    const cenaB = await entrarNaCena(page, "cenaB", null, 11);
    expect(cenaB.noPalco, "a cena B, sem mapa, ficou com o mapa da cena A").toBe("");
    expect(cenaB.visivel, "a camada de mapa continuou visivel numa cena sem mapa").toBe(false);
    // A linha que mais importa: sem ela, o proximo persist grava o mapa da
    // cena A dentro da cena B no D1.
    expect(cenaB.idNoPersist, "o persist da cena B levaria o mapa da cena A").toBe("");
  });

  test("mestre: cena com outro mapa mostra e persiste o mapa DELA", async ({ page }) => {
    await seed(page, "master");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    await entrarNaCena(page, "cenaA", MAPA_A, 10);
    const cenaC = await entrarNaCena(page, "cenaC", MAPA_C, 12);

    expect(cenaC.noPalco, "a cena C ficou com o mapa da cena A").toContain("logo-rpg-armagedon.webp");
    expect(cenaC.idNoPersist, "o persist da cena C levaria o mapa da cena A").toBe("mapaC");
  });

  test("mestre: voltar para a cena de origem devolve o mapa dela", async ({ page }) => {
    await seed(page, "master");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    await entrarNaCena(page, "cenaA", MAPA_A, 10);
    await entrarNaCena(page, "cenaB", null, 11);
    const voltaParaA = await entrarNaCena(page, "cenaA", MAPA_A, 12);

    expect(voltaParaA.noPalco, "voltar para a cena A nao trouxe o mapa dela").toContain("logo-rpg-site.webp");
    expect(voltaParaA.idNoPersist).toBe("mapaA");
  });

  test("jogador: continua vendo exatamente o mapa da cena ativa", async ({ page }) => {
    await seed(page, "player");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const cenaA = await entrarNaCena(page, "cenaA", MAPA_A, 10);
    const cenaB = await entrarNaCena(page, "cenaB", null, 11);
    const cenaC = await entrarNaCena(page, "cenaC", MAPA_C, 12);

    expect(cenaA.noPalco).toContain("logo-rpg-site.webp");
    expect(cenaB.noPalco, "o jogador ficou com o mapa da cena anterior").toBe("");
    expect(cenaC.noPalco).toContain("logo-rpg-armagedon.webp");
  });

  test("a chave do mapa local e por cena, e a default mantem a chave legada", async ({ page }) => {
    await seed(page, "master");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const chaves = await page.evaluate(() => {
      state.sceneId = "default";
      const naDefault = _mapActiveKeyForScene(_currentMesaSceneId());
      state.sceneId = "cenaB";
      const noutraCena = _mapActiveKeyForScene(_currentMesaSceneId());
      return { naDefault, noutraCena };
    });

    // Zero migracao para quem ja tem mapa salvo: a default continua na chave
    // antiga (mesma convencao de mesaSceneStorageKey em mesa-core.js).
    expect(chaves.naDefault).toBe("tc_mesa_active_map");
    expect(chaves.noutraCena).toBe("tc_mesa_active_map_cenaB");
  });

  test("o mapa local carrega a cena a que pertence", async ({ page }) => {
    await seed(page, "master");
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const marcas = await page.evaluate(async () => {
      state.sceneId = "cenaA";
      applyMesaSceneSnapshot({
        sceneVersion: 20, tokens: [],
        map: { id: "mapaA", url: "logo-rpg-site.webp", transform: { xFrac: 0, yFrac: 0, scale: 1 } }
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      const depoisDeA = { cenaDoMapa: mesaMapState.mapSceneId, pertence: _localMapBelongsToCurrentScene() };

      state.sceneId = "cenaB";
      const emB = { cenaDoMapa: mesaMapState.mapSceneId, pertence: _localMapBelongsToCurrentScene() };
      return { depoisDeA, emB };
    });

    expect(marcas.depoisDeA).toEqual({ cenaDoMapa: "cenaA", pertence: true });
    // Antes da Etapa 90 nao havia como fazer esta pergunta — e por isso o
    // mapa da cena A valia em todas.
    expect(marcas.emB).toEqual({ cenaDoMapa: "cenaA", pertence: false });
  });
});
