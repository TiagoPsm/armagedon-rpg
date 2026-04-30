function getDicePreset(key) {
  return DICE_PRESETS.find(preset => preset.key === key)
    || DICE_PRESETS.find(preset => preset.key === DEFAULT_DICE_PRESET)
    || DICE_PRESETS[0];
}

function getDiceTrayElements() {
  return {
    root: document.getElementById("diceTrayRoot"),
    dialog: document.querySelector(".dice-tray-dialog"),
    optionGrid: document.getElementById("diceOptionGrid"),
    modeGrid: document.getElementById("diceModeGrid"),
    qty: document.getElementById("diceTrayQty"),
    modifier: document.getElementById("diceTrayModifier"),
    expression: document.getElementById("diceTrayExpression"),
    preview: document.getElementById("diceExpressionPreview"),
    roll: document.getElementById("diceTrayRollBtn"),
    cancel: document.getElementById("diceTrayCancelBtn"),
    close: document.getElementById("diceTrayCloseBtn"),
    badge: document.getElementById("diceTrayBadge"),
    advancedToggle: document.getElementById("diceAdvancedToggleBtn"),
    advancedToggleState: document.getElementById("diceAdvancedToggleState"),
    advancedPanel: document.getElementById("diceTrayAdvancedPanel"),
    historyToggle: document.getElementById("diceHistoryToggleBtn"),
    historyToggleState: document.getElementById("diceHistoryToggleState"),
    historyToggleHint: document.getElementById("diceHistoryToggleHint"),
    historyPanel: document.getElementById("diceHistoryPanel"),
    historyList: document.getElementById("diceHistoryList"),
    reroll: document.getElementById("diceTrayRerollBtn"),
    resultCard: document.getElementById("diceResultCard"),
    resultBreakdown: document.getElementById("diceResultBreakdown"),
    resultState: document.getElementById("diceResultState"),
    resultFeedback: document.getElementById("diceResultFeedback"),
    resultFeedbackTitle: document.getElementById("diceResultFeedbackTitle"),
    resultFeedbackHint: document.getElementById("diceResultFeedbackHint"),
    resultTotal: document.getElementById("diceResultTotal"),
    resultDetail: document.getElementById("diceResultDetail")
  };
}

function clampDiceTrayQuantity(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 1;
  return Math.max(1, numeric);
}

function clampDiceTrayModifier(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 0;
  return Math.min(1000, Math.max(-1000, numeric));
}

function normalizeDiceTrayMode(value) {
  return Object.prototype.hasOwnProperty.call(DICE_TRAY_MODES, value) ? value : "normal";
}

function buildDiceTrayExpression() {
  const preset = getDicePreset(diceTrayState.preset);
  const modifier = clampDiceTrayModifier(diceTrayState.modifier);
  const modifierSuffix = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return `${clampDiceTrayQuantity(diceTrayState.qty)}d${preset.sides}${modifierSuffix}`;
}

function getActiveDiceTrayExpression() {
  const customExpression = normalizeDamageExpression(diceTrayState.customExpression);
  return customExpression || buildDiceTrayExpression();
}

function formatDiceTrayModeLabel(mode) {
  return DICE_TRAY_MODES[normalizeDiceTrayMode(mode)] || DICE_TRAY_MODES.normal;
}

function formatRollPreview(result) {
  if (!result || !Array.isArray(result.rolls) || !result.rolls.length) return "";

  const preview = result.rolls.join(" + ");
  if (!result.hiddenRollCount) return preview;

  const hiddenLabel = result.hiddenRollCount === 1 ? "1 restante" : `${result.hiddenRollCount} restantes`;
  return `${preview} + ... (${hiddenLabel})`;
}

function formatDiceTrayTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return DICE_TRAY_TIME_FORMATTER.format(date);
}

function shouldOpenDiceTrayAdvanced(config) {
  return Boolean(normalizeDamageExpression(config.customExpression))
    || clampDiceTrayQuantity(config.qty) !== 1
    || clampDiceTrayModifier(config.modifier) !== 0;
}

function getDiceTrayHistoryTypeLabel(config) {
  const modeLabel = formatDiceTrayModeLabel(config.mode);
  const customExpression = normalizeDamageExpression(config.customExpression);

  if (customExpression) {
    return `Expressão livre • ${modeLabel}`;
  }

  const preset = getDicePreset(config.preset);
  const qty = clampDiceTrayQuantity(config.qty);
  return `${qty > 1 ? `${qty}x ` : ""}${preset.label} • ${modeLabel}`;
}

function renderDiceOptions() {
  const { optionGrid } = getDiceTrayElements();
  if (!optionGrid) return;

  optionGrid.innerHTML = DICE_PRESETS.map(preset => `
    <button
      type="button"
      class="dice-option-btn ${diceTrayState.preset === preset.key ? "is-active" : ""}"
      data-dice-option="${preset.key}"
      aria-pressed="${diceTrayState.preset === preset.key ? "true" : "false"}"
      title="${preset.label}"
    >
      <span class="dice-option-value">${preset.sides}</span>
    </button>
  `).join("");
}

function renderDiceModeButtons() {
  const { modeGrid } = getDiceTrayElements();
  if (!modeGrid) return;

  modeGrid.querySelectorAll("[data-dice-mode]").forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return;
    const isActive = button.dataset.diceMode === diceTrayState.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function formatDiceTrayRollSummary(result) {
  const modifierText = result.modifier
    ? ` | Modificador: ${result.modifier > 0 ? "+" : ""}${result.modifier}`
    : "";
  const countText = result.hiddenRollCount ? ` | ${result.diceCount} dados` : "";
  return `${result.total} (${formatRollPreview(result)}${modifierText}${countText})`;
}

function buildDiceTrayRollMeta(result) {
  if (!result) return "";
  const rollText = formatRollPreview(result);
  const modifierText = result.modifier
    ? ` | Mod ${result.modifier > 0 ? "+" : ""}${result.modifier}`
    : "";
  const countText = result.hiddenRollCount ? ` | ${result.diceCount} dados` : "";
  return `${rollText}${modifierText}${countText}`;
}

function buildDiceTrayHistoryMeta(result) {
  if (!result) return "";

  if (result.mode === "advantage" || result.mode === "disadvantage") {
    return `${formatDiceTrayModeLabel(result.mode)} • ${result.first.total} / ${result.second.total}`;
  }

  return `Normal • ${buildDiceTrayRollMeta(result.chosen)}`;
}

function pushDiceTrayHistory(result) {
  if (!result) return;

  const now = new Date();
  diceTrayState.history.unshift({
    total: result.total,
    expression: result.expression,
    mode: result.mode,
    qty: clampDiceTrayQuantity(diceTrayState.qty),
    modifier: clampDiceTrayModifier(diceTrayState.modifier),
    preset: diceTrayState.preset,
    customExpression: normalizeDamageExpression(diceTrayState.customExpression),
    timeLabel: formatDiceTrayTime(now),
    typeLabel: getDiceTrayHistoryTypeLabel(diceTrayState),
    meta: buildDiceTrayHistoryMeta(result),
    special: result.special
  });
  diceTrayState.history = diceTrayState.history.slice(0, DICE_TRAY_HISTORY_LIMIT);
}

function renderDiceTrayHistory(elements) {
  if (!elements.historyList) return;

  if (!diceTrayState.history.length) {
    elements.historyList.innerHTML = '<p class="dice-history-empty">Nenhuma rolagem ainda.</p>';
    return;
  }

  elements.historyList.innerHTML = diceTrayState.history
    .map((entry, index) => `
      <article class="dice-history-item ${entry.special ? `is-${entry.special}` : ""} ${entry.mode !== "normal" ? `is-${entry.mode}` : ""}">
        <div class="dice-history-total-wrap">
          <strong class="dice-history-total">${esc(String(entry.total))}</strong>
          <span class="dice-history-time">${esc(entry.timeLabel)}</span>
        </div>
        <div class="dice-history-copy">
          <div class="dice-history-top">
            <span class="dice-history-expression">${esc(entry.expression)}</span>
            <span class="dice-history-type">${esc(entry.typeLabel)}</span>
          </div>
          <span class="dice-history-meta">${esc(entry.meta)}</span>
        </div>
        <button type="button" class="btn-inline dice-history-repeat-btn" data-dice-history-repeat="${index}">Repetir</button>
      </article>
    `)
    .join("");
}

async function repeatDiceTrayHistoryEntry(index) {
  const entry = diceTrayState.history[index];
  if (!entry) return;

  diceTrayState.preset = entry.preset || DEFAULT_DICE_PRESET;
  diceTrayState.qty = clampDiceTrayQuantity(entry.qty);
  diceTrayState.modifier = clampDiceTrayModifier(entry.modifier);
  diceTrayState.mode = normalizeDiceTrayMode(entry.mode);
  diceTrayState.customExpression = normalizeDamageExpression(entry.customExpression);
  diceTrayState.advancedOpen = shouldOpenDiceTrayAdvanced(diceTrayState);
  diceTrayState.lastResult = null;
  renderDiceTray();
  await rollDiceTray();
}

function openDiceTray() {
  const { root, dialog } = getDiceTrayElements();
  if (!root || !dialog) return;

  if (diceTrayCloseTimer) {
    window.clearTimeout(diceTrayCloseTimer);
    diceTrayCloseTimer = 0;
  }

  diceTrayState.open = true;
  diceTrayState.historyOpen = false;
  root.hidden = false;
  root.classList.remove("is-closing");
  window.requestAnimationFrame(() => {
    root.classList.add("is-open");
    dialog.focus();
    renderDiceTray();
  });
}

function closeDiceTray() {
  const { root } = getDiceTrayElements();
  if (!root || root.hidden) return;

  if (diceTrayCloseTimer) {
    window.clearTimeout(diceTrayCloseTimer);
    diceTrayCloseTimer = 0;
  }

  diceTrayState.open = false;
  root.classList.remove("is-open");
  root.classList.add("is-closing");
  diceTrayCloseTimer = window.setTimeout(() => {
    root.hidden = true;
    root.classList.remove("is-closing");
    diceTrayCloseTimer = 0;
  }, DICE_TRAY_ANIMATION_MS);
}

function initDiceTray() {
  const {
    root,
    dialog,
    qty,
    modifier,
    expression,
    roll,
    cancel,
    close,
    optionGrid,
    modeGrid,
    advancedToggle,
    historyToggle,
    reroll
  } = getDiceTrayElements();
  const openButton = document.getElementById("openDiceTrayBtn");
  if (
    !root
    || !dialog
    || !qty
    || !modifier
    || !expression
    || !roll
    || !cancel
    || !close
    || !optionGrid
    || !modeGrid
    || !advancedToggle
    || !historyToggle
    || !openButton
  ) return;

  const trayKicker = root.querySelector(".dice-tray-kicker");
  const trayTitle = document.getElementById("diceTrayTitle");
  const traySubtitle = root.querySelector(".dice-tray-subtitle");
  const expressionLabel = root.querySelector('label[for="diceTrayExpression"]');
  const previewNote = root.querySelector(".dice-tray-preview-note");

  if (trayKicker) trayKicker.textContent = "// Rolagem";
  if (trayTitle) trayTitle.textContent = "Lançar dados";
  if (traySubtitle) {
    traySubtitle.textContent = "Role rápido pelo fluxo principal e abra o avançado só quando precisar montar algo fora do padrão.";
  }
  if (expressionLabel) expressionLabel.textContent = "Expressão livre";
  if (previewNote) {
    previewNote.textContent = "A expressão livre substitui a quantidade, o dado e o modificador.";
  }

  openButton.addEventListener("click", openDiceTray);
  close.addEventListener("click", closeDiceTray);
  cancel.addEventListener("click", closeDiceTray);
  roll.addEventListener("click", () => {
    rollDiceTray();
  });
  if (reroll) {
    reroll.addEventListener("click", () => {
      rollDiceTray();
    });
  }
  historyToggle.addEventListener("click", () => {
    diceTrayState.historyOpen = !diceTrayState.historyOpen;
    renderDiceTray();
  });
  advancedToggle.addEventListener("click", () => {
    diceTrayState.advancedOpen = !diceTrayState.advancedOpen;
    renderDiceTray();
  });

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.diceClose) {
      closeDiceTray();
      return;
    }

    const repeatButton = target.closest("[data-dice-history-repeat]");
    if (repeatButton instanceof HTMLElement) {
      const index = Number.parseInt(repeatButton.dataset.diceHistoryRepeat || "-1", 10);
      if (index >= 0) {
        void repeatDiceTrayHistoryEntry(index);
      }
      return;
    }

    const option = target.closest("[data-dice-option]");
    if (option instanceof HTMLElement) {
      diceTrayState.preset = option.dataset.diceOption || DEFAULT_DICE_PRESET;
      diceTrayState.lastResult = null;
      renderDiceTray();
      return;
    }

    const modeButton = target.closest("[data-dice-mode]");
    if (modeButton instanceof HTMLElement) {
      diceTrayState.mode = normalizeDiceTrayMode(modeButton.dataset.diceMode || "normal");
      diceTrayState.lastResult = null;
      renderDiceTray();
    }
  });

  qty.addEventListener("input", () => {
    diceTrayState.qty = clampDiceTrayQuantity(qty.value);
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  modifier.addEventListener("input", () => {
    diceTrayState.modifier = clampDiceTrayModifier(modifier.value);
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  expression.addEventListener("input", () => {
    diceTrayState.customExpression = normalizeDamageExpression(expression.value);
    expression.value = diceTrayState.customExpression;
    if (diceTrayState.customExpression) diceTrayState.advancedOpen = true;
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  document.addEventListener("keydown", event => {
    if (!diceTrayState.open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeDiceTray();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      rollDiceTray();
    }
  });

  renderDiceTray();
}

function getDiceTrayResultFeedback(result) {
  if (!result) return null;

  if (result.special === "critical") {
    return {
      title: "Acerto crítico",
      hint: "Você atingiu o valor máximo possível desta rolagem."
    };
  }

  if (result.special === "fumble") {
    return {
      title: "Falha crítica",
      hint: "Você caiu no valor mínimo possível desta rolagem."
    };
  }

  return null;
}

function buildDiceTrayResultDetail(result) {
  if (!result) return "";

  if (result.mode === "advantage" || result.mode === "disadvantage") {
    return result.mode === "advantage"
      ? "Maior resultado mantido."
      : "Menor resultado mantido.";
  }

  if (result.chosen.modifier) {
    return `Resultado final com modificador ${result.chosen.modifier > 0 ? "+" : ""}${result.chosen.modifier}.`;
  }

  return "Resultado final da rolagem.";
}

function buildDiceTrayBreakdownCards(result) {
  if (!result) return [];

  if (result.mode === "advantage" || result.mode === "disadvantage") {
    return [
      {
        label: "1ª rolagem",
        value: String(result.first.total)
      },
      {
        label: "2ª rolagem",
        value: String(result.second.total)
      },
      {
        label: "Mantida",
        value: String(result.chosen.total),
        tone: "accent"
      }
    ];
  }

  const cards = [
    {
      label: "Rolagens",
      value: formatRollPreview(result.chosen),
      wide: true
    }
  ];

  if (result.chosen.diceCount > 1 || result.chosen.hiddenRollCount) {
    cards.push({
      label: "Dados",
      value: `${result.chosen.diceCount}d${result.chosen.diceSides}`
    });
  }

  if (result.chosen.modifier) {
    cards.push({
      label: "Mod",
      value: `${result.chosen.modifier > 0 ? "+" : ""}${result.chosen.modifier}`,
      tone: "accent"
    });
  }

  return cards;
}

function renderDiceTrayBreakdown(elements, result) {
  const { resultBreakdown } = elements;
  if (!resultBreakdown) return;

  if (!result) {
    resultBreakdown.hidden = true;
    resultBreakdown.innerHTML = "";
    return;
  }

  resultBreakdown.hidden = false;
  resultBreakdown.innerHTML = buildDiceTrayBreakdownCards(result)
    .map(card => `
      <article class="dice-breakdown-card ${card.wide ? "is-wide" : ""} ${card.tone ? `is-${card.tone}` : ""}">
        <span class="dice-breakdown-label">${esc(card.label)}</span>
        <strong class="dice-breakdown-value">${esc(card.value)}</strong>
      </article>
    `)
    .join("");
}

function applyDiceTraySpecialState(elements, result) {
  const { resultCard, resultState, resultFeedback, resultFeedbackTitle, resultFeedbackHint } = elements;
  const classes = ["is-critical", "is-fumble", "is-advantage", "is-disadvantage"];

  if (resultCard) resultCard.classList.remove(...classes);
  if (resultState) {
    resultState.hidden = true;
    resultState.textContent = "";
    resultState.className = "dice-result-state";
  }
  if (resultFeedback) resultFeedback.hidden = true;
  if (resultFeedbackTitle) resultFeedbackTitle.textContent = "";
  if (resultFeedbackHint) resultFeedbackHint.textContent = "";

  if (!result) return;

  let label = "";
  let toneClass = "";
  const feedback = getDiceTrayResultFeedback(result);

  if (result.mode === "advantage" && resultCard) resultCard.classList.add("is-advantage");
  if (result.mode === "disadvantage" && resultCard) resultCard.classList.add("is-disadvantage");

  if (result.special === "critical") {
    if (resultCard) resultCard.classList.add("is-critical");
    label = "Crítico";
    toneClass = "is-critical";
  } else if (result.special === "fumble") {
    if (resultCard) resultCard.classList.add("is-fumble");
    label = "Falha";
    toneClass = "is-fumble";
  } else if (result.mode !== "normal") {
    label = formatDiceTrayModeLabel(result.mode);
    toneClass = result.mode === "advantage" ? "is-advantage" : "is-disadvantage";
  }

  if (label && resultState) {
    resultState.hidden = false;
    resultState.textContent = label;
    resultState.className = `dice-result-state ${toneClass}`.trim();
  }

  if (feedback && resultFeedback && resultFeedbackTitle && resultFeedbackHint) {
    resultFeedback.hidden = false;
    resultFeedbackTitle.textContent = feedback.title;
    resultFeedbackHint.textContent = feedback.hint;
  }
}

function rollDiceExpressionWithMode(expression, mode) {
  const normalizedMode = normalizeDiceTrayMode(mode);
  const first = rollDamageExpression(expression);
  if (!first) return null;

  const getSpecialState = chosen => {
    const min = chosen.diceCount + chosen.modifier;
    const max = (chosen.diceCount * chosen.diceSides) + chosen.modifier;
    if (chosen.total === max) return "critical";
    if (chosen.total === min) return "fumble";
    return "";
  };

  if (normalizedMode === "normal") {
    return {
      mode: normalizedMode,
      expression: first.expression,
      total: first.total,
      chosen: first,
      first,
      second: null,
      special: getSpecialState(first)
    };
  }

  const second = rollDamageExpression(expression);
  if (!second) return null;

  const chosen = normalizedMode === "advantage"
    ? (second.total > first.total ? second : first)
    : (second.total < first.total ? second : first);

  return {
    mode: normalizedMode,
    expression: first.expression,
    total: chosen.total,
    chosen,
    first,
    second,
    special: getSpecialState(chosen)
  };
}

function renderDiceTray() {
  const elements = getDiceTrayElements();
  const preset = getDicePreset(diceTrayState.preset);
  const expression = getActiveDiceTrayExpression();
  const customExpression = normalizeDamageExpression(diceTrayState.customExpression);
  const hasCurrentResult = (
    diceTrayState.lastResult
    && diceTrayState.lastResult.expression === expression
    && diceTrayState.lastResult.mode === diceTrayState.mode
  );

  if (elements.qty) elements.qty.value = String(clampDiceTrayQuantity(diceTrayState.qty));
  if (elements.modifier) elements.modifier.value = String(clampDiceTrayModifier(diceTrayState.modifier));
  if (elements.expression) elements.expression.value = customExpression;
  if (elements.preview) elements.preview.textContent = expression;
  if (elements.badge) elements.badge.textContent = preset.label;
  if (elements.historyPanel) elements.historyPanel.hidden = !diceTrayState.historyOpen;
  if (elements.historyToggle) elements.historyToggle.setAttribute("aria-expanded", diceTrayState.historyOpen ? "true" : "false");
  if (elements.historyToggleState) elements.historyToggleState.textContent = diceTrayState.historyOpen ? "Ocultar" : "Mostrar";
  if (elements.historyToggleHint) {
    const historyCount = diceTrayState.history.length;
    elements.historyToggleHint.textContent = historyCount === 0
      ? "Últimas rolagens da sessão"
      : historyCount === 1
        ? "1 rolagem guardada"
        : `${historyCount} rolagens guardadas`;
  }
  if (elements.advancedPanel) elements.advancedPanel.hidden = !diceTrayState.advancedOpen;
  if (elements.advancedToggle) elements.advancedToggle.setAttribute("aria-expanded", diceTrayState.advancedOpen ? "true" : "false");
  if (elements.advancedToggleState) elements.advancedToggleState.textContent = diceTrayState.advancedOpen ? "Ocultar" : "Mostrar";
  if (elements.roll) {
    elements.roll.disabled = diceTrayState.rolling;
    elements.roll.textContent = diceTrayState.rolling ? "Rolando..." : "Rolar agora";
  }
  if (elements.reroll) elements.reroll.hidden = !hasCurrentResult || diceTrayState.rolling;

  if (hasCurrentResult) {
    if (elements.resultTotal) elements.resultTotal.textContent = String(diceTrayState.lastResult.total);
    if (elements.resultDetail) elements.resultDetail.textContent = buildDiceTrayResultDetail(diceTrayState.lastResult);
    applyDiceTraySpecialState(elements, diceTrayState.lastResult);
    renderDiceTrayBreakdown(elements, diceTrayState.lastResult);
  } else {
    applyDiceTraySpecialState(elements, null);
    renderDiceTrayBreakdown(elements, null);
    if (elements.resultTotal) elements.resultTotal.textContent = "—";
    if (elements.resultDetail) {
      elements.resultDetail.textContent = "";
    }
  }

  renderDiceTrayHistory(elements);
  renderDiceOptions();
  renderDiceModeButtons();
}

async function rollDiceTray() {
  if (diceTrayState.rolling) return;

  const elements = getDiceTrayElements();
  diceTrayState.qty = clampDiceTrayQuantity(elements.qty.value || diceTrayState.qty);
  diceTrayState.modifier = clampDiceTrayModifier(elements.modifier.value || diceTrayState.modifier);
  diceTrayState.customExpression = normalizeDamageExpression(elements.expression.value || diceTrayState.customExpression);
  diceTrayState.mode = normalizeDiceTrayMode(diceTrayState.mode);

  const expression = getActiveDiceTrayExpression();
  const result = rollDiceExpressionWithMode(expression, diceTrayState.mode);

  if (!result) {
    diceTrayState.advancedOpen = true;
    renderDiceTray();
    await UI.alert("Não foi possível interpretar essa rolagem.", {
      title: "Rolagem inválida",
      kicker: "// Dados"
    });
    return;
  }

  diceTrayState.rolling = true;
  renderDiceTray();
  diceTrayState.lastResult = result;
  pushDiceTrayHistory(result);
  diceTrayState.rolling = false;
  renderDiceTray();
}
