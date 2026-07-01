const mesaStageTokenElements = new Map();
let pendingRealtimeDragMove = null;
let realtimeDragMoveTimer = 0;
let lastRealtimeDragMoveAt = 0;
let lastMesaDragEndAt = 0;
let _tokenResizeDrag = null; // { tokenId, startX, startY, startScale, tokenEl }
const MESA_REALTIME_DRAG_INTERVAL_MS = 50;

function renderStage() {
  // Token da Mesa e sempre o estilo redondo (minimal), renderizado via DOM.
  renderDomStage();
}

function renderDomStage() {
  const stage = getMesaDomRef("stage");
  const emptyState = getMesaDomRef("emptyState");
  if (!stage || !emptyState) return;
  // Estilo unico (redondo); mantido no data attr para as regras de CSS
  stage.dataset.tokenStyle = "minimal";

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

// Token na camada secreta do mestre ("dm") ou marcado oculto aparece esmaecido
// SO para o mestre. Jogadores nem recebem esses tokens no render (getRenderedTokens).
function isTokenHiddenForMaster(token) {
  return isMaster() && (token.visibleToPlayers === false || token.layer === "dm");
}

// Rotulo da pill de estado secreto: "Mestre" para a camada DM, senao "Oculto".
function getTokenSecretLabel(token) {
  return token.layer === "dm" ? "Mestre" : "Oculto";
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
  const hiddenForMaster = isTokenHiddenForMaster(token);
  return JSON.stringify({
    id: token.id,
    type: token.type,
    hiddenForMaster,
    layer: token.layer === "dm" ? "dm" : "tokens",
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
    maxIntegrity: token.maxIntegrity,
    tokenScale: token.tokenScale || 1,
    canResize: canResizeToken(token)
  });
}

function updateMesaTokenElementState(element, token) {
  if (!element) return;
  element.classList.toggle("is-selected", token.id === state.selectedTokenId);
  element.style.left = `${token.x}%`;
  element.style.top = `${token.y}%`;
  element.style.zIndex = String(token.order || 1);
  element.style.setProperty("--token-scale", String(token.tokenScale || 1));
  element.dataset.contentSignature = getTokenContentSignature(token);
}

function updateStageTokenSelection(previousTokenId, nextTokenId) {
  // Atualiza os dois elementos DOM afetados no lugar
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
  const echoButton = event.target.closest("[data-echo-action]");
  if (echoButton) {
    handlePlayerEchoAction(echoButton);
    return;
  }

  const playerButton = event.target.closest("[data-player-panel-action]");
  if (playerButton) {
    handlePlayerPanelAction(playerButton);
    return;
  }

  const button = event.target.closest("[data-roster-action]");
  if (!button) return;
  if (!isMaster()) return;
  const action = String(button.dataset.rosterAction || "");
  const entryId = String(button.dataset.entryId || "");
  const entry = getRosterEntryById(entryId);
  if (!entry) return;

  if (action === "add") {
    addTokenToStage(entry);
    return;
  }

  if (action === "focus") {
    selectToken(entry.id);
    return;
  }

  if (action === "remove") {
    removeToken(entry.id);
  }
}

function handlePlayerPanelAction(button) {
  if (isMaster()) return;
  const action = String(button.dataset.playerPanelAction || "");
  const characterKey = normalizeMesaCharacterKey(button.dataset.characterKey);
  if (!characterKey || !canReceiveSheetPatch(characterKey)) return;

  state.playerPanelCharacterKey = characterKey;
  if (action === "add-inventory-item") {
    mutatePlayerPanelInventory(characterKey, {
      action: "add"
    });
    return;
  }

  if (action === "remove-inventory-item") {
    mutatePlayerPanelInventory(characterKey, {
      action: "remove",
      index: Number.parseInt(button.dataset.index || "-1", 10)
    });
    return;
  }

  if (action === "select-own" || action === "focus-own") {
    const token = getOwnPlayerTokens().find(entry => normalizeMesaCharacterKey(entry.characterKey || entry.id) === characterKey);
    if (token) {
      selectToken(token.id);
      return;
    }
  }
  scheduleMesaRender({ roster: true, inspector: true });
}

function selectToken(tokenId) {
  if (!isMaster() && !getRenderedTokens().some(token => token.id === tokenId)) return;
  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;
  const token = findToken(tokenId);
  let orderChanged = false;
  if (token && isMaster() && tokenId !== previousTokenId) {
    const previousOrder = token.order || 1;
    token.order = getNextOrder();
    orderChanged = token.order !== previousOrder;
  }
  if (orderChanged) {
    bumpMesaSceneVersion();
    broadcastMesaTokenMove(token);
  }
  if (isMaster() && orderChanged) persistState();
  updateStageTokenSelection(previousTokenId, tokenId);
  scheduleMesaRender({ inspector: true });
}

function handleInspectorAction(event) {
  const button = event.target.closest("[data-inspector-action]");
  if (!button) return;
  const action = String(button.dataset.inspectorAction || "");
  const token = getSelectedToken();
  if (!token) return;
  if (!isMaster()) return;

  if (action === "toggle-visibility") {
    token.visibleToPlayers = !token.visibleToPlayers;
  }

  if (action === "toggle-layer") {
    // Move o token entre a camada de tokens e a camada secreta do mestre.
    token.layer = token.layer === "dm" ? "tokens" : "dm";
  }

  if (action === "toggle-stats-visibility" && canConfigureStatsVisibility(token)) {
    token.statsVisibleToPlayers = !token.statsVisibleToPlayers;
  }

  if (action === "center") {
    const centerPosition = getCenterStagePosition();
    token.x = centerPosition.x;
    token.y = centerPosition.y;
    token.order = getNextOrder();
  }

  if (action === "remove") {
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
  if (isBlankMesaNumberInput(input)) return;
  if (field === "maxLife" || field === "maxIntegrity") return;

  // Echo nao tem ficha: Vida/Integridade atuais vivem na tabela echos e
  // sincronizam por um canal proprio (mesa:echo:vitals), nao pelo sheet patch.
  if (token.type === "echo") {
    if (!canEditCurrentStats(token)) return;
    if (field !== "currentLife" && field !== "currentIntegrity") return;
    const isLife = field === "currentLife";
    const max = isLife ? token.maxLife : token.maxIntegrity;
    const value = clamp(asPositiveInt(input.value, isLife ? token.currentLife : token.currentIntegrity), 0, max);
    updateEchoTokenVitals(token, isLife ? { vidaAtual: value } : { integAtual: value });
    syncInspectorStatInputCard(input, field, getSelectedToken() || token);
    scheduleMesaRender({ stage: true });
    return;
  }

  const nextValue = Number.parseInt(input.value, 10);
  const sheetPatch = buildSheetPatchFromMesa(field, nextValue, token);
  if (!sheetPatch) return;

  applySheetPatchFromMesa(token.characterKey, sheetPatch, { render: false });
  syncInspectorStatInputCard(input, field, getSelectedToken() || token);
  broadcastMesaSheetPatch(token.characterKey, sheetPatch);
  scheduleMesaRender({ stage: true });
}

function handleMesaNumericInputCommit(event) {
  const input = event.target.closest(
    "input[type='number'][data-stat-field], input[type='number'][data-player-stat-field], input[type='number'][data-player-sheet-field], input[type='number'][data-player-item-field]"
  );
  if (!input) return;
  if (isBlankMesaNumberInput(input)) {
    restoreBlankMesaNumberInput(input);
  }
  if (input.matches("[data-stat-field]")) {
    commitInspectorMaxInputClamp(input);
    scheduleMesaRender({ inspector: true });
  }

  if (input.matches("[data-player-sheet-field]")) {
    commitPlayerPanelMaxInputClamp(input);
  }
}

function commitInspectorMaxInputClamp(input) {
  const field = String(input.dataset.statField || "");
  if (field !== "maxLife" && field !== "maxIntegrity") return;
  const token = getSelectedToken();
  if (!token || !canEditAllStats(token)) return;
  const sheet = getStoredMesaSheetSnapshot(token.characterKey) || buildMesaSheetSnapshotFromEntry(token) || {};
  const isLife = field === "maxLife";
  const max = Math.max(isLife ? 1 : 0, asPositiveInt(input.value, isLife ? token.maxLife : token.maxIntegrity));
  const rawCurrent = asPositiveInt(isLife ? sheet.vidaAtual : sheet.integAtual, isLife ? token.currentLife : token.currentIntegrity);
  const current = clamp(rawCurrent, 0, max);
  const patch = isLife
    ? { vidaMax: String(max) }
    : { integMax: String(max) };

  if (rawCurrent !== current) {
    if (isLife) {
      patch.vidaAtual = String(current);
    } else {
      patch.integAtual = String(current);
    }
  }

  applySheetPatchFromMesa(token.characterKey, patch, { render: false });
  broadcastMesaSheetPatch(token.characterKey, patch);
  syncInspectorStatInputCard(input, field, getSelectedToken() || token);
  scheduleMesaRender({ stage: true });
}

function commitPlayerPanelMaxInputClamp(input) {
  const field = String(input.dataset.playerSheetField || "");
  if (field !== "vidaMax" && field !== "integMax") return;
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  if (!characterKey || !canReceiveSheetPatch(characterKey)) return;
  const context = getOwnPlayerContext(characterKey);
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const isLife = field === "vidaMax";
  const max = Math.max(isLife ? 1 : 0, asPositiveInt(input.value, isLife ? sheet.vidaMax || 1 : sheet.integMax || 0));
  const rawCurrent = asPositiveInt(isLife ? sheet.vidaAtual : sheet.integAtual, isLife ? context?.token?.currentLife || 0 : context?.token?.currentIntegrity || 0);
  const current = clamp(rawCurrent, 0, max);
  if (rawCurrent === current) return;

  applyPlayerPanelSheetPatch(characterKey, isLife ? { vidaAtual: String(current) } : { integAtual: String(current) }, {
    renderRoster: false,
    sourceInput: input
  });
}

function handlePlayerPanelStatInput(event) {
  if (isMaster()) return;

  const statInput = event.target.closest("[data-player-stat-field]");
  if (statInput) {
    handlePlayerPanelResourceInput(statInput);
    return;
  }

  const sheetInput = event.target.closest("[data-player-sheet-field]");
  if (sheetInput) {
    handlePlayerPanelSheetFieldInput(sheetInput);
    return;
  }

  const itemInput = event.target.closest("[data-player-item-field]");
  if (itemInput) {
    handlePlayerPanelInventoryInput(itemInput);
  }
}

function handlePlayerPanelResourceInput(input) {
  const field = String(input.dataset.playerStatField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  if (!field || !characterKey || !canReceiveSheetPatch(characterKey)) return;
  if (isBlankMesaNumberInput(input)) return;

  const context = getOwnPlayerContext(characterKey);
  const sheetPatch = buildPlayerPanelResourcePatch(field, Number.parseInt(input.value, 10), context);
  if (!sheetPatch) return;

  state.playerPanelCharacterKey = characterKey;
  applySheetPatchFromMesa(characterKey, sheetPatch, { render: false });
  syncPlayerStatInputCard(input, field);
  broadcastMesaSheetPatch(characterKey, sheetPatch);
  scheduleMesaRender({ summary: true, stage: true, inspector: true });
}

function handlePlayerPanelSheetFieldInput(input) {
  const field = String(input.dataset.playerSheetField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  if (!field || !characterKey || !canReceiveSheetPatch(characterKey)) return;
  if (isBlankMesaNumberInput(input)) return;

  const context = getOwnPlayerContext(characterKey);
  const sheetPatch = buildPlayerPanelFieldPatch(field, input.value, context);
  if (!sheetPatch) return;

  applyPlayerPanelSheetPatch(characterKey, sheetPatch, {
    renderRoster: false,
    sourceInput: input
  });
}

function handlePlayerPanelInventoryInput(input) {
  const field = String(input.dataset.playerItemField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  const index = Number.parseInt(input.dataset.index || "-1", 10);
  if (!field || !characterKey || Number.isNaN(index) || index < 0 || !canReceiveSheetPatch(characterKey)) return;
  if (isBlankMesaNumberInput(input)) return;

  mutatePlayerPanelInventory(characterKey, {
    action: "update",
    index,
    field,
    value: input.value
  });
}

function isBlankMesaNumberInput(input) {
  return input?.type === "number" && String(input.value ?? "").trim() === "";
}

function restoreBlankMesaNumberInput(input) {
  if (input.matches("[data-stat-field]")) {
    restoreInspectorStatInput(input);
    return;
  }

  if (input.matches("[data-player-stat-field]")) {
    restorePlayerPanelResourceInput(input);
    return;
  }

  if (input.matches("[data-player-sheet-field]")) {
    restorePlayerPanelSheetNumberInput(input);
    return;
  }

  if (input.matches("[data-player-item-field]")) {
    restorePlayerPanelItemNumberInput(input);
  }
}

function restoreInspectorStatInput(input) {
  const token = getSelectedToken();
  const field = String(input.dataset.statField || "");
  if (!token || !field) return;
  const values = {
    currentLife: token.currentLife,
    maxLife: token.maxLife,
    currentIntegrity: token.currentIntegrity,
    maxIntegrity: token.maxIntegrity
  };
  if (values[field] === undefined) return;
  input.value = String(values[field]);
  syncInspectorStatInputCard(input, field, token);
}

function restorePlayerPanelResourceInput(input) {
  const field = String(input.dataset.playerStatField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  if (!field || !characterKey) return;
  const context = getOwnPlayerContext(characterKey);
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const value = getPlayerPanelResourceValue(field, sheet, context);
  if (value === null) return;
  input.value = String(value);
  syncPlayerStatInputCard(input, field);
}

function restorePlayerPanelSheetNumberInput(input) {
  const field = String(input.dataset.playerSheetField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  if (!field || !characterKey) return;
  const context = getOwnPlayerContext(characterKey);
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const value = getPlayerPanelSheetNumberValue(field, sheet, context);
  if (value === null) return;
  input.value = String(value);
}

function restorePlayerPanelItemNumberInput(input) {
  const field = String(input.dataset.playerItemField || "");
  const characterKey = normalizeMesaCharacterKey(input.dataset.characterKey);
  const index = Number.parseInt(input.dataset.index || "-1", 10);
  if (field !== "qty" || !characterKey || Number.isNaN(index) || index < 0) return;
  const context = getOwnPlayerContext(characterKey);
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const item = Array.isArray(sheet.inv) ? sheet.inv[index] : null;
  input.value = String(Math.max(0, Number.parseInt(item?.qty || "1", 10) || 0));
}

function getPlayerPanelResourceValue(field, sheet, context) {
  if (field === "currentLife") {
    const maxLife = Math.max(1, asPositiveInt(sheet.vidaMax, context?.token?.maxLife || context?.rosterEntry?.maxLife || 1));
    return clamp(asPositiveInt(sheet.vidaAtual, context?.token?.currentLife || context?.rosterEntry?.currentLife || 0), 0, maxLife);
  }

  if (field === "currentIntegrity") {
    const maxIntegrity = Math.max(0, asPositiveInt(sheet.integMax, context?.token?.maxIntegrity || context?.rosterEntry?.maxIntegrity || 0));
    return clamp(asPositiveInt(sheet.integAtual, context?.token?.currentIntegrity || context?.rosterEntry?.currentIntegrity || 0), 0, maxIntegrity);
  }

  return null;
}

function getPlayerPanelSheetNumberValue(field, sheet, context) {
  if (field === "vidaMax") {
    return Math.max(1, asPositiveInt(sheet.vidaMax, context?.token?.maxLife || context?.rosterEntry?.maxLife || 1));
  }

  if (field === "integMax") {
    return Math.max(0, asPositiveInt(sheet.integMax, context?.token?.maxIntegrity || context?.rosterEntry?.maxIntegrity || 0));
  }

  if (field === "vidaAtual") {
    const maxLife = Math.max(1, asPositiveInt(sheet.vidaMax, 1));
    return clamp(asPositiveInt(sheet.vidaAtual, 0), 0, maxLife);
  }

  if (field === "integAtual") {
    const maxIntegrity = Math.max(0, asPositiveInt(sheet.integMax, 0));
    return clamp(asPositiveInt(sheet.integAtual, 0), 0, maxIntegrity);
  }

  if (MESA_ATTRIBUTE_NAMES.map(attr => `attr${attr}`).includes(field)) {
    return normalizeMesaAttrValue(sheet[field], "1");
  }

  return null;
}

function syncInspectorStatInputCard(input, field, token) {
  // Suporta o card do mestre (.player-vital-card, novo visual) e o antigo
  // .stat-editor — qualquer um que envolva o input editado.
  const card = input?.closest?.(".player-vital-card") || input?.closest?.(".stat-editor");
  if (!card || !token) return;
  const isLife = field === "currentLife" || field === "maxLife";
  const currentField = isLife ? "currentLife" : "currentIntegrity";
  const maxField = isLife ? "maxLife" : "maxIntegrity";
  const current = asPositiveInt(token[currentField], 0);
  const max = asPositiveInt(token[maxField], 0);
  const currentInput = card.querySelector(`[data-stat-field="${currentField}"]`);
  const maxInput = card.querySelector(`[data-stat-field="${maxField}"]`);

  if (currentInput) {
    currentInput.max = String(max);
    if (document.activeElement !== currentInput && String(currentInput.value) !== String(current)) {
      currentInput.value = String(current);
    }
  }

  if (maxInput && document.activeElement !== maxInput && String(maxInput.value) !== String(max)) {
    maxInput.value = String(max);
  }

  // Leitura "atual/max": markup novo (.player-vital-readout) ou antigo (.bar-label-row).
  const readoutCurrent = card.querySelector(".player-vital-readout strong");
  if (readoutCurrent) readoutCurrent.textContent = String(current);
  const readoutMax = card.querySelector(".player-vital-max");
  if (readoutMax) readoutMax.textContent = `/ ${max}`;
  const valueLabel = card.querySelector(".bar-label-row span:last-child");
  if (valueLabel) valueLabel.textContent = `${current}/${max}`;

  const bar = card.querySelector(".bar-preview span");
  if (bar) {
    bar.setAttribute("style", getBarFillStyle(isLife ? "vida" : "integ", current, max));
  }
}

function handleTokenPointerDown(event) {
  if (state.drag) return;
  // Bloqueia interação com tokens quando a camada mapa está ativa
  if (typeof getMesaActiveLayer === "function" && getMesaActiveLayer() !== "tokens") return;
  if (event.target.classList?.contains("mesa-token-resize-handle")) {
    handleResizePointerDown(event);
    return;
  }
  const target = resolveStagePointerTarget(event);
  if (!target) {
    // Espaço vazio: deselect acontece no evento 'click' (ver handleStageEmptyClick)
    // para não conflitar com pan (arrastar não dispara click no browser)
    return;
  }
  const tokenId = target.tokenId;
  const token = findToken(tokenId);
  if (!token) return;

  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;

  if (!canMoveTokens(token)) return;
  if (event.button !== 0) return;
  if (event.target.closest("input, button, a")) return;

  beginTokenDrag(target, token, event.clientX, event.clientY, event.pointerId);
  event.preventDefault();
  updateStageTokenSelection(previousTokenId, tokenId);
  scheduleMesaRender({ inspector: true });
}

function handleTokenMouseDown(event) {
  if (state.drag) return;
  // Bloqueia interação com tokens quando a camada mapa está ativa
  if (typeof getMesaActiveLayer === "function" && getMesaActiveLayer() !== "tokens") return;
  if (event.target.classList?.contains("mesa-token-resize-handle")) return; // handled by pointer
  const target = resolveStagePointerTarget(event);
  if (!target) {
    // Espaço vazio: deselect acontece no evento 'click' (ver handleStageEmptyClick)
    return;
  }
  const tokenId = target.tokenId;
  const token = findToken(tokenId);
  if (!token) return;

  const previousTokenId = state.selectedTokenId;
  state.selectedTokenId = tokenId;

  if (!canMoveTokens(token)) return;
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

  // Token e sempre DOM (estilo redondo): sem hit-test de canvas.
  return null;
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
  if (pointerId !== null && pointerId !== undefined) {
    target.tokenElement?.setPointerCapture?.(pointerId);
    if (!target.tokenElement) stage.setPointerCapture?.(pointerId);
  }
}

function handleDragMove(event) {
  if (_tokenResizeDrag) { handleResizePointerMove(event); return; }
  if (!state.drag) return;
  scheduleDragPosition(event.clientX, event.clientY);
}

function handleDragEnd() {
  if (_tokenResizeDrag) { handleResizePointerUp(); return; }
  if (!state.drag) return;
  flushPendingDragPosition();
  flushRealtimeDragMove();
  const token = findToken(state.drag.tokenId);
  state.drag.tokenElement?.classList.remove("is-dragging");
  const stage = getMesaDomRef("stage");
  if (stage?.dataset) delete stage.dataset.dragging;
  document.body.classList.remove("mesa-drag-active");
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
  if (_tokenResizeDrag) { handleResizePointerMove(event); return; }
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
  if (!isMaster()) return;
  localStorage.removeItem(MESA_STORAGE_KEY);
  state.tokens = [];
  state.selectedTokenId = "";
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
      // Tokens da camada secreta do mestre ("dm") NUNCA saem para o backend —
      // so existem no cliente do mestre (mesmo padrao dos tracos de desenho).
      const remotePayload = {
        ...payload,
        tokens: payload.tokens.filter(token => token.layer !== "dm")
      };
      await window.APP.saveMesaScene(remotePayload, {
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
  }

  if (field === "currentIntegrity" && canEditCurrentStats(token)) {
    patch.integAtual = String(clamp(asPositiveInt(nextValue, token.currentIntegrity), 0, token.maxIntegrity));
  }

  if (field === "maxIntegrity" && canEditAllStats(token)) {
    const nextMaxIntegrity = asPositiveInt(nextValue, token.maxIntegrity);
    patch.integMax = String(nextMaxIntegrity);
  }

  return Object.keys(patch).length ? patch : null;
}

function buildPlayerPanelResourcePatch(field, nextValue, context) {
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const vidaMax = Math.max(1, asPositiveInt(sheet.vidaMax, context?.token?.maxLife || context?.rosterEntry?.maxLife || 1));
  const integMax = Math.max(0, asPositiveInt(sheet.integMax, context?.token?.maxIntegrity || context?.rosterEntry?.maxIntegrity || 0));

  if (field === "currentLife") {
    return {
      vidaAtual: String(clamp(asPositiveInt(nextValue, sheet.vidaAtual || 0), 0, vidaMax))
    };
  }

  if (field === "currentIntegrity") {
    return {
      integAtual: String(clamp(asPositiveInt(nextValue, sheet.integAtual || 0), 0, integMax))
    };
  }

  return null;
}

function buildPlayerPanelFieldPatch(field, value, context) {
  const sheet = normalizeMesaSheetSnapshot(context?.sheet || {});
  const patch = {};

  if (MESA_SHEET_TEXT_FIELDS.has(field)) {
    patch[field] = normalizeMesaSheetTextField(field, value);
  }

  if (field === "vidaMax") {
    const nextMaxLife = Math.max(1, asPositiveInt(value, sheet.vidaMax || 1));
    patch.vidaMax = String(nextMaxLife);
  }

  if (field === "vidaAtual") {
    const maxLife = Math.max(1, asPositiveInt(sheet.vidaMax, 1));
    patch.vidaAtual = String(clamp(asPositiveInt(value, sheet.vidaAtual || 0), 0, maxLife));
  }

  if (field === "integAtual") {
    const maxIntegrity = Math.max(0, asPositiveInt(sheet.integMax, 0));
    patch.integAtual = String(clamp(asPositiveInt(value, sheet.integAtual || 0), 0, maxIntegrity));
  }

  if (field === "integMax") {
    const nextMaxIntegrity = Math.max(0, asPositiveInt(value, sheet.integMax || 0));
    patch.integMax = String(nextMaxIntegrity);
  }

  if (MESA_ATTRIBUTE_NAMES.map(attr => `attr${attr}`).includes(field)) {
    patch[field] = normalizeMesaAttrValue(value, sheet[field] || "1");
  }

  return Object.keys(patch).length ? patch : null;
}

function applyPlayerPanelSheetPatch(characterKey, patch, options = {}) {
  const payload = normalizeMesaSheetPatchPayload({
    characterKey,
    ...patch
  });
  if (!payload.characterKey || !Object.keys(payload.patch).length) return;

  state.playerPanelCharacterKey = payload.characterKey;
  applySheetPatchFromMesa(payload.characterKey, payload.patch, { render: false });
  broadcastMesaSheetPatch(payload.characterKey, payload.patch);

  if (options.renderRoster) {
    scheduleMesaRender({ summary: true, roster: true, stage: true, inspector: true });
    return;
  }

  syncPlayerPanelFieldAfterPatch(options.sourceInput, payload.patch);
  scheduleMesaRender({ summary: true, stage: true, inspector: true });
}

function syncPlayerPanelFieldAfterPatch(input, patch) {
  if (!input || !patch) return;
  const field = String(input.dataset?.playerSheetField || "");
  if (field && patch[field] !== undefined && String(input.value) !== String(patch[field])) {
    input.value = String(patch[field]);
  }

  if (field === "vidaMax") {
    const card = input.closest(".player-resource-card");
    const currentInput = card?.querySelector('[data-player-stat-field="currentLife"]');
    if (currentInput) {
      currentInput.max = String(patch.vidaMax || currentInput.max || "0");
      if (patch.vidaAtual !== undefined) {
        currentInput.value = String(patch.vidaAtual);
      }
      syncPlayerStatInputCard(currentInput, "currentLife");
    }
  }

  if (field === "integMax") {
    const card = input.closest(".player-resource-card");
    const currentInput = card?.querySelector('[data-player-stat-field="currentIntegrity"]');
    if (currentInput) {
      currentInput.max = String(patch.integMax || currentInput.max || "0");
      if (patch.integAtual !== undefined) {
        currentInput.value = String(patch.integAtual);
      }
      syncPlayerStatInputCard(currentInput, "currentIntegrity");
    }
  }
}

function mutatePlayerPanelInventory(characterKey, mutation) {
  const context = getOwnPlayerContext(characterKey);
  const sheet = normalizeMesaSheetSnapshot(context.sheet || {});
  const inventory = Array.isArray(sheet.inv) ? sheet.inv.map(normalizeMesaItem) : [];
  const inventorySlots = Math.max(
    MESA_DEFAULT_INVENTORY_SLOTS,
    asPositiveInt(sheet.inventorySlots, MESA_DEFAULT_INVENTORY_SLOTS),
    inventory.length
  );

  if (mutation.action === "add") {
    if (inventory.length >= inventorySlots) return;
    inventory.push(normalizeMesaItem({
      name: "",
      qty: "1",
      type: "outro",
      damage: "",
      desc: ""
    }));
    applyPlayerPanelSheetPatch(characterKey, { inv: inventory }, { renderRoster: true });
    return;
  }

  if (mutation.action === "remove") {
    if (Number.isNaN(mutation.index) || mutation.index < 0 || mutation.index >= inventory.length) return;
    inventory.splice(mutation.index, 1);
    applyPlayerPanelSheetPatch(characterKey, { inv: inventory }, { renderRoster: true });
    return;
  }

  if (mutation.action !== "update") return;
  if (Number.isNaN(mutation.index) || mutation.index < 0 || mutation.index >= inventory.length) return;
  const item = {
    ...inventory[mutation.index],
    [mutation.field]: mutation.value
  };
  inventory[mutation.index] = normalizeMesaItem(item);
  applyPlayerPanelSheetPatch(characterKey, { inv: inventory }, {
    renderRoster: mutation.field === "type"
  });
}

function applySheetPatchFromMesa(characterKey, patch, options = {}) {
  if (!applySheetPatchToMesaCaches(characterKey, patch)) return;
  rememberMesaOptimisticSheetPatch(characterKey, patch);
  scheduleMesaRemoteSheetPatch(characterKey, patch);
  applySheetPatchToMesaState(characterKey, options);
}

function syncPlayerStatInputCard(input, field) {
  const card = input?.closest?.(".player-vital-card");
  if (!card) return;
  const max = asPositiveInt(input.max, 0);
  const current = clamp(asPositiveInt(input.value, 0), 0, max);
  if (String(input.value) !== String(current)) input.value = String(current);

  // Leitura grande do atual no cabecalho do card ("<atual> / <max>")
  const readoutCurrent = card.querySelector(".player-vital-readout strong");
  if (readoutCurrent) readoutCurrent.textContent = String(current);

  const bar = card.querySelector(".bar-preview span");
  if (bar) {
    const type = field === "currentLife" ? "vida" : "integ";
    bar.setAttribute("style", getBarFillStyle(type, current, max));
  }
}

function buildMesaRosterEntryFromSheet(characterKey, existingEntry = null) {
  const key = normalizeMesaCharacterKey(characterKey);
  if (!key) return null;
  const fallbackSheet = buildMesaSheetSnapshotFromEntry(existingEntry);
  const sheet = getStoredMesaSheetSnapshot(key) || fallbackSheet;
  if (!sheet) return existingEntry || null;
  const type = existingEntry?.type
    || (key.startsWith(NPC_PREFIX) ? "npc" : key.startsWith(MONSTER_PREFIX) ? "monster" : "player");
  const ownerUsername = existingEntry?.ownerUsername || (type === "player" ? key : "mestre");
  const name = String(sheet.charName || existingEntry?.name || ownerUsername || key).trim() || "Sem nome";

  return createRosterEntry({
    id: existingEntry?.id || key,
    characterKey: key,
    type,
    ownerUsername,
    createdBy: existingEntry?.createdBy || "mestre",
    name,
    imageUrl: sheet.avatar || existingEntry?.imageUrl || "",
    currentLife: sheet.vidaAtual,
    maxLife: sheet.vidaMax,
    currentIntegrity: sheet.integAtual,
    maxIntegrity: sheet.integMax,
    statsVisibleToPlayers: existingEntry?.statsVisibleToPlayers
  });
}

function applySheetPatchToMesaState(characterKey, options = {}) {
  const key = normalizeMesaCharacterKey(characterKey);
  if (!key) return false;
  const currentEntry = getRosterEntryByCharacterKey(key) || getRosterEntryById(key);
  const nextEntry = buildMesaRosterEntryFromSheet(key, currentEntry);
  if (!nextEntry) return false;

  let entryFound = false;
  const nextRoster = state.roster.map(entry => {
    if (normalizeMesaCharacterKey(entry.characterKey || entry.id) !== key) return entry;
    entryFound = true;
    return nextEntry;
  });

  if (entryFound) {
    setMesaRoster(nextRoster);
  }

  let tokensChanged = false;
  state.tokens = state.tokens.map(token => {
    if (normalizeMesaCharacterKey(token.characterKey || token.id) !== key) return token;
    const mergedToken = mergeTokenWithRoster(token, nextEntry) || token;
    tokensChanged = tokensChanged || JSON.stringify(token) !== JSON.stringify(mergedToken);
    return mergedToken;
  });

  syncSelectedToken();

  if (options.render !== false) {
    scheduleMesaRender({
      summary: true,
      roster: entryFound,
      stage: tokensChanged,
      inspector: true
    });
  }

  return true;
}

function applySheetPatchToMesaCaches(characterKey, patch) {
  const key = normalizeMesaCharacterKey(characterKey);
  if (!key || !patch || !Object.keys(patch).length) return false;
  const localSheets = readJsonStorage(SHEETS_KEY, {});
  const remoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
  const localHasEntry = Object.prototype.hasOwnProperty.call(localSheets, key);
  const remoteHasEntry = Object.prototype.hasOwnProperty.call(remoteSheets, key);
  const rosterFallback = buildMesaSheetSnapshotFromEntry(getRosterEntryByCharacterKey(key));
  const baseSheet = normalizeMesaSheetSnapshot(
    remoteHasEntry ? remoteSheets[key] : localHasEntry ? localSheets[key] : rosterFallback || {}
  );
  const nextSheet = normalizeMesaSheetSnapshot({
    ...baseSheet,
    ...patch
  });

  if (localHasEntry || !remoteHasEntry) {
    localSheets[key] = {
      ...localSheets[key],
      ...nextSheet
    };
    localStorage.setItem(SHEETS_KEY, JSON.stringify(localSheets));
  }

  if (remoteHasEntry) {
    remoteSheets[key] = {
      ...remoteSheets[key],
      ...nextSheet
    };
    localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(remoteSheets));
  }

  return true;
}

function scheduleMesaRemoteSheetPatch(characterKey, patch) {
  if (!window.AUTH?.isBackendEnabled?.() || !window.APP?.saveCharacter) {
    setPlayerSheetSyncStatus("local");
    return;
  }
  const key = normalizeMesaCharacterKey(characterKey);
  if (!key || !patch || !Object.keys(patch).length) return;
  setPlayerSheetSyncStatus("saving");

  const previousPatch = pendingMesaSheetPatches.get(key) || {};
  pendingMesaSheetPatches.set(key, {
    ...previousPatch,
    ...patch
  });

  const existingTimer = mesaSheetSaveTimers.get(key);
  if (existingTimer) window.clearTimeout(existingTimer);

  const timer = window.setTimeout(() => {
    mesaSheetSaveTimers.delete(key);
    persistMesaSheetPatch(key);
  }, 500);
  mesaSheetSaveTimers.set(key, timer);
}

async function flushPendingMesaSheetPatches(options = {}) {
  const keys = new Set([
    ...pendingMesaSheetPatches.keys(),
    ...mesaSheetSaveTimers.keys()
  ]);

  mesaSheetSaveTimers.forEach(timer => {
    window.clearTimeout(timer);
  });
  mesaSheetSaveTimers.clear();

  await Promise.all([...keys].map(key => persistMesaSheetPatch(key, options)));
}

async function persistMesaSheetPatch(characterKey, options = {}) {
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
    const saved = await window.APP.saveCharacter(characterKey, nextData, {
      keepalive: options.keepalive === true
    });

    if (saved?.data) {
      const nextRemoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
      const newerPatch = pendingMesaSheetPatches.get(characterKey);
      const savedData = newerPatch
        ? {
            ...saved.data,
            ...newerPatch
          }
        : saved.data;
      nextRemoteSheets[characterKey] = mergeMesaOptimisticSheetPatch(characterKey, savedData);
      localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(nextRemoteSheets));
      setPlayerSheetSyncStatus("saved");
      applySheetPatchToMesaState(characterKey, { render: false });
      scheduleMesaRender({ summary: true, stage: true, inspector: true });
    }
  } catch (error) {
    setPlayerSheetSyncStatus("error");
    console.warn("Falha ao salvar estado da mesa no servidor.", error);
  }
}

function setPlayerSheetSyncStatus(status) {
  const normalizedStatus = ["idle", "local", "saving", "saved", "error"].includes(String(status))
    ? String(status)
    : "idle";
  state.playerSheetSyncStatus = normalizedStatus;
  syncPlayerSheetSyncStatusElement();
}

function syncPlayerSheetSyncStatusElement() {
  const row = document.querySelector("[data-player-sync-status]");
  if (!row) return;
  const status = typeof getPlayerSheetSyncStatusCopy === "function"
    ? getPlayerSheetSyncStatusCopy()
    : { key: "saved", label: "Sincronizado" };
  row.dataset.playerSyncStatus = status.key;
  const copy = row.querySelector("[data-player-sync-copy]");
  if (copy) copy.textContent = status.label;
}

function normalizeMesaSheetSnapshot(raw) {
  const attrSnapshot = Object.fromEntries(
    MESA_ATTRIBUTE_NAMES.map(attr => {
      const field = `attr${attr}`;
      return [field, raw?.[field] === undefined ? "" : normalizeMesaAttrValue(raw[field], "")];
    })
  );
  return {
    vidaAtual: raw?.vidaAtual ?? "",
    vidaMax: raw?.vidaMax ?? "",
    integAtual: raw?.integAtual ?? "",
    integMax: raw?.integMax ?? "",
    charName: raw?.charName ?? "",
    charClass: raw?.charClass ?? "",
    charRace: raw?.charRace ?? "",
    charFaction: raw?.charFaction ?? "",
    charNotes: raw?.charNotes ?? "",
    avatar: raw?.avatar ?? "",
    ...attrSnapshot,
    inventorySlots: raw?.inventorySlots ?? MESA_DEFAULT_INVENTORY_SLOTS,
    inv: Array.isArray(raw?.inv) ? raw.inv.map(normalizeMesaItem) : [],
    ownedMemories: Array.isArray(raw?.ownedMemories) ? raw.ownedMemories.map(normalizeMesaOwnedMemory) : []
  };
}

function refreshMesaRosterFromSheets(options = {}) {
  const previousSelectedId = state.selectedTokenId;
  setMesaRoster(buildRoster());
  state.tokens = state.tokens
    .map(token => mergeTokenWithRoster(token, getRosterEntryByCharacterKey(token.characterKey || token.id)))
    .filter(Boolean);
  state.selectedTokenId = previousSelectedId;
  syncSelectedToken();
  if (options.persistScene !== false) persistState();
  if (options.render !== false) {
    scheduleMesaRender({ summary: true, roster: true, stage: true, inspector: true });
  }
}

function handleMesaStorageSync(event) {
  if (![SHEETS_KEY, REMOTE_SHEETS_KEY].includes(String(event.key || ""))) return;
  refreshMesaRosterFromSheets({ persistScene: false });
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
  if (isMaster()) return state.tokens;
  // Jogador nao ve tokens ocultos NEM os da camada secreta do mestre ("dm").
  return state.tokens.filter(token => token.visibleToPlayers !== false && token.layer !== "dm");
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
  return getRenderedTokens().find(token => token.id === state.selectedTokenId) || null;
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

// Sem token: capacidade geral (mestre, ou jogador com a trava aberta).
// Com token: o jogador so pode arrastar o proprio token.
function canMoveTokens(token = null) {
  if (isMaster()) return true;
  if (state.role !== "player" || state.playersMoveLocked) return false;
  return token ? isOwnPlayerToken(token) : true;
}

function canViewTokenStats(token) {
  if (!token) return false;
  return canViewDetailedTokenInfo(token);
}

function canEditCurrentStats(token) {
  if (!token) return false;
  if (isMaster()) return true;
  return state.role === "player" && (isOwnPlayerToken(token) || isOwnEchoToken(token));
}

// Edicao de maximos (Vida/Integridade) e so do mestre e nao se aplica a Echos:
// o maximo do Echo e ajustado pelo mestre na pagina de Echos, nao na Mesa
// (a Mesa nao sabe persistir maximos de Echo pelo fluxo de ficha).
function canEditAllStats(token) {
  return Boolean(token) && isMaster() && token.type !== "echo";
}

function canConfigureStatsVisibility(token) {
  return Boolean(token) && isMaster() && token.type !== "player";
}

function isPlayerPerspective() {
  return !isMaster();
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
  return renderedTokens[0]?.id || "";
}

function getOwnerCopy(ownerUsername) {
  const owner = String(ownerUsername || "").trim();
  if (!owner || owner === "mestre") return "Controlado pelo mestre";
  return `Dono: ${owner}`;
}


/* ── TOKEN RESIZE ────────────────────────────────────────────── */

function handleResizePointerDown(event) {
  const handle = event.target.closest(".mesa-token-resize-handle");
  if (!handle) return;
  const tokenId = String(handle.dataset.tokenId || "");
  const token = findToken(tokenId);
  if (!token || !canResizeToken(token)) return;

  event.preventDefault();
  event.stopPropagation();

  const tokenEl = document.querySelector(`.mesa-token[data-token-id="${CSS.escape(tokenId)}"]`);
  _tokenResizeDrag = {
    tokenId,
    startX: event.clientX,
    startY: event.clientY,
    startScale: token.tokenScale || 1,
    tokenEl
  };
  document.body.classList.add("mesa-resize-active");
}

function handleResizePointerMove(event) {
  if (!_tokenResizeDrag) return;
  const dx = event.clientX - _tokenResizeDrag.startX;
  const dy = event.clientY - _tokenResizeDrag.startY;
  // Diagonal drag: down-right = bigger, up-left = smaller
  const delta = (dx + dy) / 300;
  const newScale = Math.max(0.25, Math.min(4.0, _tokenResizeDrag.startScale + delta));
  if (_tokenResizeDrag.tokenEl?.isConnected) {
    _tokenResizeDrag.tokenEl.style.setProperty("--token-scale", newScale.toFixed(3));
  }
}

function handleResizePointerUp() {
  if (!_tokenResizeDrag) return;
  const tokenEl = _tokenResizeDrag.tokenEl;
  const tokenId = _tokenResizeDrag.tokenId;
  const token = findToken(tokenId);

  if (token && tokenEl?.isConnected) {
    const scaleStr = tokenEl.style.getPropertyValue("--token-scale");
    const scale = parseFloat(scaleStr);
    if (scale > 0 && isFinite(scale)) {
      token.tokenScale = parseFloat(scale.toFixed(2));
    }
    bumpMesaSceneVersion();
    persistState({ immediate: true });
    scheduleMesaRender({ stage: true, inspector: true });
  }

  _tokenResizeDrag = null;
  document.body.classList.remove("mesa-resize-active");
}

function canResizeToken(token) {
  if (!token) return false;
  if (isMaster()) return true;
  const myUsername = normalizeMesaUsername(state.session?.username);
  return Boolean(myUsername && normalizeMesaUsername(token.ownerUsername || token.characterKey || token.id) === myUsername);
}


function renderToken(token) {
  // Estilo unico: token redondo (minimal).
  return renderTokenMinimal(token);
}

function renderTokenMinimal(token) {
  const hiddenForMaster = isTokenHiddenForMaster(token);
  const selectedClass = token.id === state.selectedTokenId ? "is-selected" : "";
  const hiddenClass = hiddenForMaster ? "is-hidden-master" : "";
  const layerClass = token.layer === "dm" ? "is-layer-dm" : "";
  const scale = token.tokenScale || 1;
  const resizeHandle = canResizeToken(token)
    ? `<div class="mesa-token-resize-handle" data-token-id="${token.id}" title="Redimensionar token"></div>`
    : "";
  const hiddenBadge = hiddenForMaster
    ? `<span class="mesa-token-minimal-badge is-hidden-badge">${getTokenSecretLabel(token)}</span>`
    : "";

  return `
    <article
      class="mesa-token is-minimal ${selectedClass} ${hiddenClass} ${layerClass}"
      data-token-id="${token.id}"
      data-type="${token.type}"
      style="left:${token.x}%; top:${token.y}%; z-index:${token.order || 1}; --token-scale:${scale};"
    >
      <div class="mesa-token-avatar">
        ${token.imageUrl
          ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" width="128" height="128" loading="lazy" decoding="async" draggable="false" />`
          : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
        ${hiddenBadge}
      </div>
      <h3 class="mesa-token-name">${escapeHtml(token.name)}</h3>
      ${resizeHandle}
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
  // Token nasce na camada ativa: se o mestre estiver na camada "dm", entra secreto.
  const activeLayer = (typeof getMesaActiveLayer === "function" && getMesaActiveLayer() === "dm") ? "dm" : "tokens";
  const nextToken = {
    ...entry,
    visibleToPlayers: true,
    layer: activeLayer,
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

/* ── Echos do jogador: invocar / retirar a partir do painel lateral ─────── */

function handlePlayerEchoAction(button) {
  const action = String(button.dataset.echoAction || "");
  const echoId = String(button.dataset.echoId || "");
  if (!echoId) return;
  if (action === "summon") {
    summonOwnEchoToStage(echoId);
  } else if (action === "remove") {
    removeOwnEchoFromStage(echoId);
  }
}

// Coloca o Echo do jogador no centro do palco. Se ja estiver na cena, apenas
// foca. Broadcast + persistencia seguem broadcastEchoTokenUpsert (mestre persiste
// ao receber; o jogador grava no cache local via persistState).
function summonOwnEchoToStage(echoId) {
  const rosterEntry = getRosterEntryByCharacterKey(normalizeMesaCharacterKey(`echo:${echoId}`));
  if (!rosterEntry || !isOwnEchoToken(rosterEntry)) return;

  if (isEchoOnStage(echoId)) {
    selectToken(rosterEntry.id);
    return;
  }

  const center = getCenterStagePosition();
  const token = {
    ...rosterEntry,
    visibleToPlayers: true,
    statsVisibleToPlayers: normalizeStatsVisibility(rosterEntry.type, rosterEntry.statsVisibleToPlayers),
    x: center.x,
    y: center.y,
    order: getNextOrder(),
    tokenScale: 1
  };

  state.tokens = [...state.tokens, token];
  state.selectedTokenId = token.id;
  bumpMesaSceneVersion();
  broadcastEchoTokenUpsert(token);
  persistState();
  scheduleMesaRender({ summary: true, controls: true, roster: true, stage: true, inspector: true });
}

function removeOwnEchoFromStage(echoId) {
  const key = normalizeMesaCharacterKey(`echo:${echoId}`);
  const token = state.tokens.find(item => normalizeMesaCharacterKey(item.characterKey || item.id) === key);
  if (!token || !isOwnEchoToken(token)) return;

  const removedTokenId = token.id;
  state.tokens = state.tokens.filter(item => item.id !== removedTokenId);
  if (state.selectedTokenId === removedTokenId) {
    state.selectedTokenId = getNextSelectedTokenId();
  }

  bumpMesaSceneVersion();
  broadcastEchoTokenRemove(token);
  persistState();
  scheduleMesaRender({ summary: true, controls: true, roster: true, stage: true, inspector: true });
}

