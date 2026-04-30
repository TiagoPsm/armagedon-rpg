async function openMasterPanel() {
  currentSheetTarget = null;
  pendingRealtimeSheetKey = "";
  renderPlayers();
  renderNpcs();
  renderMonsters();
  resetAddPlayerForm();
  resetNpcForm();
  resetMonsterForm();
  showScreen("masterScreen");

  if (isBackendMode()) {
    AUTH.refreshDirectory()
      .then(() => {
        if (!isMasterScreenActive()) return;
        renderPlayers();
        renderNpcs();
        renderMonsters();
      })
      .catch(() => {});
  }
}

function renderPlayers() {
  const players = AUTH.getPlayers();
  const listEl = document.getElementById("playersList");
  const btnsEl = document.getElementById("playersBtns");

  if (!listEl || !btnsEl) return;

  if (!players.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum jogador cadastrado.</p>';
    btnsEl.innerHTML = '<p class="empty-msg">Nenhum jogador ainda.</p>';
    return;
  }

  listEl.innerHTML = players
    .map(
      player => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">${esc(player.username)}</span>
            <span class="player-char">${esc(player.charname || "-")}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterView('${jsEsc(player.username)}')">Ver ficha</button>
            <button class="btn-danger" onclick="removePlayer('${jsEsc(player.username)}')">Remover</button>
          </div>
        </div>
      `
    )
    .join("");

  btnsEl.innerHTML = players
    .map(
      player => `
        <button class="player-btn" onclick="masterView('${jsEsc(player.username)}')">
          ${esc(player.charname || player.username)}
        </button>
      `
    )
    .join("");
}

async function addPlayer() {
  const username = document.getElementById("newUser").value.trim() || "";
  const password = document.getElementById("newPass").value || "";
  const charname = document.getElementById("newChar").value.trim() || "";
  const errEl = document.getElementById("addError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!username || !password) {
    errEl.textContent = "Usuário e senha são obrigatórios.";
    return;
  }

  if (username.toLowerCase() === AUTH.MASTER_USER) {
    errEl.textContent = "Nome reservado.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createPlayer({
        username,
        password,
        charname: charname || username
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error.message || "Falha ao criar o jogador.";
      return;
    }
  } else {
    const players = AUTH.getPlayers();
    if (players.find(player => player.username.toLowerCase() === username.toLowerCase())) {
      errEl.textContent = "Já existe um jogador com esse nome.";
      return;
    }

    players.push({ username, password, charname: charname || username });
    localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));
  }

  resetAddPlayerForm();
  renderPlayers();
}

async function addNpc() {
  const name = document.getElementById("newNpcName").value.trim() || "";
  const errEl = document.getElementById("npcError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "Informe o nome do NPC.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createNpc({ name });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error.message || "Falha ao criar o NPC.";
      return;
    }
  } else {
    const npcs = readNpcs();
    if (npcs.some(npc => npc.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = "Já existe um NPC com esse nome.";
      return;
    }

    const npc = normalizeNpc({
      id: createNpcId(),
      name
    });

    npcs.push(npc);
    writeNpcs(npcs);

    const sheets = readSheets();
    sheets[getNpcSheetKey(npc.id)] = normalizeSheetData({
      charName: npc.name
    }, "npc");
    writeSheets(sheets);
  }

  resetNpcForm();
  renderNpcs();
}

async function addMonster() {
  const name = document.getElementById("newMonsterName").value.trim() || "";
  const errEl = document.getElementById("monsterError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "Informe o nome do monstro.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createMonster({ name });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error.message || "Falha ao criar o monstro.";
      return;
    }
  } else {
    const monsters = readMonsters();
    if (monsters.some(monster => monster.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = "Já existe um monstro com esse nome.";
      return;
    }

    const monster = normalizeMonster({
      id: createMonsterId(),
      name
    });

    monsters.push(monster);
    writeMonsters(monsters);

    const sheets = readSheets();
    sheets[getMonsterSheetKey(monster.id)] = normalizeSheetData({
      charName: monster.name
    }, "monster");
    writeSheets(sheets);
  }

  resetMonsterForm();
  renderMonsters();
}

function resetAddPlayerForm() {
  const newUser = document.getElementById("newUser");
  const newPass = document.getElementById("newPass");
  const newChar = document.getElementById("newChar");
  const addError = document.getElementById("addError");

  if (newUser) newUser.value = "";
  if (newPass) newPass.value = "";
  if (newChar) newChar.value = "";
  if (addError) addError.textContent = "";

  // Run after the browser has a chance to apply autofill so the form stays blank by default.
  setTimeout(() => {
    if (newUser) newUser.value = "";
    if (newPass) newPass.value = "";
    if (newChar) newChar.value = "";
  }, 0);
}

function resetNpcForm() {
  const newNpcName = document.getElementById("newNpcName");
  const npcError = document.getElementById("npcError");

  if (newNpcName) newNpcName.value = "";
  if (npcError) npcError.textContent = "";

  setTimeout(() => {
    if (newNpcName) newNpcName.value = "";
  }, 0);
}

function resetMonsterForm() {
  const newMonsterName = document.getElementById("newMonsterName");
  const monsterError = document.getElementById("monsterError");

  if (newMonsterName) newMonsterName.value = "";
  if (monsterError) monsterError.textContent = "";

  setTimeout(() => {
    if (newMonsterName) newMonsterName.value = "";
  }, 0);
}

async function removePlayer(username) {
  const confirmed = await UI.confirm(`Remover "${username}"? A ficha será apagada.`, {
    title: "Excluir jogador",
    kicker: "// Confirmação",
    confirmLabel: "Remover",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deletePlayer(username);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[username];
    persistRemoteSheetsCache();
  } else {
    const players = AUTH.getPlayers().filter(player => player.username !== username);
    localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));

    const sheets = readSheets();
    delete sheets[username];
    writeSheets(sheets);
  }

  renderPlayers();
}

async function masterView(username) {
  await openSheet(createPlayerTarget(username), true);
}

async function backToMaster() {
  await saveSheet();
  await openMasterPanel();
}

function openSheetLegacy(target, fromMaster) {
  const sheetUser = document.getElementById("sheetUser");
  const backButton = document.getElementById("btnBackMaster");
  const sheetKindLabel = document.getElementById("sheetKindLabel");
  const resolvedTarget = typeof target === "string" ? createPlayerTarget(target) : target;

  currentSheetTarget = resolvedTarget;

  if (sheetUser) {
    sheetUser.textContent =
      resolvedTarget.kind === "npc" ? `${resolvedTarget.label} · NPC` : resolvedTarget.label;
  }
  if (backButton) backButton.style.display = fromMaster ? "inline-block" : "none";
  if (sheetKindLabel) {
    sheetKindLabel.textContent = resolvedTarget.kind === "npc" ? "Ficha do NPC" : "Ficha do personagem";
  }

  loadSheet(resolvedTarget.key);
  showScreen("sheetScreen");
}

function renderNpcs() {
  const npcs = readNpcs();
  const listEl = document.getElementById("npcList");

  if (!listEl) return;

  if (!npcs.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum NPC criado.</p>';
    return;
  }

  listEl.innerHTML = npcs
    .map(
      npc => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">NPC</span>
            <span class="player-char">${esc(npc.name)}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterViewNpc('${jsEsc(npc.id)}')">Abrir ficha</button>
            <button class="btn-danger" onclick="removeNpc('${jsEsc(npc.id)}')">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderMonsters() {
  const monsters = readMonsters();
  const listEl = document.getElementById("monsterList");

  if (!listEl) return;

  if (!monsters.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum monstro criado.</p>';
    return;
  }

  listEl.innerHTML = monsters
    .map(
      monster => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">Monstro</span>
            <span class="player-char">${esc(monster.name)}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterViewMonster('${jsEsc(monster.id)}')">Abrir ficha</button>
            <button class="btn-danger" onclick="removeMonster('${jsEsc(monster.id)}')">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");
}

async function masterViewNpc(npcId) {
  const npc = readNpcs().find(candidate => candidate.id === npcId);
  if (!npc) return;
  await openSheet(createNpcTarget(npc), true);
}

async function masterViewMonster(monsterId) {
  const monster = readMonsters().find(candidate => candidate.id === monsterId);
  if (!monster) return;
  await openSheet(createMonsterTarget(monster), true);
}

async function removeNpc(npcId) {
  const npcs = readNpcs();
  const npc = npcs.find(candidate => candidate.id === npcId);
  if (!npc) return;

  const confirmed = await UI.confirm(`Apagar o NPC "${npc.name}"? A ficha será apagada.`, {
    title: "Excluir NPC",
    kicker: "// Confirmação",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deleteNpc(npcId);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[getNpcSheetKey(npcId)];
    persistRemoteSheetsCache();
  } else {
    writeNpcs(npcs.filter(candidate => candidate.id !== npcId));

    const sheets = readSheets();
    delete sheets[getNpcSheetKey(npcId)];
    writeSheets(sheets);
  }

  renderNpcs();
}

async function removeMonster(monsterId) {
  const monsters = readMonsters();
  const monster = monsters.find(candidate => candidate.id === monsterId);
  if (!monster) return;

  const confirmed = await UI.confirm(`Apagar o monstro "${monster.name}"? A ficha será apagada.`, {
    title: "Excluir monstro",
    kicker: "// Confirmação",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deleteMonster(monsterId);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[getMonsterSheetKey(monsterId)];
    persistRemoteSheetsCache();
  } else {
    writeMonsters(monsters.filter(candidate => candidate.id !== monsterId));

    const sheets = readSheets();
    delete sheets[getMonsterSheetKey(monsterId)];
    writeSheets(sheets);
  }

  renderMonsters();
}

function syncDirectoryNameLegacy(charName) {
  const cleanName = String(charName || "").trim();
  if (!cleanName || !currentSheetTarget) return;

  if (currentSheetTarget.kind === "player") {
    const players = AUTH.getPlayers();
    const index = players.findIndex(player => player.username === currentSheetTarget.owner);
    if (index >= 0 && players[index].charname !== cleanName) {
      players[index] = { ...players[index], charname: cleanName };
      localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));
    }
    return;
  }

  const npcs = readNpcs();
  const index = npcs.findIndex(npc => npc.id === currentSheetTarget.npcId);
  if (index >= 0 && npcs[index].name !== cleanName) {
    npcs[index] = { ...npcs[index], name: cleanName };
    writeNpcs(npcs);
    currentSheetTarget.label = cleanName;
  }
}
