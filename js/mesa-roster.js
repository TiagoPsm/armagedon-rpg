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

  if (fullscreenMesaBtn) {
    const isFullscreen = state.fullscreenMode !== "off";
    fullscreenMesaBtn.textContent = isFullscreen ? "Sair da tela cheia" : "Tela cheia";
    fullscreenMesaBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
  }
}

function renderRoster() {
  const rosterList = getMesaDomRef("rosterList");
  const rosterCountBadge = getMesaDomRef("rosterCountBadge");
  if (!rosterList || !rosterCountBadge) return;

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
