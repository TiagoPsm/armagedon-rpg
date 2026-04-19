(function () {
  const DEFAULT_BASE_URL =
    window.ARMAGEDON_CONFIG?.apiBaseUrl || localStorage.getItem("tc_api_base_url") || "http://localhost:4000/api";
  const HEALTH_TIMEOUT_MS = 1800;
  const REALTIME_EVENTS = [
    "directory:changed",
    "sheet:changed",
    "rules:changed",
    "inventory:changed",
    "memory:changed"
  ];
  const eventBus = new EventTarget();

  const state = {
    baseUrl: DEFAULT_BASE_URL,
    backendAvailable: false,
    initialized: false,
    token: "",
    initPromise: null,
    scriptPromise: null,
    socketPromise: null,
    socket: null
  };

  function buildUrl(path) {
    return `${state.baseUrl}${path}`;
  }

  function getBaseOrigin() {
    try {
      return new URL(state.baseUrl).origin;
    } catch {
      return "http://localhost:4000";
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

  function disconnectSocket() {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    state.socketPromise = null;
  }

  async function loadSocketIoScript() {
    if (window.io) return window.io;
    if (state.scriptPromise) return state.scriptPromise;

    state.scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-armagedon-socket='1']");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.io), { once: true });
    existing.addEventListener("error", () => reject(new Error("Falha ao carregar o cliente de tempo real.")), {
          once: true
        });
        return;
      }

      const script = document.createElement("script");
      script.src = `${getBaseOrigin()}/socket.io/socket.io.js`;
      script.async = true;
      script.dataset.armagedonSocket = "1";
      script.onload = () => {
        if (window.io) {
          resolve(window.io);
          return;
        }
        reject(new Error("Cliente de tempo real indisponível."));
      };
    script.onerror = () => reject(new Error("Falha ao carregar o cliente de tempo real."));
      document.head.appendChild(script);
    }).catch(error => {
      state.scriptPromise = null;
      throw error;
    });

    return state.scriptPromise;
  }

  async function ensureSocket() {
    if (!state.backendAvailable || !state.token) return null;
    if (state.socket) return state.socket;
    if (state.socketPromise) return state.socketPromise;

    state.socketPromise = (async () => {
      try {
        const ioFactory = await loadSocketIoScript();
        const socket = ioFactory(getBaseOrigin(), {
          auth: {
            token: state.token
          },
          transports: ["websocket", "polling"]
        });

        socket.on("connect", () => {
          emitEvent("socket:connect", { id: socket.id });
        });
        socket.on("disconnect", reason => {
          emitEvent("socket:disconnect", { reason });
        });
        socket.on("connect_error", error => {
          emitEvent("socket:error", {
      message: error?.message || "Falha ao conectar ao tempo real."
          });
        });

        REALTIME_EVENTS.forEach(eventName => {
          socket.on(eventName, payload => emitEvent(eventName, payload || {}));
        });

        state.socket = socket;
        return socket;
      } catch (error) {
        emitEvent("socket:error", {
      message: error?.message || "Falha ao iniciar a sincronização em tempo real."
        });
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
        if (state.backendAvailable && state.token) {
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
    if (state.token) {
      ensureSocket();
    } else {
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
    const error = new Error(payload?.error || "Falha na comunicação com o servidor.");
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
