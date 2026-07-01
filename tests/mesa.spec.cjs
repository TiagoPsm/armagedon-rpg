const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Mesa virtual", () => {
  // Token da Mesa e sempre o estilo redondo (minimal), renderizado via DOM.
  // Le o layout do primeiro token DOM relativo ao palco.
  async function readFirstTokenLayout(page) {
    return page.evaluate(() => {
      const stage = document.getElementById("mesaStage");
      const el = stage?.querySelector(".mesa-token");
      if (!stage || !el) return null;
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.x - s.x, y: r.y - s.y, width: r.width, height: r.height };
    });
  }

  test("renderiza tokens redondos no palco e permite mover token local sem erro de console", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    const consoleErrors = [];
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("ERR_NETWORK_ACCESS_DENIED")) return;
      consoleErrors.push(text);
    });

    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStageWrap")).toBeVisible();
    await expect(page.locator("#mesaStage .mesa-token.is-minimal").first()).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeEnabled();

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const tokenBox = await page.locator("#mesaStage .mesa-token").first().boundingBox();
    expect(tokenBox).toBeTruthy();

    const start = { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 };
    const end = { x: start.x + 120, y: start.y + 80 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    const inspectorMaxLife = page.locator('#tokenInspector input[data-stat-field="maxLife"]').first();
    await expect(inspectorMaxLife).toBeVisible();
    await inspectorMaxLife.fill("");
    await expect(inspectorMaxLife).toHaveValue("");
    await inspectorMaxLife.type("30");
    await expect(inspectorMaxLife).toHaveValue("30");

    const inspectorLife = page.locator('#tokenInspector input[data-stat-field="currentLife"]').first();
    await expect(inspectorLife).toBeVisible();
    await inspectorLife.fill("");
    await expect(inspectorLife).toHaveValue("");
    await inspectorLife.type("10");
    await expect(inspectorLife).toHaveValue("10");

    const savedScene = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}"));
    expect(Array.isArray(savedScene.tokens)).toBe(true);
    expect(savedScene.tokens.length).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  test("mantem tokens do palco no mesmo tamanho ao selecionar e alternar tela cheia", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStage .mesa-token").first()).toBeVisible();

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const normalLayout = await readFirstTokenLayout(page);
    expect(normalLayout).toBeTruthy();
    expect(normalLayout.width).toBeGreaterThan(40);

    const stageBox = await page.locator("#mesaStage").boundingBox();
    expect(stageBox).toBeTruthy();
    await page.mouse.click(stageBox.x + normalLayout.x + 18, stageBox.y + normalLayout.y + 18);

    const selectedNormalLayout = await readFirstTokenLayout(page);
    expect(Math.abs(selectedNormalLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedNormalLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).toHaveClass(/is-pseudo-fullscreen/);
    const fullscreenLayout = await readFirstTokenLayout(page);
    expect(Math.abs(fullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(fullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    const fullscreenStageBox = await page.locator("#mesaStage").boundingBox();
    expect(fullscreenStageBox).toBeTruthy();
    await page.mouse.click(fullscreenStageBox.x + fullscreenLayout.x + 18, fullscreenStageBox.y + fullscreenLayout.y + 18);
    const selectedFullscreenLayout = await readFirstTokenLayout(page);
    expect(Math.abs(selectedFullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedFullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).not.toHaveClass(/is-pseudo-fullscreen/);
    const backToNormalLayout = await readFirstTokenLayout(page);
    expect(Math.abs(backToNormalLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(backToNormalLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);
  });

  test("jogador ve apenas painel pessoal e edita Vida/Integridade atuais", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("mesaRolePreview", "player");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", charname: "Ana Rubra" },
        { username: "bruno", charname: "Bruno Cinza" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charClass: "Flagelante",
          charRace: "Humana",
          charFaction: "Coro Carmesim",
          attrForca: "2",
          attrAgilidade: "3",
          attrInteligencia: "4",
          attrResistencia: "5",
          attrAlma: "18",
          vidaAtual: "8",
          vidaMax: "12",
          integAtual: "4",
          integMax: "6",
          inventorySlots: 12,
          inv: [
            { name: "Lamina curta", type: "arma", damage: "1d6", qty: "1", desc: "Afiada e discreta." }
          ],
          ownedMemories: [
            { name: "Memoria do Portao", desc: "Um fragmento frio.", source: "Prologo" }
          ]
        },
        bruno: {
          charName: "Bruno Cinza",
          vidaAtual: "10",
          vidaMax: "10",
          integAtual: "5",
          integMax: "5"
        }
      }));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "vigia", name: "Vigia da Porta" }
      ]));
      localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
        sceneVersion: 10,
        selectedTokenId: "bruno",
        tokens: [
          { id: "ana", characterKey: "ana", x: 9, y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 1 },
          { id: "bruno", characterKey: "bruno", x: 29, y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 2 },
          { id: "npc:vigia", characterKey: "npc:vigia", x: 49, y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 3 }
        ]
      }));
    });

    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#rosterPanelTitle")).toHaveText("Meu personagem");
    await expect(page.locator("#rosterSearchField")).toBeHidden();
    // "Em cena"/"Fora da cena" virou uma bolinha de status (sem texto): verde
    // quando o token do jogador esta na cena. O token "ana" esta na cena no mock.
    await expect(page.locator("#rosterCountBadge")).toHaveClass(/is-status-dot/);
    await expect(page.locator("#rosterCountBadge .player-stage-dot.is-on")).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeHidden();
    await expect(page.locator("#resetMesaBtn")).toBeDisabled();

    const playerPanel = page.locator(".player-side-panel");
    await expect(playerPanel).toBeVisible();
    await expect(playerPanel).toContainText("Ana Rubra");
    await expect(playerPanel).not.toContainText("Bruno Cinza");
    await expect(playerPanel).not.toContainText("Vigia da Porta");
    await expect(page.locator("#tokenInspector")).not.toContainText("Bruno Cinza");

    await expect(page.locator('[data-player-panel-action="select-player-tab"]')).toHaveCount(0);
    await expect(page.locator('input[data-player-stat-field="currentLife"]')).toHaveValue("8");
    await expect(page.locator('input[data-player-stat-field="currentIntegrity"]')).toHaveValue("4");

    // Maximo virou SOMENTE LEITURA no painel do jogador (2026-06): nao ha mais
    // input editavel de vidaMax/integMax — eles aparecem so na leitura "atual / max".
    await expect(page.locator('[data-player-sheet-field="vidaMax"]')).toHaveCount(0);
    await expect(page.locator('[data-player-sheet-field="integMax"]')).toHaveCount(0);
    await expect(page.locator('.player-vital-card.is-life .player-vital-max')).toContainText("12");
    await expect(page.locator('.player-vital-card.is-integrity .player-vital-max')).toContainText("6");

    // Jogador edita apenas Vida/Integridade ATUAIS.
    await page.locator('input[data-player-stat-field="currentLife"]').fill("");
    await expect(page.locator('input[data-player-stat-field="currentLife"]')).toHaveValue("");
    await page.locator('input[data-player-stat-field="currentLife"]').type("10");
    await page.locator('input[data-player-stat-field="currentIntegrity"]').focus();
    await expect(page.locator('input[data-player-stat-field="currentLife"]')).toHaveValue("10");
    await page.locator('input[data-player-stat-field="currentIntegrity"]').fill("");
    await expect(page.locator('input[data-player-stat-field="currentIntegrity"]')).toHaveValue("");
    await page.locator('input[data-player-stat-field="currentIntegrity"]').type("5");
    await page.locator('input[data-player-stat-field="currentLife"]').focus();
    await expect(page.locator('input[data-player-stat-field="currentIntegrity"]')).toHaveValue("5");

    // Painel simplificado (2026-06-06): atributos, classe, inventario e
    // memorias sairam do painel da Mesa — a edicao completa fica na ficha.
    await expect(page.locator('[data-player-sheet-field="attrForca"]')).toHaveCount(0);
    await expect(page.locator('[data-player-sheet-field="charClass"]')).toHaveCount(0);
    await expect(page.locator('[data-player-item-field="name"]')).toHaveCount(0);
    await expect(page.locator('[data-player-panel-action="add-inventory-item"]')).toHaveCount(0);

    const savedSheet = await page.evaluate(() => {
      const sheets = JSON.parse(localStorage.getItem("tc_sheets") || "{}");
      return sheets.ana || {};
    });
    expect(savedSheet.vidaAtual).toBe("10");
    expect(savedSheet.vidaMax).toBe("12");      // inalterado: maximo nao e editavel pelo painel
    expect(savedSheet.integAtual).toBe("5");
    expect(savedSheet.integMax).toBe("6");       // inalterado
    // O painel nao pode sobrescrever o que ele nao edita.
    expect(savedSheet.attrForca).toBe("2");
    expect(savedSheet.attrAlma).toBe("18");
    expect(savedSheet.charClass).toBe("Flagelante");
    expect(savedSheet.inv).toHaveLength(1);
    expect(savedSheet.inv[0].name).toBe("Lamina curta");

    const savedScene = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}"));
    expect(savedScene.tokens).toHaveLength(3);
    expect(savedScene.tokens.find(token => token.id === "bruno")).toBeTruthy();
  });

  test("mesa local ignora diretorio remoto antigo no painel pessoal", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("mesaRolePreview", "player");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", charname: "Ana Local" }
      ]));
      localStorage.setItem("tc_directory_cache", JSON.stringify({
        players: [
          { key: "player-ana-remota", username: "ana", charname: "Ana Remota" }
        ],
        npcs: [],
        monsters: []
      }));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Local",
          vidaAtual: "6",
          vidaMax: "10",
          integAtual: "3",
          integMax: "5"
        },
        "player-ana-remota": {
          charName: "Ana Remota",
          vidaAtual: "1",
          vidaMax: "1",
          integAtual: "1",
          integMax: "1"
        }
      }));
      localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
        sceneVersion: 3,
        selectedTokenId: "ana",
        tokens: [
          { id: "ana", characterKey: "ana", x: 9, y: 10, visibleToPlayers: true, statsVisibleToPlayers: true, order: 1 }
        ]
      }));
    });

    await page.goto(`${baseUrl}/mesa.html`);
    const playerPanel = page.locator(".player-side-panel");
    await expect(playerPanel).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeHidden();
    await expect(page.locator("#resetMesaBtn")).toBeDisabled();
    await expect(playerPanel).toContainText("Ana Local");
    await expect(playerPanel).not.toContainText("Ana Remota");
    await expect(page.locator('input[data-player-stat-field="currentLife"]')).toHaveValue("6");

    await page.locator('input[data-player-stat-field="currentLife"]').fill("8");

    const savedSheets = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}"));
    expect(savedSheets.ana.vidaAtual).toBe("8");
    expect(savedSheets["player-ana-remota"].vidaAtual).toBe("1");
  });

  test("jogador carrega a propria ficha oficial e persiste Vida/Integridade pela Mesa", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    const apiBaseUrl = "https://armagedon-api.tiagopsm2008.workers.dev/api";
    const putRequests = [];
    let characterData = {
      charName: "Ana Rubra",
      attrForca: "2",
      attrAgilidade: "3",
      attrInteligencia: "4",
      attrResistencia: "5",
      attrAlma: "24",
      vidaAtual: "9",
      vidaMax: "20",
      integAtual: "5",
      integMax: "8",
      inventorySlots: 12,
      inv: [
        { name: "Rosa de Ferro", type: "acessorio", qty: "1", desc: "Marca pessoal." }
      ],
      ownedMemories: [
        { name: "Juramento Rubro", desc: "Uma memoria antiga.", source: "Mesa" }
      ]
    };
    const staleCharacterData = JSON.parse(JSON.stringify(characterData));
    let forceStaleCharacterGet = false;

    const fulfillJson = (route, payload, status = 200) => route.fulfill({
      status,
      contentType: "application/json; charset=utf-8",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,authorization"
      },
      body: JSON.stringify(payload)
    });

    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (request.method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
            "access-control-allow-headers": "content-type,authorization"
          },
          body: ""
        });
        return;
      }

      if (pathname === "/api/health") {
        await fulfillJson(route, { ok: true });
        return;
      }

      if (pathname === "/api/auth/session") {
        await fulfillJson(route, {
          user: { id: "user-ana", username: "ana", role: "player" },
          defaultSheetKey: "ana"
        });
        return;
      }

      if (pathname === "/api/directory") {
        await fulfillJson(route, {
          players: [
            { id: "row-ana", key: "ana", username: "ana", charname: "Ana Rubra", inventorySlots: 12, usedSlots: 1 },
            { id: "row-bruno", key: "bruno", username: "bruno", charname: "Bruno Cinza", inventorySlots: 10, usedSlots: 0 }
          ],
          npcs: [],
          monsters: []
        });
        return;
      }

      if (pathname === "/api/mesa/scene") {
        await fulfillJson(route, {
          id: "default",
          createdAt: "2026-05-07T00:00:00.000Z",
          updatedAt: "2026-05-07T00:00:00.000Z",
          data: {
            sceneVersion: 22,
            selectedTokenId: "ana",
            tokens: [
              { id: "ana", characterKey: "ana", x: 12, y: 12, visibleToPlayers: true, statsVisibleToPlayers: true, order: 1 }
            ]
          }
        });
        return;
      }

      if (pathname === "/api/characters/ana" && request.method() === "GET") {
        await fulfillJson(route, {
          key: "ana",
          kind: "player",
          ownerUsername: "ana",
          data: forceStaleCharacterGet ? staleCharacterData : characterData
        });
        return;
      }

      if (pathname === "/api/characters/ana" && request.method() === "PUT") {
        const payload = request.postDataJSON();
        putRequests.push(payload);
        characterData = {
          ...characterData,
          ...(payload.data || {})
        };
        await fulfillJson(route, {
          key: "ana",
          kind: "player",
          ownerUsername: "ana",
          data: characterData
        });
        return;
      }

      await fulfillJson(route, { error: `Nao mockado: ${pathname}` }, 404);
    });

    await page.addInitScript(baseUrlForApi => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: baseUrlForApi,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("mesaRolePreview", "player");
      localStorage.setItem("tc_session_token", "token-ana");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "token-ana",
        backend: true
      }));
    }, apiBaseUrl);

    await page.goto(`${baseUrl}/mesa.html`);
    const playerPanel = page.locator(".player-side-panel");
    await expect(playerPanel).toBeVisible();
    await expect(page.locator('[data-player-panel-action="select-player-tab"]')).toHaveCount(0);
    await expect(page.locator('input[data-player-stat-field="currentLife"]')).toHaveValue("9");
    await expect(page.locator('input[data-player-stat-field="currentIntegrity"]')).toHaveValue("5");

    // Maximo e somente leitura no painel do jogador — o jogador edita apenas os ATUAIS.
    await expect(page.locator('[data-player-sheet-field="vidaMax"]')).toHaveCount(0);
    await expect(page.locator('[data-player-sheet-field="integMax"]')).toHaveCount(0);
    await page.locator('input[data-player-stat-field="currentLife"]').fill("7");
    await page.locator('input[data-player-stat-field="currentIntegrity"]').fill("2");

    forceStaleCharacterGet = true;
    await page.evaluate(async () => {
      if (typeof window.handleMesaSheetChanged !== "function") {
        throw new Error("handleMesaSheetChanged indisponivel");
      }
      await window.handleMesaSheetChanged({ characterKey: "ana" });
    });
    forceStaleCharacterGet = false;

    const cachedAfterStaleRefresh = await page.evaluate(() => {
      const sheets = JSON.parse(localStorage.getItem("tc_remote_sheets") || "{}");
      return sheets.ana || {};
    });
    expect(cachedAfterStaleRefresh.vidaAtual).toBe("7");
    expect(cachedAfterStaleRefresh.vidaMax).toBe("20");   // inalterado: maximo nao e editavel pelo painel
    expect(cachedAfterStaleRefresh.integAtual).toBe("2");
    expect(cachedAfterStaleRefresh.integMax).toBe("8");    // inalterado

    // Painel simplificado (2026-06-06): itens, memorias e atributos nao sao
    // editaveis pela Mesa — somente Vida/Integridade (atual e maxima).
    await expect(page.locator('[data-player-item-field="name"]')).toHaveCount(0);
    await expect(page.locator('[data-player-sheet-field="attrAgilidade"]')).toHaveCount(0);
    await expect(page.locator('[data-player-sheet-field="charRace"]')).toHaveCount(0);

    await expect.poll(() => putRequests.length, { timeout: 4000 }).toBeGreaterThan(0);
    await expect.poll(() => (
      characterData.vidaAtual === "7"
      && characterData.vidaMax === "20"
      && characterData.integAtual === "2"
      && characterData.integMax === "8"
    ), { timeout: 4000 }).toBe(true);

    // O PUT da Mesa nao pode sobrescrever campos que o painel nao edita.
    expect(characterData.attrAgilidade).toBe("3");
    expect(characterData.charRace || "").toBe("");
    expect(Array.isArray(characterData.inv)).toBe(true);
    expect(characterData.inv[0]?.name).toBe("Rosa de Ferro");

    const cachedRemoteSheet = await page.evaluate(() => {
      const sheets = JSON.parse(localStorage.getItem("tc_remote_sheets") || "{}");
      return sheets.ana || {};
    });
    expect(cachedRemoteSheet.vidaAtual).toBe("7");
    expect(cachedRemoteSheet.vidaMax).toBe("20");   // inalterado: maximo nao e editavel pelo painel
    expect(cachedRemoteSheet.integAtual).toBe("2");
    expect(cachedRemoteSheet.integMax).toBe("8");    // inalterado
    expect(cachedRemoteSheet.attrAgilidade).toBe("3");
    expect(cachedRemoteSheet.inv[0].name).toBe("Rosa de Ferro");
  });
});
