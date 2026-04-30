function getSoulRanks() {
  return Array.isArray(SOUL.RANKS) && SOUL.RANKS.length
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

function getSoulAwardElements() {
  return {
    root: document.getElementById("soulAwardRoot"),
    dialog: document.querySelector(".soul-award-dialog"),
    close: document.getElementById("soulAwardCloseBtn"),
    cancel: document.getElementById("soulAwardCancelBtn"),
    apply: document.getElementById("soulAwardApplyBtn"),
    amount: document.getElementById("soulAwardAmount"),
    preview: document.getElementById("soulAwardPreview"),
    optionGrid: document.getElementById("soulRankOptionGrid"),
    title: document.getElementById("soulAwardTitle"),
    open: document.getElementById("openSoulAwardBtn")
  };
}

function renderProgressionField(kind = currentSheetTarget.kind || "player") {
  const label = document.querySelector('label[for="charLevel"]');
  const levelInput = document.getElementById("charLevel");
  const row = document.querySelector(".level-field-row");
  const group = document.querySelector(".level-field-group");
  const panel = document.getElementById("soulCorePanel");
  const actionButton = document.getElementById("openSoulAwardBtn");
  const isPlayer = kind === "player";

  if (label) {
    label.textContent = isPlayer ? "Núcleo da alma" : "Nível";
  }

  if (label && isPlayer) {
    label.textContent = "Nível";
  }

  if (group) group.classList.toggle("is-soul", isPlayer);
  if (row) row.classList.toggle("has-soul-core", isPlayer);

  if (levelInput) {
    levelInput.hidden = isPlayer;
    levelInput.style.display = isPlayer ? "none" : "";
  }

  if (panel) {
    panel.hidden = !isPlayer;
    panel.style.display = isPlayer ? "" : "none";
    panel.classList.toggle("is-compact", isPlayer);
  }

  if (actionButton) {
    const canAward = isPlayer && currentRole === "master";
    actionButton.hidden = !canAward;
    actionButton.style.display = canAward ? "" : "none";
  }

  if (!isPlayer) return;

  const normalized = normalizeSoulCoreState(soulCore, getValue("charLevel") || 1);
  const rankName = getSoulRankName(normalized.rank);
  const requirement = getSoulNextRankRequirement(normalized.rank);
  const progressPercent = requirement ? Math.min(100, (normalized.xp / requirement) * 100) : 100;
  const rankNameElement = document.getElementById("soulRankName");
  const rankMetaElement = document.getElementById("soulRankMeta");
  const xpTextElement = document.getElementById("soulXpText");
  const nextRankElement = document.getElementById("soulNextRankText");
  const progressBar = document.getElementById("soulXpBar");
  const progressLabel = buildSoulProgressLabel(normalized);
  const nextRankLabel = requirement
    ? `Próximo rank: ${getSoulRankName(normalized.rank + 1)}`
    : "Rank máximo alcançado";

  soulCore = normalized;
  if (levelInput) levelInput.value = String(normalized.rank);
  if (rankNameElement) rankNameElement.textContent = rankName;
  if (rankMetaElement) rankMetaElement.textContent = `Rank ${normalized.rank}`;
  if (xpTextElement) xpTextElement.textContent = buildSoulProgressLabel(normalized);
  if (nextRankElement) {
    nextRankElement.textContent = requirement
      ? `Próximo rank: ${getSoulRankName(normalized.rank + 1)}`
      : "Rank máximo alcançado";
  }
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }
  if (xpTextElement) xpTextElement.textContent = progressLabel;
  if (nextRankElement) nextRankElement.textContent = nextRankLabel;
  if (panel) {
    panel.title = `${rankName} | ${progressLabel} | ${nextRankLabel}`;
    panel.setAttribute("aria-label", `Rank atual: ${rankName}. ${progressLabel}. ${nextRankLabel}.`);
  }
}

function renderSoulAwardOptions() {
  const { optionGrid } = getSoulAwardElements();
  if (!optionGrid) return;

  optionGrid.innerHTML = getSoulRanks()
    .map(
      option => `
        <button
          type="button"
          class="soul-rank-option${option.rank === soulAwardState.essenceRank ? " is-active" : ""}"
          data-soul-rank="${option.rank}"
          aria-pressed="${option.rank === soulAwardState.essenceRank ? "true" : "false"}"
        >
          <span class="item-meta">Rank ${option.rank}</span>
          <strong>${esc(option.name)}</strong>
        </button>
      `
    )
    .join("");
}

function renderSoulAwardPreview() {
  const { preview, amount, title } = getSoulAwardElements();
  if (!preview) return;

  const normalizedAmount = Math.min(999, Math.max(1, Number.parseInt(amount.value || soulAwardState.amount, 10) || 1));
  const selectedRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.essenceRank, 10) || 1));
  const currentCore = normalizeSoulCoreState(soulCore, getValue("charLevel") || 1);
  const result = absorbSoulEssencesState(currentCore, selectedRank, normalizedAmount);
  const totalExperience = result.totalExperience;
  const perEssenceExperience = calculateSoulEssenceExperience(currentCore.rank, selectedRank);

  soulAwardState.amount = normalizedAmount;
  soulAwardState.essenceRank = selectedRank;

  if (amount) amount.value = String(normalizedAmount);
  if (title) {
    title.textContent = `Alimentar núcleo de ${currentSheetTarget.label || "personagem"}`;
  }

  preview.innerHTML = `
    <span class="item-meta">Prévia</span>
    <strong>${normalizedAmount} essência(s) de rank ${selectedRank}</strong>
    <p>${getSoulRankName(currentCore.rank)} recebe ${perEssenceExperience} XP por absorção nesta etapa.</p>
    <ul>
      <li>Experiência total: ${totalExperience} XP</li>
      <li>Estado final: ${getSoulRankName(result.core.rank)} (Rank ${result.core.rank})</li>
      <li>Progresso final: ${buildSoulProgressLabel(result.core)}</li>
      ${
        result.rankUps.length
          ? `<li>Subidas: ${result.rankUps.map(entry => `${entry.from}→${entry.to}`).join(", ")}</li>`
          : "<li>Nenhuma subida de rank nesta absorção.</li>"
      }
    </ul>
  `;
}

function openSoulAwardModal() {
  if (currentRole !== "master" || currentSheetTarget.kind !== "player") return;

  const { root, dialog, amount } = getSoulAwardElements();
  if (!root || !dialog) return;

  soulAwardState.open = true;
  soulAwardState.essenceRank = soulAwardState.essenceRank || 1;
  soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount.value || soulAwardState.amount, 10) || 1));
  root.hidden = false;
  renderSoulAwardOptions();
  renderSoulAwardPreview();
  window.requestAnimationFrame(() => {
    dialog.focus();
  });
}

function closeSoulAwardModal() {
  const { root } = getSoulAwardElements();
  if (!root) return;

  soulAwardState.open = false;
  root.hidden = true;
}

function buildSoulAwardSummary(summary) {
  if (!summary) {
    return "A essência da alma foi aplicada ao núcleo do personagem.";
  }

  const beforeName = getSoulRankName(summary.before.rank || 1);
  const afterName = getSoulRankName(summary.after.rank || 1);
  const rankUps = Array.isArray(summary.rankUps) ? summary.rankUps : [];

  if (!summary.totalExperience) {
    return `${currentSheetTarget.label || "O personagem"} não absorveu experiência desta essência por causa da diferença de ranks.`;
  }

  return `${currentSheetTarget.label || "O personagem"} recebeu ${summary.totalExperience} XP em essência da alma. ${beforeName} → ${afterName}.${rankUps.length ? ` Subidas: ${rankUps.map(entry => `${entry.from}→${entry.to}`).join(", ")}.` : ""}`;
}

async function applySoulAward() {
  if (currentRole !== "master" || currentSheetTarget.kind !== "player") return;

  const { apply } = getSoulAwardElements();
  const essenceRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.essenceRank, 10) || 1));
  const amount = Math.min(999, Math.max(1, Number.parseInt(soulAwardState.amount, 10) || 1));

  if (apply) apply.disabled = true;

  try {
    if (isBackendMode()) {
      const response = await APP.awardSoulEssence(currentSheetTarget.key, {
        essenceRank,
        amount
      });
      const savedData = normalizeSheetData(response.character.data || {}, "player");
      remoteSheetsCache[currentSheetTarget.key] = savedData;
      persistRemoteSheetsCache();
      soulCore = normalizeSoulCoreState(savedData.soulCore, savedData.charLevel || 1);
      renderProgressionField("player");
      closeSoulAwardModal();
      await UI.alert(buildSoulAwardSummary(response.summary), {
        title: "Núcleo fortalecido",
        kicker: "// Essência da alma"
      });
      return;
    }

    // No modo local, a mesma lógica pura é reaproveitada para manter a integração simples.
    const beforeCore = normalizeSoulCoreState(soulCore, soulCore.rank);
    const result = absorbSoulEssencesState(beforeCore, essenceRank, amount);
    soulCore = normalizeSoulCoreState(result.core, result.core.rank);
    renderProgressionField("player");
    closeSoulAwardModal();
    saveSheetSilently();
    await UI.alert(
      buildSoulAwardSummary({
        before: beforeCore,
        after: result.core,
        totalExperience: result.totalExperience,
        rankUps: result.rankUps
      }),
      {
        title: "Núcleo fortalecido",
        kicker: "// Essência da alma"
      }
    );
  } catch (error) {
    await UI.alert(error.message || "Falha ao aplicar a essência da alma.", {
      title: "Falha na absorção",
      kicker: "// Essência da alma"
    });
  } finally {
    if (apply) apply.disabled = false;
  }
}

function initSoulAwardModal() {
  const { root, dialog, close, cancel, apply, amount, optionGrid, open } = getSoulAwardElements();
  if (!root || !dialog || !close || !cancel || !apply || !amount || !optionGrid || !open) return;
  if (root.dataset.bound === "true") return;

  root.dataset.bound = "true";

  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  open.addEventListener("click", openSoulAwardModal);
  close.addEventListener("click", closeSoulAwardModal);
  cancel.addEventListener("click", closeSoulAwardModal);
  apply.addEventListener("click", () => {
    applySoulAward();
  });

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.soulAwardClose) {
      closeSoulAwardModal();
      return;
    }

    const rankButton = target.closest("[data-soul-rank]");
    if (!(rankButton instanceof HTMLElement)) return;

    soulAwardState.essenceRank = Math.min(7, Math.max(1, Number.parseInt(rankButton.dataset.soulRank || "1", 10) || 1));
    renderSoulAwardOptions();
    renderSoulAwardPreview();
  });

  amount.addEventListener("input", () => {
    soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount.value || "1", 10) || 1));
    renderSoulAwardPreview();
  });

  document.addEventListener("keydown", event => {
    if (!soulAwardState.open) return;
    if (event.key !== "Escape") return;

    event.preventDefault();
    closeSoulAwardModal();
  });
}
