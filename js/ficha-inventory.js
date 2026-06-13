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
    armorWrap: document.getElementById("itemEditorArmorWrap"),
    armorEquipped: document.getElementById("itemEditorArmorEquipped"),
    armorMitigation: document.getElementById("itemEditorArmorMitigation"),
    armorResistances: document.getElementById("itemEditorArmorResistances"),
    armorNotes: document.getElementById("itemEditorArmorNotes"),
    rollBox: document.getElementById("itemEditorRollBox"),
    transfer: document.getElementById("itemEditorTransfer"),
    desc: document.getElementById("itemEditorDesc"),
    save: document.getElementById("itemEditorSaveBtn")
  };
}

function resetItemEditorState() {
  const { root, name, qty, type, damage, transfer, desc, armorEquipped, armorMitigation, armorResistances, armorNotes } = getItemEditorElements();

  itemEditorIndex = -1;
  itemEditorSnapshot = null;
  itemEditorIsNew = false;

  if (root) root.hidden = true;
  if (window.UI?.deactivateModal) window.UI.deactivateModal(root);
  if (name) name.value = "";
  if (qty) qty.value = "1";
  if (type) type.value = "outro";
  if (damage) damage.value = "";
  if (armorEquipped) armorEquipped.checked = false;
  if (armorMitigation) armorMitigation.value = "";
  if (armorResistances) armorResistances.value = "";
  if (armorNotes) armorNotes.value = "";
  if (transfer) {
    transfer.hidden = true;
    transfer.innerHTML = "";
  }
  if (desc) desc.value = "";
  updateItemEditorTypeUI("outro");
  updateItemEditorDamageUI("outro", "");
  updateItemEditorArmorUI("outro");
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

function updateItemEditorArmorUI(type = "outro") {
  const { armorWrap } = getItemEditorElements();
  if (armorWrap) armorWrap.hidden = normalizeItemType(type) !== "armadura";
}

function syncItemFromEditor() {
  if (itemEditorIndex < 0 || !inv[itemEditorIndex]) return;

  const { name, qty, type, damage, desc, armorEquipped, armorMitigation, armorResistances, armorNotes } = getItemEditorElements();
  const nextItem = normalizeItem({
    name: name.value || "",
    qty: qty.value || "1",
    type: type.value || "outro",
    damage: damage.value || "",
    desc: desc.value || "",
    armor: {
      equipped: Boolean(armorEquipped?.checked),
      mitigation: armorMitigation?.value || "0",
      resistances: armorResistances?.value || "",
      notes: armorNotes?.value || ""
    }
  });

  inv[itemEditorIndex] = nextItem;
  updateItemEditorTypeUI(nextItem.type);
  updateItemEditorDamageUI(nextItem.type, nextItem.damage);
  updateItemEditorArmorUI(nextItem.type);
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
      { value: "armadura", label: "Armadura", meta: "Conta em mitigacao quando equipada", selected: currentType === "armadura" },
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
  updateItemEditorArmorUI(type.value);
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
    if (target.closest("[data-item-editor-close]")) {
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

  ["itemEditorName", "itemEditorQty", "itemEditorDamage", "itemEditorDesc", "itemEditorArmorMitigation", "itemEditorArmorResistances", "itemEditorArmorNotes"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      syncItemFromEditor();
      if (itemEditorIndex >= 0) {
        renderItemEditorTransfer(itemEditorIndex);
      }
      if (id === "itemEditorDesc") {
        const textarea = document.getElementById(id);
        if (textarea instanceof HTMLTextAreaElement) autoGrowTextarea(textarea);
      }
    });
  });

  document.getElementById("itemEditorArmorEquipped").addEventListener("change", () => {
    syncItemFromEditor();
    if (itemEditorIndex >= 0) {
      renderItemEditorTransfer(itemEditorIndex);
    }
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
  const { root, dialog, name, qty, type, damage, desc, armorEquipped, armorMitigation, armorResistances, armorNotes } = getItemEditorElements();
  if (!item || !root || !dialog || !name || !qty || !type || !damage || !desc) return;
  const normalizedItem = normalizeItem(item);

  itemEditorIndex = index;
  itemEditorIsNew = isNew;
  itemEditorSnapshot = normalizedItem;

  name.value = normalizedItem.name;
  qty.value = normalizedItem.qty;
  type.value = normalizedItem.type;
  damage.value = normalizedItem.damage;
  desc.value = normalizedItem.desc;
  if (armorEquipped) armorEquipped.checked = Boolean(normalizedItem.armor?.equipped);
  if (armorMitigation) armorMitigation.value = normalizedItem.armor?.mitigation || "0";
  if (armorResistances) armorResistances.value = normalizedItem.armor?.resistances || "";
  if (armorNotes) armorNotes.value = normalizedItem.armor?.notes || "";
  autoGrowTextarea(desc);
  updateItemEditorTypeUI(normalizedItem.type);
  updateItemEditorDamageUI(normalizedItem.type, normalizedItem.damage);
  updateItemEditorArmorUI(normalizedItem.type);
  renderItemEditorTransfer(index);

  root.hidden = false;
  if (window.UI?.activateModal) {
    window.UI.activateModal(root, dialog, {
      initialFocus: name,
      onDismiss: () => closeEditor(false)
    });
  } else {
    window.requestAnimationFrame(() => {
      dialog.focus();
      name.focus();
    });
  }
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

function getPlayerInventoryState(identifier) {
  if (isBackendMode()) {
    const lookup = normalizeSheetKey(identifier);
    const directory = AUTH.getDirectoryCache();
    const players = Array.isArray(directory?.players) ? directory.players : [];
    const player = players.find(candidate => (
      normalizeSheetKey(candidate?.username) === lookup
      || normalizeSheetKey(candidate?.key) === lookup
    )) || {};
    const used = Number(player.usedSlots || 0);
    const capacity = Number(player.inventorySlots || DEFAULT_INVENTORY_SLOTS);
    return {
      used,
      capacity,
      available: Math.max(0, capacity - used)
    };
  }

  const username = String(identifier || "").trim();
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

function getCharacterInventoryState(identifier, kind = "player") {
  if (kind === "player") return getPlayerInventoryState(identifier);

  const key = normalizeSheetKey(identifier);
  if (isBackendMode()) {
    const directory = AUTH.getDirectoryCache();
    const npcs = Array.isArray(directory?.npcs) ? directory.npcs : [];
    const npc = npcs.find(candidate => normalizeSheetKey(candidate?.key || getNpcSheetKey(candidate?.id)) === key) || {};
    const used = Number(npc.usedSlots || 0);
    const capacity = Number(npc.inventorySlots || DEFAULT_INVENTORY_SLOTS);
    return {
      used,
      capacity,
      available: Math.max(0, capacity - used)
    };
  }

  const sheets = readSheets();
  const targetSheet = normalizeSheetData(sheets[key] || {}, "npc");
  const capacity = Math.max(
    normalizeInventorySlots("npc", targetSheet.inventorySlots),
    targetSheet.inv.length
  );

  return {
    used: targetSheet.inv.length,
    capacity,
    available: Math.max(0, capacity - targetSheet.inv.length)
  };
}

function getItemQuantity(item) {
  return Math.max(0, Number.parseInt(item?.qty || "0", 10) || 0);
}

function getItemMergeKey(item) {
  const normalized = normalizeItem(item || {});
  const armor = normalized.armor || {};
  return [
    normalized.type,
    normalized.name.trim().toLowerCase(),
    normalized.damage.trim().toLowerCase(),
    normalized.desc.trim().toLowerCase(),
    armor.equipped ? "equipped" : "stored",
    String(armor.mitigation || "0").trim(),
    String(armor.resistances || "").trim().toLowerCase(),
    String(armor.notes || "").trim().toLowerCase()
  ].join("|");
}

function findMergeableInventoryItem(inventory, item) {
  const itemKey = getItemMergeKey(item);
  return inventory.find(candidate => getItemMergeKey(candidate) === itemKey) || null;
}

function getTargetSheetForTransfer(target) {
  const sheets = readSheets();
  const data = sheets[target.value] || {};
  return normalizeSheetData(data, target.kind);
}

function getTargetMergeState(target, item) {
  if (!target || !item) return { canMerge: false, known: !isBackendMode() };
  const sheets = readSheets();
  const hasKnownSheet = Boolean(sheets[target.value]);
  if (isBackendMode() && !hasKnownSheet) {
    return { canMerge: false, known: false };
  }
  const targetSheet = getTargetSheetForTransfer(target);
  const match = findMergeableInventoryItem(targetSheet.inv, item);
  return {
    canMerge: Boolean(match),
    known: true,
    quantity: match ? getItemQuantity(match) : 0
  };
}

function canTargetReceiveItem(target, item) {
  const mergeState = getTargetMergeState(target, item);
  if (mergeState.canMerge) return true;
  if (target.available > 0) return true;
  return isBackendMode() && !mergeState.known;
}

function getItemTransferTargets() {
  if (!["player", "npc"].includes(currentSheetTarget.kind)) return [];

  const sourceKey = normalizeSheetKey(currentSheetTarget.key);
  const owner = normalizeSheetKey(currentSheetTarget.owner);
  const players = AUTH.getPlayers()
    .filter(player => normalizeSheetKey(player.username) !== owner)
    .map(player => {
      const username = String(player.username || "").trim();
      const value = isBackendMode() ? String(player.key || username).trim() : username;
      const inventoryState = getCharacterInventoryState(value || username, "player");
      return {
        value: value || username,
        kind: "player",
        username,
        label: player.charname || username,
        meta: `${inventoryState.used}/${inventoryState.capacity} slots`,
        available: inventoryState.available,
        isFull: inventoryState.available <= 0
      };
    });

  const npcs = readNpcs()
    .map(npc => {
      const value = npc.key || getNpcSheetKey(npc.id);
      const inventoryState = getCharacterInventoryState(value, "npc");
      return {
        value,
        kind: "npc",
        username: "",
        label: npc.name,
        meta: `${inventoryState.used}/${inventoryState.capacity} slots`,
        available: inventoryState.available,
        isFull: inventoryState.available <= 0
      };
    });

  return [...players, ...npcs].filter(target => normalizeSheetKey(target.value) !== sourceKey);
}

function formatItemTransferLabel(value, targets, fallback) {
  const target = targets.find(candidate => candidate.value === value);
  return target ? `${target.label} (${target.meta})` : fallback;
}

function normalizeItemTransferQuantity(value, maxQuantity) {
  const max = Math.max(0, Number.parseInt(maxQuantity, 10) || 0);
  if (!max) return "0";
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(max);
  return String(Math.max(1, Math.min(max, numeric)));
}

function updateItemTransferQuantity(index, value) {
  const item = normalizeItem(inv[index] || {});
  const maxQuantity = getItemQuantity(item);
  const state = itemTransferStates[index] || {};
  itemTransferStates[index] = {
    ...state,
    quantity: normalizeItemTransferQuantity(value, maxQuantity),
    tone: "",
    text: ""
  };
}

function renderItemTransferBlock(index, targets) {
  const item = normalizeItem(inv[index] || {});
  const maxQuantity = getItemQuantity(item);
  const availableTargets = targets.filter(target => canTargetReceiveItem(target, item));

  if (!maxQuantity || !availableTargets.length) {
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
    target: selectedTarget,
    quantity: normalizeItemTransferQuantity(state.quantity, maxQuantity)
  };
  const selectedTargetData = availableTargets.find(target => target.value === selectedTarget);
  const mergeState = getTargetMergeState(selectedTargetData, item);
  const transferHint = mergeState.canMerge
    ? `Vai juntar com item igual no destino (atual: ${mergeState.quantity}).`
    : selectedTargetData?.isFull && !mergeState.known
      ? "Destino sem slot livre conhecido; o servidor tentara juntar se ja houver item igual."
      : "O item ocupa um novo slot no destino.";
  if (!state.text) state.text = transferHint;

  return `
    <div class="item-transfer">
      <span class="item-meta">Enviar para jogador ou NPC</span>
      <div class="item-transfer-row">
        <button class="btn-inline memory-picker-btn item-transfer-picker" onclick="pickItemTransferTarget(${index})">
          <span class="memory-picker-label">${esc(formatItemTransferLabel(selectedTarget, availableTargets, "Escolher jogador"))}</span>
          <span class="memory-picker-hint">Alterar</span>
        </button>
        <label class="item-transfer-qty">
          <span>Qtd.</span>
          <input
            type="number"
            min="1"
            max="${maxQuantity}"
            step="1"
            value="${esc(itemTransferStates[index].quantity)}"
            oninput="updateItemTransferQuantity(${index}, this.value)"
          />
        </label>
        <button class="btn-inline item-transfer-send" onclick="transferItem(${index})">Enviar</button>
      </div>
      <div class="${statusClass}">${esc(state.text || "O item só pode ser enviado para jogadores com slot livre no Inventário.")}</div>
    </div>
  `;
}

function renderItemEditorTransfer(index) {
  const { transfer } = getItemEditorElements();
  if (!transfer) return;

  if (!["player", "npc"].includes(currentSheetTarget.kind) || !inv[index]) {
    transfer.hidden = true;
    transfer.innerHTML = "";
    return;
  }

  transfer.hidden = false;
  transfer.innerHTML = renderItemTransferBlock(index, getItemTransferTargets());
}

async function pickItemTransferTarget(index) {
  const item = normalizeItem(inv[index] || {});
  const targets = getItemTransferTargets().filter(target => canTargetReceiveItem(target, item));
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
      meta: `${target.kind === "npc" ? "NPC" : "Jogador"} | ${target.meta}`,
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
  if (!["player", "npc"].includes(currentSheetTarget.kind)) return;

  const item = normalizeItem(inv[index]);
  if (!item) return;

  const nextMaxQuantity = getItemQuantity(item);
  const nextAvailableTargets = getItemTransferTargets().filter(candidate => canTargetReceiveItem(candidate, item));
  const nextState = itemTransferStates[index] || {};
  const nextTargetValue = nextState.target || nextAvailableTargets[0]?.value || "";
  const nextTarget = nextAvailableTargets.find(candidate => candidate.value === nextTargetValue);
  const nextQuantity = Number.parseInt(normalizeItemTransferQuantity(nextState.quantity, nextMaxQuantity), 10);

  if (!nextTarget || !nextQuantity) {
    itemTransferStates[index] = {
      ...nextState,
      tone: "fail",
      text: nextTarget
        ? "Defina uma quantidade maior que zero para enviar."
        : "Nenhum jogador ou NPC disponivel para receber este item."
    };
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  const nextMergeState = getTargetMergeState(nextTarget, item);
  const nextConfirmed = await UI.confirm(
    `Transferir ${nextQuantity}x "${item.name || "Item sem nome"}" para ${nextTarget.label}${nextMergeState.canMerge ? " juntando com item igual" : ""}`,
    {
      title: "Transferir item",
      kicker: "// Inventario",
      confirmLabel: "Transferir",
      cancelLabel: "Cancelar"
    }
  );

  if (!nextConfirmed) return;

  if (isBackendMode() && currentRole !== "master" && nextTarget.kind === "player") {
    try {
      await APP.createTransferProposal({
        transferType: "item",
        sourceKey: currentSheetTarget.key,
        targetKey: nextTarget.value,
        itemIndex: index,
        quantity: nextQuantity
      });
      itemTransferStates[index] = {
        ...nextState,
        tone: "ok",
        text: `Proposta enviada para ${nextTarget.label}. O item sai da mochila quando o destino aceitar.`
      };
      refreshTransferProposals();
    } catch (error) {
      itemTransferStates[index] = {
        ...nextState,
        tone: "fail",
        text: error.message || "Falha ao enviar a proposta de transferência."
      };
    }
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.transferItem({
        sourceKey: currentSheetTarget.key,
        targetKey: nextTarget.value,
        itemIndex: index,
        quantity: nextQuantity
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      itemTransferStates[index] = {
        ...nextState,
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
    const nextTargetKey = nextTarget.value;
    const nextSheets = readSheets();
    const nextTargetSheet = normalizeSheetData(nextSheets[nextTargetKey] || {}, nextTarget.kind);
    const nextTargetCapacity = Math.max(
      normalizeInventorySlots(nextTarget.kind, nextTargetSheet.inventorySlots),
      nextTargetSheet.inv.length
    );
    const nextMergeIndex = nextTargetSheet.inv.findIndex(candidate => getItemMergeKey(candidate) === getItemMergeKey(item));

    if (nextMergeIndex < 0 && nextTargetSheet.inv.length >= nextTargetCapacity) {
      itemTransferStates[index] = {
        ...nextState,
        tone: "fail",
        text: `${nextTarget.label} ficou sem slot livre para receber este item.`
      };
      if (itemEditorIndex === index) {
        renderItemEditorTransfer(index);
      } else {
        renderInv(inv);
      }
      return;
    }

    const nextTransferredItem = normalizeItem({
      ...item,
      qty: String(nextQuantity),
      armor: item.type === "armadura"
        ? { ...(item.armor || {}), equipped: false }
        : item.armor
    });
    if (nextMergeIndex >= 0) {
      const existingTargetItem = normalizeItem(nextTargetSheet.inv[nextMergeIndex]);
      nextTargetSheet.inv[nextMergeIndex] = normalizeItem({
        ...existingTargetItem,
        qty: String(getItemQuantity(existingTargetItem) + nextQuantity)
      });
    } else {
      nextTargetSheet.inv = [...nextTargetSheet.inv, nextTransferredItem];
    }
    nextSheets[nextTargetKey] = nextTargetSheet;
    writeSheets(nextSheets);
  }

  itemTransferStates = {};
  if (nextQuantity >= nextMaxQuantity) {
    inv.splice(index, 1);
  } else {
    inv[index] = normalizeItem({ ...item, qty: String(nextMaxQuantity - nextQuantity) });
  }
  renderInv(inv);
  resetItemEditorState();
  if (isBackendMode()) {
    remoteSheetsCache[currentSheetTarget.key] = {
      ...(remoteSheetsCache[currentSheetTarget.key] || {}),
      inv: collectInv()
    };
    persistRemoteSheetsCache();
  } else {
    const sourceSheets = readSheets();
    sourceSheets[currentSheetTarget.key] = collectSheetData(currentSheetTarget.kind);
    writeSheets(sourceSheets);
  }
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
      : itemType === "armadura"
        ? `Mitigacao ${item.armor?.mitigation || "0"}`
        : `Qtd. ${item.qty}`;
    const secondaryMeta = itemType === "arma"
      ? `Qtd. ${item.qty}`
      : itemType === "armadura"
        ? (item.armor?.equipped ? "Equipada" : "Guardada")
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

  renderArmorStats();
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

function parseArmorResistances(value) {
  const seen = new Set();
  return String(value || "")
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean)
    .filter(entry => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildArmorStats(list = inv) {
  const equippedArmors = list
    .map(normalizeItem)
    .filter(item => item.type === "armadura" && item.armor?.equipped);
  const resistanceMap = new Map();
  let mitigation = 0;

  equippedArmors.forEach(item => {
    mitigation += Math.max(0, Number.parseInt(item.armor?.mitigation || "0", 10) || 0);
    parseArmorResistances(item.armor?.resistances).forEach(resistance => {
      const key = resistance.toLowerCase();
      if (!resistanceMap.has(key)) resistanceMap.set(key, resistance);
    });
  });

  return {
    equippedArmors,
    mitigation,
    resistances: [...resistanceMap.values()]
  };
}

function renderArmorStats() {
  const panel = document.getElementById("armorStatsPanel");
  if (!panel) return;
  const summary = document.getElementById("armorStatsSummary");
  const count = document.getElementById("armorEquippedCount");
  const total = document.getElementById("armorMitigationTotal");
  const resistanceList = document.getElementById("armorResistanceList");
  const equippedList = document.getElementById("armorEquippedList");
  const stats = buildArmorStats(inv);

  if (summary) {
    summary.textContent = stats.equippedArmors.length
      ? `${stats.equippedArmors.length} equipada(s), mitigacao ${stats.mitigation}`
      : "Nenhuma armadura equipada.";
  }
  if (count) count.textContent = String(stats.equippedArmors.length);
  if (total) total.textContent = String(stats.mitigation);
  if (resistanceList) {
    resistanceList.innerHTML = stats.resistances.length
      ? stats.resistances.map(resistance => `<span class="armor-resistance-chip">${esc(resistance)}</span>`).join("")
      : '<span class="armor-empty">Nenhuma</span>';
  }
  if (equippedList) {
    equippedList.innerHTML = stats.equippedArmors.length
      ? stats.equippedArmors.map(item => `
          <article class="armor-equipped-item">
            <strong>${esc(item.name || "Armadura")}</strong>
            <span>Mitigacao ${esc(item.armor?.mitigation || "0")}</span>
            ${item.armor?.notes ? `<small>${esc(item.armor.notes)}</small>` : ""}
          </article>
        `).join("")
      : '<p class="empty-msg">Equipe uma armadura no inventario para ver os detalhes aqui.</p>';
  }
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
