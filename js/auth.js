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
      let session = this.getSession();
      const storedToken = String(localStorage.getItem(this.TOKEN_KEY) || "").trim();

      if (!this._backendReady && session?.backend) {
        this.clearSession();
        return null;
      }

      if (this._backendReady && !session?.token && storedToken) {
        APP.setToken(storedToken);
        try {
          const payload = await APP.getSession();
          this.setSessionObject({
            username: payload.user.username,
            role: payload.user.role,
            token: storedToken,
            backend: true
          });
          await this.refreshDirectory();
          session = this.getSession();
        } catch {
          this.clearSession();
          return null;
        }
      }

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
      return;
    }

    localStorage.removeItem(this.TOKEN_KEY);
    APP.clearToken();
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

function initAuthPageGlow() {
  const root = document.body;
  if (!root) return;
  if (typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches) return;

  const setGlow = (x, y) => {
    root.style.setProperty("--page-glow-x", x);
    root.style.setProperty("--page-glow-y", y);
  };

  setGlow("50%", "18%");

  let frameId = 0;
  const updateGlow = (clientX, clientY) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const x = Math.max(0, Math.min(100, (clientX / width) * 100)).toFixed(2);
    const y = Math.max(0, Math.min(100, (clientY / height) * 100)).toFixed(2);
    setGlow(`${x}%`, `${y}%`);
  };

  const handleMove = event => {
    const { clientX, clientY } = event;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => updateGlow(clientX, clientY));
  };

  root.addEventListener("pointermove", handleMove);
  root.addEventListener("pointerleave", () => setGlow("50%", "18%"));
}

function updateHomeSummary() {
  const session = AUTH.getSession();
  const role = session?.role || "player";
  const directory = AUTH.getDirectoryCache();
  const readLocalList = key => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const players = AUTH.isBackendEnabled()
    ? (Array.isArray(directory?.players) ? directory.players : [])
    : AUTH.getPlayers();
  const npcs = AUTH.isBackendEnabled()
    ? (Array.isArray(directory?.npcs) ? directory.npcs : [])
    : readLocalList("tc_npcs");
  const monsters = AUTH.isBackendEnabled()
    ? (Array.isArray(directory?.monsters) ? directory.monsters : [])
    : readLocalList("tc_monsters");
  const totalSheets = players.length + npcs.length + monsters.length;
  const backendEnabled = AUTH.isBackendEnabled();

  const playerCount = document.getElementById("playerCount");
  const npcCount = document.getElementById("npcCount");
  const monsterCount = document.getElementById("monsterCount");
  const playerCountMeta = document.getElementById("playerCountMeta");
  const npcCountMeta = document.getElementById("npcCountMeta");
  const monsterCountMeta = document.getElementById("monsterCountMeta");
  const saveModeBadge = document.getElementById("saveModeBadge");
  const saveModeLabel = document.getElementById("saveModeLabel");
  const saveModeDescription = document.getElementById("saveModeDescription");
  const fichasActionMeta = document.getElementById("fichasActionMeta");
  const rulesActionMeta = document.getElementById("rulesActionMeta");
  const dashboardNoteCopy = document.getElementById("dashboardNoteCopy");
  const roleLabel = document.getElementById("roleLabel");
  const roleMeta = document.getElementById("roleMeta");

  if (playerCount) playerCount.textContent = String(players.length);
  if (npcCount) npcCount.textContent = String(npcs.length);
  if (monsterCount) monsterCount.textContent = String(monsters.length);

  if (playerCountMeta) {
    playerCountMeta.textContent = role === "master" ? "Acessos ativos" : "No diretório da campanha";
  }

  if (npcCountMeta) npcCountMeta.textContent = "Personagens do mestre";
  if (monsterCountMeta) monsterCountMeta.textContent = "Criaturas cadastradas";

  if (saveModeBadge) {
    saveModeBadge.textContent = backendEnabled ? "Servidor" : "Navegador";
  }

  if (saveModeLabel) {
    saveModeLabel.textContent = backendEnabled ? "Servidor" : "Navegador";
  }

  if (saveModeDescription) {
    saveModeDescription.textContent = backendEnabled
      ? "As altera\u00e7\u00f5es ficam centralizadas no servidor da campanha."
      : "As altera\u00e7\u00f5es ficam salvas neste navegador at\u00e9 a migra\u00e7\u00e3o completa.";
  }

  if (fichasActionMeta) {
    fichasActionMeta.textContent = role === "master"
      ? `${totalSheets} registros`
      : "Sua ficha e o diret\u00f3rio";
  }

  if (rulesActionMeta) {
    rulesActionMeta.textContent = backendEnabled ? "Atualiza\u00e7\u00e3o central" : "Consulta direta";
  }

  if (dashboardNoteCopy) {
    dashboardNoteCopy.textContent = role === "master"
      ? "Use este painel para abrir as duas \u00e1reas centrais da campanha e acompanhar o estado geral sem excesso de informa\u00e7\u00e3o."
      : "Abra sua ficha e consulte as regras em um fluxo curto, sem navega\u00e7\u00e3o desnecess\u00e1ria.";
  }

  if (roleLabel) roleLabel.textContent = role === "master" ? "Mestre" : "Jogador";
  if (roleMeta) roleMeta.textContent = role === "master" ? "Controle da campanha" : "Acesso da sess\u00e3o";
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
    errorEl.textContent = "Informe seu usu\u00e1rio.";
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
      if (/senha|usu\u00e1rio|usuario/i.test(message)) {
        errorEl.textContent = message;
      } else {
        errorEl.textContent = "Falha ao conectar ao servidor de autentica\u00e7\u00e3o.";
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

  errorEl.textContent = "Usu\u00e1rio n\u00e3o encontrado.";
  userInput.classList.add("error");
  userInput.focus();
}

async function onLoginSuccess(username, role = "player") {
  const loginScreen = document.getElementById("loginScreen");
  const homeScreen = document.getElementById("homeScreen");
  const headerUser = document.getElementById("headerUser");
  const heroUser = document.getElementById("heroUser");
  const headerRole = document.getElementById("headerRole");
  const dashboardCopy = document.getElementById("dashboardCopy");
  const dashboardTitle = document.getElementById("dashboardTitle");
  const dashboardEyebrow = document.getElementById("dashboardEyebrow");
  const dashboardSectionTitle = document.getElementById("dashboardSectionTitle");
  const dashboardSectionCopy = document.getElementById("dashboardSectionCopy");
  const fichasActionTitle = document.getElementById("fichasActionTitle");
  const fichasActionCopy = document.getElementById("fichasActionCopy");
  const rulesActionTitle = document.getElementById("rulesActionTitle");
  const rulesActionCopy = document.getElementById("rulesActionCopy");

  if (AUTH.isBackendEnabled()) {
    await AUTH.refreshDirectory();
    bindHomeRealtime();
  }

  if (loginScreen) loginScreen.classList.remove("active");
  if (homeScreen) homeScreen.classList.add("active");

  if (headerUser) headerUser.textContent = username;
  if (heroUser) heroUser.textContent = username;
  if (headerRole) headerRole.textContent = role === "master" ? "Mestre" : "Jogador";

  if (dashboardEyebrow) {
    dashboardEyebrow.textContent = role === "master" ? "Painel do mestre" : "Sess\u00e3o ativa";
  }

  if (dashboardTitle) {
    dashboardTitle.textContent = role === "master" ? "Comando da campanha" : "Painel da campanha";
  }

  if (dashboardCopy) {
    dashboardCopy.textContent =
      role === "master"
        ? AUTH.isBackendEnabled()
          ? "Crie acessos, abra qualquer ficha e mantenha a campanha organizada com salvamento central."
          : "Crie acessos, abra qualquer ficha e mantenha a campanha organizada neste navegador."
        : AUTH.isBackendEnabled()
          ? "Abra sua ficha e consulte as regras com sincroniza\u00e7\u00e3o central da campanha."
          : "Abra sua ficha e consulte as regras com salvamento local neste navegador.";
  }

  if (dashboardSectionTitle) {
    dashboardSectionTitle.textContent = role === "master" ? "Atalhos do mestre" : "Atalhos da campanha";
  }

  if (dashboardSectionCopy) {
    dashboardSectionCopy.textContent = role === "master"
      ? "As duas \u00e1reas principais ficam acess\u00edveis em um fluxo curto e direto."
      : "Tudo que voc\u00ea precisa fica concentrado nos atalhos principais.";
  }

  if (fichasActionTitle) {
    fichasActionTitle.textContent = role === "master" ? "Gerenciar campanha" : "Abrir sua ficha";
  }

  if (fichasActionCopy) {
    fichasActionCopy.textContent = role === "master"
      ? "Jogadores, NPCs, monstros e invent\u00e1rios no mesmo painel."
      : "Acesse sua ficha e acompanhe o diret\u00f3rio da campanha.";
  }

  if (rulesActionTitle) {
    rulesActionTitle.textContent = role === "master" ? "Abrir arquivo da campanha" : "Consultar regras";
  }

  if (rulesActionCopy) {
    rulesActionCopy.textContent = role === "master"
      ? "Centralize regras, ajustes e refer\u00eancias da mesa."
      : "Leia as regras e os ajustes oficiais sem sair do portal.";
  }

  updateHomeSummary();
}

async function handleLogout() {
  const sheetScreen = document.getElementById("sheetScreen");
  const shouldAttemptSave =
    Boolean(sheetScreen?.classList.contains("active"))
    && typeof window.flushSheetSaveOnExit === "function";

  if (shouldAttemptSave) {
    const saved = await window.flushSheetSaveOnExit({
      keepalive: false,
      suppressError: false,
      allowInactive: true
    });

    if (saved === false) return;
  }

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
  initAuthPageGlow();

  const loginUser = document.getElementById("loginUser");
  const loginPass = document.getElementById("loginPass");

  if (loginUser && loginPass) {
    loginUser.addEventListener("keydown", event => {
      if (event.key === "Enter") loginPass.focus();
    });

    loginPass.addEventListener("keydown", event => {
      if (event.key === "Enter") handleLogin();
    });
  }

  const session = await AUTH.init();

  if (session && document.getElementById("homeScreen")) {
    await onLoginSuccess(session.username, session.role);
  }
});
