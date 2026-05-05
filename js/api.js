(function () {
  const DEFAULT_BASE_URL =
    window.ARMAGEDON_CONFIG?.apiBaseUrl || localStorage.getItem("tc_api_base_url") || "http://localhost:4000/api";
  const HEALTH_TIMEOUT_MS = 1800;
  const REALTIME_RECONNECT_DELAY_MS = 1800;
  const REALTIME_ENABLED = window.ARMAGEDON_CONFIG?.realtimeEnabled === true;
  const eventBus = new EventTarget();

  const state = {
    baseUrl: DEFAULT_BASE_URL,
    backendAvailable: false,
    initialized: false,
    token: "",
    initPromise: null,
    socketPromise: null,
    socket: null,
    socketIntent: false,
    reconnectTimer: 0
  };

  function buildUrl(path) {
    return `${state.baseUrl}${path}`;
  }

  function buildRealtimeUrl(path) {
    try {
      const url = new URL(buildUrl(path), window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (state.token) {
        url.searchParams.set("token", state.token);
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  function emitEvent(name, detail = {}) {
    eventBus.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }

    const listener = event => handler(event.detail || {});
    eventBus.addEventListener(eventName, listener);

    return () => {
      eventBus.removeEventListener(eventName, listener);
    };
  }

  function disconnectSocket(options = {}) {
    if (!options.keepIntent) {
      state.socketIntent = false;
    }

    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = 0;
    }

    if (state.socket) {
      const socket = state.socket;
      state.socket = null;
      try {
        socket.close(1000, "client disconnect");
      } catch {}
    }

    state.socketPromise = null;
  }

  function canOpenRealtimeSocket() {
    return Boolean(REALTIME_ENABLED && state.backendAvailable && state.token && window.WebSocket);
  }

  function emitRealtimeMessage(rawMessage) {
    let payload = null;
    try {
      payload = JSON.parse(String(rawMessage || "{}"));
    } catch {
      payload = null;
    }

    const eventName = String(payload?.type || "").trim();
    if (!eventName) return;
    emitEvent(eventName, payload);
  }

  function scheduleSocketReconnect() {
    if (!state.socketIntent || !canOpenRealtimeSocket() || state.reconnectTimer) return;

    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = 0;
      ensureSocket();
    }, REALTIME_RECONNECT_DELAY_MS);
  }

  async function ensureSocket() {
    if (!REALTIME_ENABLED) return null;
    state.socketIntent = true;

    if (!state.backendAvailable || !state.token) return null;

    if (!window.WebSocket) {
      emitEvent("socket:error", { message: "WebSocket indisponivel neste navegador." });
      return null;
    }

    if (
      state.socket
      && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)
    ) {
      return state.socket;
    }

    if (state.socketPromise) return state.socketPromise;

    state.socketPromise = (async () => {
      try {
        const realtimeUrl = buildRealtimeUrl("/mesa/realtime");
        if (!realtimeUrl) return null;

        const socket = new WebSocket(realtimeUrl);
        state.socket = socket;

        socket.addEventListener("open", () => {
          emitEvent("socket:connect", {});
        });

        socket.addEventListener("message", event => {
          emitRealtimeMessage(event.data);
        });

        socket.addEventListener("close", event => {
          if (state.socket === socket) {
            state.socket = null;
          }

          emitEvent("socket:disconnect", {
            code: event.code,
            reason: event.reason || ""
          });
          scheduleSocketReconnect();
        });

        socket.addEventListener("error", () => {
          emitEvent("socket:error", {
            message: "Falha ao conectar ao tempo real da Mesa."
          });
        });

        return socket;
      } catch (error) {
        emitEvent("socket:error", {
          message: error?.message || "Falha ao iniciar a sincronizacao em tempo real."
        });
        scheduleSocketReconnect();
        return null;
      } finally {
        state.socketPromise = null;
      }
    })();

    return state.socketPromise;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = HEALTH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function init() {
    if (state.initPromise) return state.initPromise;

    state.initPromise = (async () => {
      try {
        const response = await fetchWithTimeout(buildUrl("/health"), {
          headers: {
            Accept: "application/json"
          }
        });
        state.backendAvailable = response.ok;
        if (state.backendAvailable && state.token && state.socketIntent) {
          await ensureSocket();
        }
      } catch {
        state.backendAvailable = false;
        disconnectSocket();
      } finally {
        state.initialized = true;
      }

      return state.backendAvailable;
    })();

    return state.initPromise;
  }

  function isEnabled() {
    return state.backendAvailable;
  }

  function setToken(token) {
    state.token = String(token || "");
    if (!state.token) {
      disconnectSocket();
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(buildUrl(path), {
      method: options.method || "GET",
      keepalive: options.keepalive === true,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.auth !== false && state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new Error(payload?.error || "Falha na comunicacao com o servidor.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  window.APP = {
    init,
    isEnabled,
    getBaseUrl() {
      return state.baseUrl;
    },
    setBaseUrl(baseUrl) {
      state.baseUrl = String(baseUrl || "").trim() || DEFAULT_BASE_URL;
      localStorage.setItem("tc_api_base_url", state.baseUrl);
      state.initialized = false;
      state.backendAvailable = false;
      state.initPromise = null;
      disconnectSocket();
    },
    setToken,
    clearToken() {
      state.token = "";
      disconnectSocket();
    },
    connectRealtime: ensureSocket,
    disconnectRealtime: disconnectSocket,
    on,
    async login(username, password) {
      return request("/auth/login", {
        method: "POST",
        auth: false,
        body: { username, password }
      });
    },
    async getSession() {
      return request("/auth/session");
    },
    async getDirectory() {
      return request("/directory");
    },
    async createPlayer(payload) {
      return request("/directory/players", {
        method: "POST",
        body: payload
      });
    },
    async deletePlayer(username) {
      return request(`/directory/players/${encodeURIComponent(username)}`, {
        method: "DELETE"
      });
    },
    async createNpc(payload) {
      return request("/directory/npcs", {
        method: "POST",
        body: payload
      });
    },
    async deleteNpc(id) {
      return request(`/directory/npcs/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    },
    async createMonster(payload) {
      return request("/directory/monsters", {
        method: "POST",
        body: payload
      });
    },
    async deleteMonster(id) {
      return request(`/directory/monsters/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    },
    async getCharacter(key) {
      return request(`/characters/${encodeURIComponent(key)}`);
    },
    async saveCharacter(key, data, options = {}) {
      return request(`/characters/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { data },
        keepalive: options.keepalive === true
      });
    },
    async awardSoulEssence(key, payload) {
      return request(`/characters/${encodeURIComponent(key)}/soul-essence`, {
        method: "POST",
        body: payload
      });
    },
    async getMesaScene() {
      return request("/mesa/scene");
    },
    async saveMesaScene(data, options = {}) {
      return request("/mesa/scene", {
        method: "PUT",
        body: { data },
        keepalive: options.keepalive === true
      });
    },
    async listRules() {
      return request("/rules");
    },
    async createRule(payload) {
      return request("/rules", {
        method: "POST",
        body: payload
      });
    },
    async updateRule(id, payload) {
      return request(`/rules/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: payload
      });
    },
    async deleteRule(id) {
      return request(`/rules/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    },
    async transferItem(payload) {
      return request("/transfers/items/player-to-player", {
        method: "POST",
        body: payload
      });
    },
    async transferOwnedMemory(payload) {
      return request("/transfers/memories/player-to-player", {
        method: "POST",
        body: payload
      });
    },
    async rollMonsterMemory(payload) {
      return request("/transfers/memories/monster-roll", {
        method: "POST",
        body: payload
      });
    },
    async awardMonsterMemory(payload) {
      return request("/transfers/memories/monster-award", {
        method: "POST",
        body: payload
      });
    }
  };
})();
