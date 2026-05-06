const mesaStageTokenElements = new Map();
let mesaStageRenderer = null;
let lastCanvasStageSnapshot = null;
let pendingRealtimeDragMove = null;
let realtimeDragMoveTimer = 0;
let lastRealtimeDragMoveAt = 0;
let lastMesaDragEndAt = 0;
const MESA_REALTIME_DRAG_INTERVAL_MS = 66;

function renderStage() {
  if (renderCanvasStage()) return;
  renderDomStage();
}

function renderDomStage() {
  const stage = getMesaDomRef("stage");
  const emptyState = getMesaDomRef("emptyState");
  if (!stage || !emptyState) return;

  const renderedTokens = [...getRenderedTokens()].sort((a, b) => (a.order || 0) - (b.order || 0));
  const nextTokenIds = new Set(renderedTokens.map(token => token.id));
  emptyState.hidden = renderedTokens.length > 0;

  mesaStageTokenElements.forEach((element, tokenId) => {
    if (!nextTokenIds.has(tokenId) || element.isConnected === false) {
      element.remove?.();
      mesaStageTokenElements.delete(tokenId);
    }
  });

  renderedTokens.forEach(token => {
    let element = mesaStageTokenElements.get(token.id);
    const contentSignature = getTokenContentSignature(token);

    if (!element || element.isConnected === false) {
      element = createMesaTokenElement(token);
      if (!element) return;
      mesaStageTokenElements.set(token.id, element);
      stage.appendChild(element);
    } else if (element.dataset.contentSignature !== contentSignature) {
      const nextElement = createMesaTokenElement(token);
      if (!nextElement) return;
      stage.insertBefore(nextElement, element);
      element.remove();
      element = nextElement;
      mesaStageTokenElements.set(token.id, element);
    }

    updateMesaTokenElementState(element, token);
    stage.appendChild(element);
  });
}

function getMesaStageRenderer() {
  const stage = getMesaDomRef("stage");
  if (!stage || !window.MesaRendererV2?.get) return null;
  if (mesaStageRenderer) return mesaStageRenderer;
  mesaStageRenderer = window.MesaRendererV2.get(stage, {
    workerUrl: "js/mesa-renderer-worker.js?v=2026-05-05-card-stability-1"
  });
  return mesaStageRenderer;
}

function renderCanvasStage() {
  const renderer = getMesaStageRenderer();
  if (!renderer?.enabled) return false;

  const stage = getMesaDomRef("stage");
  const emptyState = getMesaDomRef("emptyState");
  if (!stage || !emptyState) return false;

  const renderedTokens = [...getRenderedTokens()].sort((a, b) => (a.order || 0) - (b.order || 0));
  emptyState.hidden = renderedTokens.length > 0;
  clearDomStageTokenElements();

  lastCanvasStageSnapshot = {
    tokens: renderedTokens.map(createCanvasTokenSnapshot),
    selectedTokenId: state.selectedTokenId,
    draggingTokenId: state.drag?.tokenId || "",
    isFullscreen: state.fullscreenMode !== "off",
    isPlayerPerspective: isPlayerPerspective()
  };

  renderer.render(lastCanvasStageSnapshot);
  return true;
}

function clearDomStageTokenElements() {
  mesaStageTokenElements.forEach(element => {
    element.remove?.();
  });
  mesaStageTokenElements.clear();
}

function createCanvasTokenSnapshot(token) {
  const hiddenForMaster = isMaster() && !state.previewPlayerView && !token.visibleToPlayers;
  const statePillLabel = hiddenForMaster
    ? "Oculto"
    : token.type !== "player" && token.statsVisibleToPlayers !== true
      ? "Status restrito"
      : "";

  return {
    id: token.id,
    characterKey: token.characterKey,
    type: token.type,
    typeLabel: token.typeLabel,
    name: token.name,
    ownerCopy: getOwnerCopy(token.ownerUsername),
    imageUrl: token.imageUrl,
    initials: token.initials,
    x: token.x,
    y: token.y,
    order: token.order || 1,
    currentLife: token.currentLife,
    maxLife: token.maxLife,
    currentIntegrity: token.currentIntegrity,
    maxIntegrity: token.maxIntegrity,
    canViewStats: canViewTokenStats(token),
    hiddenForMaster,
    statePillLabel
  };
}

function refreshCanvasStageToken() {
  if (!mesaStageRenderer?.enabled || !lastCanvasStageSnapshot) return;
  renderCanvasStage();
}

function createMesaTokenElement(token) {
  const template = document.createElement("template");
  template.innerHTML = renderToken(token).trim();
  const element = template.content.firstElementChild;
  if (!element) return null;
  element.dataset.contentSignature = getTokenContentSignature(token);
  return element;
}

function getTokenContentSignature(token) {
  const hiddenForMaster = isMaster() && !state.previewPlayerView && !token.visibleToPlayers;
  return JSON.stringify({
    id: token.id,
    type: token.type,
    hiddenForMaster,
    canViewStats: canViewTokenStats(token),
    visibleToPlayers: token.visibleToPlayers !== false,
    statsVisibleToPlayers: token.statsVisibleToPlayers === true,
    typeLabel: token.typeLabel,
    name: token.name,
    ownerUsername: token.ownerUsername,
    imageUrl: token.imageUrl,
    initials: token.initials,
    currentLife: token.currentLife,
    maxLife: token.maxLife,
    currentIntegrity: token.currentIntegrity,
    maxIntegrity: token.maxIntegrity
  });
}

function updateMesaTokenElementState(element, token) {
  if (!element) return;
  element.classList.toggle("is-selected", token.id === state.selectedTokenId);
  element.style.left = `${token.x}%`;
  element.style.top = `${token.y}%`;
  element.style.zIndex = String(token.order || 1);
  element.dataset.contentSignature = getTokenContentSignature(token);
}

function updateStageTokenSelection(previousTokenId, nextTokenId) {
  if (mesaStageRenderer?.enabled) {
    refreshCanvasStageToken();
    return;
  }

  [previousTokenId, nextTokenId].forEach(tokenId => {
    if (!tokenId) return;
    const token = findToken(tokenId);
    const element = mesaStageTokenElements.get(tokenId);
    if (token && element) updateMesaTokenElementState(element, token);
  });
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
  const entry = getRosterEntryById(entryId);
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
  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;
  const token = findToken(tokenId);
  let orderChanged = false;
  if (token && isMaster()) {
    const previousOrder = token.order || 1;
    token.order = getNextOrder();
    orderChanged = token.order !== previousOrder;
  }
  if (orderChanged) {
    bumpMesaSceneVersion();
    broadcastMesaTokenMove(token);
  }
  persistState();
  updateStageTokenSelection(previousTokenId, tokenId);
  scheduleMesaRender({ inspector: true });
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

  bumpMesaSceneVersion();
  broadcastMesaTokenUpsert(token);
  persistState();
  scheduleMesaRender({ summary: true, controls: true, stage: true, inspector: true });
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
  broadcastMesaTokenUpsert(findToken(token.id) || token);
  scheduleMesaRender({ stage: true, inspector: true });
}

function handleTokenPointerDown(event) {
  if (state.drag) return;
  const target = resolveStagePointerTarget(event);
  if (!target) return;
  const tokenId = target.tokenId;
  const token = findToken(tokenId);
  if (!token) return;

  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;

  if (!canMoveTokens()) return;
  if (event.button !== 0) return;
  if (event.target.closest("input, button, a")) return;

  beginTokenDrag(target, token, event.clientX, event.clientY, event.pointerId);
  event.preventDefault();
  updateStageTokenSelection(previousTokenId, tokenId);
  scheduleMesaRender({ inspector: true });
}

function handleTokenMouseDown(event) {
  if (state.drag) return;
  const target = resolveStagePointerTarget(event);
  if (!target) return;
  const tokenId = target.tokenId;
  const token = findToken(tokenId);
  if (!token) return;

  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;

  if (!canMoveTokens()) return;
  if (event.button !== 0) return;
  if (event.target.closest("input, button, a")) return;

  beginTokenDrag(target, token, event.clientX, event.clientY, null);
  event.preventDefault();
  updateStageTokenSelection(previousTokenId, tokenId);
  scheduleMesaRender({ inspector: true });
}

function resolveStagePointerTarget(event) {
  const tokenElement = event.target.closest?.("[data-token-id]");
  if (tokenElement) {
    return {
      mode: "dom",
      tokenId: String(tokenElement.dataset.tokenId || ""),
      tokenElement
    };
  }

  const renderer = getMesaStageRenderer();
  const hit = renderer?.enabled ? renderer.hitTest(event.clientX, event.clientY) : null;
  if (!hit?.tokenId) return null;

  return {
    mode: "canvas",
    tokenId: hit.tokenId,
    tokenElement: null,
    bounds: hit.bounds,
    localX: hit.localX,
    localY: hit.localY
  };
}

function beginTokenDrag(target, token, clientX, clientY, pointerId) {
  const stage = getMesaDomRef("stage");
  if (!stage) return;

  const stageRect = stage.getBoundingClientRect();
  const tokenRect = target.tokenElement?.getBoundingClientRect?.() || target.bounds || {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  };
  const tokenLeft = Number.isFinite(tokenRect.left) ? tokenRect.left : stageRect.left + (target.bounds?.x || 0);
  const tokenTop = Number.isFinite(tokenRect.top) ? tokenRect.top : stageRect.top + (target.bounds?.y || 0);

  state.drag = {
    tokenId: token.id,
    mode: target.mode,
    tokenElement: target.tokenElement,
    stageRect,
    tokenWidth: tokenRect.width,
    tokenHeight: tokenRect.height,
    pointerOffsetX: clientX - tokenLeft,
    pointerOffsetY: clientY - tokenTop
  };

  token.order = getNextOrder();
  pendingDragPoint = null;
  target.tokenElement?.classList.add("is-dragging");
  updateMesaTokenElementState(target.tokenElement, token);
  if (mesaStageRenderer?.enabled) {
    const stageElement = getMesaDomRef("stage");
    stageElement.dataset.dragging = "true";
    mesaStageRenderer.setDraggingToken(token.id);
  }
  if (pointerId !== null && pointerId !== undefined) {
    target.tokenElement?.setPointerCapture?.(pointerId);
    if (!target.tokenElement) stage.setPointerCapture?.(pointerId);
  }
}

function handleDragMove(event) {
  if (!state.drag) return;
  scheduleDragPosition(event.clientX, event.clientY);
}

function handleDragEnd() {
  if (!state.drag) return;
  flushPendingDragPosition();
  flushRealtimeDragMove();
  const token = findToken(state.drag.tokenId);
  state.drag.tokenElement?.classList.remove("is-dragging");
  const stage = getMesaDomRef("stage");
  if (stage?.dataset) delete stage.dataset.dragging;
  mesaStageRenderer?.setDraggingToken("");
  state.drag = null;
  lastMesaDragEndAt = Date.now();
  bumpMesaSceneVersion();
  if (token) broadcastMesaTokenMove(token);
  persistState({ immediate: true });
  scheduleMesaRender({ stage: true, inspector: true });
}

function shouldIgnoreMesaStageClickAfterDrag() {
  return Date.now() - lastMesaDragEndAt < 120;
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
    state.drag.tokenElement.dataset.contentSignature = getTokenContentSignature(token);
  } else if (mesaStageRenderer?.enabled) {
    refreshCanvasStageToken();
  }

  queueRealtimeDragMove(token);
}

function scheduleDragPosition(clientX, clientY) {
  pendingDragPoint = { clientX, clientY };
  if (dragAnimationFrame) return;
  dragAnimationFrame = requestMesaRenderFrame(() => {
    dragAnimationFrame = 0;
    if (!pendingDragPoint || !state.drag) return;
    updateDragPosition(pendingDragPoint.clientX, pendingDragPoint.clientY);
    pendingDragPoint = null;
  });
}

function flushPendingDragPosition() {
  if (dragAnimationFrame) {
    cancelMesaRenderFrame(dragAnimationFrame);
    dragAnimationFrame = 0;
  }
  if (!pendingDragPoint || !state.drag) {
    pendingDragPoint = null;
    return;
  }
  updateDragPosition(pendingDragPoint.clientX, pendingDragPoint.clientY);
  pendingDragPoint = null;
}

function queueRealtimeDragMove(token) {
  if (!token || !isMaster()) return;
  pendingRealtimeDragMove = token;
  const elapsed = Date.now() - lastRealtimeDragMoveAt;

  if (elapsed >= MESA_REALTIME_DRAG_INTERVAL_MS) {
    flushRealtimeDragMove();
    return;
  }

  if (realtimeDragMoveTimer) return;
  realtimeDragMoveTimer = window.setTimeout(flushRealtimeDragMove, MESA_REALTIME_DRAG_INTERVAL_MS - elapsed);
}

function flushRealtimeDragMove() {
  if (realtimeDragMoveTimer) {
    window.clearTimeout(realtimeDragMoveTimer);
    realtimeDragMoveTimer = 0;
  }

  const token = pendingRealtimeDragMove;
  pendingRealtimeDragMove = null;
  if (!token || !isMaster()) return;
  lastRealtimeDragMoveAt = Date.now();
  broadcastMesaTokenMove(token);
}

function resetPrototype() {
  localStorage.removeItem(MESA_STORAGE_KEY);
  state.tokens = [];
  state.selectedTokenId = "";
  state.previewPlayerView = false;
  bumpMesaSceneVersion();
  broadcastMesaSceneClear();
  scheduleMesaRender({ summary: true, controls: true, roster: true, stage: true, inspector: true });
  persistState({ immediate: true });
}

function persistState(options = {}) {
  // Este payload guarda apenas o estado visual da cena.
  // Identidade, retrato e status continuam vindo da ficha.
  pendingPersistPayload = createMesaScenePayloadFromState();

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
  const payloadSignature = getMesaSceneSignature(payload);
  if (payloadSignature === lastPersistedMesaSceneSignature) {
    pendingPersistPayload = null;
    return;
  }

  localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(payload));
  pendingPersistPayload = null;
  lastPersistedMesaSceneSignature = payloadSignature;
  queueRemoteMesaPersist(payload, payloadSignature);
}

function canPersistRemoteMesaScene() {
  return Boolean(isMaster() && window.AUTH?.isBackendEnabled?.() && window.APP?.saveMesaScene);
}

function queueRemoteMesaPersist(payload, signature = getMesaSceneSignature(payload)) {
  if (!canPersistRemoteMesaScene()) return;
  if (
    signature === lastRemoteMesaSceneSignature
    || signature === pendingRemotePersistSignature
    || signature === activeRemotePersistSignature
  ) {
    return;
  }

  pendingRemotePersistPayload = payload;
  pendingRemotePersistSignature = signature;
  if (mesaRemotePersistInFlight) return;
  void runRemoteMesaPersist();
}

async function runRemoteMesaPersist() {
  if (!pendingRemotePersistPayload || !canPersistRemoteMesaScene()) return;
  mesaRemotePersistInFlight = true;

  while (pendingRemotePersistPayload) {
    const payload = pendingRemotePersistPayload;
    const payloadSignature = pendingRemotePersistSignature || getMesaSceneSignature(payload);
    pendingRemotePersistPayload = null;
    pendingRemotePersistSignature = "";
    activeRemotePersistSignature = payloadSignature;

    try {
      await window.APP.saveMesaScene(payload, {
        keepalive: document.visibilityState === "hidden"
      });
      state.scenePersistence = "remote";
      lastRemoteMesaSceneSignature = payloadSignature;
    } catch (error) {
      state.scenePersistence = "local";
      console.warn("Falha ao salvar cena oficial da mesa.", error);
    } finally {
      activeRemotePersistSignature = "";
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
      scheduleMesaRender({ summary: true, roster: true, stage: true, inspector: true });
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
  setMesaRoster(buildRoster());
  state.tokens = state.tokens
    .map(token => mergeTokenWithRoster(token, getRosterEntryByCharacterKey(token.characterKey || token.id)))
    .filter(Boolean);
  state.selectedTokenId = previousSelectedId;
  syncSelectedToken();
  persistState();
  scheduleMesaRender({ summary: true, roster: true, stage: true, inspector: true });
}

function handleMesaStorageSync(event) {
  if (![SHEETS_KEY, REMOTE_SHEETS_KEY].includes(String(event.key || ""))) return;
  refreshMesaRosterFromSheets();
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
  const panel = getMesaDomRef("mesaPanelStage");
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
  const panel = getMesaDomRef("mesaPanelStage");
  const isNative = Boolean(panel && document.fullscreenElement === panel);
  const isPseudo = Boolean(panel?.classList.contains("is-pseudo-fullscreen"));
  state.fullscreenMode = isNative ? "native" : isPseudo ? "pseudo" : "off";
  scheduleMesaRender({ controls: true, stage: true });
}

async function exitMesaFullscreen() {
  const panel = getMesaDomRef("mesaPanelStage");
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
  scheduleMesaRender({ controls: true, stage: true });
}

function enterPseudoFullscreen() {
  const panel = getMesaDomRef("mesaPanelStage");
  if (!panel) return;
  panel.classList.add("is-pseudo-fullscreen");
  document.body.classList.add("mesa-pseudo-fullscreen");
  state.fullscreenMode = "pseudo";
  scheduleMesaRender({ controls: true, stage: true });
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
          ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" width="256" height="256" loading="lazy" decoding="async" draggable="false" />`
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
  bumpMesaSceneVersion();
  broadcastMesaTokenUpsert(nextToken);
  persistState();
  scheduleMesaRender({ summary: true, controls: true, roster: true, stage: true, inspector: true });
}

function removeToken(tokenId) {
  const previousSelectedId = state.selectedTokenId;
  const removedTokenId = String(tokenId || "");
  state.tokens = state.tokens.filter(token => token.id !== tokenId);

  if (previousSelectedId !== tokenId && getRenderedTokens().some(token => token.id === previousSelectedId)) {
    state.selectedTokenId = previousSelectedId;
  } else {
    state.selectedTokenId = getNextSelectedTokenId();
  }

  bumpMesaSceneVersion();
  broadcastMesaTokenRemove(removedTokenId);
  persistState();
  scheduleMesaRender({ summary: true, controls: true, roster: true, stage: true, inspector: true });
}
