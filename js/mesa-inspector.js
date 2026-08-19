function renderInspector() {
  const inspector = getMesaDomRef("tokenInspector");
  if (!inspector) return;

  const inspectorBlock = document.getElementById("vttInspectorBlock");
  const token = getSelectedToken();

  // Jogador nao tem inspetor lateral: o bloco "INSPETOR / TOKEN SELECIONADO"
  // duplicava as infos do proprio token. Toda a edicao do jogador fica no
  // painel "Meu Token" (e em "Meus Echos"). Por isso o bloco some sempre.
  if (!isMaster()) {
    if (inspectorBlock) inspectorBlock.hidden = true;
    inspector.innerHTML = "";
    return;
  }

  // Mestre: quem revela o bloco e este render (Etapa 75). Antes quem revelava
  // era o showPanel() do mesa.html, que nao olhava papel nenhum e por isso
  // tambem entregava o inspetor ao jogador a cada clique na barra.
  if (inspectorBlock) inspectorBlock.hidden = false;

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
          ${isMaster() ? `<p class="token-inspector-owner">${escapeHtml(token.ownerUsername === "mestre" ? "Controlado pelo mestre" : `Pertence a ${token.ownerUsername}`)}</p>` : ""}
        </div>
      </div>
    </section>

    ${buildInspectorStatsSection(token, canEditCurrent, canEditAll, canViewStats)}

    ${isMaster() ? `
    <section class="token-inspector-controls">
      <h3>A&ccedil;&otilde;es</h3>
      <div class="inspector-action-list">
        ${buildInspectorSegmented("Visibilidade", "set-visibility", [
          { value: "visible", label: "Vis&iacute;vel", active: token.visibleToPlayers },
          { value: "hidden",  label: "Oculto",         active: !token.visibleToPlayers }
        ])}

        ${buildInspectorSegmented("Camada", "set-layer", [
          { value: "tokens", label: "Token",  active: token.layer !== "dm",
            title: "Camada normal: todos veem" },
          { value: "dm",     label: "Mestre", active: token.layer === "dm",
            title: "Camada secreta do mestre (só você vê)" }
        ])}

        ${canConfigureStatsVisibility(token) ? buildInspectorSegmented("Status dos jogadores", "set-stats-visibility", [
          { value: "shown",  label: "Liberados", active: token.statsVisibleToPlayers },
          { value: "hidden", label: "Ocultos",   active: !token.statsVisibleToPlayers }
        ]) : ""}

        <div class="inspector-action-row is-markers">
          <span class="inspector-action-label">Marcadores</span>
          ${buildInspectorMarkerRow(token)}
        </div>

        <div class="inspector-action-row">
          <span class="inspector-action-label">Palco</span>
          <div class="inspector-action-btns is-split">
            <button type="button" class="mini-btn" data-inspector-action="center">Centralizar</button>
            <button type="button" class="mini-btn is-danger" data-inspector-action="remove">Retirar</button>
          </div>
        </div>
      </div>
    </section>
    ` : ""}
  `;
}

/**
 * Controle segmentado (Etapa 94): as duas opcoes lado a lado, ocupando a
 * largura toda, com a ativa acesa.
 *
 * Resolve duas coisas de uma vez. Simetria: cada metade e 50% da coluna, entao
 * a linha nao serrilha quando o rotulo muda de tamanho — antes os botoes
 * tinham 58, 63, 99 e 144px, todos alinhados so pela esquerda. E leitura: um
 * botao escrito "Visivel" nao dizia se aquilo era o estado atual ou o que
 * aconteceria ao clicar. Aqui o estado esta aceso e a alternativa esta ao lado.
 *
 * O botao ja ativo continua clicavel (nao usa `disabled`, que o tiraria da
 * navegacao por teclado): quem trata a acao ignora o clique redundante.
 */
function buildInspectorSegmented(label, action, options) {
  const botoes = options.map(option => `
    <button type="button"
            class="inspector-seg-btn${option.active ? " is-active" : ""}"
            data-inspector-action="${escapeAttribute(action)}"
            data-value="${escapeAttribute(option.value)}"
            aria-pressed="${option.active ? "true" : "false"}"
            ${option.title ? `title="${escapeAttribute(option.title)}"` : ""}>${option.label}</button>
  `).join("");

  return `
    <div class="inspector-action-row">
      <span class="inspector-action-label" id="${escapeAttribute(`acao-${action}`)}">${label}</span>
      <div class="inspector-segmented" role="group" aria-labelledby="${escapeAttribute(`acao-${action}`)}">
        ${botoes}
      </div>
    </div>
  `;
}

// Marcadores de status (Etapa 46, refeito na 64): a grade de toggles duplicada
// virou um resumo do que esta ligado + um botao que abre o MESMO painel do
// token (js/mesa-markers.js). A whitelist MESA_STATUS_MARKERS vive em
// mesa-stage.js, carregado antes deste arquivo.
function buildInspectorMarkerRow(token) {
  const active = normalizeMesaStatusMarkers(token.statusMarkers);
  const chips = active.map(key => {
    const marker = MESA_STATUS_MARKERS_BY_KEY.get(key);
    if (!marker) return "";
    return `<span class="inspector-marker-chip" title="${escapeAttribute(marker.label)}">${marker.icon}</span>`;
  }).join("");

  return `
    <div class="inspector-marker-summary">
      <div class="inspector-marker-chips">
        ${chips || `<span class="inspector-marker-empty">Nenhum</span>`}
      </div>
      <!-- O rotulo precisa dizer O QUE se edita (Etapa 86). "Editar" sozinho,
           numa secao chamada "Acoes" e ao lado de Centralizar/Retirar, era
           lido como "editar as informacoes do token" — e abrir o painel de
           marcadores parecia bug. A fiacao sempre esteve certa. -->
      <button type="button"
              class="mini-btn mesa-token-markers-btn is-inspector"
              aria-label="Editar marcadores de status"
              title="Marcadores de status (sangrando, atordoado...)"
              data-token-id="${escapeAttribute(token.id)}">Editar marcadores</button>
    </div>
  `;
}

function buildInspectorStatsSection(token, canEditCurrent, canEditAll, canViewStats) {
  if (!canViewStats) {
    const hiddenCopy = "O mestre ainda nao liberou Vida e Integridade deste token.";
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

  // O inspetor lateral e exclusivo do mestre (renderInspector ja oculta o bloco
  // inteiro para o jogador), entao aqui so tratamos o caso do mestre.
  // Mestre: mesmo card visual do painel "Meu Token" do jogador (label + leitura
  // grande "atual/max" + barra + stepper), porem COMPACTO (.is-inspector) e com o
  // MAXIMO tambem editavel (so o mestre pode). Edita Vida/Integridade de qualquer
  // token, inclusive dos jogadores (canEditCurrent/canEditAll = true p/ o mestre).
  return `
    <section class="token-inspector-stats is-master">
      <h3>Estado</h3>
      <div class="player-vitals is-inspector">
        ${buildMasterInspectorVital("Vida", "life", "currentLife", "maxLife", token.currentLife, token.maxLife, "vida", canEditCurrent, canEditAll)}
        ${buildMasterInspectorVital("Integridade", "integrity", "currentIntegrity", "maxIntegrity", token.currentIntegrity, token.maxIntegrity, "integ", canEditCurrent, canEditAll)}
      </div>
    </section>
  `;
}

// Card de vital do MESTRE no inspetor — mesmo visual do card do jogador, porem
// compacto e com o input de MAXIMO ao lado do stepper de Atual. Reusa os mesmos
// `data-stat-field` (currentLife/maxLife/...) entao os handlers de edicao, clamp
// e broadcast existentes continuam funcionando sem alteracao.
function buildMasterInspectorVital(label, variant, currentField, maxField, current, max, type, canEditCurrent, canEditAll) {
  const lower = label.toLowerCase();
  const minMax = type === "vida" ? 1 : 0;
  return `
    <article class="player-vital-card is-${variant} is-inspector">
      <div class="player-vital-head">
        <span class="player-vital-label">${escapeHtml(label)}</span>
        <span class="player-vital-readout"><strong>${current}</strong><span class="player-vital-max">/ ${max}</span></span>
      </div>
      <div class="bar-preview is-${variant}"><span style="${getBarFillStyle(type, current, max)}"></span></div>
      <div class="inspector-vital-stepper is-master">
        <button type="button" class="stat-step-btn" data-stat-step="-1" data-stat-field="${currentField}" ${canEditCurrent ? "" : "disabled"} aria-label="Diminuir ${escapeAttribute(lower)}">−</button>
        <input type="number" min="0" max="${max}" step="1" inputmode="numeric" data-stat-field="${currentField}" value="${current}" ${canEditCurrent ? "" : "disabled"} aria-label="${escapeAttribute(`${label} atual`)}" />
        <button type="button" class="stat-step-btn" data-stat-step="1" data-stat-field="${currentField}" ${canEditCurrent ? "" : "disabled"} aria-label="Aumentar ${escapeAttribute(lower)}">+</button>
        <span class="stat-divider">/</span>
        <input type="number" min="${minMax}" step="1" inputmode="numeric" class="vital-max-input" data-stat-field="${maxField}" value="${max}" ${canEditAll ? "" : "disabled"} aria-label="${escapeAttribute(`${label} maxima`)}" />
      </div>
    </article>
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
    // "input", nao "change" (Etapa 93).
    //
    // O inspetor escuta `input` (handleInspectorStatInput, ligado em
    // js/mesa-core.js) — e e ele quem grava na ficha, redesenha a barra do
    // token e transmite o mesa:sheet:patch. Ninguem escuta `change` aqui,
    // entao o +/- so mexia no numero da tela: a vida nao mudava no token,
    // nem na ficha, nem para os outros clientes. Digitar o valor funcionava,
    // porque digitar dispara `input` de verdade — era essa a assimetria.
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
})();
