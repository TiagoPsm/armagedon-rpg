let soulDetailsState = {
  open: false,
  lastFocus: null
};

function getSoulRanks() {
  return Array.isArray(SOUL?.RANKS) && SOUL.RANKS.length
    ? SOUL.RANKS
    : [
        { rank: 1, name: "Adormecido" },
        { rank: 2, name: "Despertado" },
        { rank: 3, name: "Ascendido" },
        { rank: 4, name: "Transcendido" },
        { rank: 5, name: "Supremo" },
        { rank: 6, name: "Sagrado" },
        { rank: 7, name: "Divino" }
      ];
}

function getSoulCreatureClasses() {
  return Array.isArray(SOUL?.CREATURE_CLASSES) && SOUL.CREATURE_CLASSES.length
    ? SOUL.CREATURE_CLASSES
    : [
        { key: "Beast", label: "Beast", coreCount: 1 },
        { key: "Monster", label: "Monster", coreCount: 2 },
        { key: "Demon", label: "Demon", coreCount: 3 },
        { key: "Devil", label: "Devil", coreCount: 4 },
        { key: "Tyrant", label: "Tyrant", coreCount: 5 },
        { key: "Terror", label: "Terror", coreCount: 6 },
        { key: "Titan", label: "Titan", coreCount: 7 }
      ];
}

function getSoulAwardElements() {
  const root = document.getElementById("soulAwardRoot");
  return {
    root,
    dialog: root?.querySelector(".soul-award-dialog") || null,
    close: document.getElementById("soulAwardCloseBtn"),
    cancel: document.getElementById("soulAwardCancelBtn"),
    apply: document.getElementById("soulAwardApplyBtn"),
    amount: document.getElementById("soulAwardAmount"),
    preview: document.getElementById("soulAwardPreview"),
    optionGrid: document.getElementById("soulRankOptionGrid"),
    classGrid: document.getElementById("soulCreatureClassGrid"),
    title: document.getElementById("soulAwardTitle"),
    open: document.getElementById("openSoulAwardBtn"),
    nightmare: document.getElementById("completeSoulNightmareBtn")
  };
}

function getSoulDetailsElements() {
  const root = document.getElementById("soulDetailsRoot");
  return {
    root,
    dialog: root?.querySelector(".soul-details-dialog") || null,
    close: document.getElementById("soulDetailsCloseBtn"),
    content: document.getElementById("soulDetailsContent"),
    open: document.getElementById("openSoulDetailsBtn")
  };
}

function isSoulEnabledKind(kind = currentSheetTarget?.kind || "player") {
  return ["player", "npc", "monster"].includes(kind);
}

function canMutateCurrentSoul(kind = currentSheetTarget?.kind || "player") {
  if (!currentSheetTarget || !isSoulEnabledKind(kind)) return false;
  if (currentRole === "master") return true;
  if (kind !== "player") return false;

  const owner = normalizeSheetKey(currentSheetTarget.owner || currentSheetTarget.key);
  return Boolean(owner && owner === normalizeSheetKey(currentUser));
}

function getCurrentSoulCore(kind = currentSheetTarget?.kind || "player") {
  return normalizeSoulCoreState(
    soulCore,
    getValue("charLevel") || soulCore?.rank || 1,
    {
      kind,
      attributes: getSoulAttributesFromForm(),
      seed: currentSheetTarget?.key || getValue("charName") || kind
    }
  );
}

function formatSoulXp(value) {
  return SOUL?.formatXp ? SOUL.formatXp(value) : String(value || 0);
}

function renderSoulRankList(currentRank) {
  const list = document.getElementById("soulRankList");
  if (!list) return;

  list.innerHTML = getSoulRanks()
    .map(entry => `
      <span class="soul-rank-pill${entry.rank === currentRank ? " is-current" : ""}">
        Rank ${entry.rank}: ${esc(entry.name)}
      </span>
    `)
    .join("");
}

function renderSoulAttributeCaps(core) {
  const grid = document.getElementById("soulAttributeCapGrid");
  if (!grid) return;

  const attributes = getSoulAttributesFromForm();
  const caps = core.attributeCaps?.byRank?.[core.rank] || {};
  grid.innerHTML = ATTRIBUTES.map(attr => {
    const current = attributes[attr] || "1";
    const cap = caps[attr] || "-";
    return `
      <span class="soul-attribute-cap">
        <small>${esc(attr)}</small>
        <strong>${esc(current)} / ${esc(cap)}</strong>
      </span>
    `;
  }).join("");
}

function renderSoulLastGain(core) {
  const target = document.getElementById("soulLastGainText");
  if (!target) return;

  const gains = Array.isArray(core.lastAttributeGain) ? core.lastAttributeGain : [];
  if (!gains.length) {
    target.textContent = "Nenhum ganho recente de atributo.";
    return;
  }

  target.textContent = `Último ganho: ${gains
    .map(gain => `${gain.attr} +${gain.amount || 1}`)
    .join(", ")}.`;
}

function formatSoulPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function formatSoulDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSoulGainList(gains) {
  const list = Array.isArray(gains) ? gains : [];
  if (!list.length) return "Nenhum ganho recente.";
  return list
    .map(gain => `${esc(gain.attr || "Atributo")} +${esc(gain.amount || 1)}${gain.value ? ` (${esc(gain.value)})` : ""}`)
    .join(", ");
}

function buildSoulHistoryItem(entry) {
  if (!entry || typeof entry !== "object") return "";
  const when = formatSoulDate(entry.at);
  const dateLabel = when ? `<small>${esc(when)}</small>` : "";

  if (entry.type === "nightmare-complete") {
    return `
      <li>
        <strong>Pesadelo concluido</strong>
        <span>Rank ${esc(entry.from || "?")} para Rank ${esc(entry.to || "?")}</span>
        ${dateLabel}
      </li>
    `;
  }

  return `
    <li>
      <strong>${esc(entry.creatureClass || "Criatura")} Rank ${esc(entry.creatureRank || "?")}</strong>
      <span>${esc(entry.amount || 1)}x | ${formatSoulXp(entry.appliedXp ?? entry.totalXp ?? 0)} XP aplicado</span>
      ${dateLabel}
    </li>
  `;
}

function renderSoulDetailsContent() {
  const { content } = getSoulDetailsElements();
  if (!content) return;

  const kind = currentSheetTarget?.kind || "player";
  if (!isSoulEnabledKind(kind)) {
    content.innerHTML = "";
    return;
  }

  const core = getCurrentSoulCore(kind);
  const attributes = getSoulAttributesFromForm();
  const caps = core.attributeCaps?.byRank?.[core.rank] || {};
  const xpPerPoint = SOUL?.XP_PER_ATTRIBUTE_POINT || 25;
  const stateLabel = SOUL?.getSoulState
    ? SOUL.getSoulState(core, attributes)
    : core.pendingNightmare ? "Pronto para pesadelo" : "Em crescimento";
  const rankItems = getSoulRanks()
    .map(entry => `
      <span class="soul-details-rank${entry.rank === core.rank ? " is-current" : ""}">
        Rank ${entry.rank}: ${esc(entry.name)}
      </span>
    `)
    .join("");
  const capItems = ATTRIBUTES.map(attr => `
    <span class="soul-details-cap">
      <small>${esc(attr)}</small>
      <strong>${esc(attributes[attr] || "1")} / ${esc(caps[attr] || "-")}</strong>
    </span>
  `).join("");
  const history = Array.isArray(core.history) ? core.history.slice(0, 5) : [];
  const historyItems = history.length
    ? history.map(buildSoulHistoryItem).join("")
    : `<li><strong>Nenhum registro ainda</strong><span>As proximas absorcoes aparecerao aqui.</span></li>`;
  const overloadNote = core.overloaded
    ? `<p><strong>Sobrecarga:</strong> ${formatSoulXp(core.overloadXp || 0)} XP acumulado para o proximo rank. Novas absorcoes entram com 1/5 do valor ate concluir o pesadelo.</p>`
    : "";

  content.innerHTML = `
    <div class="soul-details-summary">
      <span>
        <small>Rank atual</small>
        <strong>Rank ${esc(core.rank)} - ${esc(getSoulRankName(core.rank))}</strong>
      </span>
      <span>
        <small>Saturacao</small>
        <strong>${esc(formatSoulPercent(core.saturation))}</strong>
      </span>
      <span>
        <small>XP atual</small>
        <strong>${esc(buildSoulProgressLabel(core))}</strong>
      </span>
      <span>
        <small>Estado</small>
        <strong>${esc(stateLabel)}</strong>
      </span>
    </div>

    <div class="soul-details-section">
      <div class="soul-details-section-head">
        <span class="item-meta">Tetos de atributos</span>
        <strong>${esc(core.attributeCaps?.kind === "monster" ? "Monstro" : "Jogador/NPC")}</strong>
      </div>
      <div class="soul-details-caps">${capItems}</div>
    </div>

    <div class="soul-details-two-col">
      <div class="soul-details-section">
        <div class="soul-details-section-head">
          <span class="item-meta">Progresso de ganho</span>
          <strong>${formatSoulXp(core.attributeGainProgress || 0)} / ${formatSoulXp(xpPerPoint)} XP</strong>
        </div>
        <p>A cada ${formatSoulXp(xpPerPoint)} XP, o nucleo tenta gerar 1 ponto em um atributo que ainda esteja abaixo do teto atual.</p>
        ${overloadNote}
        <p><strong>Ultimos ganhos:</strong> ${formatSoulGainList(core.lastAttributeGain)}</p>
      </div>

      <div class="soul-details-section">
        <div class="soul-details-section-head">
          <span class="item-meta">Historico recente</span>
          <strong>${history.length ? `${history.length} registro(s)` : "Vazio"}</strong>
        </div>
        <ul class="soul-details-history">${historyItems}</ul>
      </div>
    </div>

    <div class="soul-details-section">
      <div class="soul-details-section-head">
        <span class="item-meta">Ranks</span>
        <strong>Progressao fixa de XP</strong>
      </div>
      <div class="soul-details-ranks">${rankItems}</div>
      <p>O XP necessario para subir de rank e fixo para todos. Os tetos de atributos sao sorteados individualmente por ficha dentro da faixa do rank.</p>
    </div>
  `;
}

function openSoulDetailsModal() {
  const kind = currentSheetTarget?.kind || "player";
  if (!isSoulEnabledKind(kind)) return;

  const { root, dialog, open } = getSoulDetailsElements();
  if (!root || !dialog) return;

  soulDetailsState.open = true;
  soulDetailsState.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : open;
  renderSoulDetailsContent();
  root.hidden = false;
  if (window.UI?.activateModal) {
    window.UI.activateModal(root, dialog, {
      initialFocus: dialog,
      onDismiss: closeSoulDetailsModal
    });
  } else {
    window.requestAnimationFrame(() => dialog.focus());
  }
}

function closeSoulDetailsModal() {
  const { root } = getSoulDetailsElements();
  if (!root) return;

  soulDetailsState.open = false;
  if (window.UI?.deactivateModal) {
    window.UI.deactivateModal(root, { restoreFocus: false });
  }
  root.hidden = true;

  if (soulDetailsState.lastFocus instanceof HTMLElement) {
    soulDetailsState.lastFocus.focus();
  }
}

function renderNpcLevelDetail() {
  const levelInput = document.getElementById("charLevel");
  const panel = document.getElementById("levelDetailPanel");
  const title = document.getElementById("levelDetailTitle");
  const text = document.getElementById("levelDetailText");
  const level = Math.max(1, Number.parseInt(levelInput?.value || "1", 10) || 1);
  const label = `Nivel ${level}`;

  if (panel) {
    panel.hidden = false;
    panel.style.display = "";
  }
  if (title) title.textContent = label;
  if (text) {
    text.textContent = `${label} registrado para esta ficha.`;
  }
}

function renderProgressionField(kind = currentSheetTarget?.kind || "player") {
  const label = document.querySelector('label[for="charLevel"]');
  const levelInput = document.getElementById("charLevel");
  const row = document.querySelector(".level-field-row");
  const group = document.querySelector(".level-field-group");
  const identityRow = group?.closest(".form-row");
  const panel = document.getElementById("soulCorePanel");
  const levelDetailPanel = document.getElementById("levelDetailPanel");
  const actionButton = document.getElementById("openSoulAwardBtn");
  const detailsButton = document.getElementById("openSoulDetailsBtn");
  const nightmareButton = document.getElementById("completeSoulNightmareBtn");
  const hasSoul = isSoulEnabledKind(kind);

  if (label) label.textContent = hasSoul ? "Nucleo da alma" : "Nivel";
  if (group) group.classList.toggle("is-soul", hasSoul);
  if (identityRow) identityRow.classList.toggle("has-soul-layout", hasSoul);
  if (row) row.classList.toggle("has-soul-core", hasSoul);

  if (levelInput) {
    levelInput.hidden = hasSoul;
    levelInput.style.display = hasSoul ? "none" : "";
  }

  if (panel) {
    panel.hidden = !hasSoul;
    panel.style.display = hasSoul ? "" : "none";
    panel.classList.toggle("is-compact", false);
  }

  if (levelDetailPanel) {
    levelDetailPanel.hidden = hasSoul || kind !== "npc";
    levelDetailPanel.style.display = !hasSoul && kind === "npc" ? "" : "none";
  }

  if (!hasSoul) {
    if (detailsButton) {
      detailsButton.hidden = true;
      detailsButton.style.display = "none";
    }
    if (kind === "npc") renderNpcLevelDetail();
    return;
  }

  const normalized = getCurrentSoulCore(kind);
  const rankName = getSoulRankName(normalized.rank);
  const progressPercent = normalized.xpLimit > 0
    ? Math.min(100, (normalized.xp / normalized.xpLimit) * 100)
    : 100;
  const rankNameElement = document.getElementById("soulRankName");
  const rankMetaElement = document.getElementById("soulRankMeta");
  const xpTextElement = document.getElementById("soulXpText");
  const nextRankElement = document.getElementById("soulNextRankText");
  const progressBar = document.getElementById("soulXpBar");
  const stateElement = document.getElementById("soulStateText");
  const saturationElement = document.getElementById("soulSaturationText");
  const nextRankLabel = normalized.pendingNightmare
    ? "Pronto para pesadelo"
    : normalized.rank >= 7
      ? "Rank maximo alcancado"
      : `Próximo rank: ${getSoulRankName(normalized.rank + 1)}`;
  const stateLabel = SOUL?.getSoulState
    ? SOUL.getSoulState(normalized, getSoulAttributesFromForm())
    : normalized.pendingNightmare ? "Pronto para pesadelo" : "Em crescimento";

  soulCore = normalized;
  if (levelInput) levelInput.value = String(normalized.rank);
  if (rankNameElement) rankNameElement.textContent = rankName;
  if (rankMetaElement) rankMetaElement.textContent = `Rank ${normalized.rank}`;
  if (xpTextElement) xpTextElement.textContent = buildSoulProgressLabel(normalized);
  if (nextRankElement) nextRankElement.textContent = nextRankLabel;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (stateElement) stateElement.textContent = stateLabel;
  if (saturationElement) saturationElement.textContent = `Saturação ${Math.round(normalized.saturation * 100)}%`;

  renderSoulAttributeCaps(normalized);
  renderSoulLastGain(normalized);
  renderSoulRankList(normalized.rank);

  const canMutate = canMutateCurrentSoul(kind);
  if (actionButton) {
    actionButton.hidden = !canMutate;
    actionButton.style.display = canMutate ? "" : "none";
  }
  if (detailsButton) {
    detailsButton.hidden = false;
    detailsButton.style.display = "";
  }
  if (nightmareButton) {
    const canComplete = canMutate && normalized.pendingNightmare && normalized.rank < 7;
    nightmareButton.hidden = !canComplete;
    nightmareButton.style.display = canComplete ? "" : "none";
  }

  if (panel) {
    const progressLabel = buildSoulProgressLabel(normalized);
    panel.title = `${rankName} | ${progressLabel} | ${stateLabel}`;
    panel.setAttribute("aria-label", `Rank atual: ${rankName}. ${progressLabel}. Estado: ${stateLabel}.`);
  }
}

function renderSoulAwardOptions() {
  const { optionGrid } = getSoulAwardElements();
  if (!optionGrid) return;

  optionGrid.innerHTML = getSoulRanks()
    .map(option => `
      <button
        type="button"
        class="soul-rank-option${option.rank === soulAwardState.creatureRank ? " is-active" : ""}"
        data-soul-rank="${option.rank}"
        aria-pressed="${option.rank === soulAwardState.creatureRank ? "true" : "false"}"
      >
        <span class="item-meta">Rank ${option.rank}</span>
        <strong>${esc(option.name)}</strong>
      </button>
    `)
    .join("");
}

function renderSoulClassOptions() {
  const { classGrid } = getSoulAwardElements();
  if (!classGrid) return;

  classGrid.innerHTML = getSoulCreatureClasses()
    .map(option => `
      <button
        type="button"
        class="soul-class-option${option.key === soulAwardState.creatureClass ? " is-active" : ""}"
        data-soul-class="${esc(option.key)}"
        aria-pressed="${option.key === soulAwardState.creatureClass ? "true" : "false"}"
      >
        <strong>${esc(option.label)}</strong>
        <span>${option.coreCount} núcleo(s)</span>
      </button>
    `)
    .join("");
}

function renderSoulAwardPreview() {
  const { preview, amount, title } = getSoulAwardElements();
  if (!preview) return;

  const normalizedAmount = Math.min(999, Math.max(1, Number.parseInt(amount.value || soulAwardState.amount, 10) || 1));
  const selectedRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.creatureRank, 10) || 1));
  const selectedClass = soulAwardState.creatureClass || "Beast";
  const currentCore = getCurrentSoulCore(currentSheetTarget?.kind || "player");
  const calculation = calculateSoulCreatureExperienceState(currentCore, selectedRank, selectedClass, normalizedAmount);
  const application = SOUL?.calculateExperienceApplication
    ? SOUL.calculateExperienceApplication(currentCore, calculation.totalXp)
    : {
        totalExperience: calculation.totalXp,
        appliedExperience: calculation.totalXp,
        rankExperience: calculation.totalXp,
        overloadExperience: 0,
        overloadMultiplier: 1,
        xpAfter: currentCore.xp + calculation.totalXp,
        overloadXpAfter: currentCore.overloadXp || 0
      };
  const potential = SOUL?.calculatePotentialAttributeGains
    ? SOUL.calculatePotentialAttributeGains(currentCore, application.rankExperience, getSoulAttributesFromForm())
    : { points: 0, rawPoints: 0, saturated: false };
  const finalXp = currentCore.xpLimit > 0 ? application.xpAfter : currentCore.xp;
  const overloadItems = [];
  if (application.overloadMultiplier < 1) {
    overloadItems.push(`Sobrecarga ativa: ${formatSoulXp(calculation.totalXp)} XP vira ${formatSoulXp(application.appliedExperience)} XP acumulado.`);
  } else if (application.overloadExperience > 0) {
    overloadItems.push(`Excedente em sobrecarga: ${formatSoulXp(application.overloadExperience)} XP.`);
  }
  if (application.overloadXpAfter > 0) {
    overloadItems.push(`Sobrecarga acumulada: ${formatSoulXp(application.overloadXpAfter)} XP.`);
  }

  soulAwardState.amount = normalizedAmount;
  soulAwardState.creatureRank = selectedRank;
  soulAwardState.creatureClass = selectedClass;

  if (amount) amount.value = String(normalizedAmount);
  if (title) title.textContent = `Absorver XP de ${currentSheetTarget?.label || "personagem"}`;

  preview.innerHTML = `
    <span class="item-meta">Prévia</span>
    <strong>${formatSoulXp(calculation.totalXp)} XP da alma</strong>
    <p>${getSoulRankName(currentCore.rank)} recebe ${formatSoulXp(calculation.baseXp)} XP base por ${esc(selectedClass)} de rank ${selectedRank}.</p>
    <ul>
      <li>Quantidade: ${normalizedAmount}</li>
      <li>Anti-farm: ${calculation.isWeakKill ? "aplicado por rank inferior" : "sem penalidade"}</li>
      <li>${potential.points} ${potential.points === 1 ? "ponto" : "pontos"} de atributo possível${potential.points === 1 ? "" : "is"}${potential.rawPoints > potential.points ? ` (${potential.rawPoints - potential.points} bloqueado(s) por teto)` : ""}</li>
      <li>Progresso final: ${formatSoulXp(finalXp)} / ${formatSoulXp(currentCore.xpLimit)} XP</li>
      ${overloadItems.map(item => `<li>${item}</li>`).join("")}
    </ul>
  `;
}

function openSoulAwardModal() {
  if (!canMutateCurrentSoul(currentSheetTarget?.kind || "player")) return;

  const { root, dialog, amount } = getSoulAwardElements();
  if (!root || !dialog) return;

  soulAwardState.open = true;
  soulAwardState.creatureRank = soulAwardState.creatureRank || 1;
  soulAwardState.creatureClass = soulAwardState.creatureClass || "Beast";
  soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount.value || soulAwardState.amount, 10) || 1));
  root.hidden = false;
  renderSoulAwardOptions();
  renderSoulClassOptions();
  renderSoulAwardPreview();
  if (window.UI?.activateModal) {
    window.UI.activateModal(root, dialog, {
      initialFocus: dialog,
      onDismiss: closeSoulAwardModal
    });
  } else {
    window.requestAnimationFrame(() => dialog.focus());
  }
}

function closeSoulAwardModal() {
  const { root } = getSoulAwardElements();
  if (!root) return;

  soulAwardState.open = false;
  if (window.UI?.deactivateModal) window.UI.deactivateModal(root);
  root.hidden = true;
}

function buildSoulAwardSummary(summary) {
  if (!summary) return "O XP da alma foi aplicado ao núcleo.";

  const totalReceived = Number(summary.totalExperience ?? summary.appliedExperience ?? 0);
  const gained = formatSoulXp(totalReceived);
  const gains = Array.isArray(summary.attributeGains) && summary.attributeGains.length
    ? ` Ganhos: ${summary.attributeGains.map(gain => `${gain.attr} +${gain.amount || 1}`).join(", ")}.`
    : "";
  const rankXp = Number(summary.rankExperience ?? summary.appliedExperience ?? 0);
  const overloadXp = Number(summary.overloadExperience || summary.after?.overloadXp || 0);
  const overload = overloadXp > 0
    ? ` ${formatSoulXp(overloadXp)} XP ficou em sobrecarga para o proximo rank.`
    : "";
  const reduction = Number(summary.overloadMultiplier || 1) < 1
    ? " Sobrecarga ativa: esta absorcao entrou com 1/5 do XP."
    : "";
  const state = summary.after?.pendingNightmare ? " O núcleo está pronto para o pesadelo." : "";

  if (!totalReceived) {
    return `${currentSheetTarget?.label || "A ficha"} já está no limite atual de XP.`;
  }

  return `${currentSheetTarget?.label || "A ficha"} recebeu ${gained} XP da alma. ${formatSoulXp(rankXp)} XP foi aplicado ao rank atual.${overload}${reduction}${gains}${state}`;
}

function buildSoulNightmareSummary(summary) {
  const appliedOverload = Number(summary?.appliedOverloadExperience || 0);
  const remainingOverload = Number(summary?.remainingOverloadExperience || 0);
  const gains = Array.isArray(summary?.attributeGains) && summary.attributeGains.length
    ? ` Ganhos do novo rank: ${summary.attributeGains.map(gain => `${gain.attr} +${gain.amount || 1}`).join(", ")}.`
    : "";
  const applied = appliedOverload > 0
    ? ` ${formatSoulXp(appliedOverload)} XP acumulado em sobrecarga foi aplicado ao novo rank.`
    : "";
  const remaining = remainingOverload > 0
    ? ` ${formatSoulXp(remainingOverload)} XP continua em sobrecarga.`
    : "";
  return `O pesadelo foi concluido e o novo rank foi registrado.${applied}${remaining}${gains}`;
}

function persistLocalSoulData(data, kind) {
  const normalized = normalizeSheetData(data, kind);
  const sheets = readSheets();
  sheets[currentSheetTarget.key] = normalized;
  writeSheets(sheets);
  applySheetData(normalized, kind);
}

async function applySoulAward() {
  const kind = currentSheetTarget?.kind || "player";
  if (!canMutateCurrentSoul(kind)) return;

  const { apply } = getSoulAwardElements();
  const creatureRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.creatureRank, 10) || 1));
  const creatureClass = soulAwardState.creatureClass || "Beast";
  const amount = Math.min(999, Math.max(1, Number.parseInt(soulAwardState.amount, 10) || 1));

  if (apply) apply.disabled = true;

  try {
    if (isBackendMode()) {
      const response = await APP.awardSoulEssence(currentSheetTarget.key, {
        creatureRank,
        creatureClass,
        amount
      });
      const savedData = normalizeSheetData(response.character.data || {}, kind);
      remoteSheetsCache[currentSheetTarget.key] = savedData;
      persistRemoteSheetsCache();
      applySheetData(savedData, kind);
      closeSoulAwardModal();
      await UI.alert(buildSoulAwardSummary(response.summary), {
        title: "Núcleo fortalecido",
        kicker: "// Essência da alma"
      });
      return;
    }

    const data = collectSheetData(kind);
    const result = applySoulExperienceState(data, kind, {
      creatureRank,
      creatureClass,
      amount
    });
    persistLocalSoulData(result.data, kind);
    closeSoulAwardModal();
    await UI.alert(buildSoulAwardSummary(result.summary), {
      title: "Núcleo fortalecido",
      kicker: "// Essência da alma"
    });
  } catch (error) {
    await UI.alert(error.message || "Falha ao aplicar XP da alma.", {
      title: "Falha na absorção",
      kicker: "// Essência da alma"
    });
  } finally {
    if (apply) apply.disabled = false;
  }
}

async function completeSoulNightmareAction() {
  const kind = currentSheetTarget?.kind || "player";
  if (!canMutateCurrentSoul(kind)) return;

  const confirmed = await UI.confirm(
    "Concluir o pesadelo sobe o rank, gera novos tetos de atributo e aplica no novo rank qualquer XP que estava acumulado em sobrecarga.",
    {
      title: "Concluir pesadelo",
      kicker: "// Núcleo da alma",
      confirmLabel: "Concluir",
      cancelLabel: "Cancelar"
    }
  );
  if (!confirmed) return;

  try {
    if (isBackendMode()) {
      const response = await APP.completeSoulNightmare(currentSheetTarget.key);
      const savedData = normalizeSheetData(response.character.data || {}, kind);
      remoteSheetsCache[currentSheetTarget.key] = savedData;
      persistRemoteSheetsCache();
      applySheetData(savedData, kind);
      await UI.alert(buildSoulNightmareSummary(response.summary), {
        title: "Rank avançado",
        kicker: "// Núcleo da alma"
      });
      return;
    }

    const data = collectSheetData(kind);
    const result = completeSoulNightmareState(data, kind);
    if (!result.completed) {
      await UI.alert(result.summary?.reason || "O núcleo ainda não está pronto para o pesadelo.", {
        title: "Pesadelo indisponível",
        kicker: "// Núcleo da alma"
      });
      return;
    }

    persistLocalSoulData(result.data, kind);
    await UI.alert(buildSoulNightmareSummary(result.summary), {
      title: "Rank avançado",
      kicker: "// Núcleo da alma"
    });
  } catch (error) {
    await UI.alert(error.message || "Falha ao concluir o pesadelo.", {
      title: "Falha no pesadelo",
      kicker: "// Núcleo da alma"
    });
  }
}

function initSoulAwardModal() {
  const { root, dialog, close, cancel, apply, amount, optionGrid, classGrid, open, nightmare } = getSoulAwardElements();
  const details = getSoulDetailsElements();
  if (!root || !dialog || !close || !cancel || !apply || !amount || !optionGrid || !classGrid || !open) return;
  if (root.dataset.bound === "true") return;

  root.dataset.bound = "true";

  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }
  if (details.root && details.root.parentElement !== document.body) {
    document.body.appendChild(details.root);
  }

  open.addEventListener("click", openSoulAwardModal);
  if (details.open && details.root && details.dialog && details.close) {
    details.open.addEventListener("click", openSoulDetailsModal);
    details.close.addEventListener("click", closeSoulDetailsModal);
    details.root.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-soul-details-close]")) closeSoulDetailsModal();
    });
  }
  if (nightmare) nightmare.addEventListener("click", completeSoulNightmareAction);
  close.addEventListener("click", closeSoulAwardModal);
  cancel.addEventListener("click", closeSoulAwardModal);
  apply.addEventListener("click", () => {
    applySoulAward();
  });

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest("[data-soul-award-close]")) {
      closeSoulAwardModal();
      return;
    }

    const rankButton = target.closest("[data-soul-rank]");
    if (rankButton instanceof HTMLElement) {
      soulAwardState.creatureRank = Math.min(7, Math.max(1, Number.parseInt(rankButton.dataset.soulRank || "1", 10) || 1));
      renderSoulAwardOptions();
      renderSoulAwardPreview();
      return;
    }

    const classButton = target.closest("[data-soul-class]");
    if (classButton instanceof HTMLElement) {
      soulAwardState.creatureClass = classButton.dataset.soulClass || "Beast";
      renderSoulClassOptions();
      renderSoulAwardPreview();
    }
  });

  amount.addEventListener("input", () => {
    soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount.value || "1", 10) || 1));
    renderSoulAwardPreview();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    if (soulAwardState.open) {
      event.preventDefault();
      closeSoulAwardModal();
      return;
    }

    if (soulDetailsState.open) {
      event.preventDefault();
      closeSoulDetailsModal();
    }
  });
}
