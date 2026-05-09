const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Mesa virtual", () => {
  async function readFirstCanvasTokenLayout(page) {
    return page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => {
        const stage = document.getElementById("mesaStage");
        const renderer = window.MesaRendererV2?.get?.(stage);
        const first = renderer?.layouts ? [...renderer.layouts.values()][0] : null;
        resolve(first ? {
          x: first.x,
          y: first.y,
          width: first.width,
          height: first.height
        } : null);
      });
    }));
  }

  test("renderiza palco Canvas e permite mover token local sem erro de console", async ({ page }) => {
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
    await expect(page.locator("#mesaStage canvas.mesa-stage-canvas")).toHaveCount(1);
    await expect(page.locator("#resetMesaBtn")).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeEnabled();

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const stageBox = await page.locator("#mesaStage").boundingBox();
    expect(stageBox).toBeTruthy();

    const start = {
      x: stageBox.x + stageBox.width * 0.055 + 70,
      y: stageBox.y + stageBox.height * 0.075 + 70
    };
    const end = {
      x: start.x + 120,
      y: start.y + 80
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    const savedScene = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}"));
    expect(Array.isArray(savedScene.tokens)).toBe(true);
    expect(savedScene.tokens.length).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  test("mantem cards do palco no mesmo tamanho ao selecionar e alternar tela cheia", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStage canvas.mesa-stage-canvas")).toHaveCount(1);

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const normalLayout = await readFirstCanvasTokenLayout(page);
    expect(normalLayout).toBeTruthy();
    expect(normalLayout.width).toBeGreaterThanOrEqual(184);

    const stageBox = await page.locator("#mesaStage").boundingBox();
    expect(stageBox).toBeTruthy();
    await page.mouse.click(stageBox.x + normalLayout.x + 18, stageBox.y + normalLayout.y + 18);

    const selectedNormalLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(selectedNormalLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedNormalLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).toHaveClass(/is-pseudo-fullscreen/);
    const fullscreenLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(fullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(fullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    const fullscreenStageBox = await page.locator("#mesaStage").boundingBox();
    expect(fullscreenStageBox).toBeTruthy();
    await page.mouse.click(fullscreenStageBox.x + fullscreenLayout.x + 18, fullscreenStageBox.y + fullscreenLayout.y + 18);
    const selectedFullscreenLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(selectedFullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedFullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).not.toHaveClass(/is-pseudo-fullscreen/);
    const backToNormalLayout = await readFirstCanvasTokenLayout(page);
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
    await expect(page.locator("#rosterCountBadge")).toHaveText("Em cena");
    await expect(page.locator("#resetMesaBtn")).toBeHidden();
    await expect(page.locator("#resetMesaBtn")).toBeDisabled();

    const playerPanel = page.locator(".player-sheet-panel");
    await expect(playerPanel).toBeVisible();
    await expect(playerPanel).toContainText("Ana Rubra");
    await expect(playerPanel).not.toContainText("Bruno Cinza");
    await expect(playerPanel).not.toContainText("Vigia da Porta");
    await expect(page.locator("#tokenInspector")).not.toContainText("Bruno Cinza");

    await expect(page.locator('[data-player-panel-action="select-player-tab"]')).toHaveCount(0);
    await expect(page.locator('[data-player-stat-field="currentLife"]')).toHaveValue("8");
    await page.locator('[data-player-stat-field="currentLife"]').fill("5");
    await page.locator('[data-player-stat-field="currentIntegrity"]').fill("3");

    await page.locator('[data-player-sheet-field="attrForca"]').fill("7");
    await page.locator('[data-player-sheet-field="attrAlma"]').fill("15");

    await page.locator('[data-player-sheet-field="charClass"]').fill("Sentinela");

    await expect(page.locator('[data-player-item-field="name"]').first()).toHaveValue("Lamina curta");
    await page.locator('[data-player-item-field="name"]').first().fill("Lamina longa");
    await page.locator('[data-player-item-field="damage"]').first().fill("1d8");
    await page.locator('[data-player-panel-action="add-inventory-item"]').click();
    await expect(page.locator('[data-player-item-field="name"]')).toHaveCount(2);
    await page.locator('[data-player-item-field="name"]').last().fill("Bandagem");
    await page.locator('[data-player-item-field="type"]').last().selectOption("acessorio");

    await expect(playerPanel).toContainText("Memoria do Portao");

    const savedSheet = await page.evaluate(() => {
      const sheets = JSON.parse(localStorage.getItem("tc_sheets") || "{}");
      return sheets.ana || {};
    });
    expect(savedSheet.vidaAtual).toBe("5");
    expect(savedSheet.integAtual).toBe("3");
    expect(savedSheet.integMax).toBe("5");
    expect(savedSheet.attrForca).toBe("7");
    expect(savedSheet.attrAlma).toBe("15");
    expect(savedSheet.charClass).toBe("Sentinela");
    expect(savedSheet.inv).toHaveLength(2);
    expect(savedSheet.inv[0].name).toBe("Lamina longa");
    expect(savedSheet.inv[0].damage).toBe("1d8");
    expect(savedSheet.inv[1].name).toBe("Bandagem");
    expect(savedSheet.inv[1].type).toBe("acessorio");

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
    const playerPanel = page.locator(".player-sheet-panel");
    await expect(playerPanel).toBeVisible();
    await expect(page.locator("#resetMesaBtn")).toBeHidden();
    await expect(page.locator("#resetMesaBtn")).toBeDisabled();
    await expect(playerPanel).toContainText("Ana Local");
    await expect(playerPanel).not.toContainText("Ana Remota");
    await expect(page.locator('[data-player-stat-field="currentLife"]')).toHaveValue("6");

    await page.locator('[data-player-stat-field="currentLife"]').fill("8");

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
          data: characterData
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
    const playerPanel = page.locator(".player-sheet-panel");
    await expect(playerPanel).toBeVisible();
    await expect(page.locator('[data-player-panel-action="select-player-tab"]')).toHaveCount(0);
    await expect(page.locator('[data-player-stat-field="currentLife"]')).toHaveValue("9");
    await expect(page.locator('[data-player-stat-field="currentIntegrity"]')).toHaveValue("5");

    await page.locator('[data-player-stat-field="currentLife"]').fill("7");
    await page.locator('[data-player-stat-field="currentIntegrity"]').fill("2");

    await expect(page.locator('[data-player-item-field="name"]').first()).toHaveValue("Rosa de Ferro");
    await page.locator('[data-player-item-field="name"]').first().fill("Rosa de Ferro Reforcada");

    await expect(playerPanel).toContainText("Juramento Rubro");

    await page.locator('[data-player-sheet-field="attrAgilidade"]').fill("9");

    await page.locator('[data-player-sheet-field="charRace"]').fill("Marcada");

    await expect.poll(() => putRequests.length, { timeout: 4000 }).toBeGreaterThan(0);
    await expect.poll(() => (
      characterData.vidaAtual === "7"
      && characterData.integAtual === "2"
      && characterData.attrAgilidade === "9"
      && characterData.charRace === "Marcada"
      && Array.isArray(characterData.inv)
      && characterData.inv[0]?.name === "Rosa de Ferro Reforcada"
    ), { timeout: 4000 }).toBe(true);

    const cachedRemoteSheet = await page.evaluate(() => {
      const sheets = JSON.parse(localStorage.getItem("tc_remote_sheets") || "{}");
      return sheets.ana || {};
    });
    expect(cachedRemoteSheet.vidaAtual).toBe("7");
    expect(cachedRemoteSheet.integAtual).toBe("2");
    expect(cachedRemoteSheet.attrAgilidade).toBe("9");
    expect(cachedRemoteSheet.charRace).toBe("Marcada");
    expect(cachedRemoteSheet.inv[0].name).toBe("Rosa de Ferro Reforcada");
  });
});
