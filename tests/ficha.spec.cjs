const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

const repoRoot = path.resolve(__dirname, "..");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Fichas", () => {
  test("auditoria de transferencia usa somente tipos aceitos pelo schema", async () => {
    const workerCharacters = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "characters.js"), "utf8");
    const schemas = fs.readFileSync(path.join(repoRoot, "cloudflare", "d1", "schema.sql"), "utf8");

    expect(workerCharacters).not.toContain("item-character-to-character");
    expect(schemas).not.toContain("item-character-to-character");
    expect(workerCharacters).toContain("function normalizeTransferAuditType");
    expect(workerCharacters).toContain("normalizeTransferAuditType(transferType)");
    expect(workerCharacters).toContain("sourceKind");
    expect(workerCharacters).toContain("targetKind");
  });

  test("contrato de XP do nucleo usa criatura classe quantidade e teto sem estado do corpo", async () => {
    const browserSoul = fs.readFileSync(path.join(repoRoot, "js", "soul-essence.js"), "utf8");
    const workerSoul = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "soul-progression.js"), "utf8");
    const workerCharacters = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "characters.js"), "utf8");
    const workerIndex = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "index.js"), "utf8");
    const fichaHtml = fs.readFileSync(path.join(repoRoot, "ficha.html"), "utf8");
    const allSoulCode = [browserSoul, workerSoul, workerCharacters, workerIndex, fichaHtml].join("\n");

    expect(allSoulCode).not.toMatch(/corpseState|estado do corpo|corpo limpo|corpo danificado|corpo destru/i);
    expect(browserSoul).toContain("XP_LIMIT");
    expect(browserSoul).toContain("1000");
    expect(browserSoul).toContain("2500");
    expect(browserSoul).toContain("CREATURE_CLASSES");
    expect(browserSoul).toContain("Demon");
    expect(browserSoul).toContain("roundToQuarter");
    expect(browserSoul).toContain("calculateCreatureExperience");
    expect(browserSoul).toContain("applySoulExperience");
    expect(browserSoul).toContain("completeSoulNightmare");
    expect(workerSoul).toContain("calculateCreatureExperience");
    expect(workerSoul).toContain("applySoulExperience");
    expect(workerCharacters).toContain("awardSoulExperienceToCharacter");
    expect(workerCharacters).toContain("completeSoulNightmareForCharacter");
    expect(workerIndex).toContain("soul-essence");
    expect(workerIndex).toContain("soul-nightmare");
  });

  test("XP do nucleo gera atributos somando a partir de zero", async () => {
    const { applySoulExperience, calculateCreatureExperience } = await import("../cloudflare/src/soul-progression.js");
    const data = {
      charName: "Ana Rubra",
      charLevel: "1",
      attrForca: "0",
      attrAgilidade: "0",
      attrInteligencia: "0",
      attrResistencia: "0",
      attrAlma: "0",
      soulCore: {
        rank: 1,
        xp: 0,
        attributeGainProgress: 0,
        attributeCaps: {
          kind: "mortal",
          byRank: {
            1: { Forca: 12, Agilidade: 12, Inteligencia: 12, Resistencia: 12, Alma: 12 }
          }
        }
      }
    };

    const calculation = calculateCreatureExperience(data.soulCore, 1, "Beast", 25);
    expect(calculation.totalXp).toBe(25);

    const result = applySoulExperience(data, "player", {
      creatureRank: 1,
      creatureClass: "Beast",
      amount: 25
    }, () => 0);

    expect(result.summary.appliedExperience).toBe(25);
    expect(result.data.attrForca).toBe("1");
    expect(result.data.attrAgilidade).toBe("0");
    expect(result.data.attrInteligencia).toBe("0");
    expect(result.data.attrResistencia).toBe("0");
    expect(result.data.attrAlma).toBe("0");
    expect(result.core.attributeGainProgress).toBe(0);
    expect(result.core.lastAttributeGain).toEqual([{ attr: "Forca", amount: 1, value: 1 }]);
  });

  test("XP excedente satura o rank atual e entra em sobrecarga", async () => {
    const { applySoulExperience, calculateCreatureExperience } = await import("../cloudflare/src/soul-progression.js");
    const data = {
      charName: "Ana Rubra",
      charLevel: "1",
      attrForca: "0",
      attrAgilidade: "0",
      attrInteligencia: "0",
      attrResistencia: "0",
      attrAlma: "0",
      soulCore: {
        rank: 1,
        xp: 990,
        xpLimit: 1000,
        attributeGainProgress: 0,
        attributeCaps: {
          kind: "mortal",
          byRank: {
            1: { Forca: 50, Agilidade: 50, Inteligencia: 50, Resistencia: 50, Alma: 50 }
          }
        }
      }
    };

    const calculation = calculateCreatureExperience(data.soulCore, 7, "Titan", 1);
    expect(calculation.totalXp).toBe(448);

    const result = applySoulExperience(data, "player", {
      creatureRank: 7,
      creatureClass: "Titan",
      amount: 1
    }, () => 0);

    expect(result.summary.totalExperience).toBe(448);
    expect(result.summary.appliedExperience).toBe(448);
    expect(result.summary.rankExperience).toBe(10);
    expect(result.summary.overloadExperience).toBe(438);
    expect(result.core.xp).toBe(1000);
    expect(result.core.pendingNightmare).toBe(true);
    expect(result.core.overloaded).toBe(true);
    expect(result.core.overloadXp).toBe(438);
    expect(result.core.lastAttributeGain).toEqual([]);
    expect(result.core.attributeGainProgress).toBe(10);
  });

  test("nucleo sobrecarregado recebe apenas um quinto de novos XP ate concluir pesadelo", async () => {
    const { applySoulExperience } = await import("../cloudflare/src/soul-progression.js");
    const data = {
      charName: "Ana Rubra",
      charLevel: "1",
      attrForca: "0",
      attrAgilidade: "0",
      attrInteligencia: "0",
      attrResistencia: "0",
      attrAlma: "0",
      soulCore: {
        rank: 1,
        xp: 1000,
        xpLimit: 1000,
        pendingNightmare: true,
        overloaded: true,
        overloadXp: 438,
        attributeGainProgress: 10,
        attributeCaps: {
          kind: "mortal",
          byRank: {
            1: { Forca: 50, Agilidade: 50, Inteligencia: 50, Resistencia: 50, Alma: 50 }
          }
        }
      }
    };

    const result = applySoulExperience(data, "player", {
      creatureRank: 7,
      creatureClass: "Titan",
      amount: 1
    }, () => 0);

    expect(result.summary.totalExperience).toBe(448);
    expect(result.summary.overloadMultiplier).toBe(0.2);
    expect(result.summary.appliedExperience).toBe(89.5);
    expect(result.summary.rankExperience).toBe(0);
    expect(result.summary.overloadExperience).toBe(89.5);
    expect(result.core.xp).toBe(1000);
    expect(result.core.overloaded).toBe(true);
    expect(result.core.overloadXp).toBe(527.5);
    expect(result.core.attributeGainProgress).toBe(10);
    expect(result.core.lastAttributeGain).toEqual([]);
  });

  test("concluir pesadelo aplica XP sobrecarregado ao novo rank e gera atributos", async () => {
    const { completeSoulNightmare } = await import("../cloudflare/src/soul-progression.js");
    const data = {
      charName: "Ana Rubra",
      charLevel: "1",
      attrForca: "0",
      attrAgilidade: "0",
      attrInteligencia: "0",
      attrResistencia: "0",
      attrAlma: "0",
      soulCore: {
        rank: 1,
        xp: 1000,
        xpLimit: 1000,
        pendingNightmare: true,
        overloaded: true,
        overloadXp: 438,
        attributeGainProgress: 10,
        attributeCaps: {
          kind: "mortal",
          byRank: {
            1: { Forca: 12, Agilidade: 12, Inteligencia: 12, Resistencia: 12, Alma: 12 },
            2: { Forca: 50, Agilidade: 50, Inteligencia: 50, Resistencia: 50, Alma: 50 }
          }
        }
      }
    };

    const result = completeSoulNightmare(data, "player", () => 0);

    expect(result.completed).toBe(true);
    expect(result.core.rank).toBe(2);
    expect(result.core.xp).toBe(438);
    expect(result.core.overloaded).toBe(false);
    expect(result.core.overloadXp).toBe(0);
    expect(result.core.attributeGainProgress).toBe(13);
    expect(result.core.lastAttributeGain).toEqual([{ attr: "Forca", amount: 17, value: 17 }]);
    expect(result.data.attrForca).toBe("17");
  });

  test("resumo visual de XP nao esconde excedente quando a API retorna formato parcial", async ({ page }) => {
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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
    });

    await page.goto(`${baseUrl}/ficha.html`);

    const message = await page.evaluate(() => {
      currentSheetTarget = { label: "A" };
      return buildSoulAwardSummary({
        totalExperience: 448,
        appliedExperience: 10,
        rankExperience: 0,
        before: { overloadXp: 0 },
        after: {
          pendingNightmare: true,
          overloaded: true,
          overloadXp: 438
        }
      });
    });

    expect(message).toContain("448 XP");
    expect(message).toContain("0 XP foi aplicado ao rank atual");
    expect(message).toContain("438 XP ficou em sobrecarga");
  });

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
      attrAlma: "30",
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
    await expect(page.locator("#integMax")).toBeEditable();
    await expect(page.locator("#integMax")).toHaveValue("8");
    await page.locator("#vidaAtual").fill("7");
    await page.locator("#integMax").fill("13");
    await page.getByRole("button", { name: "Salvar ficha" }).click();

    await expect.poll(() => putRequests.some(payload => payload?.data?.vidaAtual === "7"), {
      timeout: 4000
    }).toBe(true);
    expect(putRequests.some(payload => payload?.data?.integMax === "13")).toBe(true);

    expect(requestedCharacterPaths).toContain("GET /api/characters/player-ana-oficial");
    expect(requestedCharacterPaths).toContain("PUT /api/characters/player-ana-oficial");
    expect(requestedCharacterPaths).not.toContain("GET /api/characters/ana");
    expect(requestedCharacterPaths).not.toContain("PUT /api/characters/ana");
  });

  test("transferencia online de item envia quantidade e targetKey oficial", async ({ page }) => {
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
        { name: "Lamina curta", qty: "5", type: "arma", damage: "1d6", desc: "Teste." }
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

      if (pathname === "/api/transfers/items/character-to-character" && request.method() === "POST") {
        const payload = request.postDataJSON();
        transferRequests.push(payload);
        await fulfillJson(route, {
          item: { ...characterData.inv[0], qty: String(payload.quantity || characterData.inv[0].qty) },
          quantity: payload.quantity,
          mergeMode: "new-slot",
          sourceKey: payload.sourceKey,
          sourceKind: "player",
          targetKey: payload.targetKey,
          targetKind: "player"
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
      itemTransferStates[0] = { target: "player-bruno-oficial", quantity: "2" };
      await transferItem(0);
    });

    await expect.poll(() => transferRequests.length, { timeout: 4000 }).toBe(1);
    expect(transferRequests[0]).toMatchObject({
      sourceKey: "player-ana-oficial",
      targetKey: "player-bruno-oficial",
      itemIndex: 0,
      quantity: 2
    });

    const remainingQuantity = await page.evaluate(() => inv[0]?.qty);
    expect(remainingQuantity).toBe("3");
  });

  test("transferencia local junta item igual em NPC mesmo com inventario cheio", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      const fillerItems = Array.from({ length: 9 }, (_item, index) => ({
        name: `Carga ${index + 1}`,
        qty: "1",
        type: "outro",
        damage: "",
        desc: ""
      }));
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "mercador", name: "Mercador Cinza" }
      ]));
      localStorage.setItem("tc_monsters", JSON.stringify([
        { id: "eco", name: "Eco Rubro" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          inventorySlots: 10,
          inv: [
            { name: "Pocao rubra", qty: "3", type: "outro", damage: "", desc: "Cura leve." }
          ]
        },
        "npc:mercador": {
          charName: "Mercador Cinza",
          inventorySlots: 10,
          inv: [
            { name: "Pocao rubra", qty: "4", type: "outro", damage: "", desc: "Cura leve." },
            ...fillerItems
          ]
        },
        "monster:eco": {
          charName: "Eco Rubro",
          memoryDrops: []
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();
    await page.locator(".player-row", { hasText: "Ana Rubra" }).getByRole("button", { name: "Ver ficha" }).click();
    await expect(page.locator("#charName")).toHaveValue("Ana Rubra");

    const targetValues = await page.evaluate(() => getItemTransferTargets().map(target => target.value));
    expect(targetValues).toContain("npc:mercador");
    expect(targetValues).not.toContain("monster:eco");

    await page.evaluate(async () => {
      window.UI.confirm = async () => true;
      itemTransferStates[0] = { target: "npc:mercador", quantity: "2" };
      await transferItem(0);
    });

    const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}"));
    expect(sheets.ana.inv[0].qty).toBe("1");
    expect(sheets["npc:mercador"].inv[0].qty).toBe("6");
    expect(sheets["npc:mercador"].inv).toHaveLength(10);
  });

  test("passivos permanentes e anotacoes finais persistem em jogador NPC e monstro sem trocar lore", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "vigia", name: "Vigia" }
      ]));
      localStorage.setItem("tc_monsters", JSON.stringify([
        { id: "eco", name: "Eco Rubro" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: { charName: "Ana Rubra" },
        "npc:vigia": { charName: "Vigia" },
        "monster:eco": { charName: "Eco Rubro" }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();

    await page.evaluate(async () => {
      await openSheet(createPlayerTarget("ana"), true);
      document.getElementById("charNotes").value = "Lore da Ana";
      document.getElementById("sheetNotes").value = "Notas finais da Ana";
      renderPassives([{ id: "passive-player", name: "Olhar atento", source: "Treino", effect: "+1 em vigilia." }]);
      await saveCurrentSheet({ silent: true });

      await openSheet(createNpcTarget({ id: "vigia", name: "Vigia" }), true);
      document.getElementById("charNotes").value = "Lore do Vigia";
      document.getElementById("sheetNotes").value = "Notas finais do Vigia";
      renderPassives([{ id: "passive-npc", name: "Postura firme", source: "Guarda", effect: "Nao recua facil." }]);
      await saveCurrentSheet({ silent: true });

      await openSheet(createMonsterTarget({ id: "eco", name: "Eco Rubro" }), true);
      renderPassives([{ id: "passive-monster", name: "Fome antiga", source: "Aberracao", effect: "Persegue sangue." }]);
      await saveCurrentSheet({ silent: true });
    });

    const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}"));
    expect(sheets.ana.charNotes).toBe("Lore da Ana");
    expect(sheets.ana.sheetNotes).toBe("Notas finais da Ana");
    expect(sheets.ana.passives[0]).toMatchObject({ name: "Olhar atento", source: "Treino" });
    expect(sheets["npc:vigia"].charNotes).toBe("Lore do Vigia");
    expect(sheets["npc:vigia"].sheetNotes).toBe("Notas finais do Vigia");
    expect(sheets["npc:vigia"].passives[0]).toMatchObject({ name: "Postura firme", source: "Guarda" });
    expect(sheets["monster:eco"].passives[0]).toMatchObject({ name: "Fome antiga", source: "Aberracao" });
  });

  test("avatar e reduzido a 512 px — resolucao suficiente para o token no zoom (Etapa 62)", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = { apiBaseUrl: `${window.location.origin}/api`, realtimeEnabled: false };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana", role: "player", token: "", backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", password: "123", charname: "Ana Rubra" }]));
      localStorage.setItem("tc_sheets", JSON.stringify({ ana: { charName: "Ana Rubra" } }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();

    // Passa uma foto 1200x1200 pelo caminho REAL: input file -> handleAvatar.
    const medida = await page.evaluate(async () => {
      const origem = document.createElement("canvas");
      origem.width = origem.height = 1200;
      const ctx = origem.getContext("2d");
      // Xadrez fino: uma reducao agressiva demais apaga o padrao.
      for (let y = 0; y < 1200; y += 8) {
        for (let x = 0; x < 1200; x += 8) {
          ctx.fillStyle = ((x + y) / 8) % 2 ? "#b02f39" : "#0b0c12";
          ctx.fillRect(x, y, 8, 8);
        }
      }
      const blob = await new Promise(res => origem.toBlob(res, "image/png"));
      const input = document.getElementById("avatarFile");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "avatar.png", { type: "image/png" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const img = document.getElementById("avatarImg");
      // handleAvatar e assincrono (FileReader + Image.onload).
      for (let i = 0; i < 200 && !String(img.src).startsWith("data:"); i++) {
        await new Promise(r => setTimeout(r, 25));
      }
      await img.decode().catch(() => {});
      return { lado: img.naturalWidth, bytes: Math.round(String(img.src).length * 0.75) };
    });

    // O token de 1 celula ocupa ~93 px de tela a 100%; com zoom 300% em tela
    // Retina isso vai a ~560 px de DISPOSITIVO. Com o teto antigo de 256 o
    // avatar era a camada mais borrada da Mesa (0,46 px de fonte por px de tela).
    expect(medida.lado).toBe(512);
    // E continua leve: o R2 aceita 2 MB por avatar.
    expect(medida.bytes).toBeLessThan(400 * 1024);
  });

  test("nucleo do jogador e NPC mostra XP atributos e controles permitidos", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.setViewportSize({ width: 1440, height: 820 });

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      if (localStorage.getItem("__ficha_progression_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("__ficha_progression_seeded", "1");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "2",
          soulCore: { rank: 2, xp: 35 }
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#soulCorePanel")).toBeVisible();
    await expect(page.locator("#openSoulAwardBtn")).toBeVisible();
    await expect(page.locator("#completeSoulNightmareBtn")).toBeHidden();
    await expect(page.locator("#soulRequirementText")).toHaveCount(0);
    await expect(page.locator("#soulRankSummaryText")).toHaveCount(0);
    await expect(page.locator("#soulXpText")).toContainText("35");
    await expect(page.locator("#soulStateText")).toBeVisible();
    await expect(page.locator("#soulAttributeCapGrid .soul-attribute-cap")).toHaveCount(5);
    await expect(page.locator("#soulRankList")).toHaveCount(0);
    await expect(page.locator("#openSoulDetailsBtn")).toBeVisible();
    const soulLayout = await page.locator(".identity-block").evaluate(block => {
      const raceField = block.querySelector("#charRaceGroup");
      const factionField = block.querySelector("#charFactionGroup");
      const progressionRow = block.querySelector(".identity-progression");
      const avatarCol = block.querySelector(".avatar-col");
      const identityFields = block.querySelector(".identity-fields");
      const soulGroup = block.querySelector(".level-field-group");
      const panel = block.querySelector("#soulCorePanel");
      const nextRank = block.querySelector("#soulNextRankText");
      const rankName = block.querySelector("#soulRankName");
      const progress = block.querySelector(".soul-core-progress");
      const tools = block.querySelector(".level-field-tools");
      const lore = block.querySelector(".identity-lore-card");
      const diceButton = document.querySelector("#openDiceTrayBtn");
      const ownedMemories = document.querySelector("#ownedMemoriesSection");
      const inventory = document.querySelector("#inventorySection");
      const raceBox = raceField.getBoundingClientRect();
      const factionBox = factionField.getBoundingClientRect();
      const avatarBox = avatarCol.getBoundingClientRect();
      const fieldsBox = identityFields.getBoundingClientRect();
      const progressionBox = progressionRow.getBoundingClientRect();
      const groupBox = soulGroup.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const toolsBox = tools.getBoundingClientRect();
      const progressBox = progress.getBoundingClientRect();
      const diceBox = diceButton.getBoundingClientRect();
      const ownedBox = ownedMemories.getBoundingClientRect();
      const inventoryBox = inventory.getBoundingClientRect();
      const nextBox = nextRank.getBoundingClientRect();
      const rankNameBox = rankName.getBoundingClientRect();
      const loreBox = lore.getBoundingClientRect();
      const removedStatus = !block.querySelector("#soulRankMeta")
        && !block.querySelector("#soulSaturationText")
        && !block.querySelector(".soul-core-badges")
        && !block.querySelector("#soulLastGainText")
        && !block.querySelector("#soulRankList");
      const overlaps = (first, second) =>
        first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
      return {
        progressionBelowOrigin: progressionBox.top >= Math.max(raceBox.bottom, factionBox.bottom) - 1,
        identityTopAligned: Math.abs(avatarBox.top - fieldsBox.top) <= 2,
        identityBottomAligned: Math.abs(avatarBox.bottom - fieldsBox.bottom) <= 2,
        progressionCloseToIdentity: progressionBox.top - Math.max(avatarBox.bottom, fieldsBox.bottom) <= 24,
        groupBelowOrigin: groupBox.top >= Math.max(raceBox.bottom, factionBox.bottom) - 1,
        soulAboveLore: panelBox.bottom < loreBox.top,
        panelHeight: panelBox.height,
        panelWidth: panelBox.width,
        panelSameWidthAsLore: Math.abs(panelBox.left - loreBox.left) <= 2 && Math.abs(panelBox.right - loreBox.right) <= 2,
        toolsInsidePanel: toolsBox.top >= panelBox.top - 1 && toolsBox.right <= panelBox.right + 1,
        toolsDoNotCoverRank: !overlaps(toolsBox, nextBox) && !overlaps(toolsBox, rankNameBox),
        progressDoesNotOverlapRank: !overlaps(progressBox, nextBox) && !overlaps(progressBox, rankNameBox),
        detailCardsRemoved: !block.querySelector(".soul-core-detail-grid"),
        diceOutsideProgression: !progressionRow.contains(diceButton),
        diceBetweenMemoriesAndInventory: diceBox.top >= ownedBox.bottom - 1 && diceBox.bottom <= inventoryBox.top + 1,
        diceSameWidthAsSections: Math.abs(diceBox.left - ownedBox.left) <= 2 && Math.abs(diceBox.right - inventoryBox.right) <= 2,
        removedStatus,
        panelOverflow: panel.scrollWidth > panel.clientWidth + 1
      };
    });
    expect(soulLayout.progressionBelowOrigin).toBe(true);
    expect(soulLayout.identityTopAligned).toBe(true);
    expect(soulLayout.identityBottomAligned).toBe(true);
    expect(soulLayout.progressionCloseToIdentity).toBe(true);
    expect(soulLayout.groupBelowOrigin).toBe(true);
    expect(soulLayout.soulAboveLore).toBe(true);
    expect(soulLayout.panelHeight).toBeLessThanOrEqual(320);
    expect(soulLayout.panelWidth).toBeGreaterThan(720);
    expect(soulLayout.panelSameWidthAsLore).toBe(true);
    expect(soulLayout.toolsInsidePanel).toBe(true);
    expect(soulLayout.toolsDoNotCoverRank).toBe(true);
    expect(soulLayout.progressDoesNotOverlapRank).toBe(true);
    expect(soulLayout.detailCardsRemoved).toBe(true);
    expect(soulLayout.diceOutsideProgression).toBe(true);
    expect(soulLayout.diceBetweenMemoriesAndInventory).toBe(true);
    expect(soulLayout.diceSameWidthAsSections).toBe(true);
    expect(soulLayout.removedStatus).toBe(true);
    expect(soulLayout.panelOverflow).toBe(false);

    await page.locator("#openSoulDetailsBtn").click();
    await expect(page.locator("#soulDetailsRoot")).toBeVisible();
    await expect(page.locator("#soulDetailsContent")).toContainText("Rank atual");
    await expect(page.locator("#soulDetailsContent")).toContainText("Saturacao");
    await expect(page.locator("#soulDetailsContent")).toContainText("Tetos de atributos");
    await expect(page.locator("#soulDetailsContent")).toContainText("Progressao fixa de XP");
    await page.locator("#soulDetailsCloseBtn").click();
    await expect(page.locator("#soulDetailsRoot")).toBeHidden();

    await page.evaluate(() => {
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "vigia", name: "Vigia" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "2",
          soulCore: { rank: 2, xp: 35 }
        },
        "npc:vigia": {
          charName: "Vigia",
          charLevel: "4"
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();
    await page.locator(".player-row", { hasText: "Ana Rubra" }).getByRole("button", { name: "Ver ficha" }).click();
    await expect(page.locator("#openSoulAwardBtn")).toBeVisible();

    await page.getByRole("button", { name: "Voltar ao mestre" }).click();
    await page.locator(".player-row", { hasText: "Vigia" }).getByRole("button", { name: "Abrir ficha" }).click();
    await expect(page.locator("#levelDetailPanel")).toBeHidden();
    await expect(page.locator("#soulCorePanel")).toBeVisible();
    await expect(page.locator("#soulRankName")).toContainText("Transcendido");
    await expect(page.locator("#openSoulAwardBtn")).toBeVisible();
  });

  test("jogador absorve XP da alma na propria ficha sem estado do corpo", async ({ page }) => {
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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "2",
          attrForca: "5",
          attrAgilidade: "5",
          attrInteligencia: "5",
          attrResistencia: "5",
          attrAlma: "5",
          soulCore: {
            rank: 2,
            xp: 20,
            xpLimit: 2500,
            attributeGainProgress: 19,
            weakKillsToday: 0,
            attributeCaps: {
              kind: "mortal",
              byRank: {
                2: { Forca: 18, Agilidade: 18, Inteligencia: 18, Resistencia: 18, Alma: 18 }
              }
            }
          }
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#openSoulAwardBtn")).toBeVisible();

    await page.evaluate(() => {
      window.UI.alert = async () => {};
    });

    await page.locator("#openSoulAwardBtn").click();
    await expect(page.locator("#soulAwardRoot")).toBeVisible();
    await expect(page.locator("#soulAwardRoot")).not.toContainText(/corpo|cadaver|cadáver|danificado|destruído|obliterado/i);
    await page.locator('[data-soul-rank="3"]').click();
    await page.locator('[data-soul-class="Demon"]').click();
    await page.locator("#soulAwardAmount").fill("1");
    await expect(page.locator("#soulAwardPreview")).toContainText("6 XP");
    await expect(page.locator("#soulAwardPreview")).toContainText("1 ponto");
    await page.locator("#soulAwardApplyBtn").click();

    await expect(page.locator("#soulAwardRoot")).toBeHidden();
    await expect(page.locator("#soulXpText")).toContainText("26 / 2500 XP");
    await expect(page.locator("#soulStateText")).not.toContainText("Pronto para pesadelo");

    const result = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("tc_sheets") || "{}").ana;
      const totalAttrs = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"]
        .reduce((sum, attr) => sum + Number.parseInt(data[`attr${attr}`] || "0", 10), 0);
      return {
        soulCore: data.soulCore,
        totalAttrs
      };
    });

    expect(result.soulCore.rank).toBe(2);
    expect(result.soulCore.xp).toBe(26);
    expect(result.soulCore.pendingNightmare).toBe(false);
    expect(result.soulCore.attributeGainProgress).toBe(0);
    expect(result.soulCore.lastAttributeGain).toHaveLength(1);
    expect(result.totalAttrs).toBe(26);
  });

  test("absorver XP da alma na ficha preserva atributos zerados e soma ganho no valor principal", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      Math.random = () => 0;
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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "1",
          attrForca: "0",
          attrAgilidade: "0",
          attrInteligencia: "0",
          attrResistencia: "0",
          attrAlma: "0",
          soulCore: {
            rank: 1,
            xp: 0,
            xpLimit: 1000,
            attributeGainProgress: 0,
            weakKillsToday: 0,
            attributeCaps: {
              kind: "mortal",
              byRank: {
                1: { Forca: 12, Agilidade: 12, Inteligencia: 12, Resistencia: 12, Alma: 12 }
              }
            }
          }
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#attrForca")).toHaveValue("0");
    await expect(page.locator("#attrAgilidade")).toHaveValue("0");

    await page.evaluate(() => {
      window.UI.alert = async () => {};
    });

    await page.locator("#openSoulAwardBtn").click();
    await page.locator('[data-soul-rank="1"]').click();
    await page.locator('[data-soul-class="Beast"]').click();
    await page.locator("#soulAwardAmount").fill("25");
    await expect(page.locator("#soulAwardPreview")).toContainText("25 XP");
    await expect(page.locator("#soulAwardPreview")).toContainText("1 ponto");
    await page.locator("#soulAwardApplyBtn").click();

    await expect(page.locator("#attrForca")).toHaveValue("1");
    await expect(page.locator("#attrAgilidade")).toHaveValue("0");
    await expect(page.locator("#soulXpText")).toContainText("25 / 1000 XP");

    const result = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}").ana);
    expect(result.attrForca).toBe("1");
    expect(result.attrAgilidade).toBe("0");
    expect(result.attrInteligencia).toBe("0");
    expect(result.attrResistencia).toBe("0");
    expect(result.attrAlma).toBe("0");
    expect(result.soulCore.lastAttributeGain).toEqual([{ attr: "Forca", amount: 1, value: 1 }]);
  });

  test("concluir pesadelo sobe rank manualmente zera XP e gera novo teto", async ({ page }) => {
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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "1",
          attrForca: "10",
          attrAgilidade: "10",
          attrInteligencia: "10",
          attrResistencia: "10",
          attrAlma: "10",
          soulCore: {
            rank: 1,
            xp: 995,
            xpLimit: 1000,
            attributeGainProgress: 20,
            weakKillsToday: 0,
            attributeCaps: {
              kind: "mortal",
              byRank: {
                1: { Forca: 12, Agilidade: 12, Inteligencia: 12, Resistencia: 12, Alma: 12 }
              }
            }
          }
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await page.evaluate(() => {
      window.UI.alert = async () => {};
      window.UI.confirm = async () => true;
    });

    await page.locator("#openSoulAwardBtn").click();
    await page.locator('[data-soul-rank="1"]').click();
    await page.locator('[data-soul-class="Beast"]').click();
    await page.locator("#soulAwardAmount").fill("5");
    await page.locator("#soulAwardApplyBtn").click();

    await expect(page.locator("#soulStateText")).toContainText("Pronto para pesadelo");
    await expect(page.locator("#completeSoulNightmareBtn")).toBeVisible();
    await page.locator("#completeSoulNightmareBtn").click();

    await expect(page.locator("#soulXpText")).toContainText("0 / 2500 XP");
    await expect(page.locator("#soulRankName")).toContainText("Despertado");

    const result = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}").ana);
    expect(result.charLevel).toBe("2");
    expect(result.soulCore.rank).toBe(2);
    expect(result.soulCore.xp).toBe(0);
    expect(result.soulCore.pendingNightmare).toBe(false);
    expect(result.soulCore.attributeCaps.byRank["2"]).toBeTruthy();
    expect(Math.min(...Object.values(result.soulCore.attributeCaps.byRank["2"]))).toBeGreaterThanOrEqual(13);
  });

  test("layout mobile da ficha mantem identidade antes da lore e sem overflow horizontal", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.setViewportSize({ width: 390, height: 844 });

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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Moreno",
          charLevel: "1",
          soulCore: { rank: 1, xp: 0 }
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();

    const mobileLayout = await page.evaluate(() => {
      const nameField = document.querySelector("#sheetScreen .identity-fields > .form-row:first-child .form-group:first-child")
        .getBoundingClientRect();
      const aspectField = document.querySelector("#sheetScreen .identity-fields > .form-row:first-child .form-group:nth-child(2)")
        .getBoundingClientRect();
      const raceField = document.querySelector("#charRaceGroup").getBoundingClientRect();
      const factionField = document.querySelector("#charFactionGroup").getBoundingClientRect();
      const progression = document.querySelector("#sheetScreen .identity-progression").getBoundingClientRect();
      const avatar = document.querySelector("#sheetScreen .avatar-col").getBoundingClientRect();
      const lore = document.querySelector("#sheetScreen .identity-lore-card").getBoundingClientRect();
      const soulPanel = document.querySelector("#soulCorePanel");
      const soulBox = soulPanel.getBoundingClientRect();
      return {
        identityBeforeLore: avatar.top < lore.top,
        fieldsStacked: aspectField.top >= nameField.bottom - 1,
        progressionBelowOrigin: progression.top >= Math.max(raceField.bottom, factionField.bottom) - 1,
        soulAboveLore: soulBox.bottom < lore.top,
        soulSameWidthAsLore: Math.abs(soulBox.left - lore.left) <= 2 && Math.abs(soulBox.right - lore.right) <= 2,
        viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        soulOverflow: soulPanel.scrollWidth > soulPanel.clientWidth + 1
      };
    });

    expect(mobileLayout.identityBeforeLore).toBe(true);
    expect(mobileLayout.fieldsStacked).toBe(true);
    expect(mobileLayout.progressionBelowOrigin).toBe(true);
    expect(mobileLayout.soulAboveLore).toBe(true);
    expect(mobileLayout.soulSameWidthAsLore).toBe(true);
    expect(mobileLayout.viewportOverflow).toBe(false);
    expect(mobileLayout.soulOverflow).toBe(false);
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

test.describe("Inicio", () => {
  test("sessao salva abre o painel inicial sem login ativo fixo", async ({ page }) => {
    const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
    expect(indexHtml).not.toContain('id="loginScreen" class="screen active"');
    expect(indexHtml).toContain('class="auth-loading"');

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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
    });

    await page.goto(`${baseUrl}/index.html`);
    await expect(page.locator("#homeScreen")).toBeVisible();
    await expect(page.locator("#loginScreen")).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/auth-loading/);
  });
});

test.describe("Sugestoes", () => {
  test("contrato de sugestoes existe no frontend backend worker e schemas", async () => {
    const apiSource = fs.readFileSync(path.join(repoRoot, "js", "api.js"), "utf8");
    const worker = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "index.js"), "utf8");
    const d1Schema = fs.readFileSync(path.join(repoRoot, "cloudflare", "d1", "schema.sql"), "utf8");

    expect(apiSource).toContain("listSuggestions");
    expect(apiSource).toContain("createSuggestion");
    expect(apiSource).toContain("updateSuggestion");
    expect(apiSource).toContain("deleteSuggestion");
    expect(worker).toContain("/api/suggestions");
    expect(d1Schema).toContain("create table if not exists suggestions");
  });

  test("jogador cria sugestao e apenas mestre edita ou exclui no modo local", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      if (localStorage.getItem("__suggestions_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("__suggestions_seeded", "1");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
    });

    await page.goto(`${baseUrl}/sugestoes.html`);
    await expect(page.locator("#suggestionsList")).toBeVisible();
    await page.locator("#suggestionTitle").fill("Melhorar mapa");
    await page.locator("#suggestionCategory").fill("Mesa");
    await page.locator("#suggestionContent").fill("Adicionar marcador visual para areas importantes.");
    await page.getByRole("button", { name: "Enviar sugestao" }).click();

    await expect(page.locator("#suggestionsList")).toContainText("Melhorar mapa");
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);

    const storedAfterPlayer = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_suggestions_posts") || "[]"));
    expect(storedAfterPlayer).toHaveLength(1);
    expect(storedAfterPlayer[0]).toMatchObject({
      title: "Melhorar mapa",
      category: "Mesa",
      author: "ana"
    });

    await page.evaluate(() => {
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
    });
    await page.reload();

    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(1);

    await page.getByRole("button", { name: "Editar" }).click();
    await page.locator("#suggestionTitle").fill("Melhorar mapa editado");
    await page.getByRole("button", { name: "Salvar alteracoes" }).click();
    await expect(page.locator("#suggestionsList")).toContainText("Melhorar mapa editado");

    await page.evaluate(() => {
      window.UI.confirm = async () => true;
    });
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect(page.locator("#suggestionsList")).not.toContainText("Melhorar mapa editado");
  });
});

test.describe("UX avancada", () => {
  test("popup central prende foco, fecha por Escape e backdrop e restaura foco", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
    });

    await page.goto(`${baseUrl}/index.html`);
    await page.evaluate(() => {
      const trigger = document.createElement("button");
      trigger.id = "modalTrigger";
      trigger.textContent = "Abrir";
      document.body.appendChild(trigger);
      trigger.focus();
    });

    await page.evaluate(() => {
      window.__modalResult = window.UI.confirm("Mensagem de confirmacao para validar acessibilidade.", {
        title: "Confirmar acao",
        kicker: "// Teste",
        confirmLabel: "Confirmar",
        variant: "success"
      });
    });

    const modalRoot = page.locator(".ui-modal-root");
    await expect(modalRoot).toHaveClass(/is-open/);
    await expect(modalRoot).toHaveAttribute("data-variant", "success");

    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      await expect.poll(
        () => page.evaluate(() => {
          const root = document.querySelector(".ui-modal-root");
          return Boolean(root && root.contains(document.activeElement));
        }),
        { message: "o foco deve permanecer dentro do popup" }
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(modalRoot).not.toHaveClass(/is-open/);
    await expect(page.locator("#modalTrigger")).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__modalResult)).toBe(false);

    await page.evaluate(() => {
      window.__modalResultByBackdrop = window.UI.confirm("Fechar pelo fundo.", {
        title: "Backdrop"
      });
    });
    await expect(modalRoot).toHaveClass(/is-open/);
    await page.locator(".ui-modal-backdrop").click({ position: { x: 8, y: 8 } });
    await expect.poll(() => page.evaluate(() => window.__modalResultByBackdrop)).toBe(false);

    await page.evaluate(() => {
      window.__modalResultByClose = window.UI.confirm("Fechar pelo botao superior.", {
        title: "Fechar"
      });
    });
    await expect(modalRoot).toHaveClass(/is-open/);
    await page.locator(".ui-modal-close span").click();
    await expect(modalRoot).not.toHaveClass(/is-open/);
    await expect.poll(() => page.evaluate(() => window.__modalResultByClose)).toBe(false);
  });

  test("popups da ficha mantem foco dentro e fecham por x backdrop e Escape", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" },
        { username: "bruno", password: "123", charname: "Bruno Cinza" }
      ]));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "vigia", name: "Vigia da Porta" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charLevel: "2",
          attrForca: "7",
          attrAgilidade: "6",
          attrInteligencia: "8",
          attrResistencia: "7",
          attrAlma: "10",
          inventorySlots: 12,
          soulCore: {
            rank: 2,
            xp: 640,
            xpLimit: 2500,
            attributeGainProgress: 14,
            attributeCaps: {
              kind: "mortal",
              byRank: {
                2: { Forca: 17, Agilidade: 16, Inteligencia: 18, Resistencia: 15, Alma: 18 }
              }
            }
          },
          inv: [
            {
              name: "Couraca de ferro ritual",
              qty: "2",
              type: "armadura",
              desc: "Pesada, marcada por cinzas antigas.",
              armor: {
                equipped: true,
                mitigation: "3",
                resistances: "fogo, corte, veneno",
                notes: "Ruidosa em corredores estreitos."
              }
            }
          ]
        },
        bruno: { charName: "Bruno Cinza", inv: [] },
        "npc:vigia": { charName: "Vigia da Porta", inv: [] }
      }));
    });

    const expectFocusInside = async selector => {
      for (let index = 0; index < 12; index += 1) {
        await page.keyboard.press("Tab");
        await expect.poll(
          () => page.evaluate(rootSelector => {
            const root = document.querySelector(rootSelector);
            return Boolean(root && root.contains(document.activeElement));
          }, selector),
          { message: `o foco deve permanecer dentro de ${selector}` }
        ).toBe(true);
      }
    };

    const expectNoHorizontalOverflow = async selector => {
      await expect.poll(
        () => page.locator(selector).evaluate(root => root.scrollWidth <= root.clientWidth + 1),
        { message: `${selector} nao deve gerar overflow horizontal` }
      ).toBe(true);
    };

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();

    await page.evaluate(async () => {
      await openSheet(createPlayerTarget("ana"), true);
    });
    await expect(page.locator("#sheetScreen")).toBeVisible();

    await page.evaluate(() => openItemEditor(0));
    await expect(page.locator("#itemEditorRoot")).toBeVisible();
    await expectFocusInside("#itemEditorRoot");
    await expectNoHorizontalOverflow("#itemEditorRoot .item-editor-dialog");
    await page.locator("#itemEditorCloseBtn span").click();
    await expect(page.locator("#itemEditorRoot")).toBeHidden();

    await page.evaluate(() => openItemEditor(0));
    await expect(page.locator("#itemEditorRoot")).toBeVisible();
    await page.locator(".item-editor-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(page.locator("#itemEditorRoot")).toBeHidden();

    await page.locator("#openDiceTrayBtn").click();
    await expect(page.locator("#diceTrayRoot")).toBeVisible();
    await expectFocusInside("#diceTrayRoot");
    await expectNoHorizontalOverflow("#diceTrayRoot .dice-tray-dialog");
    await page.locator("#diceTrayCloseBtn span").click();
    await expect(page.locator("#diceTrayRoot")).toBeHidden();

    await page.locator("#openSoulAwardBtn").click();
    await expect(page.locator("#soulAwardRoot")).toBeVisible();
    await expectFocusInside("#soulAwardRoot");
    await expectNoHorizontalOverflow("#soulAwardRoot .soul-award-dialog");
    await page.keyboard.press("Escape");
    await expect(page.locator("#soulAwardRoot")).toBeHidden();

    await page.locator("#openSoulDetailsBtn").click();
    await expect(page.locator("#soulDetailsRoot")).toBeVisible();
    await expectFocusInside("#soulDetailsRoot");
    await expectNoHorizontalOverflow("#soulDetailsRoot .soul-details-dialog");
    await page.locator(".soul-details-root .soul-award-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(page.locator("#soulDetailsRoot")).toBeHidden();
  });

  test("lore e anotacoes podem ser recolhidas sem perder conteudo", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      if (localStorage.getItem("__notes_collapse_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("__notes_collapse_seeded", "1");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          charNotes: "Lore inicial",
          sheetNotes: "Anotacao inicial"
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();

    await page.locator("#charNotes").fill("Lore secreta da personagem");
    await page.locator("#sheetNotes").fill("Anotacao tática final");

    const expandedLoreLayout = await page.locator("#identityLoreCard").evaluate(card => {
      const title = card.querySelector("strong").getBoundingClientRect();
      const label = card.querySelector(".section-label").getBoundingClientRect();
      const actions = card.querySelector(".notes-card-actions").getBoundingClientRect();
      const summary = card.querySelector(".notes-collapse-summary").getBoundingClientRect();
      const button = card.querySelector(".notes-toggle-btn").getBoundingClientRect();
      const textarea = card.querySelector("#charNotes").getBoundingClientRect();
      const textCenter = (label.top + title.bottom) / 2;
      const actionsCenter = (actions.top + actions.bottom) / 2;
      return {
        titleHeight: Math.round(title.height),
        summaryWidth: Math.round(summary.width),
        buttonWidth: Math.round(button.width),
        actionsCenteredWithHeader: Math.abs(actionsCenter - textCenter) <= 6,
        titleBelowLabel: title.top >= label.bottom - 1,
        textareaBelowHeader: textarea.top >= title.bottom - 1,
        noOverflow: card.scrollWidth <= card.clientWidth + 1
      };
    });
    expect(expandedLoreLayout.actionsCenteredWithHeader).toBe(true);
    expect(expandedLoreLayout.titleBelowLabel).toBe(true);
    expect(expandedLoreLayout.textareaBelowHeader).toBe(true);
    expect(expandedLoreLayout.noOverflow).toBe(true);

    await page.locator('[data-notes-toggle="charNotes"]').click();
    await page.locator('[data-notes-toggle="sheetNotes"]').click();

    await expect(page.locator('[data-notes-section="charNotes"]')).toHaveClass(/is-collapsed/);
    await expect(page.locator('[data-notes-section="sheetNotes"]')).toHaveClass(/is-collapsed/);
    await expect(page.locator('[data-notes-summary="charNotes"]')).toContainText("Com conteudo");
    await expect(page.locator('[data-notes-summary="sheetNotes"]')).toContainText("Com conteudo");
    await expect(page.locator("#charNotes")).toHaveValue("Lore secreta da personagem");
    await expect(page.locator("#sheetNotes")).toHaveValue("Anotacao tática final");

    const collapsedLoreLayout = await page.locator("#identityLoreCard").evaluate(card => {
      const title = card.querySelector("strong").getBoundingClientRect();
      const label = card.querySelector(".section-label").getBoundingClientRect();
      const actions = card.querySelector(".notes-card-actions").getBoundingClientRect();
      const summary = card.querySelector(".notes-collapse-summary").getBoundingClientRect();
      const button = card.querySelector(".notes-toggle-btn").getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const textCenter = (label.top + title.bottom) / 2;
      const actionsCenter = (actions.top + actions.bottom) / 2;
      const buttonTopGap = button.top - cardBox.top;
      const buttonBottomGap = cardBox.bottom - button.bottom;
      return {
        titleHeight: Math.round(title.height),
        summaryWidth: Math.round(summary.width),
        buttonWidth: Math.round(button.width),
        actionsCenteredWithText: Math.abs(actionsCenter - textCenter) <= 6,
        buttonVerticallyBalanced: Math.abs(buttonTopGap - buttonBottomGap) <= 2,
        titleBelowLabel: title.top >= label.bottom - 1,
        actionsInsideCard: actions.right <= cardBox.right - 1 && actions.top >= cardBox.top - 1,
        noOverflow: card.scrollWidth <= card.clientWidth + 1
      };
    });
    expect(collapsedLoreLayout.actionsCenteredWithText).toBe(true);
    expect(collapsedLoreLayout.buttonVerticallyBalanced).toBe(true);
    expect(collapsedLoreLayout.titleBelowLabel).toBe(true);
    expect(collapsedLoreLayout.titleHeight).toBe(expandedLoreLayout.titleHeight);
    expect(collapsedLoreLayout.summaryWidth).toBe(expandedLoreLayout.summaryWidth);
    expect(collapsedLoreLayout.buttonWidth).toBe(expandedLoreLayout.buttonWidth);
    expect(collapsedLoreLayout.actionsInsideCard).toBe(true);
    expect(collapsedLoreLayout.noOverflow).toBe(true);

    await page.reload();
    await expect(page.locator('[data-notes-section="charNotes"]')).toHaveClass(/is-collapsed/);
    await expect(page.locator('[data-notes-section="sheetNotes"]')).toHaveClass(/is-collapsed/);

    await page.locator('[data-notes-toggle="charNotes"]').click();
    await page.locator('[data-notes-toggle="sheetNotes"]').click();
    await expect(page.locator('[data-notes-section="charNotes"]')).not.toHaveClass(/is-collapsed/);
    await expect(page.locator('[data-notes-section="sheetNotes"]')).not.toHaveClass(/is-collapsed/);
    await expect(page.locator("#charNotes")).toHaveValue("Lore secreta da personagem");
    await expect(page.locator("#sheetNotes")).toHaveValue("Anotacao tática final");
  });

  test("jogador edita os proprios itens mas nao controla slots", async ({ page }) => {
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
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          inventorySlots: 10,
          inv: []
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#sheetScreen")).toBeVisible();
    await expect(page.locator("#inventoryMasterControls")).toBeHidden();
    await expect(page.locator("#inventorySlotDelta")).toBeHidden();

    const slotsBefore = await page.evaluate(() => inventorySlots);
    await page.evaluate(() => changeInventorySlots(1));
    await expect.poll(() => page.evaluate(() => inventorySlots)).toBe(slotsBefore);

    await page.locator("#inventoryAddBtn").click();
    await page.locator("#itemEditorName").fill("Couraca de ferro");
    await page.locator("#itemEditorQty").fill("1");
    await page.locator("#itemEditorTypeBtn").click();
    await page.getByRole("button", { name: /Armadura/ }).click();
    await expect(page.locator("#itemEditorArmorWrap")).toBeVisible();
    await page.locator("#itemEditorArmorEquipped").check();
    await page.locator("#itemEditorArmorMitigation").fill("3");
    await page.locator("#itemEditorArmorResistances").fill("fogo, corte, fogo");
    await page.locator("#itemEditorArmorNotes").fill("Pesada, mas confiavel.");
    await page.locator("#itemEditorSaveBtn").click();

    await expect(page.locator("#inventoryGrid")).toContainText("Couraca de ferro");
    await expect(page.locator("#armorStatsPanel")).toContainText("3");
    await expect(page.locator("#armorStatsPanel")).toContainText("fogo");
    await expect(page.locator(".armor-resistance-chip", { hasText: "fogo" })).toHaveCount(1);

    await expect.poll(
      () => page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}").ana),
      { message: "o item editado deve ser salvo na ficha local" }
    ).toMatchObject({
      inv: [
        {
          name: "Couraca de ferro",
          type: "armadura",
          armor: {
            equipped: true,
            mitigation: "3",
            resistances: "fogo, corte, fogo",
            notes: "Pesada, mas confiavel."
          }
        }
      ]
    });
  });

  test("editor de item mantem campos e transferencia sem quebra visual", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" },
        { username: "bruno", password: "123", charname: "Bruno Cinza" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          inv: [
            { name: "Kit de viagem", qty: "6", type: "outro", damage: "1d10", desc: "Ferramentas diversas." }
          ]
        },
        bruno: {
          charName: "Bruno Cinza",
          inv: []
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();

    await page.evaluate(async () => {
      await openSheet(createPlayerTarget("ana"), true);
      openItemEditor(0);
    });

    await expect(page.locator("#itemEditorRoot")).toBeVisible();
    await expect(page.locator("#itemEditorTypeLabel")).toHaveText("Outro");
    await expect(page.locator("#itemEditorDamageWrap")).toBeHidden();
    await expect(page.locator("#itemEditorTransfer")).toBeVisible();

    const transferLayout = await page.locator("#itemEditorTransfer .item-transfer-row").evaluate(row => {
      const sendButton = row.querySelector(".item-transfer-send");
      const rowBox = row.getBoundingClientRect();
      const parentBox = row.parentElement.getBoundingClientRect();
      return {
        columns: getComputedStyle(row).gridTemplateColumns.split(" ").filter(Boolean).length,
        sendGridColumn: sendButton ? getComputedStyle(sendButton).gridColumn : "",
        overflow: row.scrollWidth > row.clientWidth + 1 || rowBox.right > parentBox.right + 1
      };
    });

    expect(transferLayout.columns).toBeLessThanOrEqual(2);
    expect(transferLayout.sendGridColumn).toContain("1 / -1");
    expect(transferLayout.overflow).toBe(false);
  });

  test("transferencia preserva armadura e desequipa no destino", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([
        { username: "ana", password: "123", charname: "Ana Rubra" }
      ]));
      localStorage.setItem("tc_npcs", JSON.stringify([
        { id: "vigia", name: "Vigia" }
      ]));
      localStorage.setItem("tc_sheets", JSON.stringify({
        ana: {
          charName: "Ana Rubra",
          inv: [
            {
              name: "Couraca de ferro",
              qty: "1",
              type: "armadura",
              desc: "Protecao simples",
              armor: {
                equipped: true,
                mitigation: "3",
                resistances: "fogo, corte",
                notes: "Origem Ana"
              }
            }
          ]
        },
        "npc:vigia": {
          charName: "Vigia",
          inv: []
        }
      }));
    });

    await page.goto(`${baseUrl}/ficha.html`);
    await expect(page.locator("#masterScreen")).toBeVisible();

    await page.evaluate(async () => {
      window.UI.confirm = async () => true;
      await openSheet(createPlayerTarget("ana"), true);
      itemTransferStates[0] = { target: "npc:vigia", quantity: "1" };
      await transferItem(0);
    });

    const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_sheets") || "{}"));
    expect(sheets.ana.inv).toHaveLength(0);
    expect(sheets["npc:vigia"].inv[0]).toMatchObject({
      name: "Couraca de ferro",
      type: "armadura",
      armor: {
        equipped: false,
        mitigation: "3",
        resistances: "fogo, corte",
        notes: "Origem Ana"
      }
    });
  });
});

test.describe("Regras com tags", () => {
  test("contrato de regras aceita tags multiplas mantendo tag legado", async () => {
    const apiSource = fs.readFileSync(path.join(repoRoot, "js", "api.js"), "utf8");
    const worker = fs.readFileSync(path.join(repoRoot, "cloudflare", "src", "index.js"), "utf8");

    expect(apiSource).toContain("tags");
    expect(worker).toContain("tags");
  });

  test("mestre cria tags multiplas e jogador filtra regras por tag e busca", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      window.ARMAGEDON_CONFIG = {
        apiBaseUrl: `${window.location.origin}/api`,
        realtimeEnabled: false
      };
      if (localStorage.getItem("__rules_tags_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("__rules_tags_seeded", "1");
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre",
        role: "master",
        token: "",
        backend: false
      }));
    });

    await page.goto(`${baseUrl}/regras.html`);
    await page.locator("#ruleTitle").fill("Acerto critico");
    await page.locator("#ruleTag").fill("Combate, Nucleo, Combate");
    await page.locator("#ruleContent").fill("Ao rolar critico, aplique o efeito de combate.");
    await page.getByRole("button", { name: "Publicar regra" }).click();

    await page.locator("#ruleTitle").fill("Exploracao perigosa");
    await page.locator("#ruleTag").fill("Exploracao");
    await page.locator("#ruleContent").fill("Viagens longas cobram recursos.");
    await page.getByRole("button", { name: "Publicar regra" }).click();

    await expect(page.locator(".rule-tag-chip", { hasText: "Combate" })).toHaveCount(1);
    await expect(page.locator(".rule-tag-chip", { hasText: "Nucleo" })).toHaveCount(1);
    await expect(page.locator('[data-rule-tag-filter="Nucleo"]')).toBeVisible();

    await page.evaluate(() => {
      localStorage.setItem("tc_session", JSON.stringify({
        username: "ana",
        role: "player",
        token: "",
        backend: false
      }));
    });
    await page.reload();

    await expect(page.locator("#rulesEditor")).toBeHidden();
    await page.locator('[data-rule-tag-filter="Nucleo"]').click();
    await expect(page.locator("#rulesList")).toContainText("Acerto critico");
    await expect(page.locator("#rulesList")).not.toContainText("Exploracao perigosa");

    await page.locator("#rulesSearch").fill("critico");
    await expect(page.locator("#rulesList")).toContainText("Acerto critico");

    await page.locator("#clearRulesFilters").click();
    await expect(page.locator("#rulesList")).toContainText("Exploracao perigosa");

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_rules_posts") || "[]"));
    const combatRule = stored.find(rule => rule.title === "Acerto critico");
    expect(combatRule.tags).toEqual(["Combate", "Nucleo"]);
    expect(combatRule.tag).toBe("Combate, Nucleo");
  });
});
