const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Fichas", () => {
  test("mestre abre e salva ficha de jogador usando a key oficial do diretorio", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    const apiBaseUrl = "https://armagedon-api.tiagopsm2008.workers.dev/api";
    const requestedCharacterPaths = [];
    const putRequests = [];
    let characterData = {
      charName: "Ana Rubra",
      vidaAtual: "9",
      vidaMax: "20",
      integAtual: "5",
      integMax: "8",
      inventorySlots: 12,
      inv: []
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
          user: { id: "user-master", username: "mestre", role: "master" }
        });
        return;
      }

      if (pathname === "/api/directory") {
        await fulfillJson(route, {
          players: [
            {
              id: "row-ana",
              key: "player-ana-oficial",
              username: "ana",
              charname: "Ana Rubra",
              inventorySlots: 12,
              usedSlots: 0
            }
          ],
          npcs: [],
          monsters: []
        });
        return;
      }

      if (pathname.startsWith("/api/characters/")) {
        requestedCharacterPaths.push(`${request.method()} ${pathname}`);
      }

      if (pathname === "/api/characters/player-ana-oficial" && request.method() === "GET") {
        await fulfillJson(route, {
          key: "player-ana-oficial",
          kind: "player",
          ownerUsername: "ana",
          data: characterData
        });
        return;
      }

      if (pathname === "/api/characters/player-ana-oficial" && request.method() === "PUT") {
        const payload = request.postDataJSON();
        putRequests.push(payload);
        characterData = {
          ...characterData,
          ...(payload.data || {})
        };
        await fulfillJson(route, {
          key: "player-ana-oficial",
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
      localStorage.setItem("tc_session_token", "token-master");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "token-master",
        backend: true
      }));
    }, apiBaseUrl);

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();
    await page.getByRole("button", { name: "Ver ficha" }).click();

    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#charName")).toHaveValue("Ana Rubra");
    await page.locator("#vidaAtual").fill("7");
    await page.getByRole("button", { name: "Salvar ficha" }).click();

    await expect.poll(() => putRequests.some(payload => payload?.data?.vidaAtual === "7"), {
      timeout: 4000
    }).toBe(true);

    expect(requestedCharacterPaths).toContain("GET /api/characters/player-ana-oficial");
    expect(requestedCharacterPaths).toContain("PUT /api/characters/player-ana-oficial");
    expect(requestedCharacterPaths).not.toContain("GET /api/characters/ana");
    expect(requestedCharacterPaths).not.toContain("PUT /api/characters/ana");
  });

  test("transferencia de item usa targetKey oficial do jogador de destino", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    const apiBaseUrl = "https://armagedon-api.tiagopsm2008.workers.dev/api";
    const transferRequests = [];
    let characterData = {
      charName: "Ana Rubra",
      vidaAtual: "9",
      vidaMax: "20",
      integAtual: "5",
      integMax: "8",
      inventorySlots: 12,
      inv: [
        { name: "Lamina curta", qty: "1", type: "arma", damage: "1d6", desc: "Teste." }
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
      const pathname = new URL(request.url()).pathname;

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
          user: { id: "user-master", username: "mestre", role: "master" }
        });
        return;
      }

      if (pathname === "/api/directory") {
        await fulfillJson(route, {
          players: [
            {
              id: "row-ana",
              key: "player-ana-oficial",
              username: "ana",
              charname: "Ana Rubra",
              inventorySlots: 12,
              usedSlots: 1
            },
            {
              id: "row-bruno",
              key: "player-bruno-oficial",
              username: "bruno",
              charname: "Bruno Cinza",
              inventorySlots: 10,
              usedSlots: 0
            }
          ],
          npcs: [],
          monsters: []
        });
        return;
      }

      if (pathname === "/api/characters/player-ana-oficial" && request.method() === "GET") {
        await fulfillJson(route, {
          key: "player-ana-oficial",
          kind: "player",
          ownerUsername: "ana",
          data: characterData
        });
        return;
      }

      if (pathname === "/api/characters/player-ana-oficial" && request.method() === "PUT") {
        const payload = request.postDataJSON();
        characterData = {
          ...characterData,
          ...(payload.data || {})
        };
        await fulfillJson(route, {
          key: "player-ana-oficial",
          kind: "player",
          ownerUsername: "ana",
          data: characterData
        });
        return;
      }

      if (pathname === "/api/transfers/items/player-to-player" && request.method() === "POST") {
        const payload = request.postDataJSON();
        transferRequests.push(payload);
        await fulfillJson(route, {
          item: characterData.inv[0],
          sourceKey: payload.sourceKey,
          targetKey: payload.targetKey
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
      localStorage.setItem("tc_session_token", "token-master");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "token-master",
        backend: true
      }));
    }, apiBaseUrl);

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();
    await page.locator(".player-row", { hasText: "Ana Rubra" }).getByRole("button", { name: "Ver ficha" }).click();
    await expect(page.locator("#charName")).toHaveValue("Ana Rubra");

    await page.evaluate(async () => {
      window.UI.confirm = async () => true;
      await transferItem(0);
    });

    await expect.poll(() => transferRequests.length, { timeout: 4000 }).toBe(1);
    expect(transferRequests[0]).toMatchObject({
      sourceKey: "player-ana-oficial",
      targetKey: "player-bruno-oficial",
      itemIndex: 0
    });
  });

  test("modo local ignora diretorio remoto antigo ao abrir a propria ficha", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Local" }
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
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#charName")).toHaveValue("Ana Local");
    await page.locator("#vidaAtual").fill("8");
    await page.getByRole("button", { name: "Salvar ficha" }).click();

    const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}"));
    expect(sheets.ana.vidaAtual).toBe("8");
    expect(sheets["player-ana-remota"].vidaAtual).toBe("1");
  });
});
