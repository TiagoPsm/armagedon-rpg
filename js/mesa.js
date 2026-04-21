(() => {
  const MESA_STORAGE_KEY = "tc_virtual_mesa_mock_v1";
  const SHEETS_KEY = "tc_sheets";
  const REMOTE_SHEETS_KEY = "tc_remote_sheets";
  const NPCS_KEY = "tc_npcs";
  const MONSTERS_KEY = "tc_monsters";
  const NPC_PREFIX = "npc:";
  const MONSTER_PREFIX = "monster:";

  const TYPE_LABELS = {
    player: "Jogador",
    npc: "NPC",
    monster: "Monstro"
  };

  const state = {
    session: null,
    role: "player",
    roster: [],
    tokens: [],
    selectedTokenId: "",
    previewPlayerView: false,
    search: "",
    drag: null
  };

  document.addEventListener("DOMContentLoaded", initMesaPage);

  async function initMesaPage() {
    if (window.AUTH_READY) {
      await window.AUTH_READY;
    } else if (window.AUTH?.init) {
      await window.AUTH.init();
    }

    const session = window.AUTH?.requireAuth ? window.AUTH.requireAuth() : null;
    if (!session) return;

    state.session = session;
    state.role = session.role || "player";
    state.roster = buildRoster();

    hydrateState();
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    const previewToggle = document.getElementById("playerPreviewToggle");
    const rosterSearch = document.getElementById("rosterSearch");
    const resetMesaBtn = document.getElementById("resetMesaBtn");
    const stage = document.getElementById("mesaStage");

    previewToggle?.addEventListener("change", event => {
      if (!isMaster()) return;
      state.previewPlayerView = Boolean(event.target.checked);
      persistState();
      renderAll();
    });

    rosterSearch?.addEventListener("input", event => {
      state.search = String(event.target.value || "").trim().toLowerCase();
      renderRoster();
    });

    resetMesaBtn?.addEventListener("click", () => {
      resetPrototype();
    });

    stage?.addEventListener("click", event => {
      const tokenElement = event.target.closest("[data-token-id]");
      if (!tokenElement) return;
      selectToken(String(tokenElement.dataset.tokenId || ""));
    });

    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
    window.addEventListener("pointercancel", handleDragEnd);
  }

  function buildRoster() {
    const directory = window.AUTH?.getDirectoryCache?.() || { players: [], npcs: [], monsters: [] };
    const sheets = readMergedSheets();
    const players = buildPlayers(directory, sheets);
    const npcs = buildNpcs(directory, sheets);
    const monsters = buildMonsters(directory, sheets);
    const roster = [...players, ...npcs, ...monsters];

    if (roster.length) return roster;
    return buildFallbackRoster();
  }

  function buildPlayers(directory, sheets) {
    const backendPlayers = Array.isArray(directory?.players) ? directory.players : [];
    const localPlayers = Array.isArray(window.AUTH?.getPlayers?.()) ? window.AUTH.getPlayers() : [];
    const players = backendPlayers.length ? backendPlayers : localPlayers;

    return players.map((player, index) => {
      const username = String(player.username || "").trim() || `jogador-${index + 1}`;
      const sheet = normalizeSheetSnapshot(sheets[username], "player");
      const name = String(sheet.charName || player.charname || username).trim() || username;
      return createRosterEntry({
        id: username,
        characterKey: username,
        type: "player",
        ownerUsername: username,
        createdBy: "mestre",
        name,
        imageUrl: sheet.avatar,
        currentLife: sheet.vidaAtual,
        maxLife: sheet.vidaMax,
        currentIntegrity: sheet.integAtual,
        maxIntegrity: sheet.integMax
      });
    });
  }

  function buildNpcs(directory, sheets) {
    const backendNpcs = Array.isArray(directory?.npcs) ? directory.npcs : [];
    const localNpcs = readJsonStorage(NPCS_KEY, []).map(normalizeNamedEntity);
    const npcs = backendNpcs.length ? backendNpcs.map(normalizeNamedEntity) : localNpcs;

    return npcs.map(npc => {
      const npcId = String(npc.id || slugify(npc.name || "npc"));
      const key = `${NPC_PREFIX}${npcId}`;
      const sheet = normalizeSheetSnapshot(sheets[key], "npc");
      const name = String(sheet.charName || npc.name || "NPC").trim() || "NPC";
      return createRosterEntry({
        id: key,
        characterKey: key,
        type: "npc",
        ownerUsername: "mestre",
        createdBy: "mestre",
        name,
        imageUrl: sheet.avatar,
        currentLife: sheet.vidaAtual,
        maxLife: sheet.vidaMax,
        currentIntegrity: sheet.integAtual,
        maxIntegrity: sheet.integMax
      });
    });
  }

  function buildMonsters(directory, sheets) {
    const backendMonsters = Array.isArray(directory?.monsters) ? directory.monsters : [];
    const localMonsters = readJsonStorage(MONSTERS_KEY, []).map(normalizeNamedEntity);
    const monsters = backendMonsters.length ? backendMonsters.map(normalizeNamedEntity) : localMonsters;

    return monsters.map(monster => {
      const monsterId = String(monster.id || slugify(monster.name || "monster"));
      const key = `${MONSTER_PREFIX}${monsterId}`;
      const sheet = normalizeSheetSnapshot(sheets[key], "monster");
      const name = String(sheet.charName || monster.name || "Monstro").trim() || "Monstro";
      return createRosterEntry({
        id: key,
        characterKey: key,
        type: "monster",
        ownerUsername: "mestre",
        createdBy: "mestre",
        name,
        imageUrl: sheet.avatar,
        currentLife: sheet.vidaAtual,
        maxLife: sheet.vidaMax,
        currentIntegrity: 0,
        maxIntegrity: 0
      });
    });
  }

  function normalizeNamedEntity(entity) {
    return {
      id: String(entity?.id || slugify(entity?.name || "registro")),
      name: String(entity?.name || "Registro").trim() || "Registro"
    };
  }

  function normalizeSheetSnapshot(raw, type) {
    const isMonster = type === "monster";
    const vidaMax = asPositiveInt(raw?.vidaMax, type === "monster" ? 18 : 14);
    const vidaAtual = clamp(asPositiveInt(raw?.vidaAtual, vidaMax), 0, vidaMax);
    const integMax = isMonster ? 0 : asPositiveInt(raw?.integMax, 6);
    const integAtual = isMonster ? 0 : clamp(asPositiveInt(raw?.integAtual, integMax), 0, integMax);

    return {
      charName: String(raw?.charName || "").trim(),
      avatar: String(raw?.avatar || "").trim(),
      vidaAtual,
      vidaMax,
      integAtual,
      integMax
    };
  }

  function createRosterEntry(data) {
    return {
      id: String(data.id),
      characterKey: String(data.characterKey),
      type: data.type,
      ownerUsername: String(data.ownerUsername || "mestre"),
      createdBy: String(data.createdBy || "mestre"),
      name: String(data.name || "Sem nome").trim() || "Sem nome",
      imageUrl: String(data.imageUrl || "").trim(),
      currentLife: clamp(asPositiveInt(data.currentLife, asPositiveInt(data.maxLife, 10)), 0, asPositiveInt(data.maxLife, 10)),
      maxLife: asPositiveInt(data.maxLife, 10),
      currentIntegrity: clamp(asPositiveInt(data.currentIntegrity, asPositiveInt(data.maxIntegrity, 0)), 0, asPositiveInt(data.maxIntegrity, 0)),
      maxIntegrity: asPositiveInt(data.maxIntegrity, 0),
      initials: getInitials(data.name),
      typeLabel: TYPE_LABELS[data.type] || "Token"
    };
  }

  function buildFallbackRoster() {
    const username = state.session?.username || "jogador";
    return [
      createRosterEntry({
        id: username,
        characterKey: username,
        type: "player",
        ownerUsername: username,
        createdBy: "mestre",
        name: "Protagonista",
        currentLife: 12,
        maxLife: 12,
        currentIntegrity: 5,
        maxIntegrity: 5
      }),
      createRosterEntry({
        id: "npc:vigia-da-porta",
        characterKey: "npc:vigia-da-porta",
        type: "npc",
        ownerUsername: "mestre",
        createdBy: "mestre",
        name: "Vigia da Porta",
        currentLife: 9,
        maxLife: 9,
        currentIntegrity: 4,
        maxIntegrity: 4
      }),
      createRosterEntry({
        id: "monster:eco-rubro",
        characterKey: "monster:eco-rubro",
        type: "monster",
        ownerUsername: "mestre",
        createdBy: "mestre",
        name: "Eco Rubro",
        currentLife: 18,
        maxLife: 18,
        currentIntegrity: 0,
        maxIntegrity: 0
      })
    ];
  }

  function hydrateState() {
    const saved = readJsonStorage(MESA_STORAGE_KEY, {});
    const rosterMap = new Map(state.roster.map(entry => [entry.characterKey, entry]));
    const savedTokens = Array.isArray(saved?.tokens) ? saved.tokens : [];
    const mergedTokens = savedTokens
      .map(token => mergeTokenWithRoster(token, rosterMap.get(String(token.characterKey || ""))))
      .filter(Boolean);

    state.tokens = mergedTokens.length ? mergedTokens : seedInitialTokens();
    state.previewPlayerView = isMaster() ? Boolean(saved?.previewPlayerView) : false;
    state.selectedTokenId = pickInitialSelectedToken(saved?.selectedTokenId);
  }

  function seedInitialTokens() {
    const players = state.roster.filter(entry => entry.type === "player");
    const npcs = state.roster.filter(entry => entry.type === "npc");
    const monsters = state.roster.filter(entry => entry.type === "monster");
    const starter = [...players.slice(0, 2), ...npcs.slice(0, 2), ...monsters.slice(0, 2)];
    const lineup = starter.length ? starter : state.roster.slice(0, 4);

    return lineup.map((entry, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        ...entry,
        visibleToPlayers: true,
        x: clamp(10 + col * 28, 3, 82),
        y: clamp(10 + row * 34, 3, 76),
        order: index + 1
      };
    });
  }

  function mergeTokenWithRoster(savedToken, rosterEntry) {
    if (!rosterEntry) return null;
    const maxLife = asPositiveInt(savedToken?.maxLife, rosterEntry.maxLife);
    const maxIntegrity = rosterEntry.type === "monster"
      ? 0
      : asPositiveInt(savedToken?.maxIntegrity, rosterEntry.maxIntegrity);

    return {
      ...rosterEntry,
      visibleToPlayers: savedToken?.visibleToPlayers !== false,
      x: clamp(Number(savedToken?.x), 3, 82),
      y: clamp(Number(savedToken?.y), 3, 78),
      order: asPositiveInt(savedToken?.order, 1),
      currentLife: clamp(asPositiveInt(savedToken?.currentLife, rosterEntry.currentLife), 0, maxLife),
      maxLife,
      currentIntegrity: clamp(asPositiveInt(savedToken?.currentIntegrity, rosterEntry.currentIntegrity), 0, maxIntegrity),
      maxIntegrity
    };
  }

  function pickInitialSelectedToken(savedId) {
    const visibleTokens = getRenderedTokens();
    if (!visibleTokens.length) return "";
    if (visibleTokens.some(token => token.id === savedId)) return String(savedId);
    return visibleTokens[0].id;
  }

  function renderAll() {
    syncSelectedToken();
    renderHeader();
    renderSummary();
    renderControls();
    renderRoster();
    renderStage();
    renderInspector();
  }

  function renderHeader() {
    const headerUser = document.getElementById("headerUser");
    if (headerUser) {
      headerUser.textContent = state.session?.username || "Convidado";
    }
  }

  function renderSummary() {
    const renderedTokens = getRenderedTokens();
    const activeTokenCount = document.getElementById("activeTokenCount");
    const roleBadge = document.getElementById("roleBadge");
    const roleSummary = document.getElementById("roleSummary");
    const sceneStateTitle = document.getElementById("sceneStateTitle");
    const sceneStateCopy = document.getElementById("sceneStateCopy");

    if (activeTokenCount) activeTokenCount.textContent = String(renderedTokens.length);
    if (roleBadge) roleBadge.textContent = isMaster() ? "Mestre" : "Jogador";
    if (roleSummary) {
      roleSummary.textContent = isMaster()
        ? "Organiza a cena, move tokens e testa permissões no protótipo."
        : "Vê tokens visíveis e edita apenas o próprio estado no protótipo.";
    }

    if (sceneStateTitle) {
      sceneStateTitle.textContent = renderedTokens.length ? "Cena em andamento" : "Mesa vazia";
    }

    if (sceneStateCopy) {
      sceneStateCopy.textContent = isMaster()
        ? "Arraste os retratos, oculte tokens e ajuste o palco sem tocar no backend por enquanto."
        : "A cena mostra apenas o que está visível para jogadores e libera só o seu próprio estado.";
    }
  }

  function renderControls() {
    const previewRow = document.getElementById("playerPreviewRow");
    const previewToggle = document.getElementById("playerPreviewToggle");
    const stageViewBadge = document.getElementById("stageViewBadge");
    const stageHintBadge = document.getElementById("stageHintBadge");

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
        ? state.previewPlayerView ? "Prévia do jogador" : "Visão do mestre"
        : "Visão do jogador";
    }

    if (stageHintBadge) {
      stageHintBadge.textContent = canMoveTokens()
        ? "Arraste os tokens para organizar a cena."
        : "Selecione seu token para ajustar vida e integridade.";
    }
  }

  function renderRoster() {
    const rosterList = document.getElementById("rosterList");
    const rosterCountBadge = document.getElementById("rosterCountBadge");
    if (!rosterList || !rosterCountBadge) return;

    const filteredRoster = getFilteredRoster();
    const availableCount = filteredRoster.filter(entry => !findToken(entry.id)).length;
    rosterCountBadge.textContent = `${availableCount} disponíveis`;

    if (!filteredRoster.length) {
      rosterList.innerHTML = `
        <div class="token-inspector-empty">
          <strong>Nada encontrado</strong>
          <p>A busca atual não encontrou personagens disponíveis para esta etapa do protótipo.</p>
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

    rosterList.querySelectorAll("[data-roster-action]").forEach(button => {
      button.addEventListener("click", handleRosterAction);
    });
  }

  function renderRosterEntry(entry) {
    const token = findToken(entry.id);
    const isOnStage = Boolean(token);
    const canAdd = isMaster() && !isOnStage;
    const actionLabel = canAdd ? "Colocar" : isOnStage ? "Focar" : "Bloqueado";
    const secondaryLabel = isOnStage && isMaster() ? "Retirar" : "";

    return `
      <article class="roster-entry">
        <div class="roster-entry-copy">
          <strong class="roster-entry-name">${escapeHtml(entry.name)}</strong>
          <span class="roster-entry-meta">
            ${escapeHtml(entry.typeLabel)} • ${escapeHtml(entry.ownerUsername === "mestre" ? "Controle do mestre" : `Dono: ${entry.ownerUsername}`)}
          </span>
        </div>
        <div class="roster-entry-actions">
          <span class="token-type-badge" data-type="${entry.type}">${escapeHtml(entry.typeLabel)}</span>
          <button
            type="button"
            class="mini-btn ${canAdd ? "is-primary" : ""}"
            data-roster-action="${canAdd ? "add" : "focus"}"
            data-entry-id="${entry.id}"
            ${!canAdd && !isOnStage ? "disabled" : ""}
          >
            ${actionLabel}
          </button>
          ${secondaryLabel ? `
            <button type="button" class="mini-btn" data-roster-action="remove" data-entry-id="${entry.id}">
              ${secondaryLabel}
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }

  function renderStage() {
    const stage = document.getElementById("mesaStage");
    const emptyState = document.getElementById("mesaEmptyState");
    if (!stage || !emptyState) return;

    const renderedTokens = [...getRenderedTokens()].sort((a, b) => (a.order || 0) - (b.order || 0));
    emptyState.hidden = renderedTokens.length > 0;

    stage.innerHTML = renderedTokens.map(renderToken).join("");
    stage.querySelectorAll("[data-token-id]").forEach(tokenElement => {
      tokenElement.addEventListener("pointerdown", handleTokenPointerDown);
    });
  }

  function renderToken(token) {
    const hiddenForMaster = isMaster() && !state.previewPlayerView && !token.visibleToPlayers;
    const selectedClass = token.id === state.selectedTokenId ? "is-selected" : "";
    const hiddenClass = hiddenForMaster ? "is-hidden-master" : "";
    const canEdit = canEditCurrentStats(token);
    const lifePercent = getPercent(token.currentLife, token.maxLife);
    const integrityPercent = getPercent(token.currentIntegrity, token.maxIntegrity);

    return `
      <article
        class="mesa-token ${selectedClass} ${hiddenClass}"
        data-token-id="${token.id}"
        style="left:${token.x}%; top:${token.y}%; z-index:${token.order || 1};"
      >
        <div class="mesa-token-top">
          <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
          ${hiddenForMaster ? `<span class="token-state-pill">Oculto</span>` : ""}
        </div>

        <div class="mesa-token-avatar">
          ${token.imageUrl
            ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" />`
            : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
        </div>

        <h3 class="mesa-token-name">${escapeHtml(token.name)}</h3>
        <p class="mesa-token-meta">
          ${escapeHtml(token.ownerUsername === "mestre" ? "Controlado pelo mestre" : `Dono: ${token.ownerUsername}`)}
        </p>

        <div class="token-bars">
          <div class="status-row">
            <div class="status-row-head">
              <span class="status-label">Vida</span>
              <span class="status-value">${token.currentLife}/${token.maxLife}</span>
            </div>
            <div class="status-bar is-life"><span style="width:${lifePercent}%;"></span></div>
          </div>

          ${token.maxIntegrity > 0
            ? `
              <div class="status-row">
                <div class="status-row-head">
                  <span class="status-label">Integridade</span>
                  <span class="status-value">${token.currentIntegrity}/${token.maxIntegrity}</span>
                </div>
                <div class="status-bar is-integrity"><span style="width:${integrityPercent}%;"></span></div>
              </div>
            `
            : `
              <div class="status-row">
                <div class="status-row-head">
                  <span class="status-label">Integridade</span>
                  <span class="status-value">${canEdit ? "Sem uso" : "Indisponível"}</span>
                </div>
                <div class="status-bar"><span style="width:0%;"></span></div>
              </div>
            `}
        </div>
      </article>
    `;
  }

  function renderInspector() {
    const inspector = document.getElementById("tokenInspector");
    if (!inspector) return;

    const token = getSelectedToken();
    if (!token) {
      inspector.innerHTML = `
        <div class="token-inspector-empty">
          <strong>Selecione um token</strong>
          <p>Escolha um retrato no palco para ajustar o protótipo e validar o fluxo da cena.</p>
        </div>
      `;
      return;
    }

    const canEditCurrent = canEditCurrentStats(token);
    const canEditAll = canEditAllStats(token);
    const isHiddenForPlayers = !token.visibleToPlayers;
    const integrityDisabled = token.maxIntegrity <= 0;
    const inspectorNote = buildInspectorNote(token, canEditCurrent, canEditAll);

    inspector.innerHTML = `
      <section class="token-inspector-card">
        <div class="token-inspector-hero">
          <div class="token-inspector-avatar">
            ${token.imageUrl
              ? `<img src="${escapeAttribute(token.imageUrl)}" alt="${escapeAttribute(token.name)}" />`
              : `<span class="mesa-token-avatar-fallback">${escapeHtml(token.initials)}</span>`}
          </div>
          <div class="token-inspector-copy">
            <span class="token-type-badge" data-type="${token.type}">${escapeHtml(token.typeLabel)}</span>
            <h3 class="token-inspector-name">${escapeHtml(token.name)}</h3>
            <p>${escapeHtml(token.ownerUsername === "mestre" ? "Controlado pelo mestre" : `Pertence a ${token.ownerUsername}`)}</p>
            ${isHiddenForPlayers ? `<p><span class="token-state-pill">Oculto para jogadores</span></p>` : ""}
          </div>
        </div>
      </section>

      <section class="token-inspector-stats">
        <h3>Estado do token</h3>
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
            <div class="bar-preview is-life"><span style="width:${getPercent(token.currentLife, token.maxLife)}%;"></span></div>
          </div>

          <div class="stat-editor">
            <div class="bar-label-row">
              <span class="bar-label">Integridade</span>
              <span>${token.maxIntegrity > 0 ? `${token.currentIntegrity}/${token.maxIntegrity}` : "Sem integridade"}</span>
            </div>
            <div class="stat-editor-inputs">
              <input type="number" min="0" step="1" data-stat-field="currentIntegrity" value="${token.currentIntegrity}" ${(canEditCurrent && !integrityDisabled) ? "" : "disabled"} />
              <span class="stat-divider">/</span>
              <input type="number" min="1" step="1" data-stat-field="maxIntegrity" value="${token.maxIntegrity}" ${(canEditAll && !integrityDisabled) ? "" : "disabled"} />
            </div>
            <div class="bar-preview is-integrity"><span style="width:${getPercent(token.currentIntegrity, token.maxIntegrity)}%;"></span></div>
          </div>
        </div>
      </section>

      <section class="token-inspector-controls">
        <h3>Detalhes da cena</h3>
        <div class="inspector-meta-grid">
          <article class="inspector-meta-card">
            <span class="panel-kicker">Posição X</span>
            <strong>${Math.round(token.x)}%</strong>
          </article>
          <article class="inspector-meta-card">
            <span class="panel-kicker">Posição Y</span>
            <strong>${Math.round(token.y)}%</strong>
          </article>
        </div>

        <div class="inspector-control-grid">
          ${isMaster()
            ? `
              <div class="inspector-row">
                <div class="inspector-row-copy">
                  <strong>Visibilidade</strong>
                  <small>Controle se este token aparece ou não na visão do jogador.</small>
                </div>
                <button type="button" class="mini-btn ${token.visibleToPlayers ? "" : "is-primary"}" data-inspector-action="toggle-visibility">
                  ${token.visibleToPlayers ? "Visível" : "Oculto"}
                </button>
              </div>

              <div class="inspector-row">
                <div class="inspector-row-copy">
                  <strong>Organização do palco</strong>
                  <small>Centralize ou retire localmente este token para testar o ritmo da cena.</small>
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
                  <strong>Permissão atual</strong>
                  <small>${canEditCurrent ? "Você pode ajustar seus números localmente nesta fase." : "Você só pode observar este token nesta fase do protótipo."}</small>
                </div>
                <span class="status-chip">${canEditCurrent ? "Edição parcial" : "Somente leitura"}</span>
              </div>
            `}
        </div>
      </section>

      ${inspectorNote}
    `;

    inspector.querySelectorAll("[data-stat-field]").forEach(input => {
      input.addEventListener("input", handleInspectorStatInput);
    });

    inspector.querySelectorAll("[data-inspector-action]").forEach(button => {
      button.addEventListener("click", handleInspectorAction);
    });
  }

  function buildInspectorNote(token, canEditCurrent, canEditAll) {
    if (isMaster()) {
      return `
        <div class="inspector-note">
          <strong>Fase atual</strong>
          Este painel ainda é um protótipo local. Nome, retrato e vínculo da ficha já entram no desenho da feature,
          mas persistência real, banco e tempo real ficam para a próxima etapa.
        </div>
      `;
    }

    if (canEditCurrent) {
      return `
        <div class="inspector-note">
          <strong>Seu token</strong>
          Nesta fase, você consegue testar a edição local de vida e integridade para validarmos o fluxo antes de ligar o backend.
        </div>
      `;
    }

    return `
      <div class="inspector-note">
        <strong>Token de terceiros</strong>
        A interface já respeita o comportamento esperado: você não move nem edita personagens que não são seus.
      </div>
    `;
  }

  function handleRosterAction(event) {
    const action = String(event.currentTarget.dataset.rosterAction || "");
    const entryId = String(event.currentTarget.dataset.entryId || "");
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

  function addTokenToStage(entry) {
    if (findToken(entry.id)) {
      selectToken(entry.id);
      return;
    }

    const nextOrder = state.tokens.reduce((max, token) => Math.max(max, token.order || 1), 0) + 1;
    const offset = state.tokens.length % 4;
    const nextToken = {
      ...entry,
      visibleToPlayers: true,
      x: clamp(12 + offset * 18, 3, 82),
      y: clamp(14 + Math.floor(state.tokens.length / 4) * 24, 3, 78),
      order: nextOrder
    };

    state.tokens = [...state.tokens, nextToken];
    state.selectedTokenId = nextToken.id;
    persistState();
    renderAll();
  }

  function removeToken(tokenId) {
    state.tokens = state.tokens.filter(token => token.id !== tokenId);
    state.selectedTokenId = state.tokens[0]?.id || "";
    persistState();
    renderAll();
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
    const action = String(event.currentTarget.dataset.inspectorAction || "");
    const token = getSelectedToken();
    if (!token) return;

    if (action === "toggle-visibility" && isMaster()) {
      token.visibleToPlayers = !token.visibleToPlayers;
    }

    if (action === "center" && isMaster()) {
      token.x = 38;
      token.y = 26;
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
    const field = String(event.currentTarget.dataset.statField || "");
    const token = getSelectedToken();
    if (!token || !field) return;

    const nextValue = Number(event.currentTarget.value);

    if (field === "currentLife" && canEditCurrentStats(token)) {
      token.currentLife = clamp(asPositiveInt(nextValue, token.currentLife), 0, token.maxLife);
    }

    if (field === "maxLife" && canEditAllStats(token)) {
      token.maxLife = Math.max(1, asPositiveInt(nextValue, token.maxLife));
      token.currentLife = clamp(token.currentLife, 0, token.maxLife);
    }

    if (field === "currentIntegrity" && canEditCurrentStats(token) && token.maxIntegrity > 0) {
      token.currentIntegrity = clamp(asPositiveInt(nextValue, token.currentIntegrity), 0, token.maxIntegrity);
    }

    if (field === "maxIntegrity" && canEditAllStats(token) && token.maxIntegrity > 0) {
      token.maxIntegrity = Math.max(1, asPositiveInt(nextValue, token.maxIntegrity));
      token.currentIntegrity = clamp(token.currentIntegrity, 0, token.maxIntegrity);
    }

    persistState();
    renderStage();
    renderInspector();
  }

  function handleTokenPointerDown(event) {
    const tokenElement = event.currentTarget;
    const tokenId = String(tokenElement.dataset.tokenId || "");
    const token = findToken(tokenId);
    if (!token) return;

    state.selectedTokenId = tokenId;

    if (!canMoveTokens()) return;
    if (event.button !== 0) return;
    if (event.target.closest("input, button, a")) return;

    const stage = document.getElementById("mesaStage");
    if (!stage) return;

    const stageRect = stage.getBoundingClientRect();
    const tokenRect = tokenElement.getBoundingClientRect();

    state.drag = {
      tokenId,
      stageRect,
      tokenWidth: tokenRect.width,
      tokenHeight: tokenRect.height,
      pointerOffsetX: event.clientX - tokenRect.left,
      pointerOffsetY: event.clientY - tokenRect.top
    };

    token.order = getNextOrder();
    event.preventDefault();
    renderStage();
    renderInspector();
  }

  function handleDragMove(event) {
    if (!state.drag) return;
    const token = findToken(state.drag.tokenId);
    if (!token) return;

    const usableWidth = Math.max(1, state.drag.stageRect.width - state.drag.tokenWidth);
    const usableHeight = Math.max(1, state.drag.stageRect.height - state.drag.tokenHeight);

    const leftPx = clamp(
      event.clientX - state.drag.stageRect.left - state.drag.pointerOffsetX,
      0,
      usableWidth
    );
    const topPx = clamp(
      event.clientY - state.drag.stageRect.top - state.drag.pointerOffsetY,
      0,
      usableHeight
    );

    token.x = clamp((leftPx / state.drag.stageRect.width) * 100, 0, 100);
    token.y = clamp((topPx / state.drag.stageRect.height) * 100, 0, 100);

    renderStage();
    renderInspector();
  }

  function handleDragEnd() {
    if (!state.drag) return;
    state.drag = null;
    persistState();
    renderStage();
  }

  function resetPrototype() {
    localStorage.removeItem(MESA_STORAGE_KEY);
    state.tokens = seedInitialTokens();
    state.selectedTokenId = state.tokens[0]?.id || "";
    state.previewPlayerView = false;
    renderAll();
    persistState();
  }

  function persistState() {
    const payload = {
      previewPlayerView: Boolean(state.previewPlayerView),
      selectedTokenId: state.selectedTokenId,
      tokens: state.tokens.map(token => ({
        id: token.id,
        characterKey: token.characterKey,
        type: token.type,
        ownerUsername: token.ownerUsername,
        createdBy: token.createdBy,
        name: token.name,
        imageUrl: token.imageUrl,
        currentLife: token.currentLife,
        maxLife: token.maxLife,
        currentIntegrity: token.currentIntegrity,
        maxIntegrity: token.maxIntegrity,
        x: roundTo(token.x, 2),
        y: roundTo(token.y, 2),
        visibleToPlayers: token.visibleToPlayers !== false,
        order: token.order || 1
      }))
    };

    localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(payload));
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

  function canMoveTokens() {
    return isMaster();
  }

  function canEditCurrentStats(token) {
    if (!token) return false;
    if (isMaster()) return true;
    return state.role === "player" && token.ownerUsername === state.session?.username;
  }

  function canEditAllStats(token) {
    return Boolean(token) && isMaster();
  }

  function isMaster() {
    return state.role === "master";
  }

  function getNextOrder() {
    return state.tokens.reduce((max, token) => Math.max(max, token.order || 1), 0) + 1;
  }

  function readMergedSheets() {
    const localSheets = readJsonStorage(SHEETS_KEY, {});
    const remoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
    return {
      ...localSheets,
      ...remoteSheets
    };
  }

  function readJsonStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function asPositiveInt(value, fallback = 0) {
    const numeric = Number.parseInt(value, 10);
    if (Number.isNaN(numeric)) return fallback;
    return Math.max(0, numeric);
  }

  function clamp(value, min, max) {
    const numeric = Number.isFinite(value) ? value : min;
    return Math.min(max, Math.max(min, numeric));
  }

  function getPercent(current, max) {
    if (!max || max <= 0) return 0;
    return clamp((current / max) * 100, 0, 100);
  }

  function roundTo(value, digits = 0) {
    const scale = 10 ** digits;
    return Math.round(Number(value) * scale) / scale;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "registro";
  }

  function getInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) return "AR";
    return parts.map(part => part[0]?.toUpperCase() || "").join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
