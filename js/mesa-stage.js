function renderStage() {
  const stage = document.getElementById("mesaStage");
  const emptyState = document.getElementById("mesaEmptyState");
  if (!stage || !emptyState) return;

  const renderedTokens = [...getRenderedTokens()].sort((a, b) => (a.order || 0) - (b.order || 0));
  emptyState.hidden = renderedTokens.length > 0;

  stage.innerHTML = renderedTokens.map(renderToken).join("");
}

function renderTokenStatusRow(label, current, max, fillStyle, isConcealed = false) {
  return `
    <div class="status-row ${isConcealed ? "is-concealed" : ""}">
      <div class="status-row-head">
        <span class="status-label">${label}</span>
        <span class="status-value ${isConcealed ? "is-concealed" : ""}">
          ${isConcealed ? "Oculto" : `${current}/${max}`}
        </span>
      </div>
      <div class="status-bar ${isConcealed ? "is-concealed" : ""}">
        <span ${isConcealed ? `style="width:100%"` : `style="${fillStyle}"`}></span>
      </div>
    </div>
  `;
}

function handleRosterAction(event) {
  const button = event.target.closest("[data-roster-action]");
  if (!button) return;
  const action = String(button.dataset.rosterAction || "");
  const entryId = String(button.dataset.entryId || "");
  const entry = state.roster.find(candidate => candidate.id === entryId);
  if (!entry) return;

  if (action === "add" && isMaster()) {
    addTokenToStage(entry);
    return;
  }

  if (action === "focus") {
    selectToken(entry.id);
    return;
  }

  if (action === "remove" && isMaster()) {
    removeToken(entry.id);
  }
}

function selectToken(tokenId) {
  state.selectedTokenId = tokenId;
  const token = findToken(tokenId);
  if (token && isMaster()) {
    token.order = getNextOrder();
  }
  persistState();
  renderStage();
  renderInspector();
}

function handleInspectorAction(event) {
  const button = event.target.closest("[data-inspector-action]");
  if (!button) return;
  const action = String(button.dataset.inspectorAction || "");
  const token = getSelectedToken();
  if (!token) return;

  if (action === "toggle-visibility" && isMaster()) {
    token.visibleToPlayers = !token.visibleToPlayers;
  }

  if (action === "toggle-stats-visibility" && canConfigureStatsVisibility(token)) {
    token.statsVisibleToPlayers = !token.statsVisibleToPlayers;
  }

  if (action === "center" && isMaster()) {
    const centerPosition = getCenterStagePosition();
    token.x = centerPosition.x;
    token.y = centerPosition.y;
    token.order = getNextOrder();
  }

  if (action === "remove" && isMaster()) {
    removeToken(token.id);
    return;
  }

  persistState();
  renderAll();
}

function handleInspectorStatInput(event) {
  const input = event.target.closest("[data-stat-field]");
  if (!input) return;
  const field = String(input.dataset.statField || "");
  const token = getSelectedToken();
  if (!token || !field) return;

  const nextValue = Number(input.value);
  const sheetPatch = buildSheetPatchFromMesa(field, nextValue, token);
  if (!sheetPatch) return;

  applySheetPatchFromMesa(token.characterKey, sheetPatch);
  renderStage();
  renderInspector();
}

function handleTokenPointerDown(event) {
  if (state.drag) return;
  const tokenElement = event.target.closest("[data-token-id]");
  if (!tokenElement) return;
  const tokenId = String(tokenElement.dataset.tokenId || "");
  const token = findToken(tokenId);
  if (!token) return;

  state.selectedTokenId = tokenId;

  if (!canMoveTokens()) return;
  if (event.button !== 0) return;
  if (event.target.closest("input, button, a")) return;

  beginTokenDrag(tokenElement, token, event.clientX, event.clientY, event.pointerId);
  event.preventDefault();
  renderInspector();
}

function handleTokenMouseDown(event) {
  if (state.drag) return;
  const tokenElement = event.target.closest("[data-token-id]");
  if (!tokenElement) return;
  const tokenId = String(tokenElement.dataset.tokenId || "");
  const token = findToken(tokenId);
  if (!token) return;

  state.selectedTokenId = tokenId;

  if (!canMoveTokens()) return;
  if (event.button !== 0) return;
  if (event.target.closest("input, button, a")) return;

  beginTokenDrag(tokenElement, token, event.clientX, event.clientY, null);
  event.preventDefault();
  renderInspector();
}

function beginTokenDrag(tokenElement, token, clientX, clientY, pointerId) {
  const stage = document.getElementById("mesaStage");
  if (!stage) return;

  const stageRect = stage.getBoundingClientRect();
  const tokenRect = tokenElement.getBoundingClientRect();

  state.drag = {
    tokenId: token.id,
    tokenElement,
    stageRect,
    tokenWidth: tokenRect.width,
    tokenHeight: tokenRect.height,
    pointerOffsetX: clientX - tokenRect.left,
    pointerOffsetY: clientY - tokenRect.top
  };

  token.order = getNextOrder();
  pendingDragPoint = null;
  tokenElement.classList.add("is-dragging");
  tokenElement.style.zIndex = String(token.order || 1);
  if (pointerId !== null && pointerId !== undefined) {
    tokenElement.setPointerCapture?.(pointerId);
  }
}

function handleDragMove(event) {
  if (!state.drag) return;
  scheduleDragPosition(event.clientX, event.clientY);
}

function handleDragEnd() {
  if (!state.drag) return;
  flushPendingDragPosition();
  state.drag.tokenElement?.classList.remove("is-dragging");
  state.drag = null;
  persistState({ immediate: true });
  renderInspector();
  renderStage();
}

function handleMouseDragMove(event) {
  if (!state.drag) return;
  scheduleDragPosition(event.clientX, event.clientY);
}

function handleMouseDragEnd() {
  if (!state.drag) return;
  handleDragEnd();
}

function updateDragPosition(clientX, clientY) {
  const token = findToken(state.drag.tokenId);
  if (!token) return;

  const usableWidth = Math.max(1, state.drag.stageRect.width - state.drag.tokenWidth);
  const usableHeight = Math.max(1, state.drag.stageRect.height - state.drag.tokenHeight);

  const leftPx = clamp(
    clientX - state.drag.stageRect.left - state.drag.pointerOffsetX,
    0,
    usableWidth
  );
  const topPx = clamp(
    clientY - state.drag.stageRect.top - state.drag.pointerOffsetY,
    0,
    usableHeight
  );

  token.x = clamp((leftPx / state.drag.stageRect.width) * 100, 0, 100);
  token.y = clamp((topPx / state.drag.stageRect.height) * 100, 0, 100);

  if (state.drag.tokenElement?.isConnected) {
    state.drag.tokenElement.style.left = `${token.x}%`;
    state.drag.tokenElement.style.top = `${token.y}%`;
    state.drag.tokenElement.style.zIndex = String(token.order || 1);
  }
}

function scheduleDragPosition(clientX, clientY) {
  pendingDragPoint = { clientX, clientY };
  if (dragAnimationFrame) return;
  dragAnimationFrame = window.requestAnimationFrame(() => {
    dragAnimationFrame = 0;
    if (!pendingDragPoint || !state.drag) return;
    updateDragPosition(pendingDragPoint.clientX, pendingDragPoint.clientY);
    pendingDragPoint = null;
  });
}

function flushPendingDragPosition() {
  if (dragAnimationFrame) {
    window.cancelAnimationFrame(dragAnimationFrame);
    dragAnimationFrame = 0;
  }
  if (!pendingDragPoint || !state.drag) {
    pendingDragPoint = null;
    return;
  }
  updateDragPosition(pendingDragPoint.clientX, pendingDragPoint.clientY);
  pendingDragPoint = null;
}

function resetPrototype() {
  localStorage.removeItem(MESA_STORAGE_KEY);
  state.tokens = [];
  state.selectedTokenId = "";
  state.previewPlayerView = false;
  renderAll();
  persistState({ immediate: true });
}

function persistState(options = {}) {
  // Este payload guarda apenas o estado visual da cena.
  // Identidade, retrato e status continuam vindo da ficha.
  pendingPersistPayload = {
    previewPlayerView: Boolean(state.previewPlayerView),
    selectedTokenId: state.selectedTokenId,
    tokens: state.tokens.map(token => ({
      id: token.id,
      characterKey: token.characterKey,
      x: roundTo(token.x, 2),
      y: roundTo(token.y, 2),
      visibleToPlayers: token.visibleToPlayers !== false,
      statsVisibleToPlayers: normalizeStatsVisibility(token.type, token.statsVisibleToPlayers),
      order: token.order || 1
    }))
  };

  if (options.immediate) {
    flushPersistState();
    return;
  }

  if (mesaPersistTimer) window.clearTimeout(mesaPersistTimer);
  mesaPersistTimer = window.setTimeout(() => {
    flushPersistState();
  }, 160);
}

function flushPersistState() {
  if (mesaPersistTimer) {
    window.clearTimeout(mesaPersistTimer);
    mesaPersistTimer = null;
  }
  if (!pendingPersistPayload) return;
  const payload = pendingPersistPayload;
  localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(payload));
  pendingPersistPayload = null;
  queueRemoteMesaPersist(payload);
}

function canPersistRemoteMesaScene() {
  return Boolean(isMaster() && window.AUTH?.isBackendEnabled?.() && window.APP?.saveMesaScene);
}

function queueRemoteMesaPersist(payload) {
  if (!canPersistRemoteMesaScene()) return;
  pendingRemotePersistPayload = payload;
  if (mesaRemotePersistInFlight) return;
  void runRemoteMesaPersist();
}

async function runRemoteMesaPersist() {
  if (!pendingRemotePersistPayload || !canPersistRemoteMesaScene()) return;
  mesaRemotePersistInFlight = true;

  while (pendingRemotePersistPayload) {
    const payload = pendingRemotePersistPayload;
    pendingRemotePersistPayload = null;

    try {
      await window.APP.saveMesaScene(payload, {
        keepalive: document.visibilityState === "hidden"
      });
      state.scenePersistence = "remote";
    } catch (error) {
      state.scenePersistence = "local";
      console.warn("Falha ao salvar cena oficial da mesa.", error);
    }
  }

  mesaRemotePersistInFlight = false;
}

// A Mesa atualiza Vida e Integridade escrevendo primeiro na ficha local.
// Depois disso, a cena rehidrata o roster para refletir o mesmo valor
// que a ficha usaria ao ser aberta ou recarregada.
function buildSheetPatchFromMesa(field, nextValue, token) {
  const patch = {};

  if (field === "currentLife" && canEditCurrentStats(token)) {
    patch.vidaAtual = String(clamp(asPositiveInt(nextValue, token.currentLife), 0, token.maxLife));
  }

  if (field === "maxLife" && canEditAllStats(token)) {
    const nextMaxLife = Math.max(1, asPositiveInt(nextValue, token.maxLife));
    patch.vidaMax = String(nextMaxLife);
    patch.vidaAtual = String(clamp(token.currentLife, 0, nextMaxLife));
  }

  if (field === "currentIntegrity" && canEditCurrentStats(token)) {
    patch.integAtual = String(clamp(asPositiveInt(nextValue, token.currentIntegrity), 0, token.maxIntegrity));
  }

  if (field === "maxIntegrity" && canEditAllStats(token)) {
    const nextMaxIntegrity = asPositiveInt(nextValue, token.maxIntegrity);
    patch.integMax = String(nextMaxIntegrity);
    patch.integAtual = String(clamp(token.currentIntegrity, 0, nextMaxIntegrity));
  }

  return Object.keys(patch).length ? patch : null;
}

function applySheetPatchFromMesa(characterKey, patch) {
  const localSheets = readJsonStorage(SHEETS_KEY, {});
  const remoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
  const localHasEntry = Object.prototype.hasOwnProperty.call(localSheets, characterKey);
  const remoteHasEntry = Object.prototype.hasOwnProperty.call(remoteSheets, characterKey);
  const baseSheet = normalizeMesaSheetSnapshot(
    remoteHasEntry ? remoteSheets[characterKey] : localHasEntry ? localSheets[characterKey] : {}
  );
  const nextSheet = normalizeMesaSheetSnapshot({
    ...baseSheet,
    ...patch
  });

  if (localHasEntry || !remoteHasEntry) {
    localSheets[characterKey] = {
      ...localSheets[characterKey],
      ...nextSheet
    };
    localStorage.setItem(SHEETS_KEY, JSON.stringify(localSheets));
  }

  if (remoteHasEntry) {
    remoteSheets[characterKey] = {
      ...remoteSheets[characterKey],
      ...nextSheet
    };
    localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(remoteSheets));
  }

  scheduleMesaRemoteSheetPatch(characterKey, patch);
  refreshMesaRosterFromSheets();
}

function scheduleMesaRemoteSheetPatch(characterKey, patch) {
  if (!window.AUTH?.isBackendEnabled?.() || !window.APP?.saveCharacter) return;
  if (!characterKey || !patch || !Object.keys(patch).length) return;

  const previousPatch = pendingMesaSheetPatches.get(characterKey) || {};
  pendingMesaSheetPatches.set(characterKey, {
    ...previousPatch,
    ...patch
  });

  const existingTimer = mesaSheetSaveTimers.get(characterKey);
  if (existingTimer) window.clearTimeout(existingTimer);

  const timer = window.setTimeout(() => {
    mesaSheetSaveTimers.delete(characterKey);
    persistMesaSheetPatch(characterKey);
  }, 500);
  mesaSheetSaveTimers.set(characterKey, timer);
}

async function persistMesaSheetPatch(characterKey) {
  const patch = pendingMesaSheetPatches.get(characterKey);
  if (!patch) return;
  pendingMesaSheetPatches.delete(characterKey);

  try {
    const localSheets = readJsonStorage(SHEETS_KEY, {});
    const remoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
    const hasRemoteEntry = Object.prototype.hasOwnProperty.call(remoteSheets, characterKey);
    const hasLocalEntry = Object.prototype.hasOwnProperty.call(localSheets, characterKey);
    const cachedData = hasRemoteEntry ? remoteSheets[characterKey] : null;
    const remoteBundle = cachedData ? null : await window.APP.getCharacter(characterKey);
    const baseData = cachedData || remoteBundle?.data || (hasLocalEntry ? localSheets[characterKey] : {});
    const nextData = {
      ...baseData,
      ...patch
    };
    const saved = await window.APP.saveCharacter(characterKey, nextData);

    if (saved?.data) {
      const nextRemoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
      const newerPatch = pendingMesaSheetPatches.get(characterKey);
      nextRemoteSheets[characterKey] = newerPatch
        ? {
            ...saved.data,
            ...newerPatch
          }
        : saved.data;
      localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(nextRemoteSheets));
      refreshMesaRosterFromSheets();
      renderAll();
    }
  } catch (error) {
    console.warn("Falha ao salvar estado da mesa no servidor.", error);
  }
}

function normalizeMesaSheetSnapshot(raw) {
  return {
    vidaAtual: raw?.vidaAtual ?? "",
    vidaMax: raw?.vidaMax ?? "",
    integAtual: raw?.integAtual ?? "",
    integMax: raw?.integMax ?? "",
    charName: raw?.charName ?? "",
    avatar: raw?.avatar ?? ""
  };
}

function refreshMesaRosterFromSheets() {
  const previousSelectedId = state.selectedTokenId;
  const rosterMap = new Map(buildRoster().map(entry => [entry.characterKey, entry]));
  state.roster = [...rosterMap.values()];
  state.tokens = state.tokens
    .map(token => mergeTokenWithRoster(token, rosterMap.get(String(token.characterKey || token.id || ""))))
    .filter(Boolean);
  state.selectedTokenId = previousSelectedId;
  syncSelectedToken();
  persistState();
}

function handleMesaStorageSync(event) {
  if (![SHEETS_KEY, REMOTE_SHEETS_KEY].includes(String(event.key || ""))) return;
  refreshMesaRosterFromSheets();
  renderAll();
}

function getFilteredRoster() {
  if (!state.search) return state.roster;
  return state.roster.filter(entry => {
    const haystack = [
      entry.name,
      entry.typeLabel,
      entry.ownerUsername
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
  });
}

function getRenderedTokens() {
  if (isMaster() && !state.previewPlayerView) return state.tokens;
  return state.tokens.filter(token => token.visibleToPlayers !== false);
}

function syncSelectedToken() {
  const renderedTokens = getRenderedTokens();
  if (!renderedTokens.length) {
    state.selectedTokenId = "";
    return;
  }

  if (!renderedTokens.some(token => token.id === state.selectedTokenId)) {
    state.selectedTokenId = renderedTokens[0].id;
  }
}

function getSelectedToken() {
  return getRenderedTokens().find(token => token.id === state.selectedTokenId)
    || state.tokens.find(token => token.id === state.selectedTokenId)
    || null;
}

function findToken(tokenId) {
  return state.tokens.find(token => token.id === tokenId) || null;
}

async function toggleMesaFullscreen() {
  const panel = document.getElementById("mesaPanelStage");
  if (!panel) return;

  try {
    if (state.fullscreenMode !== "off") {
      await exitMesaFullscreen();
      return;
    }

    if (!shouldPreferPseudoFullscreen() && document.fullscreenEnabled && typeof panel.requestFullscreen === "function") {
      await panel.requestFullscreen();
      return;
    }

    enterPseudoFullscreen();
  } catch {
    enterPseudoFullscreen();
  }
}

function syncFullscreenState() {
  const panel = document.getElementById("mesaPanelStage");
  const isNative = Boolean(panel && document.fullscreenElement === panel);
  const isPseudo = Boolean(panel?.classList.contains("is-pseudo-fullscreen"));
  state.fullscreenMode = isNative ? "native" : isPseudo ? "pseudo" : "off";
  renderControls();
}

async function exitMesaFullscreen() {
  const panel = document.getElementById("mesaPanelStage");
  if (!panel) return;

  if (document.fullscreenElement === panel) {
    try {
      await document.exitFullscreen();
    } catch {}
    return;
  }

  panel.classList.remove("is-pseudo-fullscreen");
  document.body.classList.remove("mesa-pseudo-fullscreen");
  state.fullscreenMode = "off";
  renderControls();
}

function enterPseudoFullscreen() {
  const panel = document.getElementById("mesaPanelStage");
  if (!panel) return;
  panel.classList.add("is-pseudo-fullscreen");
  document.body.classList.add("mesa-pseudo-fullscreen");
  state.fullscreenMode = "pseudo";
  renderControls();
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") return;
  if (state.fullscreenMode !== "pseudo") return;
  exitMesaFullscreen();
}

function shouldPreferPseudoFullscreen() {
  return isLocalMesaPreview();
}

function isLocalMesaPreview() {
  const protocol = String(window.location?.protocol || "");
  const hostname = String(window.location?.hostname || "").toLowerCase();
  return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
}

function canMoveTokens() {
  return isMaster();
}

function canViewTokenStats(token) {
  if (!token) return false;
  if (!isPlayerPerspective()) return true;
  if (token.type === "player") return true;
  return token.statsVisibleToPlayers === true;
}

function canEditCurrentStats(token) {
  if (!token) return false;
  if (isMaster()) return true;
  return state.role === "player" && token.ownerUsername === state.session?.username;
}

function canEditAllStats(token) {
  return Boolean(token) && isMaster();
}

function canConfigureStatsVisibility(token) {
  return Boolean(token) && isMaster() && token.type !== "player";
}

function isPlayerPerspective() {
  return !isMaster() || state.previewPlayerView;
}

function isMaster() {
  return state.role === "master";
}

function getNextOrder() {
  return state.tokens.reduce((max, token) => Math.max(max, token.order || 1), 0) + 1;
}

function getCenterStagePosition() {
  return { x: 39, y: 22 };
}

function buildPreferredStageSlots(count) {
  const totalSlots = Math.max(count, STAGE_SLOT_COLUMNS);
  return Array.from({ length: totalSlots }, (_, index) => {
    const col = index % STAGE_SLOT_COLUMNS;
    const row = Math.floor(index / STAGE_SLOT_COLUMNS);
    return {
      x: clamp(roundTo(STAGE_SLOT_START_X + col * STAGE_SLOT_GAP_X, 2), 3, 82),
      y: clamp(roundTo(STAGE_SLOT_START_Y + row * STAGE_SLOT_GAP_Y, 2), 4, 78)
    };
  });
}

function isStageSlotOccupied(slot, tokens) {
  return tokens.some(token => (
    Math.abs((token.x ?? 0) - slot.x) < STAGE_SLOT_COLLISION_X
    && Math.abs((token.y ?? 0) - slot.y) < STAGE_SLOT_COLLISION_Y
  ));
}

function resolveNextStageSlot(tokens) {
  const preferredSlots = buildPreferredStageSlots(Math.max(tokens.length + 8, 15));
  const nextSlot = preferredSlots.find(slot => !isStageSlotOccupied(slot, tokens));
  return nextSlot || preferredSlots[preferredSlots.length - 1] || getCenterStagePosition();
}

function getNextSelectedTokenId() {
  const renderedTokens = [...getRenderedTokens()].sort((a, b) => (b.order || 0) - (a.order || 0));
  return renderedTokens[0]?.id || state.tokens[0]?.id || "";
}

function getOwnerCopy(ownerUsername) {
  const owner = String(ownerUsername || "").trim();
  if (!owner || owner === "mestre") return "Controlado pelo mestre";
  return `Dono: ${owner}`;
}

function renderToken(token) {
  const hiddenForMaster = isMaster() && !state.previewPlayerView && !token.visibleToPlayers;
  const selectedClass = token.id === state.selectedTokenId ? "is-selected" : "";
  const hiddenClass = hiddenForMaster ? "is-hidden-master" : "";
  const canViewStats = canViewTokenStats(token);
  const statePillLabel = hiddenForMaster
    ? "Oculto"
    : token.type !== "player" && token.statsVisibleToPlayers !== true
      ? "Status restrito"
      : "";

  return `
    <article
      class="mesa-token ${selectedClass} ${hiddenClass}"
      data-token-id="${token.id}"
      data-type="${token.type}"
      style="left:${token.x}%; top:${token.y}%; z-index:${token.order || 1};"
    >
      <div class="mesa-token-top">
        <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
        ${statePillLabel ? `<span class="token-state-pill">${statePillLabel}</span>` : ""}
      </div>

      <div class="mesa-token-avatar">
        ${token.imageUrl
          ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" draggable="false" />`
          : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
      </div>

      <h3 class="mesa-token-name">${escapeHtml(token.name)}</h3>
      <p class="mesa-token-meta">${escapeHtml(getOwnerCopy(token.ownerUsername))}</p>

      <div class="token-bars">
        ${canViewStats
          ? `
            ${renderTokenStatusRow("Vida", token.currentLife, token.maxLife, getBarFillStyle("vida", token.currentLife, token.maxLife))}
            ${renderTokenStatusRow("Integridade", token.currentIntegrity, token.maxIntegrity, getBarFillStyle("integ", token.currentIntegrity, token.maxIntegrity))}
          `
          : `
            ${renderTokenStatusRow("Vida", null, null, "", true)}
            ${renderTokenStatusRow("Integridade", null, null, "", true)}
          `}
      </div>
    </article>
  `;
}

function addTokenToStage(entry) {
  if (findToken(entry.id)) {
    selectToken(entry.id);
    return;
  }

  const nextOrder = getNextOrder();
  const nextSlot = resolveNextStageSlot(state.tokens);
  const nextToken = {
    ...entry,
    visibleToPlayers: true,
    statsVisibleToPlayers: normalizeStatsVisibility(entry.type, entry.statsVisibleToPlayers),
    x: nextSlot.x,
    y: nextSlot.y,
    order: nextOrder
  };

  state.tokens = [...state.tokens, nextToken];
  state.selectedTokenId = nextToken.id;
  persistState();
  renderAll();
}

function removeToken(tokenId) {
  const previousSelectedId = state.selectedTokenId;
  state.tokens = state.tokens.filter(token => token.id !== tokenId);

  if (previousSelectedId !== tokenId && getRenderedTokens().some(token => token.id === previousSelectedId)) {
    state.selectedTokenId = previousSelectedId;
  } else {
    state.selectedTokenId = getNextSelectedTokenId();
  }

  persistState();
  renderAll();
}
