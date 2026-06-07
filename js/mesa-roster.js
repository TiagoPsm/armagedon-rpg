function renderSummary() {
  const renderedTokens = getRenderedTokens();
  const activeTokenCount = getMesaDomRef("activeTokenCount");
  const roleBadge = getMesaDomRef("roleBadge");
  const roleSummary = getMesaDomRef("roleSummary");
  const sceneStateTitle = getMesaDomRef("sceneStateTitle");
  const sceneStateCopy = getMesaDomRef("sceneStateCopy");

  if (activeTokenCount) activeTokenCount.textContent = String(renderedTokens.length);
  if (roleBadge) roleBadge.textContent = isMaster() ? "Mestre" : "Jogador";
  if (roleSummary) {
    roleSummary.textContent = isMaster()
      ? "Organiza tokens e transmite a cena para jogadores conectados."
      : "Ve a cena compartilhada e edita apenas o proprio estado.";
  }

  if (sceneStateTitle) {
    sceneStateTitle.textContent = renderedTokens.length ? "Cena em andamento" : "Mesa vazia";
  }

  if (sceneStateCopy) {
    if (state.scenePersistence === "remote") {
      if (state.realtimeStatus === "online") {
        sceneStateCopy.textContent = isMaster()
          ? "Cena salva no servidor e sincronizada em tempo real com jogadores conectados."
          : "Cena sincronizada em tempo real com a mesa do mestre.";
      } else {
        sceneStateCopy.textContent = isMaster()
          ? "Cena salva no servidor; tentando reconectar o tempo real."
          : "Cena carregada do servidor; tentando reconectar a sincronizacao.";
      }
    } else {
      sceneStateCopy.textContent = isMaster()
        ? "Arraste tokens e ajuste visibilidade. Sem API, a cena fica neste navegador."
        : "A cena respeita a visibilidade e libera so o seu proprio estado.";
    }
  }
}

function renderControls() {
  const previewRow = getMesaDomRef("previewRow");
  const previewToggle = getMesaDomRef("previewToggle");
  const stageViewBadge = getMesaDomRef("stageViewBadge");
  const stageHintBadge = getMesaDomRef("stageHintBadge");
  const resetMesaBtn = getMesaDomRef("resetMesaBtn");
  const fullscreenMesaBtn = getMesaDomRef("fullscreenMesaBtn");

  if (previewRow) {
    previewRow.classList.toggle("hidden", !isMaster());
    previewRow.classList.toggle("is-checked", Boolean(state.previewPlayerView));
  }

  if (previewToggle) {
    previewToggle.checked = Boolean(state.previewPlayerView);
    previewToggle.disabled = !isMaster();
  }

  if (stageViewBadge) {
    stageViewBadge.textContent = isMaster()
      ? state.previewPlayerView ? "Previa do jogador" : "Visao do mestre"
      : "Visao do jogador";
  }

  if (stageHintBadge) {
    stageHintBadge.textContent = canMoveTokens()
      ? "Arraste os tokens para organizar a cena."
      : "Selecione seu token para ajustar vida e integridade.";
  }

  if (resetMesaBtn) {
    resetMesaBtn.hidden = !isMaster();
    resetMesaBtn.disabled = !isMaster();
    resetMesaBtn.setAttribute("aria-hidden", isMaster() ? "false" : "true");
  }

  if (fullscreenMesaBtn) {
    const isFullscreen = state.fullscreenMode !== "off";
    fullscreenMesaBtn.textContent = isFullscreen ? "Sair da tela cheia" : "Tela cheia";
    fullscreenMesaBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
  }
}

function renderRoster() {
  const rosterList = getMesaDomRef("rosterList");
  const rosterCountBadge = getMesaDomRef("rosterCountBadge");
  const rosterSearch = getMesaDomRef("rosterSearchField");
  const rosterKicker = getMesaDomRef("rosterPanelKicker");
  const rosterTitle = getMesaDomRef("rosterPanelTitle");
  if (!rosterList || !rosterCountBadge) return;
  rosterList.classList.toggle("is-player-panel", !isMaster());

  if (!isMaster()) {
    if (rosterSearch) rosterSearch.hidden = true;
    if (rosterKicker) rosterKicker.textContent = "Ficha rapida";
    if (rosterTitle) rosterTitle.textContent = "Meu personagem";
    renderPlayerSheetPanel(rosterList, rosterCountBadge);
    return;
  }

  if (rosterSearch) rosterSearch.hidden = false;
  if (rosterKicker) rosterKicker.textContent = "Escalacao";
  if (rosterTitle) rosterTitle.textContent = "Adicionar a mesa";

  const filteredRoster = getFilteredRoster();
  const availableCount = filteredRoster.filter(entry => !findToken(entry.id)).length;
  rosterCountBadge.textContent = `${availableCount}/${filteredRoster.length} para colocar`;

  if (!filteredRoster.length) {
    rosterList.innerHTML = `
      <div class="token-inspector-empty">
        <strong>Nenhum registro</strong>
        <p>A busca atual nao encontrou personagens para esta cena.</p>
      </div>
    `;
    return;
  }

  const groups = ["player", "npc", "monster"]
    .map(type => ({
      type,
      label: TYPE_LABELS[type],
      entries: filteredRoster.filter(entry => entry.type === type)
    }))
    .filter(group => group.entries.length);

  rosterList.innerHTML = groups
    .map(group => {
      const storageKey = `mesa_roster_open_${group.type}`;
      const isOpen = localStorage.getItem(storageKey) !== "0";
      return `
        <details class="roster-group" data-group-type="${group.type}"${isOpen ? " open" : ""}>
          <summary class="roster-group-head">
            <span class="roster-group-chevron" aria-hidden="true"></span>
            <h3>${group.label}</h3>
            <span>${group.entries.length}</span>
          </summary>
          <div class="roster-group-body">
            ${group.entries.map(renderRosterEntry).join("")}
          </div>
        </details>
      `;
    })
    .join("");

  // Persiste estado aberto/fechado no localStorage
  rosterList.querySelectorAll(".roster-group").forEach(function(details) {
    details.addEventListener("toggle", function() {
      const type = details.dataset.groupType;
      if (type) localStorage.setItem(`mesa_roster_open_${type}`, details.open ? "1" : "0");
    });
  });
}

function renderRosterEntry(entry) {
  const token = findToken(entry.id);
  const isOnStage = Boolean(token);
  const canAdd = isMaster() && !isOnStage;
  const canFocus = isOnStage;
  const ownerCopy = getOwnerCopy(entry.ownerUsername);
  const stageChip = isOnStage ? "Em cena" : canAdd ? "Pronto" : "Fora da cena";
  const primaryAction = canAdd ? "add" : canFocus ? "focus" : "noop";
  const primaryLabel = canAdd ? "Colocar" : "Focar";

  return `
    <article class="roster-entry" data-type="${entry.type}" data-state="${isOnStage ? "on-stage" : "off-stage"}">
      <strong class="roster-entry-name">${escapeHtml(entry.name)}</strong>
      <div class="roster-entry-actions">
        <button
          type="button"
          class="mini-btn ${canAdd ? "is-primary" : ""}"
          data-roster-action="${primaryAction}"
          data-entry-id="${entry.id}"
          ${!canAdd && !canFocus ? "disabled" : ""}
        >${primaryLabel}</button>
        ${isOnStage && isMaster() ? `<button type="button" class="mini-btn" data-roster-action="remove" data-entry-id="${entry.id}">Retirar</button>` : ""}
      </div>
    </article>
  `;
}

function renderPlayerSheetPanel(rosterList, rosterCountBadge) {
  const context = getOwnPlayerContext();
  const source = context.token || context.rosterEntry;
  const sheet = context.sheet;
  const characterName = String(sheet.charName || source?.name || state.session?.username || "Personagem").trim();
  const avatar = String(sheet.avatar || source?.imageUrl || "").trim();
  const initials = getInitials(characterName);
  const currentLife = clamp(asPositiveInt(sheet.vidaAtual, source?.currentLife || 0), 0, asPositiveInt(sheet.vidaMax, source?.maxLife || 0));
  const maxLife = Math.max(1, asPositiveInt(sheet.vidaMax, source?.maxLife || 1));
  const currentIntegrity = clamp(asPositiveInt(sheet.integAtual, source?.currentIntegrity || 0), 0, asPositiveInt(sheet.integMax, source?.maxIntegrity || 0));
  const maxIntegrity = Math.max(0, asPositiveInt(sheet.integMax, source?.maxIntegrity || 0));
  const inventory = Array.isArray(sheet.inv) ? sheet.inv.map(normalizeMesaItem) : [];
  const memories = Array.isArray(sheet.ownedMemories) ? sheet.ownedMemories.filter(memory => String(memory.name || memory.desc || "").trim()) : [];
  const inventorySlots = Math.max(MESA_DEFAULT_INVENTORY_SLOTS, asPositiveInt(sheet.inventorySlots, MESA_DEFAULT_INVENTORY_SLOTS), inventory.length);
  const selectedKey = context.characterKey || normalizeMesaCharacterKey(state.session?.username);

  rosterCountBadge.textContent = context.isOnStage ? "Em cena" : "Fora da cena";

  rosterList.innerHTML = `
    <section class="player-sheet-panel" data-character-key="${escapeAttribute(selectedKey)}">
      <div class="player-sheet-hero">
        <div class="player-sheet-avatar">
          ${avatar
            ? `<img src="${escapeAttribute(avatar)}" alt="${escapeAttribute(characterName)}" width="104" height="104" loading="lazy" decoding="async" draggable="false" />`
            : `<span class="mesa-token-avatar-fallback">${escapeHtml(initials)}</span>`}
        </div>
        <div class="player-sheet-copy">
          <span class="token-type-badge" data-type="player">Jogador</span>
          <h3>${escapeHtml(characterName)}</h3>
          <p>${context.isOnStage ? "Seu token esta no palco compartilhado." : "O mestre ainda nao colocou seu token na cena."}</p>
        </div>
      </div>

      ${renderPlayerTokenSelector(context, selectedKey)}

      <div class="player-resource-grid">
        ${renderPlayerResourceEditor("Vida", "currentLife", currentLife, maxLife, "vida", selectedKey, {
          editableMaxField: "vidaMax"
        })}
        ${renderPlayerResourceEditor("Integridade", "currentIntegrity", currentIntegrity, maxIntegrity, "integ", selectedKey, {
          editableMaxField: "integMax"
        })}
      </div>

      <div class="player-panel-meta-grid">
        <article class="player-summary-card">
          <span class="panel-kicker">Inventario</span>
          <strong>${inventory.length}/${inventorySlots}</strong>
          <small>Slots ocupados</small>
        </article>
        <article class="player-summary-card">
          <span class="panel-kicker">Memorias</span>
          <strong>${memories.length}</strong>
          <small>Registradas na ficha</small>
        </article>
      </div>

      <p class="player-panel-hint">Para editar atributos, inventario, memorias e dados da ficha, use sua Ficha de Personagem.</p>
    </section>
  `;
}

function renderPlayerTokenSelector(context, selectedKey) {
  const entries = context.entries || [];
  if (entries.length <= 1) {
    return context.isOnStage
      ? `<button type="button" class="mini-btn player-focus-btn" data-player-panel-action="focus-own" data-character-key="${escapeAttribute(selectedKey)}">Focar meu token</button>`
      : "";
  }

  return `
    <div class="player-token-selector" aria-label="Selecionar personagem proprio">
      ${entries.map(entry => {
        const key = normalizeMesaCharacterKey(entry.characterKey || entry.id);
        const token = context.tokens.find(item => normalizeMesaCharacterKey(item.characterKey || item.id) === key);
        return `
          <button
            type="button"
            class="mini-btn ${key === selectedKey ? "is-primary" : ""}"
            data-player-panel-action="select-own"
            data-character-key="${escapeAttribute(key)}"
          >
            ${escapeHtml(entry.name || key)}${token ? "" : " (fora)"}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderPlayerResourceEditor(label, field, current, max, type, characterKey, options = {}) {
  const editableMaxField = String(options.editableMaxField || "");
  return `
    <article class="player-resource-card">
      <div class="bar-label-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span>${current}/${max}</span>
      </div>
      <div class="player-stat-inputs ${editableMaxField ? "has-editable-max" : ""}">
        <input
          type="number"
          min="0"
          max="${max}"
          step="1"
          inputmode="numeric"
          data-player-stat-field="${field}"
          data-character-key="${escapeAttribute(characterKey)}"
          aria-label="${escapeAttribute(`${label} atual`)}"
          value="${current}"
        />
        ${editableMaxField ? `
          <label>
            <span>Max</span>
            <input
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              data-player-sheet-field="${escapeAttribute(editableMaxField)}"
              data-character-key="${escapeAttribute(characterKey)}"
              aria-label="${escapeAttribute(`${label} maxima`)}"
              value="${max}"
            />
          </label>
        ` : `<span>/ ${max}</span>`}
      </div>
      <div class="bar-preview is-${type === "vida" ? "life" : "integrity"}">
        <span style="${getBarFillStyle(type, current, max)}"></span>
      </div>
    </article>
  `;
}

