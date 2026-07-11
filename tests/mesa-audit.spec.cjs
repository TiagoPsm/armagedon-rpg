/* ============================================================
 * mesa-audit.spec.cjs — Regressao dos 11 bugs da auditoria
 * (Etapa 34, 2026-07-05) + casos de permissao/persistencia.
 *
 * Estrategia: as funcoes da Mesa sao globais (scripts classicos),
 * entao alem dos fluxos E2E os testes chamam funcoes direto na
 * pagina (page.evaluate) e substituem colaboradores por spies.
 * Eventos do APP (presenca/ready) sao disparados por um hook de
 * teste instalado antes dos scripts (window.APP.__testEmit).
 * ============================================================ */
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

// Hook: intercepta window.APP para capturar handlers de APP.on e
// permitir que o teste emita eventos (presenca, ready) sem WebSocket.
function installAppEmitHook(page) {
  return page.addInitScript(() => {
    let realApp;
    Object.defineProperty(window, "APP", {
      configurable: true,
      get() { return realApp; },
      set(value) {
        realApp = value;
        if (value && typeof value.on === "function" && !value.__testEmitters) {
          value.__testEmitters = {};
          const originalOn = value.on.bind(value);
          value.on = (name, handler) => {
            (value.__testEmitters[name] = value.__testEmitters[name] || []).push(handler);
            return originalOn(name, handler);
          };
          value.__testEmit = (name, payload) => {
            (value.__testEmitters[name] || []).forEach(h => h(payload));
          };
        }
      }
    });
  });
}

// Espera o boot da Mesa assentar (persist debounced de 160ms etc.) antes de
// instalar spies — sem isso, chamadas atrasadas do boot contaminam a contagem.
async function waitForMesaSettled(page) {
  await page.waitForSelector("#mesaStageWrap");
  await page.waitForTimeout(450);
}

function seedMasterWithScene(page, tokens) {
  return page.addInitScript(sceneTokens => {
    // addInitScript roda de novo em CADA navegação (inclusive reload):
    // só semeia uma vez para não apagar estado que o teste criou.
    if (localStorage.getItem("__mesa_audit_seeded")) return;
    localStorage.setItem("__mesa_audit_seeded", "1");
    localStorage.clear();
    localStorage.setItem("__mesa_audit_seeded", "1");
    localStorage.setItem("tc_session", JSON.stringify({
      username: "mestre", role: "master", token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([
      { username: "ana", charname: "Ana Rubra" },
      { username: "bruno", charname: "Bruno Cinza" }
    ]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana:   { charName: "Ana Rubra",   vidaAtual: "8",  vidaMax: "12", integAtual: "4", integMax: "6" },
      bruno: { charName: "Bruno Cinza", vidaAtual: "10", vidaMax: "10", integAtual: "5", integMax: "5" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3,
      selectedTokenId: "",
      tokens: sceneTokens
    }));
  }, tokens);
}

function seedPlayerWithScene(page, tokens) {
  return page.addInitScript(sceneTokens => {
    if (localStorage.getItem("__mesa_audit_seeded")) return;
    localStorage.setItem("__mesa_audit_seeded", "1");
    localStorage.clear();
    localStorage.setItem("__mesa_audit_seeded", "1");
    localStorage.setItem("mesaRolePreview", "player");
    localStorage.setItem("tc_session", JSON.stringify({
      username: "ana", role: "player", token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([
      { username: "ana", charname: "Ana Rubra" },
      { username: "bruno", charname: "Bruno Cinza" }
    ]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana:   { charName: "Ana Rubra",   vidaAtual: "8",  vidaMax: "12", integAtual: "4", integMax: "6" },
      bruno: { charName: "Bruno Cinza", vidaAtual: "10", vidaMax: "10", integAtual: "5", integMax: "5" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3,
      selectedTokenId: "",
      tokens: sceneTokens
    }));
  }, tokens);
}

const BASE_TOKENS = [
  { id: "ana",   characterKey: "ana",   type: "player", ownerUsername: "ana", name: "Ana Rubra",
    x: 20, y: 20, order: 1, tokenScale: 1, layer: "tokens", visibleToPlayers: true, statsVisibleToPlayers: true },
  { id: "bruno", characterKey: "bruno", type: "player", ownerUsername: "bruno", name: "Bruno Cinza",
    x: 60, y: 20, order: 2, tokenScale: 1, layer: "tokens", visibleToPlayers: true, statsVisibleToPlayers: true }
];

// Nota: no boot a Mesa normaliza o id do token para o id do roster
// (characterKey) — por isso o token dm usa um characterKey exclusivo
// ("bruno") e os cenarios dm NAO incluem o token normal do bruno.
const DM_TOKEN = {
  id: "segredo1", characterKey: "bruno", type: "player", ownerUsername: "bruno", name: "Emboscada",
  x: 40, y: 60, order: 3, tokenScale: 1, layer: "dm", visibleToPlayers: true, statsVisibleToPlayers: true
};
const ANA_TOKEN = BASE_TOKENS[0];

test.describe("Contrato do Worker (bug 1)", () => {
  test("normalizeMesaScene preserva layer dm, aplica default tokens e clampa limites", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const scene = normalizeMesaScene({
      sceneVersion: 7,
      tokens: [
        { id: "a", characterKey: "ana", x: 10, y: 10, layer: "dm", tokenScale: 2 },
        { id: "b", characterKey: "bruno", x: 250, y: -5, layer: "qualquercoisa", tokenScale: 99 },
        { id: "c", characterKey: "vigia", x: 50, y: 50 }
      ]
    });
    const byId = Object.fromEntries(scene.tokens.map(t => [t.id, t]));
    expect(byId.a.layer).toBe("dm");
    expect(byId.b.layer).toBe("tokens");     // valor invalido cai no default
    expect(byId.c.layer).toBe("tokens");     // ausente cai no default
    expect(byId.b.x).toBe(100);              // clamp 0-100
    expect(byId.b.y).toBe(0);
    expect(byId.b.tokenScale).toBe(4);       // clamp 0.25-4
    expect(scene.sceneVersion).toBe(7);
  });

  test("normalizeMesaScene descarta campos desconhecidos e limita a 120 tokens", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `t${i}`, characterKey: `c${i}`, x: 1, y: 1
    }));
    const scene = normalizeMesaScene({ tokens: many, previewPlayerView: true, malicioso: "x" });
    expect(scene.tokens.length).toBeLessThanOrEqual(120);
    expect(scene.previewPlayerView).toBeUndefined();
    expect(scene.malicioso).toBeUndefined();
  });
});

test.describe("Regressao da auditoria — mestre", () => {
  test("boot com backend nao apaga tokens secretos do snapshot local (bug 2)", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN, DM_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      // Simula backend ativo devolvendo a cena SEM tokens dm (como o D1 faz).
      window.AUTH.isBackendEnabled = () => true;
      window.APP.getMesaScene = async () => ({
        data: {
          sceneVersion: 9,
          selectedTokenId: "",
          tokens: [
            { id: "ana", characterKey: "ana", x: 25, y: 25, layer: "tokens", order: 1, tokenScale: 1 }
          ]
        },
        updatedAt: "2026-07-05T00:00:00Z"
      });
      const saved = await loadMesaSceneSnapshot(undefined);
      const local = JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}");
      return {
        returnedHasSecret: saved.tokens.some(t => t.layer === "dm"),
        localHasSecret: (local.tokens || []).some(t => t.layer === "dm"),
        remoteTokenCame: saved.tokens.some(t => t.id === "ana" && t.x === 25)
      };
    });

    expect(result.returnedHasSecret).toBe(true);
    expect(result.localHasSecret).toBe(true);
    expect(result.remoteTokenCame).toBe(true);
  });

  test("payload da cena inclui layer e token dm nunca vai para a rede (bugs 1/2)", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN, DM_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };

      const payload = createMesaScenePayloadFromState();
      const secret = state.tokens.find(t => t.layer === "dm");
      const normal = state.tokens.find(t => t.layer !== "dm");
      const secretBroadcast = broadcastMesaTokenMove(secret);
      const normalBroadcast = broadcastMesaTokenMove(normal);

      return {
        everyTokenHasLayer: payload.tokens.every(t => t.layer === "dm" || t.layer === "tokens"),
        payloadKeepsSecret: payload.tokens.some(t => t.layer === "dm"),
        secretBroadcast,
        normalBroadcast,
        networkSawSecret: calls.some(c => c.payload?.tokenId === secret.id),
        layerDefaults: [normalizeTokenLayer("dm"), normalizeTokenLayer("lixo"), normalizeTokenLayer(undefined)]
      };
    });

    expect(result.everyTokenHasLayer).toBe(true);
    expect(result.payloadKeepsSecret).toBe(true);      // localStorage guarda o segredo
    expect(result.secretBroadcast).toBe(false);        // rede nunca ve token dm
    expect(result.normalBroadcast).toBe(true);
    expect(result.networkSawSecret).toBe(false);
    expect(result.layerDefaults).toEqual(["dm", "tokens", "tokens"]);
  });

  test("reconexao do mestre re-persiste em vez de puxar a cena (bug 3)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      let persistCalls = 0;
      let fetchCalls = 0;
      persistState = () => { persistCalls += 1; };
      window.AUTH.isBackendEnabled = () => true;
      window.APP.getMesaScene = async () => { fetchCalls += 1; return { data: { tokens: [] } }; };

      await resyncMesaSceneAfterReconnect(); // 1a conexao: nao faz nada
      const afterFirst = { persistCalls, fetchCalls };
      await resyncMesaSceneAfterReconnect(); // reconexao real
      return { afterFirst, persistCalls, fetchCalls };
    });

    expect(result.afterFirst).toEqual({ persistCalls: 0, fetchCalls: 0 });
    expect(result.persistCalls).toBe(1);   // mestre re-persiste (autoritativo)
    expect(result.fetchCalls).toBe(0);     // e nao puxa cena (evita rollback)
  });

  test("selecao multipla persiste cena e retransmite desenhos ao soltar (bug 5)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      let persisted = 0;
      let drawingsBroadcasts = 0;
      let versionBumps = 0;
      persistState = () => { persisted += 1; };
      _broadcastDrawings = () => { drawingsBroadcasts += 1; };
      bumpMesaSceneVersion = () => { versionBumps += 1; };

      _selectedTokenIds.add("ana");
      _selectedStrokeIds.add("s1");
      _broadcastAndRender();
      const withSelection = { persisted, drawingsBroadcasts, versionBumps };

      _selectedTokenIds.clear();
      _selectedStrokeIds.clear();
      _broadcastAndRender();
      return { withSelection, persisted, drawingsBroadcasts };
    });

    expect(result.withSelection).toEqual({ persisted: 1, drawingsBroadcasts: 1, versionBumps: 1 });
    expect(result.persisted).toBe(1);           // selecao vazia nao salva a toa
    expect(result.drawingsBroadcasts).toBe(1);
  });

  test("mestre arrasta token secreto na camada MESTRE; camada MAPA segue bloqueada (bug 6)", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN, DM_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Camada MESTRE ativa: arrastar o token secreto deve funcionar.
    // O id do token dm e resolvido em runtime (o boot normaliza ids).
    await page.evaluate(() => setMesaActiveLayer("dm"));
    const dmId = await page.evaluate(() => state.tokens.find(t => t.layer === "dm")?.id || "");
    expect(dmId).not.toBe("");
    const secretToken = page.locator(`.mesa-token[data-token-id="${dmId}"]`);
    await expect(secretToken).toBeVisible();
    const before = await page.evaluate(id => {
      const t = state.tokens.find(tk => tk.id === id);
      return { x: t.x, y: t.y };
    }, dmId);
    const box = await secretToken.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const afterDm = await page.evaluate(id => {
      const t = state.tokens.find(tk => tk.id === id);
      return { x: t.x, y: t.y };
    }, dmId);
    expect(afterDm.x).not.toBe(before.x);

    // Camada MAPA ativa: arrastar qualquer token deve continuar bloqueado
    await page.evaluate(() => setMesaActiveLayer("map"));
    const normalToken = page.locator('.mesa-token[data-token-id="ana"]');
    const beforeMap = await page.evaluate(() => {
      const t = state.tokens.find(tk => tk.id === "ana");
      return { x: t.x, y: t.y };
    });
    const nBox = await normalToken.boundingBox();
    await page.mouse.move(nBox.x + nBox.width / 2, nBox.y + nBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(nBox.x + nBox.width / 2 + 90, nBox.y + nBox.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const afterMap = await page.evaluate(() => {
      const t = state.tokens.find(tk => tk.id === "ana");
      return { x: t.x, y: t.y };
    });
    expect(afterMap).toEqual(beforeMap);
  });

  test("desenhos sobrevivem ao reload e sao reenviados a jogador novo (bug 4)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Persiste um traco pelo fluxo real (_broadcastDrawings) e recarrega.
    // Desde a Etapa 38 a cena e a fonte de verdade dos desenhos: o snapshot
    // da cena (persistState) precisa carrega-los para o F5 restaurar.
    await page.evaluate(() => {
      _strokes = [
        { id: "s1", tool: "line", color: "#e84040", width: 3, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, points: null, layer: "tokens" },
        { id: "s2", tool: "line", color: "#e84040", width: 3, x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.6, points: null, layer: "dm" }
      ];
      _broadcastDrawings();
    });
    await page.waitForTimeout(320); // persistState debounced (160ms)
    await page.reload();
    await expect(page.locator("#mesaStageWrap")).toBeVisible();
    // O restore dos desenhos acontece no fim do boot (initMesaDrawing) —
    // espera explicita em vez de depender do timing do initMesaMap.
    await page.waitForFunction(() =>
      typeof getDrawingsSnapshot === "function" && getDrawingsSnapshot().length >= 2
    );

    const restored = await page.evaluate(() => getDrawingsSnapshot().map(s => s.id).sort());
    expect(restored).toEqual(["s1", "s2"]);

    // Jogador novo aparece na presenca: mestre reenvia snapshot (sem camada dm)
    const rebroadcast = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };
      window.APP.__testEmit("mesa:presence", { online: { users: [
        { username: "mestre", role: "master", connections: 1 },
        { username: "ana", role: "player", connections: 1 }
      ] } });
      const first = calls.filter(c => c.type === "mesa:drawings:update").length;
      // Mesma presenca de novo: nao deve reenviar
      window.APP.__testEmit("mesa:presence", { online: { users: [
        { username: "mestre", role: "master", connections: 1 },
        { username: "ana", role: "player", connections: 1 }
      ] } });
      const second = calls.filter(c => c.type === "mesa:drawings:update").length;
      const sentSecret = calls.some(c =>
        c.type === "mesa:drawings:update" && (c.payload.drawings || []).some(s => s.layer === "dm")
      );
      return { first, second, sentSecret };
    });
    expect(rebroadcast.first).toBe(1);
    expect(rebroadcast.second).toBe(1);   // sem jogador novo, sem reenvio
    expect(rebroadcast.sentSecret).toBe(false);
  });

  test("mapa e anunciado para cada jogador novo, nao so o primeiro (bug 9)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      let announces = 0;
      announceMapToPlayers = () => { announces += 1; };
      mesaMapState.isMaster = true;
      mesaMapState.activeEntry = { id: "m1", name: "Mapa", hash: "abc", blob: { size: 10 } };

      const emitUsers = users => window.APP.__testEmit("mesa:presence", { online: { users } });

      emitUsers([{ username: "mestre", role: "master" }, { username: "ana", role: "player" }]);
      const afterFirst = announces;
      emitUsers([{ username: "mestre", role: "master" }, { username: "ana", role: "player" }]);
      const afterRepeat = announces;
      emitUsers([
        { username: "mestre", role: "master" },
        { username: "ana", role: "player" },
        { username: "bruno", role: "player" }
      ]);
      const afterNewcomer = announces;
      emitUsers([{ username: "mestre", role: "master" }, { username: "bruno", role: "player" }]);
      const afterLeave = announces;
      emitUsers([
        { username: "mestre", role: "master" },
        { username: "bruno", role: "player" },
        { username: "ana", role: "player" }
      ]);
      const afterRejoin = announces;

      return { afterFirst, afterRepeat, afterNewcomer, afterLeave, afterRejoin };
    });

    expect(result.afterFirst).toBe(1);     // ana entrou
    expect(result.afterRepeat).toBe(1);    // presenca repetida nao reanuncia
    expect(result.afterNewcomer).toBe(2);  // bruno e novo
    expect(result.afterLeave).toBe(2);     // saida nao anuncia
    expect(result.afterRejoin).toBe(3);    // ana voltou (F5)
  });

  test("transform do mapa faz round-trip normalizado e mestre ignora transform remoto (bug 10)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const layer = document.getElementById("mesaMapLayer");
      layer.hidden = false;
      layer.style.width = "1000px";
      layer.style.height = "600px";

      mesaMapState.activeMapId  = "m1";
      mesaMapState.activeMapUrl = "blob:fake";
      mesaMapState._imgW = 2000;
      mesaMapState._imgH = 1500;
      mesaMapState.mapTransform = { x: 120, y: -40, scale: 1.6 };

      const dims = _getMapCoverDims();
      const sent = { xFrac: 120 / dims.w, yFrac: -40 / dims.h, scale: 1.6 };

      // Receptor (jogador) com o mesmo container: deve reconstruir os pixels
      mesaMapState.isMaster = false;
      mesaMapState.mapTransform = { x: 0, y: 0, scale: 1 };
      _applyRemoteMapTransform(sent, "m1");
      const applied = { ...mesaMapState.mapTransform };

      // Mestre nunca aplica transform remoto
      mesaMapState.isMaster = true;
      mesaMapState.mapTransform = { x: 7, y: 7, scale: 2 };
      _applyRemoteMapTransform({ xFrac: 0.5, yFrac: 0.5, scale: 1 }, "m1");
      const masterKept = { ...mesaMapState.mapTransform };

      // Transform de OUTRO mapa fica pendente (nao aplica no mapa atual)
      mesaMapState.isMaster = false;
      mesaMapState.mapTransform = { x: 1, y: 1, scale: 1 };
      _applyRemoteMapTransform({ xFrac: 0.9, yFrac: 0.9, scale: 3 }, "outro-mapa");
      const otherMapKept = { ...mesaMapState.mapTransform };

      return { applied, masterKept, otherMapKept };
    });

    expect(Math.abs(result.applied.x - 120)).toBeLessThan(1);
    expect(Math.abs(result.applied.y - -40)).toBeLessThan(1);
    expect(result.applied.scale).toBeCloseTo(1.6, 5);
    expect(result.masterKept).toEqual({ x: 7, y: 7, scale: 2 });
    expect(result.otherMapKept).toEqual({ x: 1, y: 1, scale: 1 });
  });
});

test.describe("Mesa igual para todos (correcoes 2026-07-07)", () => {
  // Mock minimo do D1 para exercitar getMesaScene (filtro por papel).
  const makeEnv = row => ({
    DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) }
  });

  test("Worker preserva dados de exibicao do token e rejeita avatar base64", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const scene = normalizeMesaScene({
      tokens: [
        {
          id: "npc:1", characterKey: "npc:1", x: 30, y: 30, type: "npc",
          name: "Sentinela da Nevoa", ownerUsername: "Mestre",
          imageUrl: "https://exemplo.dev/api/mesa/avatar.webp",
          currentLife: 12.7, maxLife: 20, currentIntegrity: -5, maxIntegrity: 8
        },
        { id: "m1", characterKey: "m1", x: 1, y: 1, type: "dragao", imageUrl: "data:image/webp;base64,AAAA", name: "X" }
      ]
    });
    const npc = scene.tokens.find(t => t.id === "npc:1");
    expect(npc.type).toBe("npc");
    expect(npc.name).toBe("Sentinela da Nevoa");
    expect(npc.ownerUsername).toBe("mestre");
    expect(npc.imageUrl).toBe("https://exemplo.dev/api/mesa/avatar.webp");
    expect(npc.currentLife).toBe(13);      // arredonda
    expect(npc.currentIntegrity).toBe(0);  // clamp >= 0
    const weird = scene.tokens.find(t => t.id === "m1");
    expect(weird.type).toBe("");           // tipo fora da whitelist
    expect(weird.imageUrl).toBe("");       // data: URI nao entra no D1
  });

  test("Worker normaliza o campo map da cena (URL http obrigatoria + clamps)", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const valid = normalizeMesaScene({
      tokens: [],
      map: { id: "cf-abc", url: "https://api.dev/api/mesa/map/maps/mestre/cf-abc.webp", transform: { xFrac: 0.25, yFrac: -99, scale: 999 } }
    });
    expect(valid.map).toEqual({
      id: "cf-abc",
      url: "https://api.dev/api/mesa/map/maps/mestre/cf-abc.webp",
      transform: { xFrac: 0.25, yFrac: -8, scale: 20 }
    });

    const invalidUrl = normalizeMesaScene({ tokens: [], map: { id: "x", url: "javascript:alert(1)" } });
    expect(invalidUrl.map).toBeNull();

    const absent = normalizeMesaScene({ tokens: [] });
    expect(absent.map).toBeNull();
  });

  test("GET da cena: jogador nao recebe camada dm nem vitais de token com status oculto", async () => {
    const { getMesaScene } = await import("../cloudflare/src/mesa.js");
    const row = {
      id: "default",
      created_at: "2026-07-07T00:00:00Z",
      updated_at: "2026-07-07T00:00:00Z",
      data_json: JSON.stringify({
        sceneVersion: 2,
        tokens: [
          { id: "npc:1", characterKey: "npc:1", x: 10, y: 10, type: "npc", name: "Aberto",
            statsVisibleToPlayers: true, currentLife: 9, maxLife: 9, currentIntegrity: 3, maxIntegrity: 3 },
          { id: "npc:2", characterKey: "npc:2", x: 20, y: 20, type: "npc", name: "Fechado",
            statsVisibleToPlayers: false, currentLife: 66, maxLife: 66, currentIntegrity: 6, maxIntegrity: 6 },
          { id: "segredo", characterKey: "segredo", x: 30, y: 30, type: "npc", name: "Oculto", layer: "dm" }
        ],
        map: { id: "m1", url: "https://api.dev/api/mesa/map/maps/mestre/m1.webp" }
      })
    };

    const playerScene = await getMesaScene(makeEnv(row), { role: "player" });
    const ids = playerScene.data.tokens.map(t => t.id);
    expect(ids).toEqual(["npc:1", "npc:2"]);            // dm filtrado
    const aberto = playerScene.data.tokens.find(t => t.id === "npc:1");
    const fechado = playerScene.data.tokens.find(t => t.id === "npc:2");
    expect(aberto.currentLife).toBe(9);                 // status visivel: vitais chegam
    expect(fechado.currentLife).toBeNull();             // status oculto: vitais nao vazam
    expect(fechado.name).toBe("Fechado");               // mas o token renderiza
    expect(playerScene.data.map?.url).toContain("/api/mesa/map/");

    const masterScene = await getMesaScene(makeEnv(row), { role: "master" });
    expect(masterScene.data.tokens.length).toBe(3);     // mestre recebe tudo
    expect(masterScene.data.tokens.find(t => t.id === "npc:2").currentLife).toBe(66);
  });

  test("payload da cena embute dados de exibicao e a referencia do mapa", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      window.getMesaSceneMapPayload = () => ({
        id: "m1",
        url: "https://api.dev/api/mesa/map/maps/mestre/m1.webp",
        transform: { xFrac: 0.1, yFrac: 0.2, scale: 1.5 }
      });
      const payload = createMesaScenePayloadFromState();
      const ana = payload.tokens.find(t => t.id === "ana");
      const sigWithMap = getMesaSceneSignature(payload);
      const sigOtherTransform = getMesaSceneSignature({
        ...payload,
        map: { ...payload.map, transform: { xFrac: 0.9, yFrac: 0.2, scale: 1.5 } }
      });
      return {
        tokenFields: { type: ana.type, name: ana.name, owner: ana.ownerUsername, maxLife: ana.maxLife },
        mapUrl: payload.map?.url,
        signatureChangesWithTransform: sigWithMap !== sigOtherTransform
      };
    });

    expect(result.tokenFields.type).toBe("player");
    expect(result.tokenFields.name).toBe("Ana Rubra");
    expect(result.tokenFields.owner).toBe("ana");
    expect(result.tokenFields.maxLife).toBeGreaterThan(0);
    expect(result.mapUrl).toContain("/api/mesa/map/");
    expect(result.signatureChangesWithTransform).toBe(true); // mudar transform persiste
  });

  test("jogador renderiza token de NPC/monstro sem entrada no roster (dados embutidos)", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      // NPC/monstro nao estao no roster do jogador (o /api/directory os
      // omite) — o token precisa hidratar so com os dados embutidos.
      applyMesaSceneSnapshot({
        sceneVersion: 9,
        selectedTokenId: "",
        tokens: [
          { id: "ana", characterKey: "ana", x: 20, y: 20, layer: "tokens",
            visibleToPlayers: true, statsVisibleToPlayers: true, order: 1, tokenScale: 1 },
          { id: "npc:9", characterKey: "npc:9", x: 45, y: 45, layer: "tokens",
            visibleToPlayers: true, statsVisibleToPlayers: false, order: 2, tokenScale: 1,
            type: "npc", name: "Sentinela da Nevoa", ownerUsername: "mestre",
            imageUrl: "", currentLife: null, maxLife: null, currentIntegrity: null, maxIntegrity: null },
          // Token legado sem dados de exibicao e fora do roster: descartado
          { id: "monster:velho", characterKey: "monster:velho", x: 70, y: 70, layer: "tokens",
            visibleToPlayers: true, order: 3, tokenScale: 1 }
        ]
      });
      renderAll();
      const npc = state.tokens.find(t => t.id === "npc:9");
      return {
        ids: state.tokens.map(t => t.id).sort(),
        npcName: npc?.name,
        npcType: npc?.type,
        npcOnStage: Boolean(document.querySelector('.mesa-token[data-token-id="npc:9"]'))
      };
    });

    expect(result.ids).toEqual(["ana", "npc:9"]);
    expect(result.npcName).toBe("Sentinela da Nevoa");
    expect(result.npcType).toBe("npc");
    expect(result.npcOnStage).toBe(true);
  });

  test("jogador carrega o mapa da cena oficial no boot e limpa quando a cena zera", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(baseUrlIn => {
      mesaMapState._initDone = true;
      mesaMapState.isMaster = false;
      window.isMaster = () => false;

      window.applyMesaSceneMapFromSnapshot({
        id: "m1",
        url: `${baseUrlIn}/assets/mapa-fake.webp`,
        transform: { xFrac: 0, yFrac: 0, scale: 1 }
      });
      const layer = document.getElementById("mesaMapLayer");
      const shown = {
        activeMapId: mesaMapState.activeMapId,
        remoteMapId: mesaMapState.remoteMapId,
        hasBackground: (layer?.style.backgroundImage || "").includes("mapa-fake.webp")
      };

      // Cena oficial sem mapa: jogador limpa o que veio da cena
      window.applyMesaSceneMapFromSnapshot(null);
      const cleared = {
        background: layer?.style.backgroundImage || "",
        activeMapId: mesaMapState.activeMapId
      };
      return { shown, cleared };
    }, baseUrl);

    expect(result.shown.activeMapId).toBe("m1");
    expect(result.shown.remoteMapId).toBe("m1");
    expect(result.shown.hasBackground).toBe(true);
    expect(result.cleared.background === "" || result.cleared.background === "none").toBe(true);
    expect(result.cleared.activeMapId).toBe("");
  });
});

test.describe("Regressao da auditoria — jogador", () => {
  test("reconexao do jogador rebusca a cena remota (bug 3)", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      let fetchCalls = 0;
      let persistCalls = 0;
      persistState = () => { persistCalls += 1; };
      window.AUTH.isBackendEnabled = () => true;
      window.APP.getMesaScene = async () => {
        fetchCalls += 1;
        return { data: { sceneVersion: 4, selectedTokenId: "", tokens: [] } };
      };

      await resyncMesaSceneAfterReconnect(); // 1a conexao
      const afterFirst = { fetchCalls, persistCalls };
      await resyncMesaSceneAfterReconnect(); // reconexao
      return { afterFirst, fetchCalls, persistCalls };
    });

    expect(result.afterFirst).toEqual({ fetchCalls: 0, persistCalls: 0 });
    expect(result.fetchCalls).toBe(1);   // jogador puxa a cena
    expect(result.persistCalls).toBe(0); // jogador nunca persiste cena
  });

  test("selecao multipla do jogador nao move nem redimensiona token alheio (bug 7)", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const snapshot = () => {
        const own = state.tokens.find(t => t.id === "ana");
        const other = state.tokens.find(t => t.id === "bruno");
        return { own: { x: own.x, y: own.y }, other: { x: other.x, y: other.y } };
      };

      _selectedTokenIds.add("ana");
      _selectedTokenIds.add("bruno");

      const before = snapshot();
      _applyMoveDelta(5, 5);
      const afterMove = snapshot();
      _applyResizeDelta("se", { x1: 10, y1: 10, x2: 90, y2: 90 }, { x1: 10, y1: 10, x2: 70, y2: 70 });
      const afterResize = snapshot();

      return { before, afterMove, afterResize };
    });

    // Proprio token moveu
    expect(result.afterMove.own.x).toBeCloseTo(result.before.own.x + 5, 3);
    // Token alheio nao mexeu em nenhuma operacao
    expect(result.afterMove.other).toEqual(result.before.other);
    expect(result.afterResize.other).toEqual(result.before.other);
  });

  test("drag do jogador transmite o proprio token em tempo real e nunca o alheio (bug 8)", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, tokenId: payload?.tokenId }); return true; };

      const own = state.tokens.find(t => t.id === "ana");
      const other = state.tokens.find(t => t.id === "bruno");

      queueRealtimeDragMove(own);
      const ownStreams = calls.filter(c => c.type === "mesa:token:move" && c.tokenId === "ana").length;
      queueRealtimeDragMove(other);
      const otherStreams = calls.filter(c => c.tokenId === "bruno").length;

      return { ownStreams, otherStreams };
    });

    expect(result.ownStreams).toBeGreaterThan(0);
    expect(result.otherStreams).toBe(0);
  });

  test("jogador nao ve token da camada dm nem controles de mestre (permissoes)", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN, DM_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await expect(page.locator('.mesa-token[data-token-id="ana"]')).toBeVisible();

    // Nenhum token da camada dm aparece no palco do jogador
    const dmOnStage = await page.evaluate(() =>
      [...document.querySelectorAll("#mesaStage .mesa-token")]
        .some(el => (el.dataset.contentSignature || "").includes('"layer":"dm"'))
    );
    expect(dmOnStage).toBe(false);

    // Botoes de camada MESTRE/MAPA ocultos e "Limpar cena" indisponivel
    const controls = await page.evaluate(() => {
      const dmBtn = document.querySelector('[data-layer-btn="dm"]');
      const mapBtn = document.querySelector('[data-layer-btn="map"]');
      const reset = document.getElementById("resetMesaBtn");
      const visible = el => Boolean(el && !el.hidden && el.offsetParent !== null);
      return { dmVisible: visible(dmBtn), mapVisible: visible(mapBtn), resetVisible: visible(reset) };
    });
    expect(controls.dmVisible).toBe(false);
    expect(controls.mapVisible).toBe(false);
    expect(controls.resetVisible).toBe(false);
  });
});

/* ============================================================
 * Etapa 37 — Iniciativa fim-a-fim
 * Antes desta etapa os deltas mesa:initiative:* eram descartados
 * pelo roteador do cliente e pelo DO; o estado sumia no F5.
 * ============================================================ */
test.describe("Iniciativa fim-a-fim (Etapa 37)", () => {
  test("Worker: normalizeMesaScene preserva iniciativa ativa e limita a 50 entradas", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, characterKey: `p${i}`, name: `P${i}`, roll: 10, modifier: 1, total: 11, rolled: true
    }));
    const active = normalizeMesaScene({
      tokens: [],
      initiative: { active: true, round: 3, currentIndex: 1, order: manyEntries }
    });
    expect(active.initiative.active).toBe(true);
    expect(active.initiative.round).toBe(3);
    expect(active.initiative.currentIndex).toBe(1);
    expect(active.initiative.order.length).toBe(50);
    expect(active.initiative.order[0]).toEqual({
      id: "p0", characterKey: "p0", name: "P0", roll: 10, modifier: 1, total: 11, rolled: true
    });

    const inactive = normalizeMesaScene({ tokens: [] });
    expect(inactive.initiative).toEqual({ active: false, round: 1, currentIndex: -1, order: [] });
  });

  test("jogador recebe mesa:initiative:update: painel + banner; banner some apos rolar", async ({ page }) => {
    await installAppEmitHook(page);
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Mestre ativa combate (ana ainda nao rolou) — vindo de OUTRO cliente.
    await page.evaluate(async () => {
      window.APP.__testEmit("mesa:initiative:update", {
        type: "mesa:initiative:update",
        clientId: "cliente-do-mestre",
        initiative: {
          active: true, round: 2, currentIndex: 0,
          order: [{ id: "bruno", characterKey: "bruno", name: "Bruno Cinza", roll: 15, modifier: 2, total: 17, rolled: true }]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 80));
    });

    await expect(page.locator("#vttInitiativeBlock")).toBeVisible();
    await expect(page.locator("#vttInitiativeBlock .init-round-num")).toHaveText("2");
    await expect(page.locator("#vttInitiativeBlock .init-entry")).toHaveCount(1);
    await expect(page.locator("#initiativeBanner")).toBeVisible();
    // Controles de mestre nunca aparecem para o jogador
    await expect(page.locator("#vttInitiativeBlock .init-master-controls")).toBeHidden();

    // Update seguinte inclui a rolagem da propria ana → banner some.
    await page.evaluate(async () => {
      window.APP.__testEmit("mesa:initiative:update", {
        type: "mesa:initiative:update",
        clientId: "cliente-do-mestre",
        initiative: {
          active: true, round: 2, currentIndex: 0,
          order: [
            { id: "bruno", characterKey: "bruno", name: "Bruno Cinza", roll: 15, modifier: 2, total: 17, rolled: true },
            { id: "ana", characterKey: "ana", name: "Ana Rubra", roll: 12, modifier: 1, total: 13, rolled: true }
          ]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 80));
    });
    await expect(page.locator("#initiativeBanner")).toBeHidden();
    await expect(page.locator("#vttInitiativeBlock .init-entry")).toHaveCount(2);
  });

  test("mestre consome mesa:initiative:roll, reordena, re-broadcasta e persiste; rolagem forjada e descartada", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      const sent = [];
      let persisted = 0;
      sendMesaRealtimeDelta = (type, payload) => { sent.push({ type, payload }); return true; };
      persistState = () => { persisted += 1; };

      activateInitiative();
      const afterActivate = {
        broadcastTypes: sent.map(call => call.type),
        persisted
      };

      // Rolagem legitima: ator ana rolando pelo proprio personagem.
      window.APP.__testEmit("mesa:initiative:roll", {
        type: "mesa:initiative:roll",
        clientId: "cliente-da-ana",
        characterKey: "ana", name: "Ana Rubra", roll: 15, modifier: 2, total: 17,
        actor: { username: "ana", role: "player" }
      });
      await new Promise(resolve => setTimeout(resolve, 80));
      const afterRoll = {
        order: getInitiativeState().order.map(entry => entry.characterKey),
        anaTotal: getInitiativeState().order.find(entry => entry.characterKey === "ana")?.total,
        broadcasts: sent.filter(call => call.type === "mesa:initiative:update").length,
        persisted
      };

      // Rolagem forjada: ator ana declarando o personagem do bruno.
      window.APP.__testEmit("mesa:initiative:roll", {
        type: "mesa:initiative:roll",
        clientId: "cliente-da-ana",
        characterKey: "bruno", name: "Bruno Cinza", roll: 20, modifier: 5, total: 25,
        actor: { username: "ana", role: "player" }
      });
      await new Promise(resolve => setTimeout(resolve, 80));

      return {
        afterActivate,
        afterRoll,
        finalOrder: getInitiativeState().order.map(entry => entry.characterKey)
      };
    });

    // Ativar combate ja broadcasta o estado E persiste a cena
    expect(result.afterActivate.broadcastTypes).toContain("mesa:initiative:update");
    expect(result.afterActivate.persisted).toBe(1);
    // Rolagem legitima entrou na ordem, re-broadcastou e re-persistiu
    expect(result.afterRoll.order).toEqual(["ana"]);
    expect(result.afterRoll.anaTotal).toBe(17);
    expect(result.afterRoll.broadcasts).toBe(2);
    expect(result.afterRoll.persisted).toBe(2);
    // Rolagem forjada (ator != characterKey) nao entrou
    expect(result.finalOrder).toEqual(["ana"]);
  });

  test("iniciativa ativa sobrevive ao F5 do mestre (persistState + snapshot da cena)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.evaluate(() => activateInitiative());
    // Espera o persist debounced (160ms) gravar o snapshot local.
    await page.waitForTimeout(400);
    const savedInitiative = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1"))?.initiative
    );
    expect(savedInitiative?.active).toBe(true);

    await page.reload();
    await waitForMesaSettled(page);
    await expect(page.locator("#vttInitiativeBlock")).toBeVisible();
    const restored = await page.evaluate(() => getInitiativeState().active);
    expect(restored).toBe(true);
  });

  test("assinatura de dedupe da cena muda quando a iniciativa muda", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      // Neutraliza efeitos colaterais do activate (broadcast/persist reais).
      sendMesaRealtimeDelta = () => true;
      persistState = () => {};
      const before = getMesaSceneSignature(createMesaScenePayloadFromState());
      activateInitiative();
      const after = getMesaSceneSignature(createMesaScenePayloadFromState());
      return { changed: before !== after };
    });
    expect(result.changed).toBe(true);
  });
});

test.describe("Desenhos fim-a-fim (Etapa 38)", () => {
  const makeEnv = row => ({
    DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) }
  });

  test("Worker: normalizeMesaScene normaliza desenhos (caps, whitelist de ferramenta, lapis)", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const many = Array.from({ length: 350 }, (_, i) => ({
      id: `d${i}`, tool: "line", color: "#40c860", width: 3,
      x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9, layer: "tokens"
    }));
    const scene = normalizeMesaScene({
      tokens: [],
      drawings: [
        { id: "ok1", tool: "line", color: "#e84040", width: 3, x1: 0.1, y1: 0.2, x2: 1.7, y2: -0.4, layer: "dm" },
        { id: "ok2", tool: "pencil", color: "lixo", width: 99,
          points: Array.from({ length: 260 }, (_, i) => [i / 260, i / 260]), x1: 0, y1: 0, x2: 1, y2: 1 },
        { id: "ruim1", tool: "spray", x1: 0, y1: 0, x2: 1, y2: 1 },          // ferramenta invalida
        { id: "ruim2", tool: "pencil", points: [[0.5, 0.5]], x1: 0, y1: 0, x2: 1, y2: 1 }, // lapis com 1 ponto
        { tool: "line", x1: 0, y1: 0, x2: 1, y2: 1 },                        // sem id
        ...many
      ]
    });

    expect(scene.drawings.length).toBe(300);                       // cap de 300 tracos
    const ok1 = scene.drawings.find(d => d.id === "ok1");
    const ok2 = scene.drawings.find(d => d.id === "ok2");
    expect(ok1.layer).toBe("dm");                                  // camada dm preservada no armazenamento
    expect(ok1.x2).toBe(1);                                        // clamp em fracao 0-1
    expect(ok1.y2).toBe(0);
    expect(ok2.color).toBe("#e84040");                             // cor invalida cai no default
    expect(ok2.width).toBe(12);                                    // clamp 1-12
    expect(ok2.points.length).toBe(200);                           // cap de pontos do lapis
    expect(scene.drawings.some(d => d.id === "ruim1")).toBe(false);
    expect(scene.drawings.some(d => d.id === "ruim2")).toBe(false);
  });

  test("Worker: GET da cena filtra tracos dm para jogador e preserva para o mestre", async () => {
    const { getMesaScene } = await import("../cloudflare/src/mesa.js");
    const row = {
      id: "default",
      created_at: "2026-07-10T00:00:00Z",
      updated_at: "2026-07-10T00:00:00Z",
      data_json: JSON.stringify({
        sceneVersion: 4,
        tokens: [],
        drawings: [
          { id: "pub", tool: "line", color: "#e84040", width: 3, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, layer: "tokens" },
          { id: "sec", tool: "rect", color: "#40b8e8", width: 3, x1: 0.2, y1: 0.2, x2: 0.7, y2: 0.7, layer: "dm" }
        ]
      })
    };

    const playerScene = await getMesaScene(makeEnv(row), { role: "player" });
    expect(playerScene.data.drawings.map(d => d.id)).toEqual(["pub"]);

    const masterScene = await getMesaScene(makeEnv(row), { role: "master" });
    expect(masterScene.data.drawings.map(d => d.id).sort()).toEqual(["pub", "sec"]);
  });

  test("DO retransmite mesa:drawings:update e remove tracos dm no relay (guarda de fonte)", async () => {
    // O modulo do DO importa "cloudflare:workers" e nao roda em Node puro —
    // testes unitarios reais do DO chegam na Etapa 41. Ate la, esta guarda
    // garante que o tipo nao saia de RELAY_TYPES nem perca o filtro dm.
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(
      path.join(__dirname, "..", "cloudflare", "src", "mesa-realtime.js"),
      "utf8"
    );
    expect(source).toMatch(/DRAWINGS_UPDATE_TYPE = "mesa:drawings:update"/);
    const relayBlock = source.match(/const RELAY_TYPES = new Set\(\[[^\]]+\]\)/)[0];
    expect(relayBlock).toContain("DRAWINGS_UPDATE_TYPE");
    // Tipo NAO pode ser master-only (jogador tambem desenha)
    const masterOnlyBlock = source.match(/const MASTER_ONLY_TYPES = new Set\(\[[^\]]+\]\)/)[0];
    expect(masterOnlyBlock).not.toContain("DRAWINGS_UPDATE_TYPE");
    // Relay filtra camada dm antes de retransmitir
    expect(source).toMatch(/stroke\.layer !== "dm"/);
  });

  test("payload da cena inclui desenhos e a assinatura de dedupe muda com traco novo", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      _strokes = [
        { id: "s1", tool: "line", color: "#e84040", width: 3, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, points: null, layer: "tokens" },
        { id: "sec", tool: "rect", color: "#40b8e8", width: 3, x1: 0.2, y1: 0.2, x2: 0.7, y2: 0.7, points: null, layer: "dm" }
      ];
      const payload = createMesaScenePayloadFromState();
      const before = getMesaSceneSignature(payload);
      _strokes.push({ id: "s2", tool: "circle", color: "#40c860", width: 5, x1: 0.3, y1: 0.3, x2: 0.8, y2: 0.8, points: null, layer: "tokens" });
      const after = getMesaSceneSignature(createMesaScenePayloadFromState());
      return {
        payloadIds: payload.drawings.map(d => d.id).sort(),
        keepsSecretInPayload: payload.drawings.some(d => d.layer === "dm"),
        signatureChanges: before !== after
      };
    });

    expect(result.payloadIds).toEqual(["s1", "sec"]);
    expect(result.keepsSecretInPayload).toBe(true); // PUT e master-only; GET filtra p/ jogador
    expect(result.signatureChanges).toBe(true);
  });

  test("jogador aplica desenhos da cena no boot (sem mestre online) e nunca ve camada dm", async ({ page }) => {
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      applyMesaSceneSnapshot({
        sceneVersion: 9,
        selectedTokenId: "",
        tokens: [],
        drawings: [
          { id: "pub", tool: "line", color: "#e84040", width: 3, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, points: null, layer: "tokens" },
          // Um traco dm forjado que tivesse passado nao pode aparecer no jogador
          { id: "sec", tool: "rect", color: "#40b8e8", width: 3, x1: 0.2, y1: 0.2, x2: 0.7, y2: 0.7, points: null, layer: "dm" }
        ]
      });
      return { ids: getDrawingsSnapshot().map(d => d.id) };
    });
    expect(result.ids).toEqual(["pub"]);

    // Cena SEM o campo drawings (legado) nao apaga o que ja esta na tela
    const legacy = await page.evaluate(() => {
      applyMesaSceneSnapshot({ sceneVersion: 10, selectedTokenId: "", tokens: [] });
      return { ids: getDrawingsSnapshot().map(d => d.id) };
    });
    expect(legacy.ids).toEqual(["pub"]);
  });

  test("mestre recebe desenho de jogador via delta, persiste a cena e preserva traco dm local", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      let persistCalls = 0;
      persistState = () => { persistCalls += 1; };
      _strokes = [
        { id: "sec", tool: "rect", color: "#40b8e8", width: 3, x1: 0.2, y1: 0.2, x2: 0.7, y2: 0.7, points: null, layer: "dm" }
      ];

      await applyMesaRealtimeDelta({
        type: "mesa:drawings:update",
        clientId: "cliente-remoto",
        sceneVersion: 0,
        actor: { username: "ana", role: "player" },
        drawings: [
          { id: "ana1", tool: "pencil", color: "#40c860", width: 3,
            x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, points: [[0.1, 0.1], [0.4, 0.4]], layer: "tokens" }
        ]
      });

      const ids = getDrawingsSnapshot().map(d => d.id).sort();
      const local = JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}");
      return {
        ids,
        persistCalls,
        snapshotHasDrawing: (local.drawings || []).some(d => d.id === "ana1")
      };
    });

    expect(result.ids).toEqual(["ana1", "sec"]); // traco do jogador entra; dm local sobrevive
    expect(result.persistCalls).toBe(1);         // mestre torna o desenho oficial
    expect(result.snapshotHasDrawing).toBe(true); // F5 preserva via snapshot local
  });
});

test.describe("Correcoes de interacao (Etapa 39)", () => {
  test("drag com zoom nao deriva: token termina sob o cursor mesmo com zoom aplicado ANTES do drag", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.evaluate(() => setStageZoom(1.5));
    const token = page.locator('.mesa-token[data-token-id="ana"]');
    const box = await token.boundingBox();
    const grabX = box.x + box.width / 2;
    const grabY = box.y + box.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 80, grabY + 50, { steps: 8 });
    await page.mouse.up();

    // O centro do token deve terminar (aprox.) sob o ponto de soltura —
    // com o rect congelado do bug antigo, o zoom de 1.5x fazia o token
    // andar mais que o cursor.
    const finalBox = await token.boundingBox();
    const finalCx = finalBox.x + finalBox.width / 2;
    const finalCy = finalBox.y + finalBox.height / 2;
    expect(Math.abs(finalCx - (grabX + 80))).toBeLessThan(6);
    expect(Math.abs(finalCy - (grabY + 50))).toBeLessThan(6);
  });

  test("zoom alterado NO MEIO do drag nao teleporta o token (stageRect e recapturado)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const token = page.locator('.mesa-token[data-token-id="ana"]');
    const box = await token.boundingBox();
    const grabX = box.x + box.width / 2;
    const grabY = box.y + box.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 40, grabY + 20, { steps: 4 });

    // Zoom muda durante o drag (wheel/slider) — o rect antigo fica invalido
    await page.evaluate(() => setStageZoom(2.0));
    await page.mouse.move(grabX + 60, grabY + 40, { steps: 4 });
    await page.mouse.up();

    // Com o rect fresco, o token continua (aprox.) sob o cursor na nova escala
    const finalBox = await token.boundingBox();
    const finalCx = finalBox.x + finalBox.width / 2;
    const finalCy = finalBox.y + finalBox.height / 2;
    expect(Math.abs(finalCx - (grabX + 60))).toBeLessThan(8);
    expect(Math.abs(finalCy - (grabY + 40))).toBeLessThan(8);
  });

  test("selecao multipla para na borda como unidade (sem esmagar o arranjo)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      sendMesaRealtimeDelta = () => true;
      persistState = () => {};

      _selectedTokenIds.add("ana");   // x=20
      _selectedTokenIds.add("bruno"); // x=60
      const gapBefore = Math.abs(
        state.tokens.find(t => t.id === "bruno").x - state.tokens.find(t => t.id === "ana").x
      );

      // Delta gigante para a direita: o grupo deve PARAR na borda mantendo
      // a distancia relativa (antes, cada token era clampado em 100 e o
      // arranjo era destruido de forma irreversivel).
      _applyMoveDelta(500, 0);
      const ana = state.tokens.find(t => t.id === "ana");
      const bruno = state.tokens.find(t => t.id === "bruno");
      const gapAfter = Math.abs(bruno.x - ana.x);

      return { gapBefore, gapAfter, anaX: ana.x, brunoX: bruno.x };
    });

    expect(result.gapAfter).toBeCloseTo(result.gapBefore, 1); // arranjo preservado
    expect(result.brunoX).toBeLessThanOrEqual(100);
    expect(result.anaX).toBeGreaterThan(result.brunoX - 100); // moveu de fato
  });

  test("stroke selecionado nao e empurrado para fora do palco pelo move em grupo", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      sendMesaRealtimeDelta = () => true;
      persistState = () => {};
      _strokes = [
        { id: "s1", tool: "line", color: "#e84040", width: 3, x1: 0.7, y1: 0.7, x2: 0.9, y2: 0.9, points: null, layer: "tokens" }
      ];
      _selectedStrokeIds.add("s1");

      _applyMoveDelta(500, 500); // tenta jogar o stroke para fora
      const s = getDrawingsSnapshot().find(x => x.id === "s1");
      return { x2: s.x2, y2: s.y2, x1: s.x1, y1: s.y1 };
    });

    // Desde a Etapa 38 o Worker clampa fracoes 0-1 no persist: um stroke fora
    // do palco seria DEFORMADO no save. O clamp de grupo impede a saida.
    expect(result.x2).toBeLessThanOrEqual(1.001);
    expect(result.y2).toBeLessThanOrEqual(1.001);
    expect(result.x1).toBeGreaterThanOrEqual(-0.001);
    expect(result.y1).toBeGreaterThanOrEqual(-0.001);
  });
});
