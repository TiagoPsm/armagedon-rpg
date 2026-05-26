function renderInspector() {
  const inspector = getMesaDomRef("tokenInspector");
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
  if (!isMaster() && !canViewDetailedTokenInfo(token)) {
    renderRestrictedPlayerInspector(inspector, token);
    return;
  }
  const isHiddenForPlayers = !token.visibleToPlayers;

  inspector.innerHTML = `
    <section class="token-inspector-card" data-type="${token.type}">
      <div class="token-inspector-hero">
        <div class="token-inspector-avatar">
          ${token.imageUrl
            ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" width="120" height="120" loading="lazy" decoding="async" draggable="false" />`
            : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
        </div>
        <div class="token-inspector-copy">
          <div class="token-inspector-badges">
            <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
            ${isHiddenForPlayers ? `<span class="token-state-pill">Oculto</span>` : ""}
            ${!canViewStats ? `<span class="token-state-pill">Status restrito</span>` : ""}
          </div>
          <h3 class="token-inspector-name">${escapeHtml(token.name)}</h3>
          <p class="token-inspector-owner">${escapeHtml(token.ownerUsername === "mestre" ? "Controlado pelo mestre" : `Pertence a ${token.ownerUsername}`)}</p>
        </div>
      </div>
    </section>

    ${buildInspectorStatsSection(token, canEditCurrent, canEditAll, canViewStats)}

    <section class="token-inspector-controls">
      <h3>A&ccedil;&otilde;es</h3>
      <div class="inspector-action-list">
        ${isMaster()
          ? `
            <div class="inspector-action-row">
              <span class="inspector-action-label">Visibilidade</span>
              <div class="inspector-action-btns">
                <button type="button" class="mini-btn ${token.visibleToPlayers ? "" : "is-primary"}" data-inspector-action="toggle-visibility">
                  ${token.visibleToPlayers ? "Vis&iacute;vel" : "Oculto"}
                </button>
              </div>
            </div>

            ${canConfigureStatsVisibility(token) ? `
              <div class="inspector-action-row">
                <span class="inspector-action-label">Status dos jogadores</span>
                <div class="inspector-action-btns">
                  <button type="button" class="mini-btn ${token.statsVisibleToPlayers ? "is-primary" : ""}" data-inspector-action="toggle-stats-visibility">
                    ${token.statsVisibleToPlayers ? "Liberados" : "Ocultos"}
                  </button>
                </div>
              </div>
            ` : ""}

            <div class="inspector-action-row">
              <span class="inspector-action-label">Palco</span>
              <div class="inspector-action-btns">
                <button type="button" class="mini-btn" data-inspector-action="center">Centralizar</button>
                <button type="button" class="mini-btn is-danger" data-inspector-action="remove">Retirar</button>
              </div>
            </div>
          `
          : `
            <div class="inspector-action-row">
              <span class="inspector-action-label">Permiss&atilde;o</span>
              <div class="inspector-action-btns">
                <span class="status-chip">${canEditCurrent ? "Edi&ccedil;&atilde;o parcial" : "Somente leitura"}</span>
              </div>
            </div>
          `}
      </div>
    </section>
  `;
}

function renderRestrictedPlayerInspector(inspector, token) {
  inspector.innerHTML = `
    <section class="token-inspector-card" data-type="${token.type}">
      <div class="token-inspector-hero">
        <div class="token-inspector-avatar">
          <span class="mesa-token-avatar-fallback">?</span>
        </div>
        <div class="token-inspector-copy">
          <div class="token-inspector-badges">
            <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
            <span class="token-state-pill">Somente cena</span>
          </div>
          <h3 class="token-inspector-name">Token da cena</h3>
          <p class="token-inspector-owner">As informacoes detalhadas ficam restritas ao proprio token.</p>
        </div>
      </div>
    </section>

    <div class="inspector-note">
      <strong>Painel pessoal</strong>
      Use o painel Meu personagem para consultar e editar sua Vida e Integridade.
    </div>
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
          <span class="bar-label">Vida</span>
          <div class="stat-editor-inputs">
            <button type="button" class="stat-step-btn" data-stat-step="-1" data-stat-field="currentLife" ${canEditCurrent ? "" : "disabled"} aria-label="Diminuir vida">−</button>
            <input type="number" min="0" step="1" inputmode="numeric" data-stat-field="currentLife" value="${token.currentLife}" ${canEditCurrent ? "" : "disabled"} />
            <button type="button" class="stat-step-btn" data-stat-step="1" data-stat-field="currentLife" ${canEditCurrent ? "" : "disabled"} aria-label="Aumentar vida">+</button>
            <span class="stat-divider">/</span>
            <input type="number" min="1" step="1" inputmode="numeric" data-stat-field="maxLife" value="${token.maxLife}" ${canEditAll ? "" : "disabled"} />
          </div>
          <div class="bar-preview is-life"><span style="${getBarFillStyle("vida", token.currentLife, token.maxLife)}"></span></div>
        </div>

        <div class="stat-editor">
          <span class="bar-label">Integridade</span>
          <div class="stat-editor-inputs">
            <button type="button" class="stat-step-btn" data-stat-step="-1" data-stat-field="currentIntegrity" ${canEditCurrent ? "" : "disabled"} aria-label="Diminuir integridade">−</button>
            <input type="number" min="0" step="1" inputmode="numeric" data-stat-field="currentIntegrity" value="${token.currentIntegrity}" ${canEditCurrent ? "" : "disabled"} />
            <button type="button" class="stat-step-btn" data-stat-step="1" data-stat-field="currentIntegrity" ${canEditCurrent ? "" : "disabled"} aria-label="Aumentar integridade">+</button>
            <span class="stat-divider">/</span>
            <input type="number" min="0" step="1" inputmode="numeric" data-stat-field="maxIntegrity" value="${token.maxIntegrity}" ${canEditAll ? "" : "disabled"} />
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
    return "";
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

/* ── Handler dos botões +/- de stat ─────────────────────────── */
(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".stat-step-btn");
    if (!btn || btn.disabled) return;

    const field = btn.dataset.statField;
    const step  = parseInt(btn.dataset.statStep, 10);
    if (!field || !step) return;

    const inspector = document.getElementById("tokenInspector");
    if (!inspector) return;

    const input = inspector.querySelector(`input[data-stat-field="${field}"]`);
    if (!input || input.disabled) return;

    const min = input.min !== "" ? parseInt(input.min, 10) : -Infinity;
    const max = input.max !== "" ? parseInt(input.max, 10) :  Infinity;
    const newVal = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + step));

    input.value = newVal;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
})();
