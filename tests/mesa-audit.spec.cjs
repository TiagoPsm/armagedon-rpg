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
  // Espera o boot assincrono TERMINAR de verdade (state.bootCompleted, setado
  // no .finally de bootMesaPage) em vez de dormir 450ms — o sono fixo era a
  // raiz da familia de flakes "bug 2": sob carga o boot passa de 450ms e o
  // teste rodava com state/role/APP pela metade.
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);
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
    expect(byId.b.tokenScale).toBe(12);      // clamp 0.25-12 (teto subiu na Etapa 65)
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
      // fit entrou na Etapa 55; payload sem o campo cai em false — este teste
      // afirma o shape EXATO, entao e aqui que a ausencia vira default visivel.
      fit: false,
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

  test("DO retransmite mesa:drawings:update (nao master-only) e remove tracos dm no relay", async () => {
    // Desde a Etapa 41 as regras do DO vivem em mesa-realtime-rules.js (sem
    // "cloudflare:workers") — este teste importa exatamente o codigo usado
    // pelo DO em producao.
    const { RELAY_TYPES, MASTER_ONLY_TYPES, sanitizeRelayDrawings } =
      await import("../cloudflare/src/mesa-realtime-rules.js");

    expect(RELAY_TYPES.has("mesa:drawings:update")).toBe(true);
    expect(MASTER_ONLY_TYPES.has("mesa:drawings:update")).toBe(false); // jogador desenha

    // Sanitizacao do relay: remove dm, mantem publicos, cap 300, nao-array = null
    const sanitized = sanitizeRelayDrawings([
      { id: "pub", tool: "line", layer: "tokens" },
      { id: "sec", tool: "rect", layer: "dm" },
      "lixo",
      ...Array.from({ length: 350 }, (_, i) => ({ id: `d${i}`, tool: "line", layer: "tokens" }))
    ]);
    expect(sanitized.some(s => s.id === "sec")).toBe(false);
    expect(sanitized.some(s => s.id === "pub")).toBe(true);
    expect(sanitized.length).toBe(300);
    expect(sanitizeRelayDrawings("nao-e-array")).toBeNull();
    expect(sanitizeRelayDrawings(undefined)).toBeNull();
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

test.describe("Fachada do mapa (Etapa 40)", () => {
  test("upload e delete de mapa passam pela fachada window.APP, sem fetch direto", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      const facadeCalls = [];
      let directFetches = 0;
      const originalFetch = window.fetch;
      window.fetch = (...args) => { directFetches += 1; return originalFetch(...args); };

      window.AUTH.isBackendEnabled = () => true;
      window.APP.uploadMesaMap = async (blob, mapId) => {
        facadeCalls.push({ fn: "upload", mapId, blobSize: blob?.size ?? null });
        return { url: "https://api.dev/api/mesa/map/maps/mestre/m1.webp", r2Key: "maps/mestre/m1.webp" };
      };
      window.APP.deleteMesaMap = async r2Key => {
        facadeCalls.push({ fn: "delete", r2Key });
        return { ok: true };
      };
      // Broadcast/persist reais nao interessam aqui
      window._persistMesaSceneMapOriginal = _persistMesaSceneMap;
      _persistMesaSceneMap = () => {};
      _sendRealtime = () => {};

      mesaMapState.activeEntry = { id: "m1", name: "Mapa", hash: "abc", blob: new Blob(["x"]) };
      await uploadActiveMapToR2();
      const stateAfterUpload = {
        r2Key: mesaMapState.activeMapR2Key,
        publicUrl: mesaMapState.activeMapPublicUrl
      };

      await deleteActiveMapFromR2();

      window.fetch = originalFetch;
      return { facadeCalls, directFetches, stateAfterUpload };
    });

    expect(result.facadeCalls).toEqual([
      { fn: "upload", mapId: "m1", blobSize: 1 },
      { fn: "delete", r2Key: "maps/mestre/m1.webp" }
    ]);
    expect(result.directFetches).toBe(0); // nenhum fetch fora da fachada
    expect(result.stateAfterUpload.r2Key).toBe("maps/mestre/m1.webp");
    expect(result.stateAfterUpload.publicUrl).toContain("/api/mesa/map/");
  });
});

test.describe("Hardening do backend (Etapa 41)", () => {
  test("readJson: aceita body normal, rejeita 413 acima do cap (declarado e real)", async () => {
    const { readJson } = await import("../cloudflare/src/auth.js");

    const ok = await readJson(new Request("https://x.dev", {
      method: "POST", body: JSON.stringify({ a: 1 })
    }));
    expect(ok).toEqual({ a: 1 });

    // Content-Length declarado acima do cap → 413 sem ler o body
    const declared = new Request("https://x.dev", {
      method: "POST", body: "{}", headers: { "content-length": String(64 * 1024) }
    });
    await expect(readJson(declared, 16 * 1024)).rejects.toMatchObject({ status: 413 });

    // Body real acima do cap (sem content-length confiavel) → 413
    const bigBody = new Request("https://x.dev", {
      method: "POST", body: JSON.stringify({ blob: "x".repeat(20 * 1024) })
    });
    await expect(readJson(bigBody, 16 * 1024)).rejects.toMatchObject({ status: 413 });

    // Cena usa cap maior: o mesmo body passa com 256KB
    const sceneBody = new Request("https://x.dev", {
      method: "POST", body: JSON.stringify({ blob: "x".repeat(20 * 1024) })
    });
    const scene = await readJson(sceneBody, 256 * 1024);
    expect(scene.blob.length).toBe(20 * 1024);

    // JSON invalido continua caindo em {} (comportamento antigo preservado)
    const invalid = await readJson(new Request("https://x.dev", { method: "POST", body: "nao-json" }));
    expect(invalid).toEqual({});
  });

  test("saveMesaScene rejeita jogador com 403", async () => {
    const { saveMesaScene } = await import("../cloudflare/src/mesa.js");
    const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => null }) }) } };

    let thrown = null;
    try {
      await saveMesaScene(env, { role: "player", sub: "u1" }, { tokens: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown.status).toBe(403);
  });

  test("cap de mensagem do realtime: 32KB geral, chunk de mapa ate 128KB, nada acima de 256KB", async () => {
    const { checkRealtimeMessageSize } = await import("../cloudflare/src/mesa-realtime-rules.js");

    expect(checkRealtimeMessageSize(JSON.stringify({ type: "mesa:token:move" })).ok).toBe(true);

    // Mensagem generica acima de 32KB → rejeitada
    const bigGeneric = JSON.stringify({ type: "mesa:drawings:update", pad: "x".repeat(40 * 1024) });
    expect(checkRealtimeMessageSize(bigGeneric).ok).toBe(false);

    // Chunk de mapa de ~90KB (64KB binario em base64) → passa
    const mapChunk = JSON.stringify({ type: "mesa:map:ws:chunk", to: "ana", data: "A".repeat(90 * 1024) });
    expect(mapChunk.length).toBeGreaterThan(32 * 1024);
    expect(checkRealtimeMessageSize(mapChunk).ok).toBe(true);

    // Chunk de mapa acima de 128KB → rejeitado
    const hugeChunk = JSON.stringify({ type: "mesa:map:ws:chunk", to: "ana", data: "A".repeat(140 * 1024) });
    expect(checkRealtimeMessageSize(hugeChunk).ok).toBe(false);

    // Hard cap absoluto (mesmo que o texto finja ser chunk)
    expect(checkRealtimeMessageSize("x".repeat(300 * 1024)).ok).toBe(false);
  });

  test("rate limit por socket: burst de 60, esgota, e recarrega com o tempo; chunk tem bucket proprio", async () => {
    const { createRateBucket, takeRateToken } = await import("../cloudflare/src/mesa-realtime-rules.js");

    const t0 = 1_000_000;
    const bucket = createRateBucket(t0);

    // Burst: 60 mensagens gerais passam, a 61a e bloqueada (mesmo instante)
    let passed = 0;
    for (let i = 0; i < 61; i++) {
      if (takeRateToken(bucket, "mesa:token:move", t0)) passed += 1;
    }
    expect(passed).toBe(60);

    // Apos 1s, ~30 tokens voltam
    let refilled = 0;
    for (let i = 0; i < 40; i++) {
      if (takeRateToken(bucket, "mesa:token:move", t0 + 1000)) refilled += 1;
    }
    expect(refilled).toBe(30);

    // Bucket de chunk e independente: mesmo com o geral esgotado, chunks passam
    let chunksPassed = 0;
    for (let i = 0; i < 240; i++) {
      if (takeRateToken(bucket, "mesa:map:ws:chunk", t0 + 1000)) chunksPassed += 1;
    }
    expect(chunksPassed).toBe(240); // burst proprio de 240
    expect(takeRateToken(bucket, "mesa:map:ws:chunk", t0 + 1000)).toBe(false);
  });

  test("regras de patch de ficha continuam identicas no modulo extraido (paridade DO)", async () => {
    const { normalizeSheetPatchPayload, filterPlayerSheetPatch } =
      await import("../cloudflare/src/mesa-realtime-rules.js");

    const { characterKey, patch } = normalizeSheetPatchPayload({
      characterKey: " Ana ",
      charName: "  Ana   Rubra  ",
      vidaAtual: "-5",
      integAtual: "",
      attrForca: "3.9",
      inventorySlots: "999",
      inv: [{ name: "Espada", qty: "2", type: "arma", damage: " 1 d 8 " }],
      campoDesconhecido: "descartado"
    });

    expect(characterKey).toBe("ana");
    expect(patch.charName).toBe("Ana Rubra");     // espacos colapsados
    expect(patch.vidaAtual).toBe("0");            // minimo 0
    expect(patch.integAtual).toBe("");            // vazio permanece vazio
    expect(patch.attrForca).toBe("3");            // parseInt
    expect(patch.inventorySlots).toBe("120");     // teto 120
    expect(patch.inv[0].damage).toBe("1d8");      // espacos removidos
    expect(patch.campoDesconhecido).toBeUndefined();

    // Jogador nao pode alterar inventorySlots nem ownedMemories via patch
    const filtered = filterPlayerSheetPatch({
      vidaAtual: "5", inventorySlots: "50", ownedMemories: [{ name: "x" }], inv: []
    });
    expect(filtered.vidaAtual).toBe("5");
    expect(filtered.inventorySlots).toBeUndefined();
    expect(filtered.ownedMemories).toBeUndefined();
  });
});

test.describe("Grade funcional (Etapa 42)", () => {
  test("Worker: normalizeMesaScene normaliza a grade (clamps + null quando desligada)", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");

    const on = normalizeMesaScene({
      tokens: [],
      grid: { enabled: true, snap: true, cellFrac: 0.9, offsetXFrac: 3, color: "javascript:x", opacity: 99 }
    });
    expect(on.grid.enabled).toBe(true);
    expect(on.grid.snap).toBe(true);
    expect(on.grid.cellFrac).toBe(0.25);      // clamp 0.01-0.25
    expect(on.grid.offsetXFrac).toBe(1);      // clamp 0-1
    expect(on.grid.color).toBe("#ffffff");    // cor invalida cai no default
    expect(on.grid.opacity).toBe(0.8);        // clamp 0.05-0.8

    const off = normalizeMesaScene({ tokens: [], grid: { enabled: false, snap: false, cellFrac: 0.05 } });
    expect(off.grid).toBeNull();              // grade toda desligada nao ocupa a cena

    const legacy = normalizeMesaScene({ tokens: [] });
    expect(legacy.grid).toBeNull();           // cena antiga sem o campo
  });

  test("DO rules: mesa:grid:update e master-only e retransmitido", async () => {
    const { GRID_UPDATE_TYPE, MASTER_ONLY_TYPES, RELAY_TYPES } =
      await import("../cloudflare/src/mesa-realtime-rules.js");
    expect(GRID_UPDATE_TYPE).toBe("mesa:grid:update");
    expect(MASTER_ONLY_TYPES.has(GRID_UPDATE_TYPE)).toBe(true);
    expect(RELAY_TYPES.has(GRID_UPDATE_TYPE)).toBe(true);
  });

  test("mestre: ligar a grade desenha no canvas e entra no payload da cena", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    // Sob carga o boot pode passar dos 450ms — updateMesaGrid e master-only,
    // entao espera o papel assentar antes de mexer na grade.
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(() => {
      window.updateMesaGrid({ enabled: true, cellFrac: 0.1, opacity: 0.5 });
      const canvas = document.getElementById("mesaGridCanvas");
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) painted++; }
      const payload = createMesaScenePayloadFromState();
      const normalized = normalizeMesaScenePayload(payload);
      return { painted, payloadGrid: payload.grid, signatureGrid: normalized.grid };
    });

    expect(result.painted).toBeGreaterThan(100);          // linhas visiveis
    expect(result.payloadGrid?.enabled).toBe(true);
    expect(result.payloadGrid?.cellFrac).toBe(0.1);
    // Grade na assinatura: persist so-de-grade nao pode cair no dedupe.
    expect(result.signatureGrid?.enabled).toBe(true);
  });

  test("mestre: snap-to-grid centraliza o token na celula ao soltar", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());
    const result = await page.evaluate(() => {
      window.updateMesaGrid({ enabled: true, snap: true, cellFrac: 0.1, offsetXFrac: 0, offsetYFrac: 0 });
      const token = state.tokens.find(t => t.id === "ana");
      token.x = 23.7;  // posicao "solta", fora de qualquer centro de celula
      token.y = 31.2;
      const el = document.querySelector('[data-token-id="ana"]');
      const moved = window.mesaSnapTokenToGrid(token, el);

      // Centro do token por LAYOUT (offsetWidth x tokenScale): o transform
      // tem transicao CSS e o rect no mesmo frame reflete a escala antiga
      // (updateMesaGrid re-conforma o token para 1x1 = escala ~1.06).
      const stage = document.getElementById("mesaStageInner");
      const tokenWFrac = (el.offsetWidth * (token.tokenScale || 1)) / stage.offsetWidth;
      const centerFx = token.x / 100 + tokenWFrac / 2;
      // Sem mapa ativo a superficie e o palco: centro deve cair em (n + 0.5) * 0.1
      const remainder = ((centerFx / 0.1) % 1 + 1) % 1;
      return { moved, remainder, x: token.x, y: token.y };
    });

    expect(result.moved).toBe(true);
    expect(Math.abs(result.remainder - 0.5)).toBeLessThan(0.02);
  });

  test("jogador: recebe mesa:grid:update mas nao consegue alterar a grade", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    await installAppEmitHook(page);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // `state` e const lexical global (nao vive em window.*): acessa direto.
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);
    const result = await page.evaluate(async () => {
      // Tentativa direta do jogador: no-op (updateMesaGrid e master-only).
      window.updateMesaGrid({ enabled: true });
      const blocked = window.getMesaGridState();

      // Delta autoritativo vindo do mestre via DO
      await applyMesaRealtimeDelta({
        type: "mesa:grid:update",
        clientId: "cliente-do-mestre",
        sceneVersion: 99,
        grid: { enabled: true, snap: true, cellFrac: 0.08, opacity: 0.3 }
      });
      const applied = window.getMesaGridState();

      const canvas = document.getElementById("mesaGridCanvas");
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) painted++; }
      return { blocked, applied, painted };
    });

    expect(result.blocked.enabled).toBe(false);
    expect(result.applied.enabled).toBe(true);
    expect(result.applied.snap).toBe(true);
    expect(result.applied.cellFrac).toBe(0.08);
    expect(result.painted).toBeGreaterThan(100);
  });
});

test.describe("Encaixe do token no grid (Etapa 42b)", () => {
  test("caixa do token e so o circulo; nome aparece apenas em hover/selecao", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN, BASE_TOKENS[1]]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    // Caixa quadrada (88x88): o nome absoluto nao infla o rect usado por
    // snap/arrasto/selecao.
    const box = await page.evaluate(() => {
      const el = document.querySelector('#mesaStage [data-token-id="ana"]');
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(box.w).toBe(88);
    expect(box.h).toBe(88);

    // Nome invisivel por padrao (bruno nao esta selecionado nem em hover)
    const nameHidden = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#mesaStage [data-token-id="bruno"] .mesa-token-name')).opacity
    );
    expect(Number(nameHidden)).toBe(0);

    // Selecionar mostra o nome (espera a transicao de 150ms terminar)
    await page.evaluate(() => selectToken("ana"));
    await page.waitForFunction(() => {
      const name = document.querySelector('#mesaStage [data-token-id="ana"] .mesa-token-name');
      return name && getComputedStyle(name).opacity === "1";
    });

    // Hover tambem mostra (no token NAO selecionado)
    await page.hover('#mesaStage [data-token-id="bruno"]');
    await page.waitForFunction(() => {
      const name = document.querySelector('#mesaStage [data-token-id="bruno"] .mesa-token-name');
      return name && getComputedStyle(name).opacity === "1";
    });

    // Com grade+snap: apos snap o CENTRO DO CIRCULO cai no centro da celula
    const snap = await page.evaluate(() => {
      window.updateMesaGrid({ enabled: true, snap: true, cellFrac: 0.1, offsetXFrac: 0, offsetYFrac: 0 });
      const token = state.tokens.find(t => t.id === "ana");
      token.x = 41.3;
      token.y = 27.9;
      const el = document.querySelector('#mesaStage [data-token-id="ana"]');
      const moved = window.mesaSnapTokenToGrid(token, el);
      // Medida por LAYOUT: o transform do token tem transicao CSS e o rect
      // no mesmo frame ainda reflete a escala antiga (pre-conformidade 1x1).
      const stage = document.getElementById("mesaStageInner");
      const tokenWFrac = (el.offsetWidth * (token.tokenScale || 1)) / stage.offsetWidth;
      const centerFx = token.x / 100 + tokenWFrac / 2;
      const remainder = ((centerFx / 0.1) % 1 + 1) % 1;
      return { moved, remainder };
    });
    expect(snap.moved).toBe(true);
    expect(Math.abs(snap.remainder - 0.5)).toBeLessThan(0.02);
  });
});

test.describe("Grupo Grade no painel (correcao pos-42)", () => {
  test("mestre ve o grupo Grade apos o boot; jogador nao", async ({ page }) => {
    // Regressao da corrida de boot: initMesaGrid roda no DOMContentLoaded,
    // ANTES do papel assentar — decidir a visibilidade ali deixava o grupo
    // escondido para o mestre para sempre (bug reportado em 2026-07-11).
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());
    await page.waitForFunction(() => {
      const group = document.getElementById("mesaGridGroup");
      return group && group.hidden === false;
    });
  });

  test("jogador nunca ve o grupo Grade", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);
    await waitForMesaSettled(page);
    const hidden = await page.evaluate(() => document.getElementById("mesaGridGroup").hidden);
    expect(hidden).toBe(true);
  });
});

test.describe("Token em NxN celulas (Etapa 42c)", () => {
  test("tamanho quantiza para 1x1 / 2x2 e o quadrado alinha na grade", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(() => {
      window.updateMesaGrid({ enabled: true, snap: true, cellFrac: 0.1, offsetXFrac: 0, offsetYFrac: 0 });
      const stage = document.getElementById("mesaStageInner");
      const cellPx = 0.1 * stage.offsetWidth;
      const token = state.tokens.find(t => t.id === "ana");
      const el = document.querySelector('#mesaStage [data-token-id="ana"]');
      const base = el.offsetWidth;

      // Medidas por LAYOUT (token.x + tokenScale x offsetWidth): o transform
      // do token tem transicao CSS, entao o rect lido no mesmo frame ainda
      // reflete a escala ANTIGA — nao serve para medir o resultado.
      const measure = () => {
        const diam = (token.tokenScale * base) / stage.offsetWidth;
        const center = token.x / 100 + diam / 2;
        return { diam, rem: ((center / 0.1) % 1 + 1) % 1 };
      };

      // Escala "quebrada" perto de 1 celula -> deve virar exatamente 1x1
      token.tokenScale = 0.8 * (cellPx / base);
      token.x = 23.7; token.y = 31.2;
      window.mesaConformTokenToGrid(token, el);
      const scale1 = token.tokenScale;
      const m1 = measure(); // N impar: centro da celula (rem 0.5)

      // Escala perto de 2 celulas -> 2x2, centro numa INTERSECAO (rem 0)
      token.tokenScale = 1.7 * (cellPx / base);
      window.mesaConformTokenToGrid(token, el);
      const scale2 = token.tokenScale;
      const m2 = measure();

      return {
        cellScale: cellPx / base,
        scale1, rem1: m1.rem,
        scale2, rem2: m2.rem,
        diam1: m1.diam,  // ~0.1 (1 celula)
        diam2: m2.diam   // ~0.2 (2 celulas)
      };
    });

    // 1x1: diametro = 1 celula (10% do palco), centro no meio da celula
    expect(Math.abs(result.scale1 - result.cellScale)).toBeLessThan(0.02);
    expect(Math.abs(result.diam1 - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(result.rem1 - 0.5)).toBeLessThan(0.05);

    // 2x2: diametro = 2 celulas, centro numa intersecao de linhas
    expect(Math.abs(result.scale2 - 2 * result.cellScale)).toBeLessThan(0.03);
    expect(Math.abs(result.diam2 - 0.2)).toBeLessThan(0.01);
    expect(Math.min(result.rem2, 1 - result.rem2)).toBeLessThan(0.05);
  });

  test("mudar o tamanho da celula re-conforma todos os tokens (mestre)", async ({ page }) => {
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(() => {
      const stage = document.getElementById("mesaStageInner");
      window.updateMesaGrid({ enabled: true, snap: true, cellFrac: 0.08, offsetXFrac: 0, offsetYFrac: 0 });
      const cellPx = 0.08 * stage.offsetWidth;
      const el = document.querySelector('#mesaStage [data-token-id="ana"]');
      const base = el.offsetWidth;
      const expected = cellPx / base;
      const scales = state.tokens.map(t => t.tokenScale);
      return { expected, scales };
    });

    // Todos os tokens (88px ~ 1 celula com 12-13 colunas) uniformizados em 1x1
    for (const s of result.scales) {
      expect(Math.abs(s - result.expected)).toBeLessThan(0.02);
    }
  });
});

test.describe("Ping no mapa (Etapa 43)", () => {
  test("DO rules: mesa:ping e retransmitido e NAO e master-only (jogador pinga)", async () => {
    const { PING_TYPE, MASTER_ONLY_TYPES, RELAY_TYPES } =
      await import("../cloudflare/src/mesa-realtime-rules.js");
    expect(PING_TYPE).toBe("mesa:ping");
    expect(RELAY_TYPES.has(PING_TYPE)).toBe(true);
    expect(MASTER_ONLY_TYPES.has(PING_TYPE)).toBe(false);
  });

  test("Alt+clique emite mesa:ping, mostra pulso local e nada persiste", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    // Captura a emissao realtime sem backend real
    const versionBefore = await page.evaluate(() => {
      window.__pingsSent = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__pingsSent.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      return state.sceneVersion || 0;
    });

    // Alt+clique no centro do palco (handler em fase de captura no wrap)
    await page.locator("#mesaStageWrap").click({ modifiers: ["Alt"] });

    const result = await page.evaluate(() => {
      const sent = (window.__pingsSent || []).filter(m => String(m?.type) === "mesa:ping");
      const pulse = document.querySelector(".mesa-ping");
      return {
        sent,
        pulseCount: document.querySelectorAll(".mesa-ping").length,
        isSelf: Boolean(pulse?.classList.contains("is-self")),
        versionAfter: state.sceneVersion || 0,
        sceneHasPing: JSON.stringify(createMesaScenePayloadFromState()).includes("ping")
      };
    });

    expect(result.sent.length).toBe(1);
    // Sem mapa ativo o ping viaja em fracao do palco (clique no centro ~0.5)
    expect(result.sent[0].space).toBe("stage");
    expect(Math.abs(result.sent[0].u - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(result.sent[0].v - 0.5)).toBeLessThan(0.1);
    expect(result.pulseCount).toBe(1);
    expect(result.isSelf).toBe(true);
    // Canal efemero: nada muda na cena nem na versao
    expect(result.versionAfter).toBe(versionBefore);
    expect(result.sceneHasPing).toBe(false);

    // Pulso expira sozinho (~2s)
    await page.waitForFunction(
      () => document.querySelectorAll(".mesa-ping").length === 0,
      null,
      { timeout: 3500 }
    );
  });

  test("jogador: recebe mesa:ping remoto com o nome do autor", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);

    const result = await page.evaluate(async () => {
      await applyMesaRealtimeDelta({
        type: "mesa:ping",
        clientId: "cliente-remoto",
        u: 0.4,
        v: 0.6,
        space: "stage",
        actor: { username: "ana", role: "player" }
      });
      const pulse = document.querySelector(".mesa-ping");
      return {
        count: document.querySelectorAll(".mesa-ping").length,
        left: pulse?.style.left || "",
        top: pulse?.style.top || "",
        isSelf: Boolean(pulse?.classList.contains("is-self")),
        name: pulse?.querySelector(".mesa-ping-name")?.textContent || ""
      };
    });

    expect(result.count).toBe(1);
    expect(result.left).toBe("40%");
    expect(result.top).toBe("60%");
    expect(result.isSelf).toBe(false);
    expect(result.name).toBe("ana");
  });
});

test.describe("Regua de medicao (Etapa 44)", () => {
  test("DO rules: mesa:ruler e retransmitido e NAO e master-only (jogador mede)", async () => {
    const { RULER_TYPE, MASTER_ONLY_TYPES, RELAY_TYPES } =
      await import("../cloudflare/src/mesa-realtime-rules.js");
    expect(RULER_TYPE).toBe("mesa:ruler");
    expect(RELAY_TYPES.has(RULER_TYPE)).toBe(true);
    expect(MASTER_ONLY_TYPES.has(RULER_TYPE)).toBe(false);
  });

  test("medida em celulas/metros usa a celula da grade (1 celula = 1,5m)", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(() => {
      window.updateMesaGrid({ enabled: true, cellFrac: 0.1, offsetXFrac: 0, offsetYFrac: 0 });
      // Sem mapa: superficie = palco. 0.4 da largura / celula de 0.1 = 4 celulas.
      const horizontal = window.measureMesaRuler(0.2, 0.3, 0.6, 0.3);
      // Diagonal em px de layout (celula quadrada em px)
      const stage = document.getElementById("mesaStageInner");
      const cellPx = 0.1 * stage.offsetWidth;
      const dx = 0.3 * stage.offsetWidth;
      const dy = 0.2 * stage.offsetHeight;
      const expectedDiag = Math.hypot(dx, dy) / cellPx;
      const diagonal = window.measureMesaRuler(0.1, 0.1, 0.4, 0.3);
      return { horizontal, diagonal, expectedDiag };
    });

    expect(Math.abs(result.horizontal.cells - 4)).toBeLessThan(0.01);
    expect(Math.abs(result.horizontal.meters - 6)).toBeLessThan(0.01);
    expect(Math.abs(result.diagonal.cells - result.expectedDiag)).toBeLessThan(0.01);
  });

  test("Shift+arrastar mostra a regua, transmite mesa:ruler e encerra com active:false", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    await page.evaluate(() => {
      window.__rulerSent = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__rulerSent.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
    });

    const wrap = page.locator("#mesaStageWrap");
    const box = await wrap.boundingBox();
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let step = 1; step <= 5; step++) {
      await page.mouse.move(
        box.x + box.width * (0.25 + step * 0.06),
        box.y + box.height * 0.5
      );
      await page.waitForTimeout(60);
    }

    const during = await page.evaluate(() => ({
      rulers: document.querySelectorAll("#mesaRulerOverlay .mesa-ruler.is-self").length,
      label: document.querySelector(".mesa-ruler-label")?.textContent || "",
      sentActive: (window.__rulerSent || []).filter(m => m.type === "mesa:ruler" && m.active).length,
      dragStarted: Boolean(state.drag)
    }));

    await page.mouse.up();
    await page.keyboard.up("Shift");

    const after = await page.evaluate(() => ({
      rulers: document.querySelectorAll("#mesaRulerOverlay .mesa-ruler").length,
      sentEnd: (window.__rulerSent || []).filter(m => m.type === "mesa:ruler" && m.active === false).length,
      sceneHasRuler: JSON.stringify(createMesaScenePayloadFromState()).includes("ruler")
    }));

    expect(during.rulers).toBe(1);                    // regua propria visivel
    expect(during.label).toMatch(/cél · .+ m/);       // rotulo "N,N cél · N,N m"
    expect(during.sentActive).toBeGreaterThan(0);     // transmitiu durante o arrasto
    expect(during.dragStarted).toBe(false);           // nao virou drag/pan/rubber-band
    expect(after.rulers).toBe(0);                     // sumiu ao soltar
    expect(after.sentEnd).toBeGreaterThan(0);         // avisou o fim (active:false)
    expect(after.sceneHasRuler).toBe(false);          // nada persiste na cena
  });

  test("jogador: regua remota aparece com nome do autor e some no active:false", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);

    const shown = await page.evaluate(async () => {
      await applyMesaRealtimeDelta({
        type: "mesa:ruler",
        clientId: "cliente-remoto",
        active: true,
        u1: 0.2, v1: 0.3, u2: 0.5, v2: 0.3,
        space: "stage",
        actor: { username: "mestre", role: "master" }
      });
      const ruler = document.querySelector("#mesaRulerOverlay .mesa-ruler");
      return {
        count: document.querySelectorAll("#mesaRulerOverlay .mesa-ruler").length,
        isSelf: Boolean(ruler?.classList.contains("is-self")),
        name: ruler?.querySelector(".mesa-ruler-name")?.textContent || "",
        label: ruler?.querySelector(".mesa-ruler-label")?.textContent || ""
      };
    });

    const removed = await page.evaluate(async () => {
      await applyMesaRealtimeDelta({
        type: "mesa:ruler",
        clientId: "cliente-remoto",
        active: false,
        actor: { username: "mestre", role: "master" }
      });
      return document.querySelectorAll("#mesaRulerOverlay .mesa-ruler").length;
    });

    expect(shown.count).toBe(1);
    expect(shown.isSelf).toBe(false);
    expect(shown.name).toBe("mestre");
    expect(shown.label).toMatch(/cél · .+ m/);
    expect(removed).toBe(0);
  });
});

test.describe("Dados na Mesa (Etapa 45)", () => {
  test("DO rules: formula validada, rolagem com RNG injetado, tipos fora do relay", async () => {
    const { DICE_REQUEST_TYPE, DICE_RESULT_TYPE, MAX_DICE_HISTORY, RELAY_TYPES, parseMesaDiceFormula, rollMesaDice } =
      await import("../cloudflare/src/mesa-realtime-rules.js");

    expect(DICE_REQUEST_TYPE).toBe("mesa:dice:request");
    expect(DICE_RESULT_TYPE).toBe("mesa:dice:result");
    expect(MAX_DICE_HISTORY).toBe(20);
    // Nenhum dos dois passa pelo relay generico: request tem handler proprio
    // e result so nasce no DO — cliente nao consegue forjar resultado.
    expect(RELAY_TYPES.has(DICE_REQUEST_TYPE)).toBe(false);
    expect(RELAY_TYPES.has(DICE_RESULT_TYPE)).toBe(false);

    // Gramatica: NdM (+/- K), tolerante a espacos/maiusculas
    expect(parseMesaDiceFormula("2d20+3")).toEqual({ count: 2, sides: 20, modifier: 3, formula: "2d20+3" });
    expect(parseMesaDiceFormula("d6")).toEqual({ count: 1, sides: 6, modifier: 0, formula: "1d6" });
    expect(parseMesaDiceFormula(" 20 D 100 - 99 ")).toEqual({ count: 20, sides: 100, modifier: -99, formula: "20d100-99" });
    expect(parseMesaDiceFormula("0d6")).toBeNull();      // count < 1
    expect(parseMesaDiceFormula("21d6")).toBeNull();     // count > 20
    expect(parseMesaDiceFormula("3d7")).toBeNull();      // lado fora da whitelist
    expect(parseMesaDiceFormula("2d20+100")).toBeNull(); // mod > 99
    expect(parseMesaDiceFormula("abc")).toBeNull();
    expect(parseMesaDiceFormula("")).toBeNull();

    // Rolagem deterministica com RNG injetado (o DO injeta a versao crypto)
    const spec = parseMesaDiceFormula("3d6+2");
    const maxed = rollMesaDice(spec, sides => sides);
    expect(maxed.rolls).toEqual([6, 6, 6]);
    expect(maxed.total).toBe(20);
    const floored = rollMesaDice(spec, () => 1);
    expect(floored.rolls).toEqual([1, 1, 1]);
    expect(floored.total).toBe(5);
  });

  test("painel: sem backend rola local com crypto e registra no historico", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    await page.click("#mesaDiceBtn");
    await page.fill("#mesaDiceQty", "2");
    await page.fill("#mesaDiceMod", "3");
    await page.click('.mesa-dice-die[data-die="20"]');

    const result = await page.evaluate(() => {
      const history = window.getMesaDiceHistory();
      const entryEl = document.querySelector("#mesaDiceHistory .mesa-dice-entry");
      return {
        panelOpen: !document.getElementById("mesaDicePanel").hidden,
        history,
        who: entryEl?.querySelector(".mesa-dice-who")?.textContent || "",
        total: entryEl?.querySelector(".mesa-dice-total")?.textContent || ""
      };
    });

    expect(result.panelOpen).toBe(true);
    expect(result.history.length).toBe(1);
    const entry = result.history[0];
    expect(entry.formula).toBe("2d20+3");
    expect(entry.local).toBe(true);
    expect(entry.rolls.length).toBe(2);
    entry.rolls.forEach(roll => {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    });
    expect(entry.total).toBe(entry.rolls[0] + entry.rolls[1] + 3);
    expect(result.who).toContain("(local)");
    expect(Number(result.total)).toBe(entry.total);
  });

  test("com backend: pedido vai como mesa:dice:request e o resultado do DO rende a entrada", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(async () => {
      window.__diceSent = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__diceSent.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });

      // Pedido: NAO gera entrada local (quem rola e o DO)
      window.requestMesaDiceRoll("2d6+1");
      const afterRequest = window.getMesaDiceHistory().length;

      // Resultado oficial vindo do DO (broadcast para todos, sem clientId)
      await applyMesaRealtimeDelta({
        type: "mesa:dice:result",
        id: "do-roll-1",
        formula: "2d6+1",
        rolls: [4, 6],
        modifier: 1,
        total: 11,
        actor: { username: "ana", role: "player" },
        sentAt: new Date().toISOString()
      });
      // Dedupe por id: o mesmo resultado nao entra duas vezes
      await applyMesaRealtimeDelta({
        type: "mesa:dice:result",
        id: "do-roll-1",
        formula: "2d6+1",
        rolls: [4, 6],
        modifier: 1,
        total: 11,
        actor: { username: "ana", role: "player" }
      });

      return {
        sent: window.__diceSent.filter(m => m.type === "mesa:dice:request"),
        afterRequest,
        history: window.getMesaDiceHistory(),
        badge: document.getElementById("mesaDiceBtn").classList.contains("has-new")
      };
    });

    expect(result.sent.length).toBe(1);
    expect(result.sent[0].formula).toBe("2d6+1");
    expect(result.afterRequest).toBe(0);          // cliente nao inventa numero
    expect(result.history.length).toBe(1);        // dedupe por id segurou a copia
    expect(result.history[0].total).toBe(11);
    expect(result.history[0].actor.username).toBe("ana");
    expect(result.badge).toBe(true);              // painel fechado -> badge
  });

  test("historico do mesa:ready substitui a lista e respeita o cap de 20", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);

    const result = await page.evaluate(() => {
      // 25 entradas (mais recente primeiro, como o DO guarda) -> mantem 20
      const fromDo = Array.from({ length: 25 }, (_, i) => ({
        id: "h-" + i,
        formula: "1d20",
        rolls: [((i * 7) % 20) + 1],
        modifier: 0,
        total: ((i * 7) % 20) + 1,
        actor: { username: i % 2 ? "ana" : "mestre", role: i % 2 ? "player" : "master" },
        sentAt: new Date().toISOString()
      }));
      window.setMesaDiceHistory(fromDo);
      const history = window.getMesaDiceHistory();
      return {
        count: history.length,
        firstId: history[0]?.id,
        rendered: document.querySelectorAll("#mesaDiceHistory .mesa-dice-entry").length
      };
    });

    expect(result.count).toBe(20);
    expect(result.firstId).toBe("h-0");   // mais recente continua no topo
    expect(result.rendered).toBe(20);
  });
});

test.describe("Marcadores de status nos tokens (Etapa 46)", () => {
  test("Worker: normalizeMesaScene filtra whitelist, dedupe e cap de 8", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");

    const scene = normalizeMesaScene({
      tokens: [{
        id: "ana",
        characterKey: "ana",
        x: 10, y: 10,
        statusMarkers: [
          "VENENO", "veneno", "hackeado", "sangramento", "queimando", "congelado",
          "atordoado", "derrubado", "amaldicoado", "abencoado", "medo"
        ]
      }]
    });

    const markers = scene.tokens[0].statusMarkers;
    expect(markers[0]).toBe("veneno");            // case-insensitive
    expect(markers).not.toContain("hackeado");    // fora da whitelist
    expect(new Set(markers).size).toBe(markers.length); // sem duplicata
    expect(markers.length).toBe(8);               // cap de 8 (9 validos enviados)

    const legacy = normalizeMesaScene({ tokens: [{ id: "ana", characterKey: "ana", x: 1, y: 1 }] });
    expect(legacy.tokens[0].statusMarkers).toEqual([]); // cena antiga sem o campo
  });

  test("mestre: toggle no inspetor renderiza o chip, transmite upsert e entra na assinatura", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    await page.evaluate(() => {
      window.__markerSent = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__markerSent.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      selectToken("ana");
    });
    // Etapa 64: a grade duplicada do inspetor virou um botao que abre o
    // painel de marcadores (o mesmo do token).
    await page.click('.mesa-token-markers-btn.is-inspector');
    await page.waitForSelector('#mesaMarkerPanel .marker-icon[data-marker-key="veneno"]');
    await page.click('#mesaMarkerPanel .marker-icon[data-marker-key="veneno"]');
    await page.click('#mesaMarkerPanel .marker-icon[data-marker-key="queimando"]');
    // O render do palco e agendado via rAF — espera o segundo chip pintar.
    await page.waitForSelector('[data-token-id="ana"] .mesa-token-marker[data-marker="queimando"]');

    const result = await page.evaluate(() => {
      const token = state.tokens.find(t => t.id === "ana");
      const chips = [...document.querySelectorAll('[data-token-id="ana"] .mesa-token-marker')]
        .map(el => el.dataset.marker);
      const upserts = window.__markerSent.filter(m => m.type === "mesa:token:upsert");
      const signature = normalizeMesaScenePayload(createMesaScenePayloadFromState());
      return {
        markers: token.statusMarkers,
        chips,
        upsertMarkers: upserts.length ? upserts[upserts.length - 1].token.statusMarkers : null,
        signatureMarkers: signature.tokens[0].statusMarkers,
        activeButtons: document.querySelectorAll("#mesaMarkerPanel .marker-icon.is-active").length
      };
    });

    expect(result.markers).toEqual(["veneno", "queimando"]);
    expect(result.chips).toEqual(["veneno", "queimando"]);       // chips no token
    expect(result.upsertMarkers).toEqual(["veneno", "queimando"]); // broadcast
    expect(result.signatureMarkers).toEqual(["veneno", "queimando"]); // assinatura (dedupe)
    expect(result.activeButtons).toBe(2);
  });

  test("cap de 8 no cliente: o nono marcador nao entra", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());

    const result = await page.evaluate(() => {
      const token = state.tokens.find(t => t.id === "ana");
      const all = MESA_STATUS_MARKERS.map(m => m.key);
      const applied = all.map(key => toggleMesaTokenStatusMarker(token, key));
      return { markers: token.statusMarkers, applied, invalid: toggleMesaTokenStatusMarker(token, "hackeado") };
    });

    expect(result.markers.length).toBe(8);
    expect(result.applied.slice(0, 8).every(Boolean)).toBe(true);
    expect(result.applied.slice(8).some(Boolean)).toBe(false); // 9-12 recusados
    expect(result.invalid).toBe(false);                        // fora da whitelist
  });

  test("jogador: upsert remoto com marcadores renderiza os chips", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof state !== "undefined" && state.session != null);

    const result = await page.evaluate(async () => {
      const token = state.tokens.find(t => t.id === "ana");
      await applyMesaRealtimeDelta({
        type: "mesa:token:upsert",
        clientId: "cliente-do-mestre",
        sceneVersion: 99,
        actor: { username: "mestre", role: "master" },
        token: { ...token, statusMarkers: ["morto", "amaldicoado", "invalido"] }
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        markers: state.tokens.find(t => t.id === "ana").statusMarkers,
        chips: [...document.querySelectorAll('[data-token-id="ana"] .mesa-token-marker')].map(el => el.dataset.marker)
      };
    });

    expect(result.markers).toEqual(["morto", "amaldicoado"]); // whitelist aplicada
    expect(result.chips).toEqual(["morto", "amaldicoado"]);
  });
});

test.describe("Painel de marcadores no token (Etapa 64)", () => {
  async function abrirPainelDoToken(page) {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);
    await page.waitForFunction(() => typeof isMaster === "function" && isMaster());
    await page.evaluate(() => selectToken("ana"));
    // Botao no proprio token selecionado (nao o do inspetor).
    await page.click('[data-token-id="ana"] .mesa-token-markers-btn');
    await page.waitForSelector("#mesaMarkerPanel .marker-icon");
  }

  test("'Limpar tudo' remove todos os marcadores e transmite a mudanca", async ({ page }) => {
    await abrirPainelDoToken(page);
    await page.evaluate(() => {
      window.__cleared = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__cleared.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
    });

    await page.click('#mesaMarkerPanel .marker-icon[data-marker-key="congelado"]');
    await page.click('#mesaMarkerPanel .marker-icon[data-marker-key="veneno"]');
    await page.waitForSelector('[data-token-id="ana"] .mesa-token-marker[data-marker="veneno"]');

    await page.click("#mesaMarkerPanel .marker-clear-btn");
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-token-id="ana"] .mesa-token-marker').length === 0);

    const depois = await page.evaluate(() => {
      const upserts = window.__cleared.filter(m => m.type === "mesa:token:upsert");
      return {
        markers: state.tokens.find(t => t.id === "ana").statusMarkers,
        ultimoUpsert: upserts.length ? upserts[upserts.length - 1].token.statusMarkers : null,
        botaoDesabilitado: document.querySelector("#mesaMarkerPanel .marker-clear-btn").disabled
      };
    });
    expect(depois.markers).toEqual([]);
    expect(depois.ultimoUpsert).toEqual([]);   // o esvaziamento viaja pela rede
    expect(depois.botaoDesabilitado).toBe(true);
  });

  test("Esc fecha o painel e alcas/botao nao capturam clique fora da selecao", async ({ page }) => {
    await abrirPainelDoToken(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#mesaMarkerPanel")).toBeHidden();

    // Token NAO selecionado: a caixa e invisivel, logo nada nela pode receber
    // clique (senao viram alvos fantasma em volta do token).
    const eventos = await page.evaluate(() => {
      const token = document.querySelector('[data-token-id="ana"]');
      token.classList.remove("is-selected");
      const alca = token.querySelector(".mesa-token-handle");
      const botao = token.querySelector(".mesa-token-markers-btn");
      return {
        alca: getComputedStyle(alca).pointerEvents,
        botao: getComputedStyle(botao).pointerEvents
      };
    });
    expect(eventos.alca).toBe("none");
    expect(eventos.botao).toBe("none");
  });
});

test.describe("Fog of War (Etapa 47)", () => {
  test("Worker: normalizeMesaScene normaliza a nevoa (whitelist de ops, clamps, cap 400)", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");

    const on = normalizeMesaScene({
      tokens: [],
      fog: {
        enabled: true,
        ops: [
          { mode: "reveal", u: 0.5, v: 0.5, r: 0.1 },
          { mode: "hide", u: 5, v: -9, r: 99 },          // clamps
          { mode: "explodir", u: 0.1, v: 0.1, r: 0.1 },  // mode invalido -> fora
          { mode: "reveal", u: "x", v: 0.1, r: 0.1 },    // coord invalida -> fora
          "lixo"
        ]
      }
    });
    expect(on.fog.enabled).toBe(true);
    expect(on.fog.ops.length).toBe(2);
    expect(on.fog.ops[0]).toEqual({ mode: "reveal", u: 0.5, v: 0.5, r: 0.1 });
    expect(on.fog.ops[1]).toEqual({ mode: "hide", u: 2, v: -1, r: 1 }); // clamp -1..2 / 0.005..1

    const many = normalizeMesaScene({
      tokens: [],
      fog: { enabled: true, ops: Array.from({ length: 450 }, () => ({ mode: "reveal", u: 0.5, v: 0.5, r: 0.05 })) }
    });
    expect(many.fog.ops.length).toBe(400);               // cap

    const off = normalizeMesaScene({ tokens: [], fog: { enabled: false, ops: [] } });
    expect(off.fog).toBeNull();                          // desligada sem ops
    const legacy = normalizeMesaScene({ tokens: [] });
    expect(legacy.fog).toBeNull();                       // cena antiga
  });

  test("DO rules: mesa:fog:update e master-only e retransmitido", async () => {
    const { FOG_UPDATE_TYPE, MASTER_ONLY_TYPES, RELAY_TYPES } =
      await import("../cloudflare/src/mesa-realtime-rules.js");
    expect(FOG_UPDATE_TYPE).toBe("mesa:fog:update");
    expect(MASTER_ONLY_TYPES.has(FOG_UPDATE_TYPE)).toBe(true);
    expect(RELAY_TYPES.has(FOG_UPDATE_TYPE)).toBe(true);
  });

  test("mestre: ativar cobre o palco (40% CSS), pincel revela e tudo entra na cena", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    // Liga a nevoa e pinta um reveal via pincel REAL (arrasto no palco)
    await page.evaluate(() => {
      window.__fogSent = [];
      window.APP = Object.assign({}, window.APP, {
        sendRealtime: message => { window.__fogSent.push(message); return true; }
      });
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      window.updateMesaFog({ enabled: true });
      window.setMesaFogBrush("reveal");
    });

    const wrap = page.locator("#mesaStageWrap");
    const box = await wrap.boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      // Ponto revelado (meio do arrasto) vs canto coberto
      const midX = Math.floor(canvas.width * 0.4);
      const midY = Math.floor(canvas.height * 0.5);
      const revealed = ctx.getImageData(midX, midY, 1, 1).data[3];
      const corner = ctx.getImageData(Math.floor(canvas.width * 0.05), Math.floor(canvas.height * 0.05), 1, 1).data[3];
      const fogState = window.getMesaFogState();
      const payload = createMesaScenePayloadFromState();
      const signature = normalizeMesaScenePayload(payload);
      return {
        cssOpacity: canvas.style.opacity,
        revealed,
        corner,
        opsCount: fogState.ops.length,
        stateDrag: Boolean(state.drag),
        payloadFog: payload.fog?.enabled,
        signatureOps: signature.fog?.ops.length,
        sentFog: (window.__fogSent || []).filter(m => m.type === "mesa:fog:update").length
      };
    });

    expect(result.cssOpacity).toBe("0.4");            // mestre enxerga atraves
    expect(result.corner).toBe(255);                  // canto segue coberto (opaco no canvas)
    expect(result.revealed).toBe(0);                  // area pincelada 100% revelada
    expect(result.opsCount).toBeGreaterThan(0);
    expect(result.stateDrag).toBe(false);             // pincel nao vira drag de token
    expect(result.payloadFog).toBe(true);             // nevoa na cena oficial
    expect(result.signatureOps).toBe(result.opsCount); // e na assinatura (dedupe)
    expect(result.sentFog).toBeGreaterThan(0);        // transmitiu ao vivo
  });

  test("jogador: nao altera a nevoa, recebe o estado do mestre e ve 100% opaco", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      // Tentativa direta do jogador: no-op (updateMesaFog e master-only)
      window.updateMesaFog({ enabled: true });
      const blocked = window.getMesaFogState();

      // Delta autoritativo vindo do mestre via DO
      await applyMesaRealtimeDelta({
        type: "mesa:fog:update",
        clientId: "cliente-do-mestre",
        fog: { enabled: true, ops: [{ mode: "reveal", u: 0.5, v: 0.5, r: 0.2 }] }
      });
      const applied = window.getMesaFogState();

      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      const center = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
      const corner = ctx.getImageData(Math.floor(canvas.width * 0.03), Math.floor(canvas.height * 0.03), 1, 1).data[3];
      return { blocked, applied, cssOpacity: canvas.style.opacity, center, corner };
    });

    expect(result.blocked.enabled).toBe(false);
    expect(result.applied.enabled).toBe(true);
    expect(result.applied.ops.length).toBe(1);
    expect(result.cssOpacity).toBe("1");   // jogador nao enxerga sob a nevoa
    expect(result.center).toBe(0);         // area revelada pelo mestre
    expect(result.corner).toBe(255);       // resto coberto
  });
});

test.describe("Multiplas cenas — backend (Etapa 48)", () => {
  // Mini-D1 em memoria: cobre exatamente as queries usadas por mesa.js
  // (upsert 6/4 colunas, select por id, listagem sem meta, delete, batch).
  function createFakeDb() {
    const rows = new Map();
    function makeStatement(sql) {
      return {
        bind(...values) {
          return {
            sql, values,
            async first() {
              const row = rows.get(values[0]);
              return row ? { ...row } : null;
            },
            async run() { applyWrite(sql, values); return { success: true }; },
            async all() { throw new Error("all() apos bind nao usado"); }
          };
        },
        async all() {
          if (!/not like 'meta%'/.test(sql)) throw new Error("all() inesperado: " + sql);
          const results = [...rows.values()]
            .filter(row => !String(row.id).startsWith("meta"))
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
          return { results: results.map(row => ({ id: row.id, updated_at: row.updated_at })) };
        }
      };
    }
    function applyWrite(sql, values) {
      if (/^\s*delete/i.test(sql)) { rows.delete(values[0]); return; }
      if (/insert into mesa_scenes/i.test(sql)) {
        const [id, dataJson] = values;
        const createdAt = values.length >= 6 ? values[4] : values[2];
        const updatedAt = values.length >= 6 ? values[5] : values[3];
        const existing = rows.get(id);
        rows.set(id, {
          id,
          data_json: dataJson,
          created_at: existing?.created_at || createdAt,
          updated_at: updatedAt,
          updated_by_user_id: values.length >= 6 ? values[3] : (existing?.updated_by_user_id || null)
        });
        return;
      }
      throw new Error("write inesperado: " + sql);
    }
    return {
      prepare: sql => makeStatement(sql),
      async batch(statements) { statements.forEach(st => applyWrite(st.sql, st.values)); return []; }
    };
  }

  const MASTER = { role: "master", sub: "u1", username: "mestre" };
  const PLAYER = { role: "player", sub: "u2", username: "ana" };

  async function expectHttpError(promise, status) {
    try {
      await promise;
      throw new Error("esperava erro " + status);
    } catch (error) {
      expect(error?.status).toBe(status); // jsonError lanca Response
    }
  }

  test("fluxo completo: criar, listar, ativar; jogador sempre ve a cena ativa", async () => {
    const mesa = await import("../cloudflare/src/mesa.js");
    const env = { DB: createFakeDb() };

    // Estado inicial: so a default (virtual), ativa
    const initial = await mesa.listMesaScenes(env, MASTER);
    expect(initial.activeId).toBe("default");
    expect(initial.scenes).toEqual([
      { id: "default", name: "Cena principal", updatedAt: null, active: true }
    ]);

    // Salva algo na default e cria a segunda cena
    await mesa.saveMesaScene(env, MASTER, { tokens: [{ id: "ana", characterKey: "ana", x: 10, y: 10 }] });
    const created = await mesa.createMesaScene(env, MASTER, { name: "  Caverna   Sombria  " });
    expect(created.name).toBe("Caverna Sombria");

    const list = await mesa.listMesaScenes(env, MASTER);
    expect(list.scenes.length).toBe(2);
    expect(list.scenes.find(s => s.id === created.id)?.active).toBe(false);

    // Jogador ve a ativa (default, com o token); ?id= de jogador e ignorado
    const playerScene = await mesa.getMesaScene(env, PLAYER, created.id);
    expect(playerScene.id).toBe("default");
    expect(playerScene.data.tokens.length).toBe(1);

    // Ativa a caverna: jogador passa a ver a cena vazia nova
    const activation = await mesa.activateMesaScene(env, MASTER, created.id);
    expect(activation.activeId).toBe(created.id);
    expect(activation.name).toBe("Caverna Sombria");
    const playerAfter = await mesa.getMesaScene(env, PLAYER);
    expect(playerAfter.id).toBe(created.id);
    expect(playerAfter.data.tokens.length).toBe(0);

    // Mestre ainda acessa a default por ?id= (active: false — sem broadcast)
    const masterOld = await mesa.getMesaScene(env, MASTER, "default");
    expect(masterOld.id).toBe("default");
    expect(masterOld.active).toBe(false);
    expect(masterOld.data.tokens.length).toBe(1);
  });

  test("salvar cena em preparo (?id=) nao mexe na cena ativa dos jogadores", async () => {
    const mesa = await import("../cloudflare/src/mesa.js");
    const env = { DB: createFakeDb() };
    const created = await mesa.createMesaScene(env, MASTER, { name: "Preparo" });

    const saved = await mesa.saveMesaScene(
      env, MASTER,
      { tokens: [{ id: "vigia", characterKey: "vigia", x: 50, y: 50 }] },
      created.id
    );
    expect(saved.id).toBe(created.id);
    expect(saved.active).toBe(false); // index.js NAO transmite este PUT

    const playerScene = await mesa.getMesaScene(env, PLAYER);
    expect(playerScene.id).toBe("default");
    expect(playerScene.data.tokens.length).toBe(0);
  });

  test("guardas: master-only, delete da ativa/principal, ativar inexistente, cap de cenas", async () => {
    const mesa = await import("../cloudflare/src/mesa.js");
    const env = { DB: createFakeDb() };
    const created = await mesa.createMesaScene(env, MASTER, { name: "B" });

    await expectHttpError(mesa.listMesaScenes(env, PLAYER), 403);
    await expectHttpError(mesa.createMesaScene(env, PLAYER, { name: "x" }), 403);
    await expectHttpError(mesa.activateMesaScene(env, PLAYER, created.id), 403);
    await expectHttpError(mesa.deleteMesaScene(env, MASTER, "default"), 400);   // principal
    await expectHttpError(mesa.activateMesaScene(env, MASTER, "snaoexiste0"), 404);
    await mesa.activateMesaScene(env, MASTER, created.id);
    await expectHttpError(mesa.deleteMesaScene(env, MASTER, created.id), 400);  // ativa

    // Volta pra default, dai a exclusao passa e some da lista
    await mesa.activateMesaScene(env, MASTER, "default");
    await mesa.deleteMesaScene(env, MASTER, created.id);
    const list = await mesa.listMesaScenes(env, MASTER);
    expect(list.scenes.some(s => s.id === created.id)).toBe(false);
  });

  test("rename normaliza o nome e ids invalidos sao rejeitados", async () => {
    const mesa = await import("../cloudflare/src/mesa.js");
    const env = { DB: createFakeDb() };
    const created = await mesa.createMesaScene(env, MASTER, { name: "A" });

    const renamed = await mesa.renameMesaScene(env, MASTER, created.id, { name: "  Torre   do   Fim " });
    expect(renamed.name).toBe("Torre do Fim");
    const list = await mesa.listMesaScenes(env, MASTER);
    expect(list.scenes.find(s => s.id === created.id)?.name).toBe("Torre do Fim");

    await expectHttpError(mesa.renameMesaScene(env, MASTER, "meta:mesa", { name: "x" }), 400);
    await expectHttpError(mesa.renameMesaScene(env, MASTER, "ID COM ESPACO", { name: "x" }), 400);
  });
});

test.describe("Multiplas cenas — frontend (Etapa 49)", () => {
  test("mestre: grupo Cenas lista, destaca a ativa e Ativar chama a API", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    await page.evaluate(async () => {
      window.__sceneCalls = [];
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      window.APP = Object.assign({}, window.APP, {
        getMesaScenes: async () => ({
          activeId: "default",
          scenes: [
            { id: "default", name: "Cena principal", updatedAt: null, active: true },
            { id: "scaverna01", name: "Caverna Sombria", updatedAt: null, active: false }
          ]
        }),
        activateMesaScene: async id => { window.__sceneCalls.push(["activate", id]); return { activeId: id }; }
      });
      await window.refreshMesaScenesUI();
    });

    const ui = await page.evaluate(() => ({
      groupVisible: !document.getElementById("mesaScenesGroup").hidden,
      rows: [...document.querySelectorAll(".mesa-scene-row")].map(row => ({
        name: row.querySelector(".mesa-scene-name").textContent,
        active: row.classList.contains("is-active"),
        hasActivate: Boolean(row.querySelector('[data-scene-action="activate"]')),
        hasDelete: Boolean(row.querySelector('[data-scene-action="delete"]'))
      }))
    }));

    expect(ui.groupVisible).toBe(true);
    expect(ui.rows.length).toBe(2);
    expect(ui.rows[0]).toEqual({ name: "Cena principal", active: true, hasActivate: false, hasDelete: false });
    expect(ui.rows[1]).toEqual({ name: "Caverna Sombria", active: false, hasActivate: true, hasDelete: true });

    // O painel do mapa pode estar recolhido (elemento fora de vista): dispara
    // o click direto — o handler e delegation no grupo, nao depende de layout.
    await page.evaluate(() => {
      document.querySelector('[data-scene-action="activate"][data-scene-id="scaverna01"]').click();
    });
    await page.waitForFunction(() => (window.__sceneCalls || []).length > 0);
    const calls = await page.evaluate(() => window.__sceneCalls);
    expect(calls).toContainEqual(["activate", "scaverna01"]);
  });

  test("jogador: grupo Cenas nunca aparece", async ({ page }) => {
    await seedPlayerWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const hidden = await page.evaluate(async () => {
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      await window.refreshMesaScenesUI();
      return document.getElementById("mesaScenesGroup").hidden;
    });
    expect(hidden).toBe(true);
  });

  test("mesa:scene:switch recarrega a cena ativa e o snapshot local vira por-cena", async ({ page }) => {
    await seedMasterWithScene(page, [ANA_TOKEN]);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(async () => {
      const legacyBefore = localStorage.getItem("tc_virtual_mesa_mock_v1");
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      window.APP = Object.assign({}, window.APP, {
        // GET da cena ativa NOVA (id/name vieram na Etapa 48)
        getMesaScene: async () => ({
          id: "scaverna01",
          name: "Caverna Sombria",
          active: true,
          data: {
            sceneVersion: 5,
            selectedTokenId: "",
            tokens: [{
              id: "vigia", characterKey: "vigia", type: "monster", name: "Vigia Sombrio",
              x: 40, y: 40, visibleToPlayers: true, layer: "tokens", order: 1, tokenScale: 1,
              currentLife: 20, maxLife: 20, currentIntegrity: 0, maxIntegrity: 0
            }]
          },
          updatedAt: "2026-07-27T00:00:00Z"
        })
      });

      await handleMesaSceneSwitch({ sceneId: "scaverna01", sceneName: "Caverna Sombria" });

      return {
        sceneId: state.sceneId,
        sceneName: state.sceneName,
        storageKey: mesaSceneStorageKey(),
        tokens: state.tokens.map(t => t.id),
        sceneVersion: state.sceneVersion,
        suffixedSaved: Boolean(localStorage.getItem("tc_virtual_mesa_mock_v1_scaverna01")),
        legacyIntact: localStorage.getItem("tc_virtual_mesa_mock_v1") === legacyBefore
      };
    });

    expect(result.sceneId).toBe("scaverna01");
    expect(result.sceneName).toBe("Caverna Sombria");
    expect(result.storageKey).toBe("tc_virtual_mesa_mock_v1_scaverna01");
    expect(result.tokens).toEqual(["vigia"]);       // cena trocou de verdade
    expect(result.sceneVersion).toBe(5);            // linha do tempo da cena nova
    expect(result.suffixedSaved).toBe(true);        // snapshot local por-cena
    expect(result.legacyIntact).toBe(true);         // cena default preservada (zero migracao)
  });
});

/* ============================================================
 * Etapa 50 — Auditoria multi-frente + performance
 *
 * O achado da auditoria: mesa:drawings:update carregava o ESTADO
 * COMPLETO com coordenadas cruas (0.02145922746781116). Medido:
 * 5 tracos a lapis = 13,4KB; o cap do DO e 32KB por mensagem, ou
 * seja ~12 tracos e o backend passava a RECUSAR — e ninguem
 * escutava mesa:scene:ack, entao a sincronia morria em silencio.
 *
 * Correcoes: coordenada arredondada na captura (mesmas 4 casas do
 * Worker), ralo de pontos, caps iguais aos do Worker, broadcast por
 * DELTA (add de um traco / remove por id) e ack visivel.
 * ============================================================ */
test.describe("Auditoria multi-frente + performance (Etapa 50)", () => {
  test("DO rules: add/remove de desenho sao relay e sanitizam camada dm, id e cap", async () => {
    const {
      RELAY_TYPES,
      MASTER_ONLY_TYPES,
      MAX_RELAY_DRAWINGS,
      sanitizeRelayDrawingIds,
      sanitizeRelayDrawingStroke
    } = await import("../cloudflare/src/mesa-realtime-rules.js");

    // Qualquer participante desenha (como o full-state ja era): relay, nao master-only.
    expect(RELAY_TYPES.has("mesa:drawings:add")).toBe(true);
    expect(RELAY_TYPES.has("mesa:drawings:remove")).toBe(true);
    expect(MASTER_ONLY_TYPES.has("mesa:drawings:add")).toBe(false);
    expect(MASTER_ONLY_TYPES.has("mesa:drawings:remove")).toBe(false);

    // add: traco secreto, sem id ou nao-objeto sao recusados
    expect(sanitizeRelayDrawingStroke({ id: "s1", layer: "dm" })).toBeNull();
    expect(sanitizeRelayDrawingStroke({ id: "  ", layer: "tokens" })).toBeNull();
    expect(sanitizeRelayDrawingStroke("nao-objeto")).toBeNull();
    expect(sanitizeRelayDrawingStroke([{ id: "s1" }])).toBeNull();
    const ok = sanitizeRelayDrawingStroke({ id: " s1 ", layer: "tokens", tool: "pencil" });
    expect(ok.id).toBe("s1");
    expect(ok.tool).toBe("pencil");

    // remove: lista de ids, vazios caem fora, cap igual ao do full-state
    expect(sanitizeRelayDrawingIds("nao-array")).toBeNull();
    expect(sanitizeRelayDrawingIds([" ", ""])).toBeNull();
    expect(sanitizeRelayDrawingIds([" a ", "", "b"])).toEqual(["a", "b"]);
    const muitos = Array.from({ length: MAX_RELAY_DRAWINGS + 50 }, (_, i) => `id${i}`);
    expect(sanitizeRelayDrawingIds(muitos).length).toBe(MAX_RELAY_DRAWINGS);
  });

  test("traco novo viaja sozinho e cabe no cap de 32KB (o full-state nao cabia)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };

      // Quadro ja pesado: 40 tracos de 200 pontos. Antes, QUALQUER traco novo
      // reenviava tudo isso e estourava o cap.
      const pesados = [];
      for (let s = 0; s < 40; s += 1) {
        const points = [];
        for (let p = 0; p < 200; p += 1) points.push([Math.round(p / 2) / 100, Math.round(s / 2) / 100]);
        pesados.push({ id: `pes${s}`, tool: "pencil", color: "#e84040", width: 3, layer: "tokens",
          x1: 0, y1: 0, x2: 1, y2: 1, points });
      }
      _strokes = pesados;
      const fullStateBytes = JSON.stringify({ drawings: _strokes }).length;

      // Traco novo pelo caminho real de commit
      const novo = { id: "novo1", tool: "pencil", color: "#e84040", width: 3, layer: "tokens",
        x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2, points: [[0.1, 0.1], [0.2, 0.2]] };
      _strokes.push(novo);
      _commitStrokeAdd(novo);

      const add = calls.find(c => c.type === "mesa:drawings:add");
      return {
        fullStateBytes,
        tipos: calls.map(c => c.type),
        addBytes: JSON.stringify(add?.payload || {}).length,
        addStrokeId: add?.payload?.stroke?.id
      };
    });

    expect(result.fullStateBytes).toBeGreaterThan(32 * 1024);  // o quadro NAO cabe inteiro
    expect(result.tipos).toContain("mesa:drawings:add");
    expect(result.tipos).not.toContain("mesa:drawings:update"); // nao reenvia o estado todo
    expect(result.addStrokeId).toBe("novo1");
    expect(result.addBytes).toBeLessThan(8 * 1024);             // o delta cabe folgado
  });

  test("borracha e desfazer mandam so os ids; traco secreto nunca sai pela rede", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };
      _strokes = [
        { id: "a", tool: "line", layer: "tokens", x1: 0, y1: 0, x2: 1, y2: 1, points: null },
        { id: "segredo", tool: "line", layer: "dm", x1: 0, y1: 0, x2: 1, y2: 1, points: null },
        { id: "b", tool: "line", layer: "tokens", x1: 0, y1: 0, x2: 1, y2: 1, points: null }
      ];
      deleteDrawingsById(["a", "b"]);
      const removeCall = calls.find(c => c.type === "mesa:drawings:remove");

      // Traco secreto: some da tela do mestre, mas nao vira mensagem de rede
      calls.length = 0;
      deleteDrawingsById(["segredo"]);
      return {
        ids: removeCall?.payload?.ids,
        payloadRemove: JSON.stringify(removeCall?.payload || {}),
        restantes: _strokes.map(s => s.id),
        tiposAposSegredo: calls.map(c => c.type)
      };
    });

    expect(result.ids).toEqual(["a", "b"]);
    expect(result.payloadRemove).not.toContain("points");   // so ids, sem geometria
    expect(result.restantes).toEqual([]);
    expect(result.tiposAposSegredo).not.toContain("mesa:drawings:remove");
  });

  test("coordenadas sao arredondadas na captura e add remoto e idempotente", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      // Captura: nenhuma coordenada pode ter mais de 4 casas (o Worker salva 4;
      // mandar 17 so inflava o payload em ~2,5x).
      const p = _toPercent(123.456789, 77.7777);
      const casas = valor => (String(valor).split(".")[1] || "").length;

      // Idempotencia do add remoto: reenvio/duplicata nao desenha duas vezes
      _strokes = [];
      const stroke = { id: "r1", tool: "line", layer: "tokens", x1: 0, y1: 0, x2: 1, y2: 1, points: null };
      applyMesaDrawingAddFromRemote(stroke);
      applyMesaDrawingAddFromRemote(stroke);
      const aposDuplicata = _strokes.length;

      // Traco secreto vindo da rede e ignorado (ninguem injeta na camada dm)
      applyMesaDrawingAddFromRemote({ id: "x", layer: "dm" });
      const aposDm = _strokes.length;

      // Remocao remota nao apaga traco secreto do mestre
      _strokes.push({ id: "meu-segredo", layer: "dm" });
      applyMesaDrawingRemoveFromRemote(["r1", "meu-segredo"]);

      return {
        casasX: casas(p.px), casasY: casas(p.py),
        aposDuplicata, aposDm,
        finais: _strokes.map(s => s.id)
      };
    });

    expect(result.casasX).toBeLessThanOrEqual(4);
    expect(result.casasY).toBeLessThanOrEqual(4);
    expect(result.aposDuplicata).toBe(1);
    expect(result.aposDm).toBe(1);
    expect(result.finais).toEqual(["meu-segredo"]);
  });

  test("recusa do backend vira aviso na tela (antes sumia em silencio)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const toasts = [];
      window.UI = window.UI || {};
      window.UI.toast = message => { toasts.push(String(message)); };

      window.APP.__testEmit("mesa:scene:ack", { ok: false, reason: "Mensagem excede o limite de tamanho do realtime." });
      const aposRecusa = toasts.length;
      // Rajada: garganta de 4s evita chuva de toasts
      window.APP.__testEmit("mesa:scene:ack", { ok: false, reason: "Outra recusa." });
      const aposRajada = toasts.length;
      // Sucesso nao avisa nada
      window.APP.__testEmit("mesa:scene:ack", { ok: true });
      return { aposRecusa, aposRajada, total: toasts.length, primeiro: toasts[0] };
    });

    expect(result.aposRecusa).toBe(1);
    expect(result.aposRajada).toBe(1);
    expect(result.total).toBe(1);
    expect(result.primeiro).toContain("limite de tamanho");
  });

  test("full-state acima do teto nao e enviado (o DO recusaria em silencio)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };

      // Quadro pequeno: reenvio a quem entra depois continua acontecendo
      _strokes = [{ id: "s1", tool: "line", layer: "tokens", x1: 0, y1: 0, x2: 1, y2: 1, points: null }];
      _broadcastDrawings();
      const pequeno = calls.filter(c => c.type === "mesa:drawings:update").length;

      // Quadro gigante: pular o envio e melhor que ser recusado sem aviso —
      // quem entra recebe os tracos pelo GET /mesa/scene de qualquer forma.
      calls.length = 0;
      const pesados = [];
      for (let s = 0; s < 60; s += 1) {
        const points = [];
        for (let p = 0; p < 200; p += 1) points.push([Math.round(p / 2) / 100, Math.round(s / 2) / 100]);
        pesados.push({ id: `pes${s}`, tool: "pencil", layer: "tokens", x1: 0, y1: 0, x2: 1, y2: 1, points });
      }
      _strokes = pesados;
      _broadcastDrawings();
      const gigante = calls.filter(c => c.type === "mesa:drawings:update").length;

      return { pequeno, gigante };
    });

    expect(result.pequeno).toBe(1);
    expect(result.gigante).toBe(0);
  });
});

/* ============================================================
 * Nevoa: cobrir tudo x revelar tudo (2026-07-28)
 *
 * A nevoa ganhou uma BASE: "hidden" (padrao, tudo coberto — o
 * comportamento de sempre) e "revealed" (tudo descoberto com a
 * nevoa AINDA ativa, entao o pincel "Cobrir" volta a esconder
 * pontos). Cena antiga sem o campo cai em "hidden".
 * ============================================================ */
test.describe("Nevoa: cobrir tudo x revelar tudo (2026-07-28)", () => {
  test("Worker: base normalizada, cena antiga cai em hidden", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");

    // Cena ANTIGA (sem o campo) continua coberta — zero migracao
    const antiga = normalizeMesaScene({ fog: { enabled: true, ops: [] } });
    expect(antiga.fog).toEqual({ enabled: true, base: "hidden", ops: [] });

    // Valor invalido tambem cai em hidden (nunca revela sem o mestre mandar)
    const invalida = normalizeMesaScene({ fog: { enabled: true, base: "qualquer", ops: [] } });
    expect(invalida.fog.base).toBe("hidden");

    // Revelar tudo sobrevive ao round-trip
    const revelada = normalizeMesaScene({ fog: { enabled: true, base: "revealed", ops: [] } });
    expect(revelada.fog).toEqual({ enabled: true, base: "revealed", ops: [] });

    // Desligada, sem ops e na base padrao continua virando null
    expect(normalizeMesaScene({ fog: { enabled: false, ops: [] } }).fog).toBeNull();
    // ...mas base "revealed" e estado, entao NAO pode ser descartado
    expect(normalizeMesaScene({ fog: { enabled: false, base: "revealed", ops: [] } }).fog)
      .toEqual({ enabled: false, base: "revealed", ops: [] });
  });

  test("mestre: os dois botoes trocam a base, entram na cena e sao transmitidos", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const calls = [];
      sendMesaRealtimeDelta = (type, payload) => { calls.push({ type, payload }); return true; };

      // Liga a nevoa: base padrao e coberta
      updateMesaFog({ enabled: true });
      const aoLigar = getMesaFogState().base;

      // Revelar tudo: base vira revealed, a nevoa CONTINUA ativa
      document.getElementById("mesaFogRevealAllBtn").click();
      const revelado = getMesaFogState();
      // Ler o estado dos botoes AGORA: cada mutacao seguinte re-sincroniza a UI
      // e um classList lido no fim ja estaria desatualizado.
      const revealAllBtn = document.getElementById("mesaFogRevealAllBtn");
      const resetBtn = document.getElementById("mesaFogResetBtn");
      const revealAllMarcado = revealAllBtn.classList.contains("is-active");
      const revealAllDesabilitado = revealAllBtn.disabled;
      const resetHabilitadoQuandoRevelado = !resetBtn.disabled;

      // Com o mapa revelado, o pincel "Cobrir" ainda esconde pontos
      updateMesaFog({ ops: [{ mode: "hide", u: 0.5, v: 0.5, r: 0.1 }] });
      const comBuraco = getMesaFogState();

      // Cobrir tudo: volta para hidden e zera as pinceladas
      document.getElementById("mesaFogResetBtn").click();
      const coberto = getMesaFogState();

      return {
        aoLigar,
        reveladoBase: revelado.base,
        reveladoAtivo: revelado.enabled,
        revealAllMarcado,
        revealAllDesabilitado,
        resetHabilitadoQuandoRevelado,
        comBuracoBase: comBuraco.base,
        comBuracoOps: comBuraco.ops.length,
        cobertoBase: coberto.base,
        cobertoOps: coberto.ops.length,
        basesTransmitidas: calls.filter(c => c.type === "mesa:fog:update").map(c => c.payload.fog?.base),
        baseNaCena: createMesaScenePayloadFromState().fog?.base
      };
    });

    expect(result.aoLigar).toBe("hidden");            // ligar a nevoa cobre, como sempre
    expect(result.reveladoBase).toBe("revealed");
    expect(result.reveladoAtivo).toBe(true);          // revelar != desligar a nevoa
    expect(result.revealAllMarcado).toBe(true);       // botao do estado atual fica marcado
    expect(result.revealAllDesabilitado).toBe(true);  // ...e sem clique redundante
    expect(result.resetHabilitadoQuandoRevelado).toBe(true);
    expect(result.comBuracoBase).toBe("revealed");    // pincel Cobrir funciona sobre o revelado
    expect(result.comBuracoOps).toBe(1);
    expect(result.cobertoBase).toBe("hidden");
    expect(result.cobertoOps).toBe(0);                // Cobrir tudo zera as pinceladas
    expect(result.basesTransmitidas).toContain("revealed");
    expect(result.basesTransmitidas).toContain("hidden");
    expect(result.baseNaCena).toBe("hidden");
  });

  test("render: revelar tudo deixa o mapa limpo; cobrir tudo pinta de novo", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      const alphaNoCentro = () => {
        const x = Math.floor(canvas.width / 2);
        const y = Math.floor(canvas.height / 2);
        return ctx.getImageData(x, y, 1, 1).data[3];
      };

      updateMesaFog({ enabled: true, base: "hidden", ops: [] });
      const coberto = alphaNoCentro();

      revealAllMesaFog();
      const revelado = alphaNoCentro();

      // Com a base revelada, uma op de "hide" no centro cobre de novo
      updateMesaFog({ ops: [{ mode: "hide", u: 0.5, v: 0.5, r: 0.5 }] });
      const escondidoDeNovo = alphaNoCentro();

      resetMesaFog();
      const cobertoDeNovo = alphaNoCentro();

      return { coberto, revelado, escondidoDeNovo, cobertoDeNovo };
    });

    expect(result.coberto).toBe(255);           // tudo coberto
    expect(result.revelado).toBe(0);            // tudo descoberto
    expect(result.escondidoDeNovo).toBe(255);   // pincel Cobrir sobre o revelado
    expect(result.cobertoDeNovo).toBe(255);     // Cobrir tudo volta ao inicio
  });

  test("jogador: recebe a base do mestre e nao tem os botoes", async ({ page }) => {
    await installAppEmitHook(page);
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      // Jogador nunca muda a nevoa por conta propria
      revealAllMesaFog();
      const aposTentativa = getMesaFogState().base;

      // ...mas recebe o estado do mestre e renderiza limpo
      setMesaFogFromRemote({ enabled: true, base: "revealed", ops: [] });
      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      const alpha = ctx.getImageData(
        Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1
      ).data[3];

      return {
        aposTentativa,
        baseRemota: getMesaFogState().base,
        alpha,
        grupoEscondido: document.getElementById("mesaFogGroup").hidden,
        opacidade: canvas.style.opacity
      };
    });

    expect(result.aposTentativa).toBe("hidden");   // guarda de papel intacta
    expect(result.baseRemota).toBe("revealed");
    expect(result.alpha).toBe(0);                  // mapa limpo para o jogador
    expect(result.grupoEscondido).toBe(true);
    expect(result.opacidade).toBe("1");            // jogador segue com nevoa opaca
  });
});

/* ============================================================
 * Nevoa: liga/desliga (2026-07-28)
 *
 * BUG encontrado pelo Tiago: nao dava para DESLIGAR a nevoa.
 * O handler do checkbox fazia `if (!toggle.checked) setMesaFogBrush(null)`
 * e so DEPOIS lia `toggle.checked` de novo — mas setMesaFogBrush chama
 * _syncFogSettingsUI, que reescreve `toggle.checked` a partir do estado
 * AINDA ligado. A leitura seguinte via `true` e a nevoa se religava
 * sozinha. Ligar sempre funcionou; desligar, nunca (desde a Etapa 47).
 * Correcao: ler a intencao ANTES de qualquer sync de UI.
 * ============================================================ */
test.describe("Nevoa: liga/desliga (2026-07-28)", () => {
  test("desligar funciona mesmo com o pincel armado (o bug do religa sozinho)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const toggle = document.getElementById("mesaFogToggle");
      const wrap = document.getElementById("mesaStageWrap");

      toggle.click();                     // liga pelo controle REAL
      const aposLigar = getMesaFogState().enabled;

      // Pincel armado e a condicao que disparava o bug — era exatamente o
      // estado do print do Tiago ("Revelar" destacado).
      setMesaFogBrush("reveal");
      const pincelArmado = _fogBrushMode;

      toggle.click();                     // desliga
      return {
        aposLigar,
        pincelArmado,
        enabled: getMesaFogState().enabled,
        checkbox: toggle.checked,
        pincelAposDesligar: _fogBrushMode,
        cursorDePincel: wrap.classList.contains("is-fog-brushing"),
        // Nevoa desligada, sem pinceladas e na base padrao nao ocupa espaco na
        // cena: vira null (mesma regra de antes desta mudanca).
        cenaFog: createMesaScenePayloadFromState().fog
      };
    });

    expect(result.aposLigar).toBe(true);
    expect(result.pincelArmado).toBe("reveal");
    expect(result.enabled).toBe(false);          // <- o bug: ficava true
    expect(result.checkbox).toBe(false);
    expect(result.pincelAposDesligar).toBeNull(); // desligar desarma o pincel
    expect(result.cursorDePincel).toBe(false);
    expect(result.cenaFog).toBeNull();
  });

  test("desligar limpa a tela e preserva as pinceladas; religar restaura", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      const alpha = (fx, fy) => ctx.getImageData(
        Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1
      ).data[3];
      const toggle = document.getElementById("mesaFogToggle");

      toggle.click();
      updateMesaFog({ ops: [{ mode: "reveal", u: 0.5, v: 0.5, r: 0.2 }] });
      const ligada = { centro: alpha(0.5, 0.5), canto: alpha(0.05, 0.05) };

      toggle.click();                     // desliga
      const desligada = { centro: alpha(0.5, 0.5), canto: alpha(0.05, 0.05) };
      const opsPreservadas = getMesaFogState().ops.length;
      const pinceisDesabilitados = document.getElementById("mesaFogRevealBtn").disabled
        && document.getElementById("mesaFogHideBtn").disabled;

      toggle.click();                     // religa
      const religada = { centro: alpha(0.5, 0.5), canto: alpha(0.05, 0.05) };

      return { ligada, desligada, opsPreservadas, pinceisDesabilitados, religada };
    });

    expect(result.ligada).toEqual({ centro: 0, canto: 255 });     // buraco revelado
    expect(result.desligada).toEqual({ centro: 0, canto: 0 });    // tela limpa
    expect(result.opsPreservadas).toBe(1);                        // pinceladas nao se perdem
    expect(result.pinceisDesabilitados).toBe(true);
    expect(result.religada).toEqual({ centro: 0, canto: 255 });   // volta igualzinho
  });

  test("com a nevoa desligada os dois botoes 'tudo' ligam ja no estado escolhido", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const cobrirTudo = document.getElementById("mesaFogResetBtn");
      const revelarTudo = document.getElementById("mesaFogRevealAllBtn");

      // Desligada: os dois clicaveis (sem pegadinha entre eles)
      const desligada = { cobrir: cobrirTudo.disabled, revelar: revelarTudo.disabled };

      revelarTudo.click();
      const aposRevelarTudo = {
        enabled: getMesaFogState().enabled,
        base: getMesaFogState().base,
        revelarDesabilitado: revelarTudo.disabled,   // ja esta nesse estado
        cobrirDesabilitado: cobrirTudo.disabled
      };

      cobrirTudo.click();
      const aposCobrirTudo = {
        enabled: getMesaFogState().enabled,
        base: getMesaFogState().base,
        cobrirDesabilitado: cobrirTudo.disabled,
        revelarDesabilitado: revelarTudo.disabled
      };

      return { desligada, aposRevelarTudo, aposCobrirTudo };
    });

    expect(result.desligada).toEqual({ cobrir: false, revelar: false });
    expect(result.aposRevelarTudo).toEqual({
      enabled: true, base: "revealed", revelarDesabilitado: true, cobrirDesabilitado: false
    });
    expect(result.aposCobrirTudo).toEqual({
      enabled: true, base: "hidden", cobrirDesabilitado: true, revelarDesabilitado: false
    });
  });

  test("jogador recebe o desligamento do mestre e a tela dele limpa", async ({ page }) => {
    await installAppEmitHook(page);
    await seedPlayerWithScene(page, BASE_TOKENS);
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await waitForMesaSettled(page);

    const result = await page.evaluate(() => {
      const canvas = document.getElementById("mesaFogCanvas");
      const ctx = canvas.getContext("2d");
      const canto = () => ctx.getImageData(5, 5, 1, 1).data[3];

      setMesaFogFromRemote({ enabled: true, base: "hidden", ops: [] });
      const coberto = canto();

      setMesaFogFromRemote({ enabled: false, base: "hidden", ops: [] });
      return { coberto, aposDesligar: canto(), enabled: getMesaFogState().enabled };
    });

    expect(result.coberto).toBe(255);
    expect(result.aposDesligar).toBe(0);
    expect(result.enabled).toBe(false);
  });
});

/* ============================================================
 * Palco ajustado ao mapa + resolucao (Etapas 52-55, 2026-07-29)
 * ============================================================ */
test.describe("Palco ajustado ao mapa + resolucao (Etapas 52-55)", () => {

  // Prepara mestre com um mapa "ativo" de dimensoes conhecidas, sem depender
  // de rede: so o que applyStageFitBox/applyMapTransform de fato leem.
  const seedMapaAtivo = (iw, ih) => {
    mesaMapState.isMaster = true;
    window.isMaster = () => true;
    mesaMapState._imgW = iw;
    mesaMapState._imgH = ih;
    mesaMapState.activeMapUrl = "blob:teste";
    mesaMapState.activeMapId = "map-teste";
    mesaMapState.activeMapPublicUrl = "https://exemplo/r2/map-teste.webp";
    document.getElementById("mesaMapLayer").removeAttribute("hidden");
    applyMapTransform();
  };

  test("Worker: fit sobrevive ao round-trip e cena antiga nao muda de comportamento", async () => {
    const { normalizeMesaScene } = await import("../cloudflare/src/mesa.js");
    const url = "https://exemplo.com/mapa.webp";

    expect(normalizeMesaScene({ map: { id: "m1", url, fit: true } }).map.fit).toBe(true);
    expect(normalizeMesaScene({ map: { id: "m1", url, fit: false } }).map.fit).toBe(false);

    // Cena ANTIGA (sem o campo): fit desligado E transform intacto — e a
    // garantia de que nenhuma coordenada ja salva se desloca.
    const antiga = normalizeMesaScene({
      map: { id: "m1", url, transform: { xFrac: 0.02, yFrac: -0.03, scale: 1.8 } }
    }).map;
    expect(antiga.fit).toBe(false);
    expect(antiga.transform).toEqual({ xFrac: 0.02, yFrac: -0.03, scale: 1.8 });

    // Comparacao estrita, nao coercao: string truthy nao liga o fit
    expect(normalizeMesaScene({ map: { id: "m1", url, fit: "sim" } }).map.fit).toBe(false);
    // Sem url nao ha mapa — logo nao ha fit
    expect(normalizeMesaScene({ map: { fit: true } }).map).toBeNull();
  });

  test("fit da ao palco a proporcao exata da imagem, centralizado e sem corte", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate((seedSrc) => {
      eval(`(${seedSrc})`)(4000, 1000);   // proporcao 4:1, o pior caso do "cover"
      const wrap  = document.getElementById("mesaStageWrap");
      const inner = document.getElementById("mesaStageInner");
      const layer = document.getElementById("mesaMapLayer");
      const wrapBox = [wrap.clientWidth, wrap.clientHeight];

      setStageFitToMap(true);
      const ligado = {
        inner:   [inner.clientWidth, inner.clientHeight],
        top:     inner.style.top,
        bgSize:  layer.style.backgroundSize,
        temAttr: wrap.hasAttribute("data-fit-map")
      };
      setStageFitToMap(false);
      const desligado = {
        inner:      [inner.clientWidth, inner.clientHeight],
        leftInline: inner.style.left,
        temAttr:    wrap.hasAttribute("data-fit-map")
      };
      return { wrapBox, ligado, desligado };
    }, seedMapaAtivo.toString());

    const [cw, ch] = r.wrapBox;
    const esperadoH = Math.round(1000 * Math.min(cw / 4000, ch / 1000));

    // Proporcao exata da IMAGEM (4:1), nao a do painel
    expect(r.ligado.inner[1]).toBe(esperadoH);
    expect(r.ligado.inner[0] / r.ligado.inner[1]).toBeCloseTo(4, 2);
    // Centralizado na sobra (letterbox)
    expect(r.ligado.top).toBe(`${Math.round((ch - esperadoH) / 2)}px`);
    // background-size == a caixa: a imagem cabe inteira, ZERO corte
    expect(r.ligado.bgSize).toBe(`${r.ligado.inner[0]}px ${r.ligado.inner[1]}px`);
    expect(r.ligado.temAttr).toBe(true);

    // Desligar devolve o palco ao canvas inteiro e limpa os estilos inline
    expect(r.desligado.inner).toEqual(r.wrapBox);
    expect(r.desligado.leftInline).toBe("");
    expect(r.desligado.temAttr).toBe(false);
  });

  test("com fit, fracao do palco == fracao do mapa (tokens e desenhos alinhados)", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate((seedSrc) => {
      eval(`(${seedSrc})`)(4000, 1000);
      // Mestre havia compensado o corte na mao — o estado que causa o desvio
      mesaMapState.mapTransform = { x: 120, y: -40, scale: 1.8 };
      applyMapTransform();
      const semFit = {
        surface: getMesaMapSurfaceFrac(),
        token:   mesaStageFracToMapFrac(0.25, 0.75)
      };

      setStageFitToMap(true);
      const comFit = {
        surface:       getMesaMapSurfaceFrac(),
        token:         mesaStageFracToMapFrac(0.25, 0.75),
        travado:       isMapTransformLocked(),
        escalaOculta:  document.getElementById("mesaMapScaleGroup").hidden,
        toggleVisivel: !document.getElementById("mesaMapFitGroup").hidden
      };
      // Controles de mapa devem ser inertes enquanto travado
      adjustMapScale(0.5);
      panMap(999, 999);
      comFit.aposMexer = {
        guardado: { ...mesaMapState.mapTransform },
        surface:  getMesaMapSurfaceFrac()
      };

      setStageFitToMap(false);
      return { semFit, comFit, guardadoNoFim: { ...mesaMapState.mapTransform } };
    }, seedMapaAtivo.toString());

    // Sem fit, o token cai num ponto do mapa diferente de onde e desenhado
    expect(r.semFit.token.u).not.toBeCloseTo(0.25, 2);
    expect(r.semFit.surface.width).toBeGreaterThan(1);

    // Com fit a superficie do mapa COINCIDE com o palco: identidade
    expect(r.comFit.surface).toMatchObject({ left: 0, top: 0, width: 1, height: 1, hasMap: true });
    expect(r.comFit.token.u).toBeCloseTo(0.25, 6);
    expect(r.comFit.token.v).toBeCloseTo(0.75, 6);
    expect(r.comFit.travado).toBe(true);
    expect(r.comFit.escalaOculta).toBe(true);
    expect(r.comFit.toggleVisivel).toBe(true);

    // Travado de verdade: pan/escala nao movem nada...
    expect(r.comFit.aposMexer.guardado).toEqual({ x: 120, y: -40, scale: 1.8 });
    expect(r.comFit.aposMexer.surface).toMatchObject({ left: 0, top: 0, width: 1, height: 1 });
    // ...e o transform do mestre sobrevive intacto ao ciclo liga/desliga
    expect(r.guardadoNoFim).toEqual({ x: 120, y: -40, scale: 1.8 });
  });

  test("toggle do mestre grava na cena; jogador recebe e legado nao desliga", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate((seedSrc) => {
      eval(`(${seedSrc})`)(4000, 1000);
      const toggle = document.getElementById("mesaMapFitToggle");
      const out = {};

      toggle.click();                       // clique REAL, passa pelo listener
      out.ligado = { fit: isStageFitToMap(), payload: getMesaSceneMapPayload() };
      toggle.click();
      out.desligado = { fit: isStageFitToMap(), payload: getMesaSceneMapPayload() };

      // Sem mapa o grupo some (nao ha proporcao a que ajustar)
      mesaMapState.activeMapUrl = "";
      renderMesaMapLayer("", "");
      out.semMapaOculto = document.getElementById("mesaMapFitGroup").hidden;

      // â”€â”€ Jogador â”€â”€
      eval(`(${seedSrc})`)(4000, 1000);
      window.isMaster = () => false;
      mesaMapState.isMaster = false;
      setStageFitToMap(false);
      _applyRemoteFit(true);       out.jogadorLiga      = isStageFitToMap();
      _applyRemoteFit(undefined);  out.legadoNaoDesliga = isStageFitToMap();
      _applyRemoteFit(false);      out.jogadorDesliga   = isStageFitToMap();

      // Mestre e a fonte de verdade: ignora fit remoto
      window.isMaster = () => true;
      mesaMapState.isMaster = true;
      setStageFitToMap(true);
      _applyRemoteFit(false);      out.mestreIgnoraRemoto = isStageFitToMap();
      return out;
    }, seedMapaAtivo.toString());

    expect(r.ligado.fit).toBe(true);
    expect(r.ligado.payload.fit).toBe(true);
    // Travado => a cena guarda identidade, nao o pan guardado
    expect(r.ligado.payload.transform).toEqual({ xFrac: 0, yFrac: 0, scale: 1 });
    expect(r.desligado.fit).toBe(false);
    expect(r.desligado.payload.fit).toBe(false);
    expect(r.semMapaOculto).toBe(true);

    expect(r.jogadorLiga).toBe(true);
    // Payload legado (sem o campo) NAO pode apagar o ajuste do mestre
    expect(r.legadoNaoDesliga).toBe(true);
    expect(r.jogadorDesliga).toBe(false);
    expect(r.mestreIgnoraRemoto).toBe(true);
  });

  test("compressao: respeita o cap de 4096, nunca faz upscale e nao re-encoda WebP", async ({ page }) => {
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate(async () => {
      function png(w, h) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d");
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#2b2118"); g.addColorStop(1, "#1a1410");
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          x.fillStyle = `hsl(${(i * 37) % 360} 30% ${18 + (i % 22)}%)`;
          x.fillRect((i * 613) % w, (i * 941) % h, 90, 70);
        }
        return new Promise(res => c.toBlob(res, "image/png"));
      }
      const dims = async b => {
        const bm = await createImageBitmap(b);
        const d = [bm.width, bm.height];
        bm.close();
        return d;
      };

      // Maior que o cap: reduz para 4096 no maior lado, mantendo proporcao
      const grande = await compressToWebP(await png(5000, 2500));
      // Menor que o cap: NAO faz upscale
      const pequeno = await compressToWebP(await png(1200, 800));
      // Ja WebP dentro dos limites: volta a MESMA instancia (zero perda geracional)
      const webp   = await compressToWebP(await png(1600, 1000));
      const denovo = await compressToWebP(webp);

      return {
        grande: await dims(grande), grandeTipo: grande.type,
        pequeno: await dims(pequeno),
        passthrough: denovo === webp, passthroughDim: await dims(denovo)
      };
    });

    expect(r.grande).toEqual([4096, 2048]);   // proporcao 2:1 preservada
    expect(r.grandeTipo).toBe("image/webp");
    expect(r.pequeno).toEqual([1200, 800]);   // sem upscale
    expect(r.passthrough).toBe(true);
    expect(r.passthroughDim).toEqual([1600, 1000]);
  });
});

/* ============================================================
 * Correcoes de uso do fit (Etapa 57, 2026-07-29)
 * Feedback do Tiago: mapa continuava cortado (o toggle estava
 * escondido e desligado por padrao) e a grade "vinha atrasada"
 * ao arrastar o mapa.
 * ============================================================ */
test.describe("Fit: descoberta e fluidez (Etapa 57)", () => {

  const seedMapaAtivo = (iw, ih) => {
    mesaMapState.isMaster = true;
    window.isMaster = () => true;
    mesaMapState._imgW = iw;
    mesaMapState._imgH = ih;
    mesaMapState.activeMapUrl = "blob:teste";
    mesaMapState.activeMapId = "map-teste";
    document.getElementById("mesaMapLayer").removeAttribute("hidden");
    applyMapTransform();
  };

  test("botao da barra alterna o fit e fica em sincronia com o checkbox do painel", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate((seedSrc) => {
      const btn = document.getElementById("mesaMapFitBtn");
      const out = { semMapaOculto: btn.hidden };

      eval(`(${seedSrc})`)(4000, 2400);
      const inner = document.getElementById("mesaStageInner");
      out.comMapa = { visivel: !btn.hidden, texto: btn.textContent.trim(),
                      inner: [inner.clientWidth, inner.clientHeight] };

      btn.click();
      out.ligado = {
        texto:     btn.textContent.trim(),
        ativo:     btn.classList.contains("is-active"),
        pressed:   btn.getAttribute("aria-pressed"),
        inner:     [inner.clientWidth, inner.clientHeight],
        travado:   isMapTransformLocked(),
        checkbox:  document.getElementById("mesaMapFitToggle").checked
      };

      btn.click();
      out.desligado = { texto: btn.textContent.trim(), ativo: btn.classList.contains("is-active"),
                        checkbox: document.getElementById("mesaMapFitToggle").checked };
      return out;
    }, seedMapaAtivo.toString());

    expect(r.semMapaOculto).toBe(true);          // sem mapa nao ha o que ajustar
    expect(r.comMapa.visivel).toBe(true);
    expect(r.comMapa.texto).toBe("Ajustar");

    // Proporcao 4000x2400 = 5/3 aplicada a caixa
    expect(r.ligado.inner[0] / r.ligado.inner[1]).toBeCloseTo(4000 / 2400, 2);
    expect(r.ligado.texto).toBe("Ajustado");
    expect(r.ligado.ativo).toBe(true);
    expect(r.ligado.pressed).toBe("true");
    expect(r.ligado.travado).toBe(true);
    // Os dois controles mexem no MESMO estado
    expect(r.ligado.checkbox).toBe(true);

    expect(r.desligado.texto).toBe("Ajustar");
    expect(r.desligado.ativo).toBe(false);
    expect(r.desligado.checkbox).toBe(false);
  });

  test("mapa novo escolhido pelo mestre ja nasce ajustado", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate((seedSrc) => {
      eval(`(${seedSrc})`)(4000, 1000);
      setStageFitToMap(false);            // estado de quem acabou de abrir a Mesa
      const antes = isStageFitToMap();

      _fitDefaultForNewMap();             // o que roda ao escolher um mapa
      const depois = isStageFitToMap();
      // Ler a UI AGORA: o bloco do jogador abaixo re-sincroniza os controles,
      // e um classList lido no return refletiria AQUELE estado, nao este.
      const botaoAtivo = document.getElementById("mesaMapFitBtn").classList.contains("is-active");

      // Jogador NAO decide o proprio fit — quem manda e o mestre
      window.isMaster = () => false;
      mesaMapState.isMaster = false;
      setStageFitToMap(false);
      _fitDefaultForNewMap();
      const jogador = isStageFitToMap();

      return { antes, depois, botaoAtivo, jogador };
    }, seedMapaAtivo.toString());

    expect(r.antes).toBe(false);
    expect(r.depois).toBe(true);        // mapa novo nasce ajustado
    expect(r.botaoAtivo).toBe(true);    // e a barra reflete isso
    expect(r.jogador).toBe(false);      // jogador nao liga sozinho
  });

  test("arrastar o mapa coalesce o redesenho de grade e nevoa em um por frame", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate(async (seedSrc) => {
      eval(`(${seedSrc})`)(4000, 2400);
      setStageFitToMap(false);          // destravado, para panMap valer

      let grade = 0, nevoa = 0;
      const origG = window.renderMesaGrid, origF = window.renderMesaFog;
      window.renderMesaGrid = () => { grade++; };
      window.renderMesaFog  = () => { nevoa++; };

      const frame = () => new Promise(res => requestAnimationFrame(res));
      await frame(); await frame();
      grade = 0; nevoa = 0;

      // Simula um arrasto: 60 mousemove dentro do mesmo frame
      for (let k = 0; k < 60; k++) panMap(1, 1);
      const durante = { grade, nevoa };

      await frame(); await frame();
      const apos = { grade, nevoa };

      window.renderMesaGrid = origG;
      window.renderMesaFog  = origF;
      return { durante, apos };
    }, seedMapaAtivo.toString());

    // Antes da Etapa 57 eram 60 redesenhos sincronos — a causa do atraso
    expect(r.durante.grade).toBe(0);
    expect(r.durante.nevoa).toBe(0);
    // ...e o redesenho NAO se perde: acontece uma vez quando o frame chega
    expect(r.apos.grade).toBe(1);
    expect(r.apos.nevoa).toBe(1);
  });
});

/* ============================================================
 * Nitidez no zoom (Etapa 58, 2026-07-29)
 * Feedback do Tiago: a 300% a grade e o mapa saem borrados.
 * Causa: canvas com buffer fixo em offsetWidth x dpr (o
 * compositor estica o bitmap) e will-change permanente no
 * inner (camada rasterizada uma vez na escala base).
 * ============================================================ */
test.describe("Nitidez no zoom (Etapa 58)", () => {

  test("os canvas do palco rasterizam na escala EXIBIDA, nao na escala base", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate(async () => {
      const frame = () => new Promise(res => requestAnimationFrame(res));
      const inner = document.getElementById("mesaStageInner");
      const grid  = document.getElementById("mesaGridCanvas");
      const fog   = document.getElementById("mesaFogCanvas");
      const draw  = document.getElementById("mesaDrawCanvas");
      const dpr   = window.devicePixelRatio || 1;

      // A grade precisa estar ligada para o render valer alguma coisa
      updateMesaGrid({ enabled: true });

      setStageZoom(1);
      rescaleStageCanvases();
      await frame(); await frame();
      const cssW = inner.offsetWidth;
      const em100 = { grid: grid.width, fog: fog.width, draw: draw.width };

      setStageZoom(3);
      rescaleStageCanvases();
      await frame(); await frame();
      const em300 = { grid: grid.width, fog: fog.width, draw: draw.width };

      // Teto de memoria: um zoom absurdo nao pode alocar sem limite
      const escalaNoTeto = getMesaRenderScale(4000, 4000);

      setStageZoom(1);
      rescaleStageCanvases();
      await frame(); await frame();
      const voltou = { grid: grid.width };

      return { dpr, cssW, em100, em300, escalaNoTeto, voltou };
    });

    const base = Math.round(r.cssW * r.dpr);
    // A 100% o buffer e a densidade da tela — comportamento de sempre
    expect(r.em100.grid).toBe(base);
    expect(r.em100.fog).toBe(base);
    expect(r.em100.draw).toBe(base);

    // A 300% o buffer TRIPLICA: e isso que mantem a linha fina nitida.
    // Antes da Etapa 58 ficava em `base` e o compositor esticava 3x.
    expect(r.em300.grid).toBe(Math.round(r.cssW * r.dpr * 3));
    expect(r.em300.fog).toBe(r.em300.grid);
    expect(r.em300.draw).toBe(r.em300.grid);
    expect(r.em300.grid).toBeGreaterThan(r.em100.grid);

    // Teto de 24 MP respeitado (4000x4000 = 16 MP de area base)
    expect(4000 * 4000 * r.escalaNoTeto * r.escalaNoTeto).toBeLessThanOrEqual(24e6 + 1);

    // Voltar o zoom devolve o buffer ao tamanho normal (nao fica inflado)
    expect(r.voltou.grid).toBe(base);
  });

  test("will-change so existe durante o movimento", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const inner = page.locator("#mesaStageInner");

    // Parado: sem a classe -> o navegador re-rasteriza na escala exibida
    await page.evaluate(() => setStageZoom(1));
    await page.waitForFunction(
      () => !document.getElementById("mesaStageInner").classList.contains("is-transforming")
    );
    expect(await inner.evaluate(el => getComputedStyle(el).willChange)).toBe("auto");

    // Durante o movimento: com a classe -> camada promovida, movimento fluido
    await page.evaluate(() => setStageZoom(2));
    expect(await inner.evaluate(el => el.classList.contains("is-transforming"))).toBe(true);
    expect(await inner.evaluate(el => getComputedStyle(el).willChange)).toBe("transform");

    // E some sozinho ao parar
    await page.waitForFunction(
      () => !document.getElementById("mesaStageInner").classList.contains("is-transforming")
    );
    expect(await inner.evaluate(el => getComputedStyle(el).willChange)).toBe("auto");
  });
});

/* ============================================================
 * Grade transbordando o mapa (Etapa 59, 2026-07-29)
 * Regressao introduzida na Etapa 58: ao aumentar o buffer do
 * canvas para ganhar nitidez, o #mesaGridCanvas CRESCEU junto.
 * Canvas e elemento substituido — com width:auto a largura vem
 * do tamanho intrinseco (atributo width=), nao do inset:0.
 * ============================================================ */
test.describe("Grade nao transborda o mapa (Etapa 59)", () => {

  test("todas as camadas do palco ocupam a MESMA caixa, em qualquer zoom", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const r = await page.evaluate(async () => {
      const frame = () => new Promise(res => requestAnimationFrame(res));
      mesaMapState.isMaster = true;
      window.isMaster = () => true;
      mesaMapState._imgW = 2048;
      mesaMapState._imgH = 1400;
      mesaMapState.activeMapUrl = "blob:teste";
      mesaMapState.activeMapId = "m";
      document.getElementById("mesaMapLayer").removeAttribute("hidden");
      updateMesaGrid({ enabled: true });
      setStageFitToMap(true);

      const medir = async (z) => {
        setStageZoom(z);
        rescaleStageCanvases();
        await frame(); await frame();
        const cx = el => {
          const b = document.getElementById(el).getBoundingClientRect();
          return [Math.round(b.width), Math.round(b.height)];
        };
        const grid = document.getElementById("mesaGridCanvas");
        return {
          inner: cx("mesaStageInner"),
          layer: cx("mesaMapLayer"),
          grid:  cx("mesaGridCanvas"),
          fog:   cx("mesaFogCanvas"),
          draw:  cx("mesaDrawCanvas"),
          gridBuffer: [grid.width, grid.height]
        };
      };

      return { z100: await medir(1), z132: await medir(1.32), z300: await medir(3) };
    });

    for (const [nome, m] of Object.entries(r)) {
      // O ponto da etapa: nenhuma camada pode ser maior que o palco. Antes do
      // conserto, a 132% a grade media 1624x1110 contra 1230x841 do mapa.
      expect(m.grid,  `grade fora da caixa em ${nome}`).toEqual(m.inner);
      expect(m.layer, `mapa fora da caixa em ${nome}`).toEqual(m.inner);
      expect(m.fog,   `nevoa fora da caixa em ${nome}`).toEqual(m.inner);
      expect(m.draw,  `desenhos fora da caixa em ${nome}`).toEqual(m.inner);
    }

    // E a nitidez continua valendo: o buffer acompanha os pixels de TELA,
    // entao o desenho sai 1:1 em vez de esticado pelo compositor.
    expect(r.z132.gridBuffer).toEqual(r.z132.inner);
    expect(r.z300.gridBuffer).toEqual(r.z300.inner);
    expect(r.z300.gridBuffer[0]).toBeGreaterThan(r.z100.gridBuffer[0]);
  });
});

/* ============================================================
 * Grade cintilando no zoom (Etapa 60, 2026-07-29)
 *
 * Feedback do Tiago: "o grid fica oscilando quando dou zoom".
 * Segunda regressao da Etapa 58, causa DIFERENTE da Etapa 59:
 * o buffer passou a escalar com o zoom, entao lineWidth (= dpr
 * = densidade x zoom) virou fracionario. O canvas centra o traco
 * na coordenada, e traco fracionario em coordenada fracionaria
 * se espalha por 2-3 px com alpha parcial — divisao diferente em
 * cada linha, e o padrao varre junto com o zoom: cintilacao.
 *
 * O teste afirma o que o olho ve: o BRILHO da grade. Sondar o
 * tamanho do buffer (Etapa 58) ou a caixa (Etapa 59) nao pegava
 * isto — os dois estavam certos enquanto a grade piscava.
 * ============================================================ */
test.describe("Grade nao cintila no zoom (Etapa 60)", () => {

  test("o brilho das linhas nao varia com o zoom", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const medidas = await page.evaluate(async () => {
      const frame = () => new Promise(res => requestAnimationFrame(res));
      mesaMapState.isMaster = true;
      window.isMaster = () => true;
      mesaMapState._imgW = 2048;
      mesaMapState._imgH = 1400;
      mesaMapState.activeMapUrl = "blob:teste";
      mesaMapState.activeMapId = "m";
      document.getElementById("mesaMapLayer").removeAttribute("hidden");
      // Opacidade no maximo do contrato (0.8) para o alvo ser exato: 0.8 x 255.
      updateMesaGrid({ enabled: true, opacity: 0.8, color: "#ffffff" });
      setStageFitToMap(true);

      const canvas = document.getElementById("mesaGridCanvas");
      const ctx = canvas.getContext("2d");
      const out = [];

      // Varredura fina: a cintilacao aparece nos zooms em que lineWidth cai
      // longe de um inteiro (1,2 – 1,4), nao nos extremos redondos.
      for (let zi = 100; zi <= 200; zi += 10) {
        setStageZoom(zi / 100);
        rescaleStageCanvases();
        await frame(); await frame();

        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let acesos = 0, soma = 0, fracos = 0;
        for (let i = 3; i < data.length; i += 4) {
          const a = data[i];
          if (a <= 2) continue;              // fundo transparente
          acesos++;
          soma += a;
          if (a < 184) fracos++;             // < 90% do alpha pedido (204)
        }
        out.push({ z: zi, media: soma / acesos, pctFracos: (100 * fracos) / acesos });
      }
      return out;
    });

    // ALVO = opacidade x 255 = 204. Uma grade bem alinhada acerta o alvo em
    // TODO zoom; a versao com cintilacao media 103 a 100% e 152 a 200% —
    // o brilho varria com o zoom, e era isso que se via oscilando.
    for (const m of medidas) {
      expect(m.media, `alpha medio fora do alvo em z${m.z}`).toBeGreaterThan(200);
      expect(m.pctFracos, `linhas com alpha parcial em z${m.z}`).toBeLessThan(2);
    }

    // E o brilho e ESTAVEL entre zooms: e a variacao, nao o valor absoluto,
    // que o olho le como oscilacao.
    const medias = medidas.map(m => m.media);
    expect(Math.max(...medias) - Math.min(...medias)).toBeLessThan(2);
  });
});

/* ============================================================
 * Grade estavel no zoom (Etapa 61, 2026-07-30)
 * A Etapa 60 alinhou a grade ao pixel usando `dpr` — que JA
 * carrega o zoom de palco (Etapa 58). Resultado: a espessura
 * crescia com o zoom (1 -> 2 -> 3 px de buffer) e a troca de
 * PARIDADE deslocava todas as linhas meio pixel, derrubando a
 * linha da borda: 20 colunas a 100%, 19 a 150%. Era a grade
 * "andando" ao aplicar e tirar o zoom.
 * ============================================================ */
test.describe("Grade mantem a proporcao em qualquer zoom (Etapa 61)", () => {

  test("mesmo numero de linhas e mesmas posicoes relativas ao mapa", async ({ page }) => {
    await installAppEmitHook(page);
    await seedMasterWithScene(page, BASE_TOKENS);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const medidas = await page.evaluate(async () => {
      const frame = () => new Promise(res => requestAnimationFrame(res));
      mesaMapState.isMaster = true;
      window.isMaster = () => true;
      mesaMapState._imgW = 2048;
      mesaMapState._imgH = 1400;
      mesaMapState.activeMapUrl = "blob:teste";
      mesaMapState.activeMapId = "m";
      document.getElementById("mesaMapLayer").removeAttribute("hidden");
      updateMesaGrid({ enabled: true, cellFrac: 0.05, opacity: 0.8, color: "#ffffff" });
      setStageFitToMap(true);

      const canvas = document.getElementById("mesaGridCanvas");
      const ctx = canvas.getContext("2d");
      const out = [];

      for (const z of [1, 1.08, 1.5, 2, 2.5, 3, 1]) {
        setStageZoom(z);
        rescaleStageCanvases();
        await frame(); await frame();

        // Uma fatia horizontal no meio: cada traco vertical vira um "run".
        const linha = ctx.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
        const runs = [];
        let atual = null;
        for (let x = 0; x < canvas.width; x++) {
          if (linha[x * 4 + 3] > 8) { if (!atual) { atual = [x, x]; runs.push(atual); } else atual[1] = x; }
          else atual = null;
        }

        // Centro de cada traco em fracao da SUPERFICIE do mapa: e essa
        // fracao que precisa ser identica em todo zoom.
        const surf = window.getMesaMapSurfaceFrac();
        const cell = window.getMesaGridState().cellFrac;
        const erro = runs.map((r, i) => {
          const meio = (r[0] + r[1] + 1) / 2;
          return Math.abs((meio / canvas.width - surf.left) / surf.width - i * cell) / cell;
        });

        out.push({
          z,
          linhas: runs.length,
          espessuras: runs.map(r => r[1] - r[0] + 1),
          erroMax: erro.length ? Math.max(...erro) : 99,
          maxEspessura: Math.max(1, Math.ceil(window.devicePixelRatio || 1))
        });
      }
      return out;
    });

    const base = medidas[0];
    for (const m of medidas) {
      // Nenhuma linha some nem aparece ao ampliar — era o sintoma visivel.
      expect(m.linhas, `numero de linhas mudou em z${m.z}`).toBe(base.linhas);
      // Cada traco continua na MESMA celula do mapa (tolerancia: 1/10 de celula).
      expect(m.erroMax, `linhas fora do lugar em z${m.z}`).toBeLessThan(0.1);
      // Espessura em px de DISPOSITIVO: nao pode engordar junto com o zoom.
      expect(Math.max(...m.espessuras), `traco engordou em z${m.z}`)
        .toBeLessThanOrEqual(m.maxEspessura);
    }
  });
});
