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
    .map(group => `
      <section class="roster-group">
        <div class="roster-group-head">
          <h3>${group.label}</h3>
          <span>${group.entries.length} registro${group.entries.length === 1 ? "" : "s"}</span>
        </div>
        ${group.entries.map(renderRosterEntry).join("")}
      </section>
    `)
    .join("");
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
      <div class="roster-entry-copy">
        <div class="roster-entry-headline">
          <strong class="roster-entry-name">${escapeHtml(entry.name)}</strong>
          <span class="token-type-badge" data-type="${entry.type}">${escapeHtml(entry.typeLabel)}</span>
        </div>
        <span class="roster-entry-meta">${escapeHtml(ownerCopy)}</span>
      </div>
      <div class="roster-entry-actions">
        <span class="status-chip">${stageChip}</span>
        <button
          type="button"
          class="mini-btn ${canAdd ? "is-primary" : ""}"
          data-roster-action="${primaryAction}"
          data-entry-id="${entry.id}"
          ${!canAdd && !canFocus ? "disabled" : ""}
        >
          ${primaryLabel}
        </button>
        ${isOnStage && isMaster() ? `
          <button type="button" class="mini-btn" data-roster-action="remove" data-entry-id="${entry.id}">
            Retirar
          </button>
        ` : ""}
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
        ${renderPlayerResourceEditor("Integridade", "currentIntegrity", currentIntegrity, maxIntegrity, "integ", selectedKey)}
      </div>

      ${renderPlayerIdentityEditor(sheet, selectedKey)}

      ${renderPlayerAttributeEditor(sheet, selectedKey)}

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

      ${renderPlayerInventoryList(inventory, selectedKey, inventorySlots)}
      ${renderPlayerMemoryList(memories)}
    </section>
  `;
}

function renderPlayerIdentityEditor(sheet, characterKey) {
  return `
    <section class="player-panel-section">
      <div class="player-panel-section-head">
        <h3>Dados rapidos</h3>
      </div>
      <div class="player-editor-grid">
        ${renderPlayerTextField("Nome", "charName", sheet.charName, characterKey)}
        ${renderPlayerTextField("Classe", "charClass", sheet.charClass, characterKey)}
        ${renderPlayerTextField("Raca", "charRace", sheet.charRace, characterKey)}
        ${renderPlayerTextField("Faccao", "charFaction", sheet.charFaction, characterKey)}
      </div>
      <label class="player-inline-field is-wide">
        <span>Anotacoes</span>
        <textarea
          rows="3"
          data-player-sheet-field="charNotes"
          data-character-key="${escapeAttribute(characterKey)}"
          aria-label="Anotacoes do personagem"
        >${escapeHtml(sheet.charNotes || "")}</textarea>
      </label>
    </section>
  `;
}

function renderPlayerTextField(label, field, value, characterKey) {
  return `
    <label class="player-inline-field">
      <span>${escapeHtml(label)}</span>
      <input
        type="text"
        data-player-sheet-field="${escapeAttribute(field)}"
        data-character-key="${escapeAttribute(characterKey)}"
        aria-label="${escapeAttribute(label)}"
        value="${escapeAttribute(value || "")}"
      />
    </label>
  `;
}

function renderPlayerAttributeEditor(sheet, characterKey) {
  const attributes = [
    ["Forca", "Forca"],
    ["Agilidade", "Agilidade"],
    ["Inteligencia", "Inteligencia"],
    ["Resistencia", "Resistencia"],
    ["Alma", "Alma"]
  ];

  return `
    <section class="player-panel-section">
      <div class="player-panel-section-head">
        <h3>Atributos</h3>
        <span>Integridade maxima pela Alma</span>
      </div>
      <div class="player-attribute-grid">
        ${attributes.map(([label, attr]) => {
          const field = `attr${attr}`;
          return `
            <label class="player-inline-field">
              <span>${escapeHtml(label)}</span>
              <input
                type="number"
                min="1"
                step="1"
                data-player-sheet-field="${escapeAttribute(field)}"
                data-character-key="${escapeAttribute(characterKey)}"
                aria-label="${escapeAttribute(label)}"
                value="${escapeAttribute(sheet[field] || "")}"
                placeholder="1"
              />
            </label>
          `;
        }).join("")}
      </div>
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

function renderPlayerInventoryList(inventory, characterKey, inventorySlots) {
  const canAdd = inventory.length < inventorySlots;
  if (!inventory.length) {
    return `
      <section class="player-panel-section">
        <div class="player-panel-section-head">
          <h3>Itens</h3>
          <button
            type="button"
            class="mini-btn"
            data-player-panel-action="add-inventory-item"
            data-character-key="${escapeAttribute(characterKey)}"
            ${canAdd ? "" : "disabled"}
          >
            Adicionar
          </button>
        </div>
        <p class="player-panel-empty">Nenhum item registrado na ficha.</p>
      </section>
    `;
  }

  return `
    <section class="player-panel-section">
      <div class="player-panel-section-head">
        <h3>Itens</h3>
        <div class="player-panel-section-actions">
          <span>${inventory.length}/${inventorySlots}</span>
          <button
            type="button"
            class="mini-btn"
            data-player-panel-action="add-inventory-item"
            data-character-key="${escapeAttribute(characterKey)}"
            ${canAdd ? "" : "disabled"}
          >
            Adicionar
          </button>
        </div>
      </div>
      <div class="player-panel-list">
        ${inventory.map((item, index) => renderPlayerInventoryItem(item, index, characterKey)).join("")}
      </div>
    </section>
  `;
}

function renderPlayerInventoryItem(item, index, characterKey) {
  return `
    <article class="player-list-card player-editor-card" data-player-item-index="${index}">
      <div class="player-editor-card-head">
        <span class="token-type-badge" data-type="player">${escapeHtml(formatMesaItemType(item.type))}</span>
        <button
          type="button"
          class="mini-btn"
          data-player-panel-action="remove-inventory-item"
          data-character-key="${escapeAttribute(characterKey)}"
          data-index="${index}"
        >
          Remover
        </button>
      </div>
      <label class="player-inline-field">
        <span>Nome</span>
        <input
          type="text"
          data-player-item-field="name"
          data-character-key="${escapeAttribute(characterKey)}"
          data-index="${index}"
          value="${escapeAttribute(item.name || "")}"
          placeholder="Item"
        />
      </label>
      <div class="player-editor-grid is-compact">
        <label class="player-inline-field">
          <span>Tipo</span>
          <select data-player-item-field="type" data-character-key="${escapeAttribute(characterKey)}" data-index="${index}">
            ${["arma", "acessorio", "outro"].map(type => `
              <option value="${type}" ${item.type === type ? "selected" : ""}>${escapeHtml(formatMesaItemType(type))}</option>
            `).join("")}
          </select>
        </label>
        <label class="player-inline-field">
          <span>Qtd</span>
          <input
            type="number"
            min="0"
            step="1"
            data-player-item-field="qty"
            data-character-key="${escapeAttribute(characterKey)}"
            data-index="${index}"
            value="${escapeAttribute(item.qty || "1")}"
          />
        </label>
      </div>
      ${item.type === "arma" ? `
        <label class="player-inline-field">
          <span>Dano</span>
          <input
            type="text"
            data-player-item-field="damage"
            data-character-key="${escapeAttribute(characterKey)}"
            data-index="${index}"
            value="${escapeAttribute(item.damage || "")}"
            placeholder="Ex.: 1d6"
          />
        </label>
      ` : ""}
      <details class="player-item-details" ${item.desc ? "open" : ""}>
        <summary>Detalhes</summary>
        <label class="player-inline-field is-wide">
          <span>Descricao</span>
          <textarea
            rows="2"
            data-player-item-field="desc"
            data-character-key="${escapeAttribute(characterKey)}"
            data-index="${index}"
            placeholder="Detalhes do item"
          >${escapeHtml(item.desc || "")}</textarea>
        </label>
      </details>
    </article>
  `;
}

function renderPlayerMemoryList(memories) {
  if (!memories.length) {
    return `
      <section class="player-panel-section">
        <div class="player-panel-section-head">
          <h3>Memorias</h3>
        </div>
        <p class="player-panel-empty">Nenhuma memoria possuida.</p>
      </section>
    `;
  }

  return `
    <section class="player-panel-section">
      <div class="player-panel-section-head">
        <h3>Memorias</h3>
        <span>${memories.length} memoria${memories.length === 1 ? "" : "s"}</span>
      </div>
      <div class="player-panel-list">
        ${memories.map(memory => `
          <article class="player-list-card">
            <span class="token-type-badge" data-type="npc">Memoria</span>
            <strong>${escapeHtml(memory.name || "Memoria sem nome")}</strong>
            <small>${escapeHtml(memory.desc || "Sem descricao.")}</small>
            ${memory.source ? `<small>Origem: ${escapeHtml(memory.source)}</small>` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function formatMesaItemType(type) {
  if (type === "arma") return "Arma";
  if (type === "acessorio") return "Acessorio";
  return "Outro";
}
