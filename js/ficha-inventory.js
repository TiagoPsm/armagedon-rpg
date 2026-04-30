function getItemEditorElements() {
  return {
    root: document.getElementById("itemEditorRoot"),
    dialog: document.querySelector(".item-editor-dialog"),
    name: document.getElementById("itemEditorName"),
    qty: document.getElementById("itemEditorQty"),
    type: document.getElementById("itemEditorType"),
    typeBtn: document.getElementById("itemEditorTypeBtn"),
    typeLabel: document.getElementById("itemEditorTypeLabel"),
    damageWrap: document.getElementById("itemEditorDamageWrap"),
    damage: document.getElementById("itemEditorDamage"),
    damageLabel: document.getElementById("itemEditorDamageLabel"),
    rollBox: document.getElementById("itemEditorRollBox"),
    transfer: document.getElementById("itemEditorTransfer"),
    desc: document.getElementById("itemEditorDesc"),
    save: document.getElementById("itemEditorSaveBtn")
  };
}

function resetItemEditorState() {
  const { root, name, qty, type, damage, transfer, desc } = getItemEditorElements();

  itemEditorIndex = -1;
  itemEditorSnapshot = null;
  itemEditorIsNew = false;

  if (root) root.hidden = true;
  if (name) name.value = "";
  if (qty) qty.value = "1";
  if (type) type.value = "outro";
  if (damage) damage.value = "";
  if (transfer) {
    transfer.hidden = true;
    transfer.innerHTML = "";
  }
  if (desc) desc.value = "";
  updateItemEditorTypeUI("outro");
  updateItemEditorDamageUI("outro", "");
}

function updateItemEditorTypeUI(type = "outro") {
  const { typeLabel } = getItemEditorElements();
  if (typeLabel) {
    typeLabel.textContent = formatItemType(type);
  }
}

function updateItemEditorDamageUI(type = "outro", damage = "") {
  const { damageWrap, rollBox, damageLabel } = getItemEditorElements();
  const isWeapon = normalizeItemType(type) === "arma";
  const cleanDamage = normalizeDamageExpression(damage);

  if (damageWrap) damageWrap.hidden = !isWeapon;
  if (rollBox) rollBox.hidden = !isWeapon;
  if (damageLabel) {
    damageLabel.textContent = cleanDamage ? `Dano: ${cleanDamage}` : "Dano: definir";
  }
}

function syncItemFromEditor() {
  if (itemEditorIndex < 0 || !inv[itemEditorIndex]) return;

  const { name, qty, type, damage, desc } = getItemEditorElements();
  const nextItem = normalizeItem({
    name: name.value || "",
    qty: qty.value || "1",
    type: type.value || "outro",
    damage: damage.value || "",
    desc: desc.value || ""
  });

  inv[itemEditorIndex] = nextItem;
  updateItemEditorTypeUI(nextItem.type);
  updateItemEditorDamageUI(nextItem.type, nextItem.damage);
}

async function openItemTypePicker() {
  if (itemEditorIndex < 0) return;

  const { type, typeBtn, damage } = getItemEditorElements();
  if (!type) return;

  const currentType = normalizeItemType(type.value);
  const selectedType = await UI.pickOption({
    title: "Escolher categoria",
    kicker: "// Item",
    message: "Defina o tipo do item para habilitar os campos específicos.",
    cancelLabel: "Fechar",
    options: [
      { value: "outro", label: "Outro", meta: "Item geral", selected: currentType === "outro" },
      { value: "arma", label: "Arma", meta: "Permite rolagem de dano", selected: currentType === "arma" },
      { value: "acessorio", label: "Acessório", meta: "Equipável ou passivo", selected: currentType === "acessorio" }
    ]
  });

  if (!selectedType) {
    typeBtn.focus();
    return;
  }

  type.value = normalizeItemType(selectedType);
  if (type.value !== "arma" && damage) {
    damage.value = "";
  }

  syncItemFromEditor();
  typeBtn.focus();
}

function initItemEditor() {
  const root = document.getElementById("itemEditorRoot");
  if (!root) return;
  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  const closeEditor = shouldSave => {
    if (shouldSave) {
      commitItemEditor();
      return;
    }
    cancelItemEditor();
  };

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.itemEditorClose) {
      closeEditor(false);
    }
  });

  document.getElementById("itemEditorCloseBtn").addEventListener("click", () => closeEditor(false));
  document.getElementById("itemEditorCancelBtn").addEventListener("click", () => closeEditor(false));
  document.getElementById("itemEditorSaveBtn").addEventListener("click", () => closeEditor(true));
  document.getElementById("itemEditorRollBtn").addEventListener("click", () => rollCurrentEditorDamage());
  document.getElementById("itemEditorTypeBtn").addEventListener("click", () => {
    openItemTypePicker();
  });

  ["itemEditorName", "itemEditorQty", "itemEditorDamage", "itemEditorDesc"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      syncItemFromEditor();
      if (id === "itemEditorDesc") {
        const textarea = document.getElementById(id);
        if (textarea instanceof HTMLTextAreaElement) autoGrowTextarea(textarea);
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (itemEditorIndex < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor(false);
    }
  });
}

function openItemEditor(index, { isNew = false } = {}) {
  const item = inv[index];
  const { root, dialog, name, qty, type, damage, desc } = getItemEditorElements();
  if (!item || !root || !dialog || !name || !qty || !type || !damage || !desc) return;

  itemEditorIndex = index;
  itemEditorIsNew = isNew;
  itemEditorSnapshot = normalizeItem(item);

  name.value = item.name;
  qty.value = item.qty;
  type.value = item.type;
  damage.value = item.damage;
  desc.value = item.desc;
  autoGrowTextarea(desc);
  updateItemEditorTypeUI(item.type);
  updateItemEditorDamageUI(item.type, item.damage);
  renderItemEditorTransfer(index);

  root.hidden = false;
  window.requestAnimationFrame(() => {
    dialog.focus();
    name.focus();
  });
}

function commitItemEditor() {
  if (itemEditorIndex < 0 || !inv[itemEditorIndex]) {
    resetItemEditorState();
    return;
  }

  syncItemFromEditor();
  const currentItem = normalizeItem(inv[itemEditorIndex]);

  if (itemEditorIsNew && !itemHasContent(currentItem)) {
    inv.splice(itemEditorIndex, 1);
  } else {
    inv[itemEditorIndex] = currentItem;
  }

  renderInv(inv);
  resetItemEditorState();
  saveSheetSilently();
}

function cancelItemEditor() {
  if (itemEditorIndex >= 0) {
    if (itemEditorIsNew) {
      inv.splice(itemEditorIndex, 1);
    } else if (itemEditorSnapshot) {
      inv[itemEditorIndex] = normalizeItem(itemEditorSnapshot);
    }
    renderInv(inv);
  }

  resetItemEditorState();
}

function rollCurrentEditorDamage() {
  if (itemEditorIndex < 0) return;
  syncItemFromEditor();
  rollItemDamage(itemEditorIndex, { preserveModal: true });
}

async function rollItemDamage(index, options = {}) {
  const item = normalizeItem(inv[index]);
  if (!item || item.type !== "arma") return;

  const result = rollDamageExpression(item.damage);
  if (!result) {
    itemRollStates[index] = {
      tone: "fail",
      text: "Defina um dano válido, como 1d10 ou 2d6+3."
    };
    renderInv(inv);
    await UI.alert("Defina um dano válido para a arma, por exemplo 1d10 ou 2d6+3.", {
      title: "Dano inválido",
      kicker: "// Inventário"
    });
    if (options.preserveModal) openItemEditor(index, { isNew: itemEditorIsNew });
    return;
  }

  const modifierText = result.modifier
    ? ` ${result.modifier > 0 ? "+" : "-"} ${Math.abs(result.modifier)}`
    : "";
  itemRollStates[index] = {
    tone: "success",
    text: `Ultimo dano: ${result.total} (${result.expression})`
  };
  renderInv(inv);

  await UI.alert(
    `Resultado: ${result.total}. Rolagens: ${formatRollPreview(result)}${modifierText}${result.hiddenRollCount ? ` | ${result.diceCount} dados` : ""}.`,
    {
      title: item.name || "Rolagem de arma",
      kicker: "// Dano"
    }
  );

  if (options.preserveModal) {
    openItemEditor(index, { isNew: itemEditorIsNew });
  }
}

function getPlayerInventoryState(username) {
  if (isBackendMode()) {
    const player = AUTH.getDirectoryCache().players.find(candidate => candidate.username === username);
    const used = Number(player.usedSlots || 0);
    const capacity = Number(player.inventorySlots || DEFAULT_INVENTORY_SLOTS);
    return {
      used,
      capacity,
      available: Math.max(0, capacity - used)
    };
  }

  const sheets = readSheets();
  const playerSheet = normalizeSheetData(sheets[username] || {}, "player");
  const capacity = Math.max(
    normalizeInventorySlots("player", playerSheet.inventorySlots),
    playerSheet.inv.length
  );

  return {
    used: playerSheet.inv.length,
    capacity,
    available: Math.max(0, capacity - playerSheet.inv.length)
  };
}

function getItemTransferTargets() {
  if (currentSheetTarget.kind !== "player") return [];

  return AUTH.getPlayers()
    .filter(player => player.username !== currentSheetTarget.owner)
    .map(player => {
      const inventoryState = getPlayerInventoryState(player.username);
      return {
        value: player.username,
        label: player.charname || player.username,
        meta: `${inventoryState.used}/${inventoryState.capacity} slots`,
        isFull: inventoryState.available <= 0
      };
    });
}

function formatItemTransferLabel(value, targets, fallback) {
  const target = targets.find(candidate => candidate.value === value);
  return target ? `${target.label} (${target.meta})` : fallback;
}

function renderItemTransferBlock(index, targets) {
  const availableTargets = targets.filter(target => !target.isFull);

  if (!availableTargets.length) {
    return `
      <div class="item-transfer">
        <span class="item-meta">Troca de item</span>
        <div class="memory-award-status">Nenhum jogador disponível com slot livre para receber este item.</div>
      </div>
    `;
  }

  const state = itemTransferStates[index] || {};
  const selectedTarget = availableTargets.some(target => target.value === state.target)
    ? state.target
    : availableTargets[0].value;
  const statusClass =
    state.tone === "success"
      ? "memory-award-status is-success"
      : state.tone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  itemTransferStates[index] = {
    ...state,
    target: selectedTarget
  };

  return `
    <div class="item-transfer">
      <span class="item-meta">Enviar para outro jogador</span>
      <div class="item-transfer-row">
        <button class="btn-inline memory-picker-btn item-transfer-picker" onclick="pickItemTransferTarget(${index})">
          <span class="memory-picker-label">${esc(formatItemTransferLabel(selectedTarget, availableTargets, "Escolher jogador"))}</span>
          <span class="memory-picker-hint">Alterar</span>
        </button>
        <button class="btn-inline item-transfer-send" onclick="transferItem(${index})">Enviar</button>
      </div>
      <div class="${statusClass}">${esc(state.text || "O item só pode ser enviado para jogadores com slot livre no Inventário.")}</div>
    </div>
  `;
}

function renderItemEditorTransfer(index) {
  const { transfer } = getItemEditorElements();
  if (!transfer) return;

  if (currentSheetTarget.kind !== "player" || !inv[index]) {
    transfer.hidden = true;
    transfer.innerHTML = "";
    return;
  }

  transfer.hidden = false;
  transfer.innerHTML = renderItemTransferBlock(index, getItemTransferTargets());
}

async function pickItemTransferTarget(index) {
  const targets = getItemTransferTargets().filter(target => !target.isFull);
  if (!targets.length) return;

  const state = itemTransferStates[index] || {};
  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Transferir item",
    kicker: "// Inventário",
    message: "Escolha qual jogador vai receber este item.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: `Jogador | ${target.meta}`,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  itemTransferStates[index] = {
    ...state,
    target: selected,
    tone: "",
    text: "Destino definido. Clique em Enviar para concluir a transferência."
  };

  if (itemEditorIndex === index) {
    renderItemEditorTransfer(index);
    return;
  }

  renderInv(inv);
}

async function transferItem(index) {
  if (currentSheetTarget.kind !== "player") return;

  const item = inv[index];
  if (!item) return;

  const availableTargets = getItemTransferTargets().filter(target => !target.isFull);
  const state = itemTransferStates[index] || {};
  const targetUsername = state.target || availableTargets[0].value;
  const target = availableTargets.find(candidate => candidate.value === targetUsername);

  if (!target) {
    itemTransferStates[index] = {
      ...state,
      tone: "fail",
      text: "Nenhum jogador com slot livre está disponível para receber este item."
    };
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  const targetInventoryState = getPlayerInventoryState(targetUsername);
  if (targetInventoryState.available <= 0) {
    itemTransferStates[index] = {
      ...state,
      tone: "fail",
      text: `${target.label} está com a mochila cheia.`
    };
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  const confirmed = await UI.confirm(
    `Transferir "${item.name || "Item sem nome"}" para ${target.label}`,
    {
      title: "Transferir item",
      kicker: "// Inventário",
      confirmLabel: "Transferir",
      cancelLabel: "Cancelar"
    }
  );

  if (!confirmed) return;

  if (isBackendMode()) {
    try {
      await APP.transferItem({
        sourceKey: currentSheetTarget.key,
        targetKey: targetUsername,
        itemIndex: index
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      itemTransferStates[index] = {
        ...state,
        tone: "fail",
        text: error.message || "Falha ao transferir o item."
      };
      if (itemEditorIndex === index) {
        renderItemEditorTransfer(index);
      } else {
        renderInv(inv);
      }
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[targetUsername] || {}, "player");
    const targetCapacity = Math.max(
      normalizeInventorySlots("player", targetSheet.inventorySlots),
      targetSheet.inv.length
    );

    if (targetSheet.inv.length >= targetCapacity) {
      itemTransferStates[index] = {
        ...state,
        tone: "fail",
        text: `${target.label} ficou sem slot livre para receber este item.`
      };
      if (itemEditorIndex === index) {
        renderItemEditorTransfer(index);
      } else {
        renderInv(inv);
      }
      return;
    }

    targetSheet.inv = [...targetSheet.inv, normalizeItem(item)];
    sheets[targetUsername] = targetSheet;
    writeSheets(sheets);
  }

  itemTransferStates = {};
  inv.splice(index, 1);
  renderInv(inv);
  resetItemEditorState();
  saveSheetSilently();
}

function renderInv(list) {
  inv = list.map(normalizeItem);
  const grid = document.getElementById("inventoryGrid");
  const inventoryMeta = document.getElementById("inventoryMeta");
  const inventoryAddBtn = document.getElementById("inventoryAddBtn");
  const inventoryMasterControls = document.getElementById("inventoryMasterControls");
  const inventorySlotDelta = document.getElementById("inventorySlotDelta");
  if (!grid) return;

  const capacity = Math.max(
    normalizeInventorySlots(currentSheetTarget.kind || "player", inventorySlots),
    inv.length
  );
  const used = Math.min(inv.length, capacity);
  const canExpand = currentRole === "master" && currentSheetTarget.kind === "player";

  inventorySlots = capacity;

  if (inventoryMeta) inventoryMeta.textContent = `${used} / ${capacity} slots`;
  if (inventoryMasterControls) inventoryMasterControls.hidden = !canExpand;
  if (inventorySlotDelta && (!inventorySlotDelta.value || Number.parseInt(inventorySlotDelta.value, 10) < 1)) {
    inventorySlotDelta.value = "1";
  }
  if (inventoryAddBtn) {
    inventoryAddBtn.disabled = used >= capacity;
    inventoryAddBtn.textContent = used >= capacity ? "Lotado" : "+ Item";
  }

  grid.innerHTML = Array.from({ length: capacity }, (_slot, index) => {
    const item = inv[index];

    if (!item) {
      return `
        <article class="item-card item-card-empty">
          <button class="item-slot-btn" onclick="addItem()" ${used >= capacity ? "disabled" : ""}>
            <span class="item-slot-index">Slot ${index + 1}</span>
            <strong class="item-slot-plus">+</strong>
            <span class="item-slot-copy">${used >= capacity ? "Inventário cheio" : "Slot vazio"}</span>
          </button>
        </article>
      `;
    }

    const itemType = normalizeItemType(item.type);
    const primaryMeta = itemType === "arma" && item.damage
      ? item.damage
      : `Qtd. ${item.qty}`;
    const secondaryMeta = itemType === "arma"
      ? `Qtd. ${item.qty}`
      : formatItemType(itemType);

    return `
      <article class="item-card item-card-compact" data-index="${index}">
        <button
          class="item-remove-compact"
          type="button"
          onclick="removeItem(${index})"
          aria-label="Remover item"
          title="Remover item"
        >x</button>

        <button class="item-summary-btn item-summary-btn-compact" type="button" onclick="openItemEditor(${index})">
          <span class="item-slot-index">Slot ${index + 1}</span>
          <span class="${getItemTypeBadgeClass(itemType)}">${esc(formatItemType(itemType))}</span>
          <h3 class="item-title item-title-compact">${esc(item.name || "Item")}</h3>
          <span class="item-summary-line ${itemType === "arma" && item.damage ? "is-weapon" : ""}">${esc(primaryMeta)}</span>
          <span class="item-summary-line is-muted">${esc(secondaryMeta)}</span>
        </button>
      </article>
    `;
  }).join("");

  syncAutoGrowTextareas(grid);
}

function updateItem(index, field, value) {
  if (!inv[index]) return;
  inv[index] = normalizeItem({
    ...inv[index],
    [field]: value
  });
}

async function addItem() {
  const capacity = Math.max(
    normalizeInventorySlots(currentSheetTarget.kind || "player", inventorySlots),
    inv.length
  );
  if (inv.length >= capacity) {
    await UI.alert("Todos os slots atuais do inventário já estão ocupados.", {
      title: "Inventário cheio",
      kicker: "// Slots",
      confirmLabel: "Fechar"
    });
    return;
  }

  inv.push(normalizeItem({ name: "", qty: 1, type: "outro", damage: "", desc: "" }));
  renderInv(inv);
  openItemEditor(inv.length - 1, { isNew: true });
}

function removeItem(index) {
  if (itemEditorIndex === index) {
    resetItemEditorState();
  }
  itemTransferStates = {};
  delete itemRollStates[index];
  inv.splice(index, 1);
  itemRollStates = Object.fromEntries(
    Object.entries(itemRollStates)
      .map(([key, value]) => {
        const numericKey = Number.parseInt(key, 10);
        if (numericKey > index) return [String(numericKey - 1), value];
        return [key, value];
      })
  );
  renderInv(inv);
  saveSheetSilently();
}

function collectInv() {
  return inv.map(normalizeItem);
}

function getInventorySlotDelta() {
  const input = document.getElementById("inventorySlotDelta");
  const numeric = Number.parseInt(input.value || "1", 10);
  const safeValue = Number.isNaN(numeric) ? 1 : Math.max(1, Math.min(100, numeric));

  if (input) input.value = String(safeValue);
  return safeValue;
}

async function changeInventorySlots(direction) {
  if (!(currentRole === "master" && currentSheetTarget.kind === "player")) return;

  const delta = getInventorySlotDelta();
  const currentCapacity = Math.max(
    normalizeInventorySlots(currentSheetTarget.kind || "player", inventorySlots),
    inv.length
  );
  const minimumCapacity = Math.max(DEFAULT_INVENTORY_SLOTS, inv.length);
  const targetCapacity = currentCapacity + delta * direction;

  if (direction < 0 && targetCapacity < minimumCapacity) {
    await UI.alert(
      `Não é possível reduzir abaixo de ${minimumCapacity} slots porque a ficha usa ${inv.length} item(ns) e o mínimo padrão é ${DEFAULT_INVENTORY_SLOTS}.`,
      {
        title: "Redução bloqueada",
        kicker: "// Inventário",
        confirmLabel: "Entendi"
      }
    );
    return;
  }

  inventorySlots = normalizeInventorySlots("player", targetCapacity);
  renderInv(inv);
  saveSheetSilently();
}
