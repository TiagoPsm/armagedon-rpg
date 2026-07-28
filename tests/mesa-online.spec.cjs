const { test, expect } = require("@playwright/test");

const SITE_BASE_URL = cleanBaseUrl(
  process.env.ARMAGEDON_SITE_URL,
  "https://tiagopsm.github.io/armagedon-rpg"
);
const API_BASE_URL = cleanBaseUrl(
  process.env.ARMAGEDON_API_BASE_URL,
  "https://armagedon-api.tiagopsm2008.workers.dev/api"
);

const MASTER_USERNAME = process.env.ARMAGEDON_MASTER_USERNAME || "";
const MASTER_PASSWORD = process.env.ARMAGEDON_MASTER_PASSWORD || "";
const PLAYER_USERNAME = process.env.ARMAGEDON_PLAYER_USERNAME || "";
const PLAYER_PASSWORD = process.env.ARMAGEDON_PLAYER_PASSWORD || "";
const RUN_RELAY_PROBE = process.env.ARMAGEDON_ONLINE_RELAY_PROBE === "1";

const HAS_ONLINE_CREDENTIALS = Boolean(
  MASTER_USERNAME &&
    MASTER_PASSWORD &&
    PLAYER_USERNAME &&
    PLAYER_PASSWORD
);

function cleanBaseUrl(value, fallback) {
  return String(value || fallback || "").replace(/\/+$/, "");
}

function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function realtimeUrl() {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/mesa/realtime`;
  url.search = "";
  return url.toString();
}

async function login(request, username, password) {
  const response = await request.post(apiUrl("/auth/login"), {
    data: { username, password }
  });
  expect(response.status(), `login failed for ${username}`).toBe(200);
  const payload = await response.json();
  expect(payload.token, `missing token for ${username}`).toBeTruthy();
  expect(payload.user?.username, `missing user for ${username}`).toBeTruthy();
  return payload;
}

async function expectJsonOk(response, label) {
  expect(response.status(), label).toBe(200);
  const payload = await response.json();
  expect(payload).toBeTruthy();
  return payload;
}

test.describe("Mesa online - readiness publico", () => {
  test("Pages e API oficiais respondem", async ({ request }) => {
    const health = await expectJsonOk(await request.get(apiUrl("/health")), "api health");
    expect(health.ok).toBe(true);

    const pages = [
      "index.html",
      "mesa.html",
      "ficha.html",
      "regras.html"
    ];

    for (const pageName of pages) {
      const response = await request.get(`${SITE_BASE_URL}/${pageName}?online-smoke=${Date.now()}`);
      expect(response.status(), `${pageName} should be online`).toBe(200);
    }
  });

  test("endpoints protegidos bloqueiam acesso anonimo", async ({ request }) => {
    const directory = await request.get(apiUrl("/directory"));
    expect(directory.status(), "directory without token").toBe(401);

    const scene = await request.get(apiUrl("/mesa/scene"));
    expect(scene.status(), "scene without token").toBe(401);

    const realtime = await request.get(apiUrl("/mesa/realtime"));
    expect(realtime.status(), "realtime without websocket upgrade").toBe(426);
  });
});

test.describe("Mesa online - fluxo autenticado", () => {
  test.skip(
    !HAS_ONLINE_CREDENTIALS,
    "Defina ARMAGEDON_MASTER_USERNAME/PASSWORD e ARMAGEDON_PLAYER_USERNAME/PASSWORD para validar o fluxo online real."
  );

  test("mestre e jogador acessam API, Mesa e WebSocket oficiais", async ({ browser, page, request }) => {
    const master = await login(request, MASTER_USERNAME, MASTER_PASSWORD);
    const player = await login(request, PLAYER_USERNAME, PLAYER_PASSWORD);

    const directory = await expectJsonOk(
      await request.get(apiUrl("/directory"), {
        headers: { Authorization: `Bearer ${master.token}` }
      }),
      "directory with master token"
    );
    expect(Array.isArray(directory.players), "directory players").toBe(true);
    expect(
      directory.players.some(entry => String(entry.username || "").toLowerCase() === PLAYER_USERNAME.toLowerCase()),
      "configured player should exist in directory"
    ).toBe(true);

    const scene = await expectJsonOk(
      await request.get(apiUrl("/mesa/scene"), {
        headers: { Authorization: `Bearer ${master.token}` }
      }),
      "mesa scene with master token"
    );
    expect(scene.data).toBeTruthy();
    expect(Array.isArray(scene.data.tokens), "scene tokens").toBe(true);

    const websocketResult = await page.evaluate(
      async ({ masterToken, playerToken, wsUrl, relayProbe }) => {
        const messageId = `codex-online-${Date.now()}`;
        // Sonda do delta de desenho da Etapa 50: o traco de teste tem id
        // reconhecivel e e REMOVIDO logo apos o jogador confirmar o recebimento,
        // para nao deixar sujeira na cena caso um cliente do mestre esteja
        // aberto e persista o que chega pelo realtime.
        const probeStrokeId = `smoke-${Date.now()}`;
        const state = {
          masterReady: false,
          playerReady: false,
          masterAck: false,
          playerSawRelay: false,
          playerSawDrawAdd: false,
          playerSawDrawRemove: false,
          masterTypes: [],
          playerTypes: []
        };

        const openSocket = token => new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

        return new Promise((resolve, reject) => {
          const masterSocket = openSocket(masterToken);
          const playerSocket = openSocket(playerToken);
          let relaySent = false;
          let drawSent = false;
          let drawCleaned = false;

          const cleanup = () => {
            try { masterSocket.close(); } catch {}
            try { playerSocket.close(); } catch {}
          };

          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Realtime timeout: ${JSON.stringify(state)}`));
          }, 12000);

          const finishIfReady = () => {
            if (!state.masterReady || !state.playerReady) return;

            if (relayProbe && !relaySent) {
              relaySent = true;
              masterSocket.send(JSON.stringify({
                type: "mesa:token:move",
                tokenId: "codex-online-probe",
                x: 12,
                y: 34,
                order: 77,
                sceneVersion: Date.now(),
                clientId: "codex-online-master",
                messageId
              }));
              return;
            }

            if (relayProbe && (!state.masterAck || !state.playerSawRelay)) return;

            // Segundo passo da sonda: traco novo pelo canal de DELTA (Etapa 50).
            // Antes dessa etapa o desenho ia como estado completo e o DO recusava
            // acima de 32KB; aqui provamos que o add chega ao jogador em producao.
            if (relayProbe && !drawSent) {
              drawSent = true;
              masterSocket.send(JSON.stringify({
                type: "mesa:drawings:add",
                stroke: {
                  id: probeStrokeId, tool: "line", color: "#e84040", width: 3,
                  layer: "tokens", x1: 0.01, y1: 0.01, x2: 0.02, y2: 0.02, points: null
                },
                clientId: "codex-online-master",
                messageId: `${messageId}-draw`
              }));
              return;
            }

            // Limpeza: remove o traco da sonda assim que o jogador confirma.
            if (relayProbe && state.playerSawDrawAdd && !drawCleaned) {
              drawCleaned = true;
              masterSocket.send(JSON.stringify({
                type: "mesa:drawings:remove",
                ids: [probeStrokeId],
                clientId: "codex-online-master",
                messageId: `${messageId}-draw-clean`
              }));
              return;
            }

            if (relayProbe && !state.playerSawDrawRemove) return;

            window.clearTimeout(timeout);
            cleanup();
            resolve(state);
          };

          const handleMessage = (side, event) => {
            let payload = null;
            try {
              payload = JSON.parse(String(event.data || "{}"));
            } catch {
              payload = {};
            }

            const type = String(payload.type || "");
            state[`${side}Types`].push(type);

            if (side === "master" && type === "mesa:ready") state.masterReady = true;
            if (side === "player" && type === "mesa:ready") state.playerReady = true;
            if (side === "master" && type === "mesa:scene:ack" && payload.messageId === messageId) {
              state.masterAck = payload.ok === true;
            }
            if (side === "player" && type === "mesa:token:move" && payload.messageId === messageId) {
              state.playerSawRelay = true;
            }
            if (side === "player" && type === "mesa:drawings:add" && payload.stroke?.id === probeStrokeId) {
              state.playerSawDrawAdd = true;
            }
            if (side === "player" && type === "mesa:drawings:remove"
                && Array.isArray(payload.ids) && payload.ids.includes(probeStrokeId)) {
              state.playerSawDrawRemove = true;
            }

            finishIfReady();
          };

          masterSocket.addEventListener("message", event => handleMessage("master", event));
          playerSocket.addEventListener("message", event => handleMessage("player", event));
          masterSocket.addEventListener("error", () => reject(new Error("master websocket error")));
          playerSocket.addEventListener("error", () => reject(new Error("player websocket error")));
        });
      },
      {
        masterToken: master.token,
        playerToken: player.token,
        wsUrl: realtimeUrl(),
        relayProbe: RUN_RELAY_PROBE
      }
    );

    expect(websocketResult.masterReady).toBe(true);
    expect(websocketResult.playerReady).toBe(true);
    if (RUN_RELAY_PROBE) {
      expect(websocketResult.masterAck).toBe(true);
      expect(websocketResult.playerSawRelay).toBe(true);
      // Delta de desenho da Etapa 50 funcionando de ponta a ponta em producao,
      // e o traco da sonda removido em seguida (sem sujeira na cena).
      expect(websocketResult.playerSawDrawAdd).toBe(true);
      expect(websocketResult.playerSawDrawRemove).toBe(true);
    }

    const masterContext = await browser.newContext();
    await masterContext.addInitScript(({ token, username }) => {
      localStorage.setItem("tc_session_token", token);
      localStorage.setItem("tc_session", JSON.stringify({
        username,
        role: "master",
        token,
        backend: true
      }));
    }, { token: master.token, username: master.user.username });
    const masterPage = await masterContext.newPage();
    const consoleErrors = [];
    masterPage.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await masterPage.goto(`${SITE_BASE_URL}/mesa.html?online-ui=${Date.now()}`);
    // O boot da Mesa e assincrono: esperar a flag em vez de um seletor solto
    // (mesma licao dos testes locais — sem isso o smoke le a pagina pela metade).
    await masterPage.waitForFunction(
      () => typeof state !== "undefined" && state.bootCompleted === true,
      { timeout: 20000 }
    );
    await expect(masterPage.locator("#mesaStageWrap")).toBeVisible({ timeout: 15000 });
    await expect(masterPage.locator("#rosterList")).toBeVisible({ timeout: 15000 });
    await expect(masterPage.locator("#rosterSearchField")).toBeVisible({ timeout: 15000 });
    // Ferramentas do mestre construidas nas Etapas 42-49 precisam estar na tela
    // publicada — se um bundle sair incompleto, e aqui que aparece.
    const ferramentasDoMestre = await masterPage.evaluate(() => ({
      grade: !document.getElementById("mesaGridGroup")?.hidden,
      nevoa: !document.getElementById("mesaFogGroup")?.hidden,
      cenas: !document.getElementById("mesaScenesGroup")?.hidden,
      dados: Boolean(document.getElementById("mesaDicePanel")),
      nevoaCanvas: Boolean(document.getElementById("mesaFogCanvas")),
      desenhoCanvas: Boolean(document.getElementById("mesaDrawCanvas"))
    }));
    expect(ferramentasDoMestre).toEqual({
      grade: true, nevoa: true, cenas: true,
      dados: true, nevoaCanvas: true, desenhoCanvas: true
    });
    expect(consoleErrors).toEqual([]);
    await masterContext.close();

    const playerContext = await browser.newContext();
    await playerContext.addInitScript(({ token, username }) => {
      localStorage.setItem("tc_session_token", token);
      localStorage.setItem("tc_session", JSON.stringify({
        username,
        role: "player",
        token,
        backend: true
      }));
    }, { token: player.token, username: player.user.username });
    const playerPage = await playerContext.newPage();
    const playerConsoleErrors = [];
    playerPage.on("console", message => {
      if (message.type() === "error") playerConsoleErrors.push(message.text());
    });
    await playerPage.goto(`${SITE_BASE_URL}/mesa.html?online-player-ui=${Date.now()}`);
    await playerPage.waitForFunction(
      () => typeof state !== "undefined" && state.bootCompleted === true,
      { timeout: 20000 }
    );
    await expect(playerPage.locator("#mesaStageWrap")).toBeVisible({ timeout: 15000 });
    await expect(playerPage.locator(".player-side-panel")).toBeVisible({ timeout: 15000 });
    await expect(playerPage.locator("#rosterSearchField")).toBeHidden({ timeout: 15000 });
    await expect(playerPage.locator("[data-roster-action]")).toHaveCount(0);
    // Nada de mestre pode vazar para o jogador na tela publicada.
    const vazamentoNoJogador = await playerPage.evaluate(() => ({
      grade: !document.getElementById("mesaGridGroup")?.hidden,
      nevoa: !document.getElementById("mesaFogGroup")?.hidden,
      cenas: !document.getElementById("mesaScenesGroup")?.hidden,
      tokensSecretos: document.querySelectorAll("#mesaStage .mesa-token.is-layer-dm").length
    }));
    expect(vazamentoNoJogador).toEqual({
      grade: false, nevoa: false, cenas: false, tokensSecretos: 0
    });
    expect(playerConsoleErrors).toEqual([]);
    await playerContext.close();
  });
});
