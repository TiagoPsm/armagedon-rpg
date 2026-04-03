const AUTH = {
  MASTER_USER: "mestre",
  MASTER_PASS: "Mestre123",
  SESSION_KEY: "tc_session",
  PLAYERS_KEY: "tc_players",
  DIRECTORY_KEY: "tc_directory_cache",
  TOKEN_KEY: "tc_session_token",
  _initPromise: null,
  _backendReady: false,

  async init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      this._backendReady = await APP.init();
      const session = this.getSession();

      if (this._backendReady && session?.token) {
        APP.setToken(session.token);
        try {
          const payload = await APP.getSession();
          this.setSessionObject({
            username: payload.user.username,
            role: payload.user.role,
            token: session.token,
            backend: true
          });
          await this.refreshDirectory();
          return this.getSession();
        } catch {
          this.clearSession();
          return null;
        }
      }

      return session;
    })();

    return this._initPromise;
  },

  isBackendEnabled() {
    const session = this.getSession();
    return Boolean(this._backendReady && session?.backend);
  },

  getSession() {
    try {
      return JSON.parse(localStorage.getItem(this.SESSION_KEY));
    } catch {
      return null;
    }
  },

  setSession(username, role, token = "", backend = false) {
    this.setSessionObject({ username, role, token, backend });
  },

  setSessionObject(session) {
    localStorage.setItem(
      this.SESSION_KEY,
      JSON.stringify({
        username: session.username,
        role: session.role,
        token: session.token || "",
        backend: Boolean(session.backend)
      })
    );

    if (session.token) {
      localStorage.setItem(this.TOKEN_KEY, session.token);
      APP.setToken(session.token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
      APP.clearToken();
    }
  },

  clearSession() {
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    APP.clearToken();
  },

  logout() {
    this.clearSession();
    window.location.href = "index.html";
  },

  getPlayers() {
    try {
      return JSON.parse(localStorage.getItem(this.PLAYERS_KEY) || "[]");
    } catch {
      return [];
    }
  },

  setPlayers(players) {
    localStorage.setItem(this.PLAYERS_KEY, JSON.stringify(players));
  },

  getDirectoryCache() {
    try {
      return JSON.parse(localStorage.getItem(this.DIRECTORY_KEY) || '{"players":[],"npcs":[],"monsters":[]}');
    } catch {
      return { players: [], npcs: [], monsters: [] };
    }
  },

  setDirectoryCache(directory) {
    const safeDirectory = {
      players: Array.isArray(directory?.players) ? directory.players : [],
      npcs: Array.isArray(directory?.npcs) ? directory.npcs : [],
      monsters: Array.isArray(directory?.monsters) ? directory.monsters : []
    };

    localStorage.setItem(this.DIRECTORY_KEY, JSON.stringify(safeDirectory));
    this.setPlayers(
      safeDirectory.players.map(player => ({
        username: player.username,
        charname: player.charname || player.username
      }))
    );
  },

  async refreshDirectory() {
    if (!this.isBackendEnabled()) {
      return this.getDirectoryCache();
    }

    const directory = await APP.getDirectory();
    this.setDirectoryCache(directory);
    return directory;
  },

  requireAuth() {
    const session = this.getSession();
    if (!session) {
      window.location.href = "index.html";
      return null;
    }

    return session;
  }
};

let homeRealtimeBound = false;

window.AUTH_READY = AUTH.init();

function updateHomeSummary() {
  const playerCount = document.getElementById("playerCount");
  if (playerCount) {
    playerCount.textContent = String(AUTH.getPlayers().length);
  }
}

function bindHomeRealtime() {
  if (homeRealtimeBound || !AUTH.isBackendEnabled()) return;
  homeRealtimeBound = true;

  APP.on("directory:changed", async () => {
    try {
      await AUTH.refreshDirectory();
      updateHomeSummary();
    } catch {}
  });
}

async function handleLogin() {
  const userRaw = document.getElementById("loginUser")?.value.trim() || "";
  const pass = document.getElementById("loginPass")?.value || "";
  const errorEl = document.getElementById("loginError");
  const userInput = document.getElementById("loginUser");
  const passInput = document.getElementById("loginPass");

  if (!errorEl || !userInput || !passInput) return;

  errorEl.textContent = "";
  userInput.classList.remove("error");
  passInput.classList.remove("error");

  if (!userRaw) {
    errorEl.textContent = "Informe seu usuário.";
    userInput.classList.add("error");
    userInput.focus();
    return;
  }

  if (!pass) {
    errorEl.textContent = "Informe sua senha.";
    passInput.classList.add("error");
    passInput.focus();
    return;
  }

  await AUTH.init();

  if (AUTH._backendReady) {
    try {
      const payload = await APP.login(userRaw, pass);
      AUTH.setSession(payload.user.username, payload.user.role, payload.token, true);
      await AUTH.refreshDirectory();
      await onLoginSuccess(payload.user.username, payload.user.role);
      return;
    } catch (error) {
      const message = error?.message || "Falha ao autenticar no servidor.";
      if (/senha|usuário|usuario/i.test(message)) {
        errorEl.textContent = message;
      } else {
        errorEl.textContent = "Falha ao conectar ao servidor de autenticação.";
      }
      passInput.classList.add("error");
      passInput.focus();
      return;
    }
  }

  const userLower = userRaw.toLowerCase();

  if (userLower === AUTH.MASTER_USER && pass === AUTH.MASTER_PASS) {
    AUTH.setSession(userRaw, "master");
    await onLoginSuccess(userRaw, "master");
    return;
  }

  const players = AUTH.getPlayers();
  const player = players.find(
    candidate => candidate.username.toLowerCase() === userLower && candidate.password === pass
  );

  if (player) {
    AUTH.setSession(player.username, "player");
    await onLoginSuccess(player.username, "player");
    return;
  }

  const userExists =
    userLower === AUTH.MASTER_USER ||
    players.some(candidate => candidate.username.toLowerCase() === userLower);

  if (userExists) {
    errorEl.textContent = "Senha incorreta.";
    passInput.classList.add("error");
    passInput.value = "";
    passInput.focus();
    return;
  }

  errorEl.textContent = "Usuário não encontrado.";
  userInput.classList.add("error");
  userInput.focus();
}

async function onLoginSuccess(username, role = "player") {
  const loginScreen = document.getElementById("loginScreen");
  const homeScreen = document.getElementById("homeScreen");
  const headerUser = document.getElementById("headerUser");
  const heroUser = document.getElementById("heroUser");
  const playerCount = document.getElementById("playerCount");
  const headerRole = document.getElementById("headerRole");
  const roleLabel = document.getElementById("roleLabel");
  const dashboardCopy = document.getElementById("dashboardCopy");

  if (AUTH.isBackendEnabled()) {
    await AUTH.refreshDirectory();
    bindHomeRealtime();
  }

  loginScreen?.classList.remove("active");
  homeScreen?.classList.add("active");

  if (headerUser) headerUser.textContent = username;
  if (heroUser) heroUser.textContent = username;
  if (playerCount) playerCount.textContent = String(AUTH.getPlayers().length);
  if (headerRole) headerRole.textContent = role === "master" ? "Mestre" : "Jogador";
  if (roleLabel) roleLabel.textContent = role === "master" ? "Mestre" : "Jogador";

  if (dashboardCopy) {
    dashboardCopy.textContent =
      role === "master"
        ? AUTH.isBackendEnabled()
          ? "Você pode criar jogadores, abrir qualquer ficha e salvar tudo no servidor central."
          : "Você pode criar jogadores, abrir qualquer ficha e manter tudo salvo neste navegador."
        : AUTH.isBackendEnabled()
          ? "Você acessa seus dados no servidor da campanha, com sincronização central."
          : "Você acessa somente seus dados, e tudo fica salvo automaticamente neste navegador.";
  }
}

function handleLogout() {
  AUTH.logout();
}

function togglePassword() {
  const input = document.getElementById("loginPass");
  const eyeOpen = document.getElementById("eyeOpen");
  const eyeClosed = document.getElementById("eyeClosed");

  if (!input || !eyeOpen || !eyeClosed) return;

  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  eyeOpen.style.display = showing ? "inline" : "none";
  eyeClosed.style.display = showing ? "none" : "inline";
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginUser = document.getElementById("loginUser");
  const loginPass = document.getElementById("loginPass");

  loginUser?.addEventListener("keydown", event => {
    if (event.key === "Enter") loginPass?.focus();
  });

  loginPass?.addEventListener("keydown", event => {
    if (event.key === "Enter") handleLogin();
  });

  const session = await AUTH.init();

  if (session && document.getElementById("homeScreen")) {
    await onLoginSuccess(session.username, session.role);
  }
});
