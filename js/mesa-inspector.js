function renderInspector() {
  const inspector = document.getElementById("tokenInspector");
  if (!inspector) return;

  const token = getSelectedToken();
  if (!token) {
    inspector.innerHTML = `
      <div class="token-inspector-empty">
        <strong>Selecione um token</strong>
        <p>Escolha um retrato no palco para ajustar a cena.</p>
      </div>
    `;
    return;
  }

  const canEditCurrent = canEditCurrentStats(token);
  const canEditAll = canEditAllStats(token);
  const canViewStats = canViewTokenStats(token);
  const isHiddenForPlayers = !token.visibleToPlayers;

  inspector.innerHTML = `
    <section class="token-inspector-card" data-type="${token.type}">
      <div class="token-inspector-hero">
        <div class="token-inspector-avatar">
          ${token.imageUrl
            ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" draggable="false" />`
            : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
        </div>
        <div class="token-inspector-copy">
          <div class="token-inspector-badges">
            <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
            ${isHiddenForPlayers ? `<span class="token-state-pill">Oculto</span>` : ""}
            ${token.type !== "player" && token.statsVisibleToPlayers !== true ? `<span class="token-state-pill">Status restrito</span>` : ""}
          </div>
          <h3 class="token-inspector-name">${escapeHtml(token.name)}</h3>
          <p class="token-inspector-owner">${escapeHtml(token.ownerUsername === "mestre" ? "Controlado pelo mestre" : `Pertence a ${token.ownerUsername}`)}</p>
        </div>
      </div>
    </section>

    ${buildInspectorStatsSection(token, canEditCurrent, canEditAll, canViewStats)}

    <section class="token-inspector-controls">
      <h3>Cena e acoes</h3>
      <div class="inspector-meta-grid">
        <article class="inspector-meta-card">
          <span class="panel-kicker">Posicao X</span>
          <strong>${Math.round(token.x)}%</strong>
        </article>
        <article class="inspector-meta-card">
          <span class="panel-kicker">Posicao Y</span>
          <strong>${Math.round(token.y)}%</strong>
        </article>
      </div>

      <div class="inspector-control-grid">
        ${isMaster()
          ? `
            <div class="inspector-row">
              <div class="inspector-row-copy">
                <strong>Visibilidade</strong>
                <small>Controla se o retrato aparece para jogadores.</small>
              </div>
              <button type="button" class="mini-btn ${token.visibleToPlayers ? "" : "is-primary"}" data-inspector-action="toggle-visibility">
                ${token.visibleToPlayers ? "Visivel" : "Oculto"}
              </button>
            </div>

            ${canConfigureStatsVisibility(token) ? `
              <div class="inspector-row">
                <div class="inspector-row-copy">
                  <strong>Status</strong>
                  <small>Libera Vida e Integridade para jogadores.</small>
                </div>
                <button type="button" class="mini-btn ${token.statsVisibleToPlayers ? "is-primary" : ""}" data-inspector-action="toggle-stats-visibility">
                  ${token.statsVisibleToPlayers ? "Liberados" : "Ocultos"}
                </button>
              </div>
            ` : ""}

            <div class="inspector-row">
              <div class="inspector-row-copy">
                <strong>Palco</strong>
                <small>Centralize ou retire este token do palco.</small>
              </div>
              <div class="roster-entry-actions">
                <button type="button" class="mini-btn" data-inspector-action="center">Centralizar</button>
                <button type="button" class="mini-btn" data-inspector-action="remove">Retirar</button>
              </div>
            </div>
          `
          : `
            <div class="inspector-row">
              <div class="inspector-row-copy">
                <strong>Permissao atual</strong>
                <small>${canEditCurrent ? "Voce pode ajustar Vida e Integridade deste token." : "Este token fica em modo somente leitura."}</small>
              </div>
              <span class="status-chip">${canEditCurrent ? "Edicao parcial" : "Somente leitura"}</span>
            </div>
          `}
      </div>
    </section>

    ${buildInspectorNote(token, canEditCurrent, canEditAll, canViewStats)}
  `;
}

function buildInspectorStatsSection(token, canEditCurrent, canEditAll, canViewStats) {
  if (!canViewStats) {
    const hiddenCopy = isMaster()
      ? "Na previa do jogador, estes numeros ficam ocultos ate a liberacao."
      : "O mestre ainda nao liberou Vida e Integridade deste token.";
    return `
      <section class="token-inspector-stats">
        <h3>Estado</h3>
        <div class="inspector-row is-status-hidden">
          <div class="inspector-row-copy">
            <strong>Status oculto</strong>
            <small>${hiddenCopy}</small>
          </div>
          <span class="status-chip">Oculto</span>
        </div>
      </section>
    `;
  }

  return `
    <section class="token-inspector-stats">
      <h3>Estado</h3>
      <div class="stats-grid">
        <div class="stat-editor">
          <div class="bar-label-row">
            <span class="bar-label">Vida</span>
            <span>${token.currentLife}/${token.maxLife}</span>
          </div>
          <div class="stat-editor-inputs">
            <input type="number" min="0" step="1" data-stat-field="currentLife" value="${token.currentLife}" ${canEditCurrent ? "" : "disabled"} />
            <span class="stat-divider">/</span>
            <input type="number" min="1" step="1" data-stat-field="maxLife" value="${token.maxLife}" ${canEditAll ? "" : "disabled"} />
          </div>
          <div class="bar-preview is-life"><span style="${getBarFillStyle("vida", token.currentLife, token.maxLife)}"></span></div>
        </div>

        <div class="stat-editor">
          <div class="bar-label-row">
            <span class="bar-label">Integridade</span>
            <span>${token.currentIntegrity}/${token.maxIntegrity}</span>
          </div>
          <div class="stat-editor-inputs">
            <input type="number" min="0" step="1" data-stat-field="currentIntegrity" value="${token.currentIntegrity}" ${canEditCurrent ? "" : "disabled"} />
            <span class="stat-divider">/</span>
            <input type="number" min="0" step="1" data-stat-field="maxIntegrity" value="${token.maxIntegrity}" ${canEditAll ? "" : "disabled"} />
          </div>
          <div class="bar-preview is-integrity"><span style="${getBarFillStyle("integ", token.currentIntegrity, token.maxIntegrity)}"></span></div>
        </div>
      </div>
    </section>
  `;
}

function buildInspectorNote(token, canEditCurrent, canEditAll, canViewStats) {
  if (!canViewStats) {
    const hiddenStatusNote = isMaster()
      ? "Jogadores so veem estes numeros quando o mestre libera o token."
      : "NPCs e monstros podem ficar na cena sem expor seus numeros.";
    return `
      <div class="inspector-note">
        <strong>Status restrito</strong>
        ${hiddenStatusNote}
      </div>
    `;
  }

  if (isMaster()) {
    return `
      <div class="inspector-note">
        <strong>Cena oficial</strong>
        Status usa a ficha quando a API esta ativa; posicao dos tokens ainda fica local ate o realtime.
      </div>
    `;
  }

  if (canEditCurrent) {
    return `
      <div class="inspector-note">
        <strong>Seu token</strong>
        Alteracoes de Vida e Integridade sao enviadas a ficha quando a API esta ativa.
      </div>
    `;
  }

  return `
    <div class="inspector-note">
      <strong>Somente leitura</strong>
      A mesa respeita o bloqueio de edicao para tokens que nao sao seus.
    </div>
  `;
}
