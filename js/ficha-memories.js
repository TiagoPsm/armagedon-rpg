function renderOwnedMemories(list) {
  ownedMemories = list.map(normalizeOwnedMemory);
  const element = document.getElementById("ownedMemoryList");
  if (!element) return;

  const canTransfer = currentSheetTarget.kind === "player";
  const transferTargets = canTransfer ? getOwnedMemoryTransferTargets() : [];

  if (!ownedMemories.length) {
    element.className = "";
    element.innerHTML = '<p class="empty-msg">Nenhuma memória possuída.</p>';
    return;
  }

  element.className = "owned-memory-list";
  element.innerHTML = ownedMemories
    .map(
      (memory, index) => `
        <article
          class="owned-memory-card"
          data-name="${esc(memory.name)}"
          data-desc="${esc(memory.desc)}"
          data-source="${esc(memory.source)}"
        >
          <div class="owned-memory-body">
            <span class="item-meta">Memória</span>
            <h3 class="owned-memory-title">${esc(memory.name || "Memória sem nome")}</h3>
            <p class="owned-memory-desc">${esc(memory.desc || "Sem descrição.")}</p>
            ${
              memory.source
                ? `<span class="owned-memory-source">Origem: ${esc(memory.source)}</span>`
                : ""
            }
            ${
              canTransfer
                ? renderOwnedMemoryTransferBlock(index, transferTargets)
                : ""
            }
          </div>
          <button class="btn-remove" onclick="removeOwnedMemory(${index})">x</button>
        </article>
      `
    )
    .join("");
}

function removeOwnedMemory(index) {
  ownedMemoryTransferStates = {};
  ownedMemories.splice(index, 1);
  renderOwnedMemories(ownedMemories);
  saveSheetSilently();
}

function collectOwnedMemories() {
  return Array.from(document.querySelectorAll(".owned-memory-card")).map(card => ({
    name: card.dataset.name || "",
    desc: card.dataset.desc || "",
    source: card.dataset.source || ""
  }));
}

function getOwnedMemoryTransferTargets() {
  if (currentSheetTarget.kind !== "player") return [];

  return AUTH.getPlayers()
    .filter(player => player.username !== currentSheetTarget.owner)
    .map(player => ({
      value: player.username,
      label: player.charname || player.username,
      meta: player.username
    }));
}

function formatMemoryTargetLabel(value, targets, fallback) {
  const target = targets.find(candidate => candidate.value === value);
  return target ? `${target.label} (${target.meta})` : fallback;
}

function renderOwnedMemoryTransferBlock(index, targets) {
  if (!targets.length) {
    return `
      <div class="owned-memory-transfer">
        <span class="item-meta">Transferência</span>
        <div class="memory-award-status">Não há outro jogador disponível para receber esta memória.</div>
      </div>
    `;
  }

  const state = ownedMemoryTransferStates[index] || {};
  const selectedTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;
  const statusClass =
    state.tone === "success"
      ? "memory-award-status is-success"
      : state.tone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  ownedMemoryTransferStates[index] = {
    ...state,
    target: selectedTarget
  };

  return `
    <div class="owned-memory-transfer">
      <span class="item-meta">Transferir para outro jogador</span>
      <div class="owned-memory-transfer-row">
        <button class="btn-inline memory-picker-btn owned-memory-picker-btn" onclick="pickOwnedMemoryTransferTarget(${index})">
          <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher jogador"))}</span>
          <span class="memory-picker-hint">Alterar</span>
        </button>
        <button class="btn-inline owned-memory-transfer-send" onclick="transferOwnedMemory(${index})">Enviar</button>
      </div>
          <div class="${statusClass}">${esc(state.text || "Selecione o jogador de destino para transferir esta memória.")}</div>
    </div>
  `;
}

async function pickOwnedMemoryTransferTarget(index) {
  const targets = getOwnedMemoryTransferTargets();
  if (!targets.length) return;

  const state = ownedMemoryTransferStates[index] || {};
  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Transferir memória",
    kicker: "// Jogadores",
    message: "Escolha qual jogador vai receber esta memória.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: `Jogador | ${target.meta}`,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  ownedMemoryTransferStates[index] = {
    ...state,
    target: selected,
    tone: "",
    text: "Destino definido. Clique em Enviar para concluir a transferência."
  };

  renderOwnedMemories(ownedMemories);
}

async function transferOwnedMemory(index) {
  if (currentSheetTarget.kind !== "player") return;

  const memory = ownedMemories[index];
  const state = ownedMemoryTransferStates[index] || {};
  const targetUsername = state.target || getOwnedMemoryTransferTargets()[0].value;
  if (!memory || !targetUsername) return;

  const target = createPlayerTarget(targetUsername);
  const confirmed = await UI.confirm(
      `Transferir "${memory.name || "Memória sem nome"}" para ${target.label}`,
    {
        title: "Transferir memória",
        kicker: "// Memórias possuídas",
      confirmLabel: "Transferir",
      cancelLabel: "Cancelar"
    }
  );

  if (!confirmed) return;

  if (isBackendMode()) {
    try {
      await APP.transferOwnedMemory({
        sourceKey: currentSheetTarget.key,
        targetKey: target.key,
        memoryIndex: index
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      ownedMemoryTransferStates[index] = {
        ...state,
        tone: "fail",
      text: error.message || "Falha ao transferir a memória."
      };
      renderOwnedMemories(ownedMemories);
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[target.key] || {}, "player");
    const transferredMemory = normalizeOwnedMemory({
      name: memory.name,
      desc: memory.desc,
      source: memory.source || currentSheetTarget.label || ""
    });

    targetSheet.ownedMemories = [...targetSheet.ownedMemories, transferredMemory];
    sheets[target.key] = targetSheet;
    writeSheets(sheets);
  }

  ownedMemoryTransferStates = {};
  ownedMemories.splice(index, 1);
  renderOwnedMemories(ownedMemories);
  saveSheetSilently();
}

function getMemoryAwardTargets() {
  const players = AUTH.getPlayers().map(player => ({
    kind: "player",
    value: `player:${player.username}`,
    label: player.charname || player.username,
    meta: `Jogador | ${player.username}`
  }));

  const npcs = readNpcs().map(npc => ({
    kind: "npc",
    value: `npc:${npc.id}`,
    label: npc.name,
    meta: "NPC"
  }));

  return [...players, ...npcs];
}

function parseMemoryAwardTarget(value) {
  if (!value) return null;

  const [kind, rawId] = String(value).split(":");
  if (!kind || !rawId) return null;

  if (kind === "player") {
    return createPlayerTarget(rawId);
  }

  if (kind === "npc") {
    const npc = readNpcs().find(candidate => candidate.id === rawId);
    return npc ? createNpcTarget(npc) : null;
  }

  return null;
}

function buildOwnedMemoryEntry(drop) {
  return normalizeOwnedMemory({
    name: String(drop.name || "").trim() || "Memória sem nome",
    desc: String(drop.desc || "").trim(),
    source: currentSheetTarget.label || "Origem desconhecida"
  });
}

function applyMemoryRollState(index) {
  const fill = document.getElementById(`memoryRollFill${index}`);
  const result = document.getElementById(`memoryRollResult${index}`);
  const threshold = document.getElementById(`memoryThreshold${index}`);
  const state = memoryRollStates[index];

  if (threshold) {
    threshold.style.left = `${formatChancePercent(memoryDrops[index].chance)}%`;
  }

  if (fill) {
    fill.classList.remove("success", "fail");
    fill.style.transition = "none";
    fill.style.width = state.rolled !== undefined ? `${state.rolled}%` : "0%";
    if (state.status) fill.classList.add(state.status);
  }

  if (result) {
    result.className = "memory-roll-result";
    if (state.status) result.classList.add(`is-${state.status}`);
    if (state.isRolling) result.classList.add("is-rolling");
    result.textContent = state.resultText || "Defina a chance e role para descobrir se a memória caiu.";
  }

  renderMemoryAwardControls(index);
}

function renderMemoryAwardControls(index) {
  const award = document.getElementById(`memoryAward${index}`);
  const state = memoryRollStates[index];
  if (!award) return;

  const showAward = Boolean(state.success);
  if (!showAward) {
    award.hidden = true;
    award.innerHTML = "";
    return;
  }

  const targets = getMemoryAwardTargets();
  const statusClass =
    state.awardTone === "success"
      ? "memory-award-status is-success"
      : state.awardTone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  award.hidden = false;

  if (state.awarded) {
    award.innerHTML = `
      <span class="item-meta">Memória enviada</span>
      <div class="${statusClass}">${esc(state.awardText || "Memória enviada para a ficha escolhida.")}</div>
    `;
    return;
  }

  if (!targets.length) {
    award.innerHTML = `
      <span class="item-meta">Enviar memória</span>
      <div class="memory-award-status is-fail">Não há jogadores ou NPCs disponíveis para receber esta memória.</div>
    `;
    return;
  }

  const selectedTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  memoryRollStates[index] = {
    ...state,
    target: selectedTarget
  };

  award.innerHTML = `
    <span class="item-meta">Enviar memória para</span>
    <button class="btn-inline memory-picker-btn" onclick="pickMemoryAwardTarget(${index})">
      <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher destino"))}</span>
      <span class="memory-picker-hint">Alterar</span>
    </button>
    <button class="btn-inline memory-award-btn" onclick="awardMemoryDrop(${index})">Enviar para ficha</button>
    <div class="${statusClass}">${esc(state.awardText || "A memória caiu. Escolha quem vai recebê-la.")}</div>
  `;
}

async function pickMemoryAwardTarget(index) {
  const state = memoryRollStates[index];
  if (!state) return;

  const targets = getMemoryAwardTargets();
  if (!targets.length) return;

  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Enviar memória",
    kicker: "// Destino",
    message: "Escolha quem vai receber esta memória.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: target.meta,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  memoryRollStates[index] = {
    ...state,
    target: selected,
    awardTone: "",
    awardText: "Destino definido. Clique em Enviar para ficha."
  };

  renderMemoryAwardControls(index);
}

function renderMemoryDrops(list) {
  memoryDrops = list.map(normalizeMemoryDrop);
  const element = document.getElementById("memoryList");
  if (!element) return;

  if (!memoryDrops.length) {
    element.className = "";
    element.innerHTML = '<p class="empty-msg">Nenhuma memória definida.</p>';
    return;
  }

  element.className = "memory-drop-list";
  element.innerHTML = memoryDrops
    .map(
      (drop, index) => `
        <div class="memory-row">
          <div class="memory-main">
            <div class="memory-field">
              <span class="item-meta">Memória</span>
              <input class="memory-name" type="text" placeholder="Nome da memória..." value="${esc(drop.name)}" oninput="updateMemoryDrop(${index}, 'name', this.value)" />
            </div>

            <div class="memory-field">
              <span class="item-meta">Descrição e efeito</span>
              <textarea class="memory-desc auto-grow" rows="3" placeholder="Descrição do drop, raridade, condição ou efeito..." oninput="updateMemoryDrop(${index}, 'desc', this.value)">${esc(drop.desc)}</textarea>
            </div>
          </div>

          <div class="memory-side">
            <div class="memory-meta">
              <span class="item-meta">Chance de drop (%)</span>
              <input
                class="memory-chance"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value="${esc(drop.chance)}"
                oninput="updateMemoryDrop(${index}, 'chance', this.value)"
              />
              <button class="btn-inline memory-roll-btn" onclick="rollMemoryDrop(${index})">Testar drop</button>
              <div class="memory-roll-track">
                <div class="memory-roll-threshold" id="memoryThreshold${index}" style="left:${formatChancePercent(drop.chance)}%"></div>
                <div class="memory-roll-fill" id="memoryRollFill${index}"></div>
              </div>
          <div class="memory-roll-result" id="memoryRollResult${index}">Defina a chance e role para descobrir se a memória caiu.</div>
            </div>

            <div class="memory-award" id="memoryAward${index}" hidden></div>
          </div>

          <button class="btn-remove" onclick="removeMemoryDrop(${index})">x</button>
        </div>
      `
    )
    .join("");

  syncAutoGrowTextareas(element);
  memoryDrops.forEach((_drop, index) => applyMemoryRollState(index));
}

function updateMemoryDrop(index, field, value) {
  if (!memoryDrops[index]) return;
  memoryDrops[index][field] = field === "chance" ? sanitizeChance(value, "0") : value;

  if (field === "chance") {
    delete memoryRollStates[index];
    applyMemoryRollState(index);
  }
}

function addMemoryDrop() {
  memoryRollStates = {};
  memoryDrops.push({ name: "", desc: "", chance: "0" });
  renderMemoryDrops(memoryDrops);
  document.querySelectorAll(".memory-name")[memoryDrops.length - 1].focus();
  saveSheetSilently();
}

function removeMemoryDrop(index) {
  memoryRollStates = {};
  memoryDrops.splice(index, 1);
  renderMemoryDrops(memoryDrops);
  saveSheetSilently();
}

function collectMemoryDrops() {
  return Array.from(document.querySelectorAll(".memory-row")).map(row => ({
    name: row.querySelector(".memory-name").value || "",
    desc: row.querySelector(".memory-desc").value || "",
    chance: sanitizeChance(row.querySelector(".memory-chance").value || "0", "0")
  }));
}

function formatChancePercent(value) {
  const chance = Number.parseFloat(sanitizeChance(value, "0")) || 0;
  return Math.max(0, Math.min(100, chance));
}

async function rollMemoryDrop(index) {
  const drop = memoryDrops[index];
  const fill = document.getElementById(`memoryRollFill${index}`);
  const result = document.getElementById(`memoryRollResult${index}`);
  if (!drop || !fill || !result) return;

  fill.classList.remove("success", "fail");
  fill.style.transition = "none";
  fill.style.width = "0%";
  delete memoryRollStates[index];
  renderMemoryAwardControls(index);
  result.className = "memory-roll-result is-rolling";
  result.textContent = "Rolando o destino da memória...";

  let chance = formatChancePercent(drop.chance);
  let rolled = Number((Math.random() * 100).toFixed(1));
  let success = chance > 0 && rolled <= chance;

  if (isBackendMode()) {
    try {
      const remoteResult = await APP.rollMonsterMemory({
        monsterKey: currentSheetTarget.key,
        dropIndex: index
      });
      chance = Number(remoteResult.chance || chance);
      rolled = Number(remoteResult.rolled || rolled);
      success = Boolean(remoteResult.success);
    } catch (error) {
      result.className = "memory-roll-result is-fail";
    result.textContent = error.message || "Falha ao rolar o drop da memória.";
      return;
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = "width 1.2s cubic-bezier(0.2, 0.9, 0.1, 1)";
      fill.style.width = `${rolled}%`;
    });
  });

  window.setTimeout(() => {
    memoryRollStates[index] = {
      rolled,
      status: success ? "success" : "fail",
      success,
      awarded: false,
      target: getMemoryAwardTargets()[0].value || "",
      awardTone: "",
      awardText: "",
      resultText: success
        ? `Memória obtida. Rolagem ${rolled}% dentro da chance de ${chance}%.`
        : `Sem memória. Rolagem ${rolled}% acima da chance de ${chance}%.`
    };
    applyMemoryRollState(index);
  }, 1250);
}

async function awardMemoryDrop(index) {
  const drop = memoryDrops[index];
  const state = memoryRollStates[index];
  if (!drop || !state.success || state.awarded) return;
  const awardedMemoryName = String(drop.name || "").trim() || "Memória sem nome";

  const target = parseMemoryAwardTarget(state.target);
  if (!target || target.kind === "monster") {
    memoryRollStates[index] = {
      ...state,
      awardTone: "fail",
      awardText: "Escolha um jogador ou NPC válido para receber a memória."
    };
    renderMemoryAwardControls(index);
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.awardMonsterMemory({
        monsterKey: currentSheetTarget.key,
        targetKey: target.key,
        dropIndex: index
      });
    } catch (error) {
      memoryRollStates[index] = {
        ...state,
        awardTone: "fail",
      awardText: error.message || "Falha ao enviar a memória."
      };
      renderMemoryAwardControls(index);
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[target.key] || {}, target.kind);
    const memory = buildOwnedMemoryEntry(drop);

    targetSheet.ownedMemories = [...targetSheet.ownedMemories, memory];
    sheets[target.key] = targetSheet;
    writeSheets(sheets);
  }

  memoryRollStates[index] = {
    ...state,
    awarded: true,
    awardTone: "success",
    awardText: `${awardedMemoryName} enviada para ${target.label}.`
  };

  renderMemoryAwardControls(index);
}
