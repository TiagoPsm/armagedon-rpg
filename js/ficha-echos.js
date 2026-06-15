/* ── Seção "Drop de Echo" na ficha do monstro ──────────────────────────
   Espelha o fluxo de drop de memória: o mestre configura chance + raridade
   padrão, testa o drop e, em caso de sucesso, concede o Echo a um jogador
   ou NPC. O Echo é criado no servidor (tabela echos) com rank próprio. */

const ECHO_RARITY_LABELS = {
  comum: "Comum",
  raro: "Raro",
  epico: "Épico",
  lendario: "Lendário"
};
const ECHO_RARITY_ORDER = ["comum", "raro", "epico", "lendario"];

function getEchoRarityLabel(value) {
  return ECHO_RARITY_LABELS[normalizeEchoRarityValue(value)] || ECHO_RARITY_LABELS.comum;
}

function ensureEchoDropConfig() {
  if (!echoDropConfig || typeof echoDropConfig !== "object") {
    echoDropConfig = { chance: "0", defaultRarity: "comum" };
  }
  return echoDropConfig;
}

function collectEchoDropConfig() {
  const config = ensureEchoDropConfig();
  const chanceInput = document.getElementById("echoDropChance");
  return normalizeEchoDropConfig({
    chance: chanceInput ? chanceInput.value : config.chance,
    defaultRarity: config.defaultRarity
  });
}

function renderEchoDropSection(kind = currentSheetTarget?.kind || "player") {
  const panel = document.getElementById("echoDropPanel");
  if (!panel) return;

  if (kind !== "monster") {
    panel.innerHTML = "";
    return;
  }

  const config = ensureEchoDropConfig();
  const chance = formatChancePercent(config.chance);

  panel.innerHTML = `
    <div class="echo-drop-config">
      <div class="echo-drop-fields">
        <div class="memory-field">
          <span class="item-meta">Chance de drop do Echo (%)</span>
          <input
            id="echoDropChance"
            class="memory-chance"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value="${esc(config.chance)}"
            oninput="updateEchoDropConfig('chance', this.value)"
          />
        </div>

        <div class="memory-field">
          <span class="item-meta">Raridade padrão</span>
          <button type="button" class="btn-inline echo-rarity-btn" onclick="pickEchoDefaultRarity()">
            <span class="echo-rarity-label" data-rarity="${esc(config.defaultRarity)}">${esc(getEchoRarityLabel(config.defaultRarity))}</span>
            <span class="memory-picker-hint">Alterar</span>
          </button>
        </div>
      </div>

      <p class="echo-drop-hint">
        Echos são raros. Ao cair, o monstro vira uma manifestação residual enfraquecida,
        com rank próprio, que passa a pertencer ao jogador.
      </p>

      <button type="button" class="btn-inline memory-roll-btn" onclick="rollEchoDrop()">Testar drop de Echo</button>

      <div class="memory-roll-track">
        <div class="memory-roll-threshold" id="echoThreshold" style="left:${chance}%"></div>
        <div class="memory-roll-fill" id="echoRollFill"></div>
      </div>
      <div class="memory-roll-result" id="echoRollResult">Defina a chance e role para descobrir se o Echo caiu.</div>

      <div class="memory-award" id="echoAward" hidden></div>
    </div>
  `;

  applyEchoRollState();
}

function updateEchoDropConfig(field, value) {
  const config = ensureEchoDropConfig();
  if (field === "chance") {
    config.chance = sanitizeChance(value, "0");
    echoRollState = {};
    applyEchoRollState();
    const threshold = document.getElementById("echoThreshold");
    if (threshold) threshold.style.left = `${formatChancePercent(config.chance)}%`;
  } else if (field === "defaultRarity") {
    config.defaultRarity = normalizeEchoRarityValue(value);
  }
  saveSheetSilently();
}

async function pickEchoDefaultRarity() {
  const config = ensureEchoDropConfig();
  const selected = await UI.pickOption({
    title: "Raridade padrão do Echo",
    kicker: "// Raridade",
    message: "Escolha a raridade padrão aplicada ao Echo gerado por este monstro.",
    options: ECHO_RARITY_ORDER.map(rarity => ({
      value: rarity,
      label: ECHO_RARITY_LABELS[rarity],
      meta: "Raridade",
      selected: rarity === config.defaultRarity
    }))
  });

  if (!selected) return;
  updateEchoDropConfig("defaultRarity", selected);
  renderEchoDropSection("monster");
}

function applyEchoRollState() {
  const fill = document.getElementById("echoRollFill");
  const result = document.getElementById("echoRollResult");
  const threshold = document.getElementById("echoThreshold");
  const config = ensureEchoDropConfig();

  if (threshold) threshold.style.left = `${formatChancePercent(config.chance)}%`;

  if (fill) {
    fill.classList.remove("success", "fail");
    fill.style.transition = "none";
    fill.style.width = echoRollState.rolled !== undefined ? `${echoRollState.rolled}%` : "0%";
    if (echoRollState.status) fill.classList.add(echoRollState.status);
  }

  if (result) {
    result.className = "memory-roll-result";
    if (echoRollState.status) result.classList.add(`is-${echoRollState.status}`);
    if (echoRollState.isRolling) result.classList.add("is-rolling");
    result.textContent = echoRollState.resultText || "Defina a chance e role para descobrir se o Echo caiu.";
  }

  renderEchoAwardControls();
}

function renderEchoAwardControls() {
  const award = document.getElementById("echoAward");
  if (!award) return;

  if (!echoRollState.success) {
    award.hidden = true;
    award.innerHTML = "";
    return;
  }

  const statusClass =
    echoRollState.awardTone === "success"
      ? "memory-award-status is-success"
      : echoRollState.awardTone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  award.hidden = false;

  if (echoRollState.awarded) {
    award.innerHTML = `
      <span class="item-meta">Echo concedido</span>
      <div class="${statusClass}">${esc(echoRollState.awardText || "Echo concedido à ficha escolhida.")}</div>
    `;
    return;
  }

  if (!isBackendMode()) {
    award.innerHTML = `
      <span class="item-meta">Conceder Echo</span>
      <div class="memory-award-status is-fail">Conceder Echos exige o servidor ativo (modo online).</div>
    `;
    return;
  }

  const targets = getMemoryAwardTargets();
  if (!targets.length) {
    award.innerHTML = `
      <span class="item-meta">Conceder Echo</span>
      <div class="memory-award-status is-fail">Não há jogadores ou NPCs disponíveis para receber este Echo.</div>
    `;
    return;
  }

  const selectedTarget = targets.some(target => target.value === echoRollState.target)
    ? echoRollState.target
    : targets[0].value;
  echoRollState.target = selectedTarget;

  award.innerHTML = `
    <span class="item-meta">Conceder Echo para</span>
    <button type="button" class="btn-inline memory-picker-btn" onclick="pickEchoAwardTarget()">
      <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher destino"))}</span>
      <span class="memory-picker-hint">Alterar</span>
    </button>
    <button type="button" class="btn-inline memory-award-btn" onclick="awardEchoDrop()">Conceder Echo</button>
    <div class="${statusClass}">${esc(echoRollState.awardText || "O Echo caiu. Escolha quem vai recebê-lo.")}</div>
  `;
}

async function pickEchoAwardTarget() {
  if (!echoRollState.success) return;
  const targets = getMemoryAwardTargets();
  if (!targets.length) return;

  const currentTarget = targets.some(target => target.value === echoRollState.target)
    ? echoRollState.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Conceder Echo",
    kicker: "// Destino",
    message: "Escolha quem vai receber este Echo.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: target.meta,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  echoRollState.target = selected;
  echoRollState.awardTone = "";
  echoRollState.awardText = "Destino definido. Clique em Conceder Echo.";
  renderEchoAwardControls();
}

async function rollEchoDrop() {
  const fill = document.getElementById("echoRollFill");
  const result = document.getElementById("echoRollResult");
  if (!fill || !result) return;

  if (!isBackendMode()) {
    echoRollState = {
      resultText: "Conceder Echos exige o servidor ativo (modo online).",
      status: "fail"
    };
    applyEchoRollState();
    return;
  }

  const config = ensureEchoDropConfig();

  fill.classList.remove("success", "fail");
  fill.style.transition = "none";
  fill.style.width = "0%";
  echoRollState = { isRolling: true };
  renderEchoAwardControls();
  result.className = "memory-roll-result is-rolling";
  result.textContent = "Rolando o destino do Echo...";

  let chance = formatChancePercent(config.chance);
  let rolled = Number((Math.random() * 100).toFixed(1));
  let success = chance > 0 && rolled <= chance;
  let defaultRarity = config.defaultRarity;

  try {
    const remote = await APP.rollMonsterEcho({ monsterKey: currentSheetTarget.key });
    chance = Number(remote.chance ?? chance);
    rolled = Number(remote.rolled ?? rolled);
    success = Boolean(remote.success);
    defaultRarity = normalizeEchoRarityValue(remote.defaultRarity || defaultRarity);
  } catch (error) {
    echoRollState = { status: "fail", resultText: error.message || "Falha ao rolar o drop do Echo." };
    applyEchoRollState();
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = "width 1.2s cubic-bezier(0.2, 0.9, 0.1, 1)";
      fill.style.width = `${rolled}%`;
    });
  });

  window.setTimeout(() => {
    echoRollState = {
      rolled,
      status: success ? "success" : "fail",
      success,
      awarded: false,
      target: getMemoryAwardTargets()[0]?.value || "",
      rarity: defaultRarity,
      awardTone: "",
      awardText: "",
      resultText: success
        ? `Echo obtido. Rolagem ${rolled}% dentro da chance de ${chance}%.`
        : `Sem Echo. Rolagem ${rolled}% acima da chance de ${chance}%.`
    };
    applyEchoRollState();
  }, 1250);
}

async function awardEchoDrop() {
  if (!echoRollState.success || echoRollState.awarded) return;
  if (!isBackendMode()) return;

  const target = parseMemoryAwardTarget(echoRollState.target);
  if (!target || target.kind === "monster") {
    echoRollState.awardTone = "fail";
    echoRollState.awardText = "Escolha um jogador ou NPC válido para receber o Echo.";
    renderEchoAwardControls();
    return;
  }

  try {
    const response = await APP.awardMonsterEcho({
      monsterKey: currentSheetTarget.key,
      targetKey: target.key,
      rarity: echoRollState.rarity || ensureEchoDropConfig().defaultRarity
    });
    const echoName = response?.echo?.displayName || currentSheetTarget.label || "Echo";
    echoRollState.awarded = true;
    echoRollState.awardTone = "success";
    echoRollState.awardText = `${echoName} concedido a ${target.label}.`;
  } catch (error) {
    echoRollState.awardTone = "fail";
    echoRollState.awardText = error.message || "Falha ao conceder o Echo.";
  }

  renderEchoAwardControls();
}
