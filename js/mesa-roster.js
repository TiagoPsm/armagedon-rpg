function renderSummary() {
  const renderedTokens = getRenderedTokens();
  const activeTokenCount = getMesaDomRef("activeTokenCount");
  const roleBadge = getMesaDomRef("roleBadge");
  const roleBadge2 = document.getElementById("roleBadge2");
  const roleSummary = getMesaDomRef("roleSummary");
  const sceneStateTitle = getMesaDomRef("sceneStateTitle");
  const sceneStateCopy = getMesaDomRef("sceneStateCopy");

  if (activeTokenCount) activeTokenCount.textContent = String(renderedTokens.length);
  if (roleBadge) roleBadge.textContent = isMaster() ? "Mestre" : "Jogador";
  if (roleBadge2) roleBadge2.textContent = isMaster() ? "Mestre" : "Jogador";
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
  const stageHintBadge = getMesaDomRef("stageHintBadge");
  const resetMesaBtn = getMesaDomRef("resetMesaBtn");
  const fullscreenMesaBtn = getMesaDomRef("fullscreenMesaBtn");

  if (stageHintBadge) {
    if (isMaster()) {
      stageHintBadge.textContent = "Arraste os tokens para organizar a cena.";
    } else if (state.playersMoveLocked) {
      stageHintBadge.textContent = "Movimento travado pelo mestre. Selecione seu token para ajustar vida e integridade.";
    } else {
      stageHintBadge.textContent = "Arraste o seu token e ajuste vida e integridade.";
    }
  }

  if (resetMesaBtn) {
    resetMesaBtn.hidden = !isMaster();
    resetMesaBtn.disabled = !isMaster();
    resetMesaBtn.setAttribute("aria-hidden", isMaster() ? "false" : "true");
  }

  const moveLockBtn = document.getElementById("moveLockBtn");
  if (moveLockBtn) {
    const online = window.AUTH?.isBackendEnabled?.() === true;
    moveLockBtn.hidden = !isMaster() || !online;
    moveLockBtn.disabled = !isMaster() || !online;
    moveLockBtn.textContent = state.playersMoveLocked ? "Liberar movimento" : "Travar movimento";
    moveLockBtn.setAttribute("aria-pressed", state.playersMoveLocked ? "true" : "false");
    moveLockBtn.title = state.playersMoveLocked
      ? "Jogadores nao podem mover os proprios tokens"
      : "Jogadores podem mover os proprios tokens";
  }

  if (fullscreenMesaBtn) {
    // Botao compacto so com icone — nao escrever texto (apagaria o SVG); usar
    // title/aria-label e a classe is-active para refletir o estado.
    const isFullscreen = state.fullscreenMode !== "off";
    const label = isFullscreen ? "Sair da tela cheia" : "Tela cheia";
    fullscreenMesaBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
    fullscreenMesaBtn.setAttribute("aria-label", label);
    fullscreenMesaBtn.setAttribute("title", label);
    fullscreenMesaBtn.classList.toggle("is-active", isFullscreen);
  }

  // Overlay inferior direito: so contem botoes do mestre (Travar movimento /
  // Limpar cena). Para o jogador ambos ficam ocultos, entao escondemos o
  // container inteiro — senao sobra uma "casca" vazia embaixo do mapa.
  const overlayBr = document.querySelector(".vtt-overlay-br");
  if (overlayBr) {
    const moveBtn = document.getElementById("moveLockBtn");
    const anyVisible = (resetMesaBtn && !resetMesaBtn.hidden) || (moveBtn && !moveBtn.hidden);
    overlayBr.hidden = !anyVisible;
  }

  // Ultima palavra do render: reforca as permissoes de papel no DOM
  // (Etapa 75). Barato — so varre [data-mesa-master-only] e so esconde.
  if (typeof applyMesaRolePermissions === "function") applyMesaRolePermissions();
}

function renderRoster() {
  const rosterList = getMesaDomRef("rosterList");
  const rosterCountBadge = getMesaDomRef("rosterCountBadge");
  const rosterSearch = getMesaDomRef("rosterSearchField");
  const rosterKicker = getMesaDomRef("rosterPanelKicker");
  const rosterTitle = getMesaDomRef("rosterPanelTitle");
  // Tabs de filtro por tipo (Todos/Jogadores/NPCs/Monstros): chrome de escalacao,
  // nunca deve aparecer na visao do jogador — sem id, busca por classe.
  const rosterTabs = document.querySelector(".vtt-roster-tabs");
  const rosterBlock = document.getElementById("vttRosterBlock");
  if (!rosterList || !rosterCountBadge) return;

  // O jogador nunca ve a escalacao (lista + tabs + busca): so o painel pessoal.
  rosterList.classList.toggle("is-player-panel", !isMaster());
  if (rosterBlock) rosterBlock.classList.toggle("is-player-view", !isMaster());

  if (!isMaster()) {
    if (rosterSearch) rosterSearch.hidden = true;
    if (rosterTabs) rosterTabs.hidden = true;
    if (rosterKicker) rosterKicker.textContent = "Ficha rapida";
    if (rosterTitle) rosterTitle.textContent = "Meu personagem";
    renderPlayerSheetPanel(rosterList, rosterCountBadge);
    return;
  }

  if (rosterSearch) rosterSearch.hidden = false;
  if (rosterTabs) rosterTabs.hidden = false;
  rosterCountBadge.classList.remove("is-status-dot");
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

  const groups = ["player", "npc", "monster", "echo"]
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
  const selectedKey = context.characterKey || normalizeMesaCharacterKey(state.session?.username);

  // "Fora da cena" virou uma bolinha de status (apagada fora da cena, verde em cena).
  const stageOn = Boolean(context.isOnStage);
  rosterCountBadge.classList.add("is-status-dot");
  rosterCountBadge.innerHTML = `<span class="player-stage-dot ${stageOn ? "is-on" : "is-off"}" role="img" aria-label="${stageOn ? "Token em cena" : "Token fora da cena"}" title="${stageOn ? "Em cena" : "Fora da cena"}"></span>`;

  rosterList.innerHTML = `
    <section class="player-side-panel" data-character-key="${escapeAttribute(selectedKey)}">
      <div class="player-side-section player-side-token">
        <h3 class="player-side-title">Meu Token</h3>

        <div class="player-sheet-hero">
          <div class="player-sheet-avatar">
            ${avatar
              ? `<img src="${escapeAttribute(avatar)}" alt="${escapeAttribute(characterName)}" width="112" height="112" loading="lazy" decoding="async" draggable="false" />`
              : `<span class="mesa-token-avatar-fallback">${escapeHtml(initials)}</span>`}
          </div>
          <div class="player-sheet-copy">
            <h3>${escapeHtml(characterName)}</h3>
          </div>
        </div>

        ${renderPlayerTokenSelector(context, selectedKey)}

        <div class="player-vitals">
          ${renderPlayerResourceEditor("Vida", "currentLife", currentLife, maxLife, "vida", selectedKey)}
          ${renderPlayerResourceEditor("Integridade", "currentIntegrity", currentIntegrity, maxIntegrity, "integ", selectedKey)}
        </div>

        ${renderPlayerLifeBarsToggle()}

        <a href="ficha.html" class="btn btn-primary btn-block player-open-sheet-btn">
          <span>Ficha Completa</span>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h6.5V10"/><path d="M12.5 3.5 4 12"/></svg>
        </a>
      </div>

      ${renderPlayerEchosSection()}
    </section>
  `;
}

/* Preferencia de exibicao das barras de vida (Etapa 114).
   Fica no painel pessoal porque e ali que o jogador ja gerencia o proprio
   token. Vale so para o palco DELE — o texto de apoio diz isso, para nao
   parecer que ele esta escondendo a propria vida do mestre. O estado vem
   sempre do localStorage (getMesaLifeBarsPref), entao o painel pode ser
   re-renderizado a vontade sem perder a escolha. */
function renderPlayerLifeBarsToggle() {
  const on = typeof getMesaLifeBarsPref === "function" ? getMesaLifeBarsPref() : true;
  return `
    <div class="player-side-option">
      <label class="mesa-grid-check">
        <input type="checkbox" data-life-bars-toggle${on ? " checked" : ""}>
        Mostrar barras de vida nos tokens
      </label>
      <p class="player-side-option-hint">Vale so para a sua tela.</p>
    </div>
  `;
}

// Seção "Meus Echos": só aparece se o jogador tiver Echos. Cada card permite
// invocar o Echo (colocá-lo na cena) ou removê-lo. As barras de Vida/Integridade
// do Echo continuam editáveis pelo inspetor ao selecionar o token na cena.
function renderPlayerEchosSection() {
  const echos = getPlayerOwnEchos();
  if (!echos.length) return "";

  return `
    <div class="player-side-section player-side-echos">
      <h3 class="player-side-title">Meus Echos</h3>
      <div class="player-echo-list">
        ${echos.map(renderPlayerEchoCard).join("")}
      </div>
    </div>
  `;
}

function renderPlayerEchoCard(echo) {
  const echoId = String(echo?.id || "");
  const name = String(echo?.displayName || echo?.name || "Echo").trim() || "Echo";
  const rankName = String(echo?.rankName || "").trim();
  const rank = asPositiveInt(echo?.rank, 1);
  const rankLabel = rankName || `Rank ${rank}`;
  const avatar = String(echo?.avatar || "").trim();
  const initials = getInitials(name);
  const onStage = isEchoOnStage(echoId);

  return `
    <article class="player-echo-card" data-echo-id="${escapeAttribute(echoId)}">
      <div class="player-echo-avatar">
        ${avatar
          ? `<img src="${escapeAttribute(avatar)}" alt="${escapeAttribute(name)}" width="44" height="44" loading="lazy" decoding="async" draggable="false" />`
          : `<span class="mesa-token-avatar-fallback">${escapeHtml(initials)}</span>`}
      </div>
      <div class="player-echo-info">
        <span class="player-echo-name">${escapeHtml(name)}</span>
        <span class="player-echo-rank">${escapeHtml(rankLabel)}</span>
      </div>
      <div class="player-echo-actions">
        ${onStage
          ? `<span class="echo-on-stage-badge">Na cena</span>
             <button type="button" class="mini-btn is-danger" data-echo-action="remove" data-echo-id="${escapeAttribute(echoId)}">Remover</button>`
          : `<button type="button" class="mini-btn is-primary" data-echo-action="summon" data-echo-id="${escapeAttribute(echoId)}">Invocar</button>`}
      </div>
    </article>
  `;
}

function renderPlayerTokenSelector(context, selectedKey) {
  const entries = context.entries || [];
  // Token unico: sem botao "Focar meu token" (removido a pedido — redundante).
  // O seletor abaixo so aparece quando o jogador tem mais de um personagem.
  if (entries.length <= 1) return "";

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

// Card de Vida/Integridade do jogador. O MAXIMO nao e editavel aqui — aparece so
// como leitura no cabecalho ("atual / max"). O atual e ajustado por um stepper
// [−] [valor] [+] (o valor tambem aceita digitacao manual). O maximo e definido
// na ficha completa. Sync via data-player-stat-field (handlePlayerPanelResourceInput).
function renderPlayerResourceEditor(label, field, current, max, type, characterKey) {
  const variant = type === "vida" ? "life" : "integrity";
  const lower = label.toLowerCase();
  const keyAttr = escapeAttribute(characterKey);
  return `
    <article class="player-vital-card is-${variant}">
      <div class="player-vital-head">
        <span class="player-vital-label">${escapeHtml(label)}</span>
        <span class="player-vital-readout"><strong>${current}</strong><span class="player-vital-max">/ ${max}</span></span>
      </div>
      <div class="bar-preview is-${variant}">
        <span style="${getBarFillStyle(type, current, max)}"></span>
      </div>
      <div class="player-vital-stepper">
        <button type="button" class="stat-step-btn" data-player-stat-step="-1" data-player-stat-field="${field}" data-character-key="${keyAttr}" aria-label="Diminuir ${escapeAttribute(lower)}">−</button>
        <input
          type="number"
          min="0"
          max="${max}"
          step="1"
          inputmode="numeric"
          data-player-stat-field="${field}"
          data-character-key="${keyAttr}"
          aria-label="${escapeAttribute(`${label} atual`)}"
          value="${current}"
        />
        <button type="button" class="stat-step-btn" data-player-stat-step="1" data-player-stat-field="${field}" data-character-key="${keyAttr}" aria-label="Aumentar ${escapeAttribute(lower)}">+</button>
      </div>
    </article>
  `;
}

/* Stepper de Vida/Integridade do painel do jogador: os botoes [−]/[+] ajustam o
   input de atual (clampando por min/max do proprio input) e disparam "change",
   que o listener do rosterList (handlePlayerPanelStatInput) usa para sincronizar
   com a ficha. O jogador tambem pode digitar direto no input. */
(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-player-stat-step]");
    if (!btn || btn.disabled) return;
    const field = btn.dataset.playerStatField;
    const step = parseInt(btn.dataset.playerStatStep, 10);
    if (!field || !step) return;

    const card = btn.closest(".player-vital-card");
    const input = card && card.querySelector(`input[data-player-stat-field="${field}"]`);
    if (!input || input.disabled) return;

    const min = input.min !== "" ? parseInt(input.min, 10) : 0;
    const max = input.max !== "" ? parseInt(input.max, 10) : Infinity;
    const base = parseInt(input.value, 10);
    const newVal = Math.min(max, Math.max(min, (Number.isFinite(base) ? base : 0) + step));
    if (String(newVal) === String(input.value)) return;

    input.value = String(newVal);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
})();

