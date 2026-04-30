function initSheetMouseGlow() {
  const sheetScreen = document.getElementById("sheetScreen");
  if (!sheetScreen) return;
  if (typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches) return;

  const setGlowVars = (x, y) => {
    sheetScreen.style.setProperty("--sheet-glow-x", x);
    sheetScreen.style.setProperty("--sheet-glow-y", y);
  };

  setGlowVars("50%", "18%");

  let frameId = 0;

  const updateGlow = (clientX, clientY) => {
    const rect = sheetScreen.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    setGlowVars(
      `${Math.max(0, Math.min(100, x)).toFixed(2)}%`,
      `${Math.max(0, Math.min(100, y)).toFixed(2)}%`
    );
  };

  const handlePointerMove = event => {
    const { clientX, clientY } = event;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => updateGlow(clientX, clientY));
  };

  const resetGlow = () => {
    setGlowVars("50%", "18%");
  };

  sheetScreen.addEventListener("pointermove", handlePointerMove);
  sheetScreen.addEventListener("pointerleave", resetGlow);
}

function sanitizeAttrValue(attr, value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;

  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;

  const clamped = Math.max(1, numeric);
  return String(clamped);
}

function sanitizeResourceInputValue(value, fallback = "") {
  if (value === "" || value === null || value === undefined) return fallback;

  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;

  return String(Math.max(0, numeric));
}

function clampResourceInputs(type) {
  const isVida = type === "vida";
  const currentInput = document.getElementById(isVida ? "vidaAtual" : "integAtual");
  const maxInput = document.getElementById(isVida ? "vidaMax" : "integMax");
  if (!currentInput || !maxInput) return;

  const safeMax = sanitizeResourceInputValue(maxInput.value, "");
  if (safeMax !== "") {
    maxInput.value = safeMax;
    currentInput.max = safeMax;
  } else {
    currentInput.removeAttribute("max");
  }

  const safeCurrent = sanitizeResourceInputValue(currentInput.value, "");
  if (safeCurrent === "") return;

  if (safeMax === "") {
    currentInput.value = safeCurrent;
    return;
  }

  currentInput.value = String(Math.min(
    Number.parseInt(safeCurrent, 10),
    Number.parseInt(safeMax, 10)
  ));
}

function enforceSheetRules() {
  ATTRIBUTES.forEach(attr => {
    const input = document.getElementById(`attr${attr}`);
    if (!input) return;

    input.value = sanitizeAttrValue(attr, input.value, "");
    calcMod(attr);
  });

  clampResourceInputs("vida");
  syncIntegrityFromSoul();
}

function initAutoSave() {
  const sheetScreen = document.getElementById("sheetScreen");
  if (!sheetScreen) return;

  ["input", "change"].forEach(eventName => {
    sheetScreen.addEventListener(eventName, event => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest("#sheetScreen")) return;
      if (event.target instanceof HTMLTextAreaElement && event.target.classList.contains("auto-grow")) {
        autoGrowTextarea(event.target);
      }
      saveSheetSilently();
    });
  });

  window.addEventListener("beforeunload", () => {
    flushSheetSaveOnExit();
  });

  window.addEventListener("pagehide", () => {
    flushSheetSaveOnExit();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSheetSaveOnExit();
    }
  });
}

function getValue(id) {
  return document.getElementById(id).value || "";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function modScale(value) {
  if (value <= 0) return 0;
  return Math.floor(value / 3);
}

function getIntegrityMaxFromSoul(value, fallback = "") {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(0, Math.floor(numeric / 3)));
}

function syncIntegrityFromSoul() {
  const integrityMaxInput = document.getElementById("integMax");
  const integrityCurrentInput = document.getElementById("integAtual");
  if (!integrityMaxInput) return;
  if (currentSheetTarget?.kind === "monster") {
    clampResourceInputs("integ");
    updateBar("integ");
    return;
  }

  const nextIntegrityMax = getIntegrityMaxFromSoul(getValue("attrAlma"), "");
  integrityMaxInput.value = nextIntegrityMax;

  if (integrityCurrentInput && nextIntegrityMax !== "") {
    const currentIntegrity = Number.parseInt(integrityCurrentInput.value, 10);
    const maxIntegrity = Number.parseInt(nextIntegrityMax, 10);

    if (!Number.isNaN(currentIntegrity) && !Number.isNaN(maxIntegrity)) {
      integrityCurrentInput.value = String(Math.max(0, Math.min(currentIntegrity, maxIntegrity)));
    }
  }

  clampResourceInputs("integ");
  updateBar("integ");
}

function calcMod(attr) {
  const input = document.getElementById(`attr${attr}`);
  const target = document.getElementById(`mod${attr}`);
  if (!input || !target) return;

  input.value = sanitizeAttrValue(attr, input.value, "");
  const value = Number.parseInt(input.value, 10);

  if (Number.isNaN(value)) {
    target.textContent = "-";
    target.style.color = "";
    if (attr === "Alma") syncIntegrityFromSoul();
    return;
  }

  calcModFromVal(attr, value);
}

function calcModFromVal(attr, value) {
  const target = document.getElementById(`mod${attr}`);
  if (!target) return;

  if (Number.isNaN(value)) {
    target.textContent = "-";
    target.style.color = "";
    return;
  }

  const mod = modScale(value);
  target.textContent = `+${mod}`;
  target.style.color = mod >= 4 ? "var(--red-mid)" : mod >= 2 ? "var(--gold)" : "var(--text-secondary)";

  if (attr === "Alma") {
    syncIntegrityFromSoul();
  }
}

function updateBar(type) {
  const isVida = type === "vida";
  clampResourceInputs(type);

  const current = parseFloat(getValue(isVida ? "vidaAtual" : "integAtual")) || 0;
  const max = parseFloat(getValue(isVida ? "vidaMax" : "integMax")) || 1;
  const bar = document.getElementById(isVida ? "barVida" : "barInteg");
  if (!bar) return;

  const percent = Math.min(100, Math.max(0, (current / max) * 100));
  bar.style.width = `${percent}%`;

  if (isVida) {
    const hue = Math.round((percent / 100) * 120);
    const lightness = 28 + (percent / 100) * 22;
    bar.style.background = `hsl(${hue} 78% ${lightness}%)`;
    bar.style.boxShadow = `0 0 16px hsla(${hue}, 90%, ${Math.max(lightness, 35)}%, 0.22)`;
  } else {
    const lightness = 14 + (percent / 100) * 50;
    const saturation = 48 + (percent / 100) * 30;
    bar.style.background = `hsl(204 ${saturation}% ${lightness}%)`;
    bar.style.boxShadow = `0 0 16px hsla(204, 90%, ${Math.max(lightness, 28)}%, 0.2)`;
  }
}

function handleAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = loadEvent => {
    const avatarImg = document.getElementById("avatarImg");
    const avatarPlaceholder = document.getElementById("avatarPlaceholder");
    if (!avatarImg || !avatarPlaceholder) return;

    avatarImg.src = loadEvent.target.result || "";
    avatarImg.style.display = "block";
    avatarPlaceholder.style.display = "none";
    saveSheetSilently();
  };

  reader.readAsDataURL(file);
}

async function openSheet(target, fromMaster) {
  const resolvedTarget = typeof target === "string" ? createPlayerTarget(target) : target;

  pendingRealtimeSheetKey = "";
  currentSheetTarget = resolvedTarget;
  updateSheetHeader(fromMaster);
  applySheetKindUI(resolvedTarget.kind);
  showScreen("sheetScreen");
  await loadSheet(resolvedTarget.key, resolvedTarget.kind);
}

function updateSheetHeader(fromMaster) {
  const sheetUser = document.getElementById("sheetUser");
  const backButton = document.getElementById("btnBackMaster");
  const sheetKindLabel = document.getElementById("sheetKindLabel");

  if (sheetUser) sheetUser.textContent = formatCurrentSheetTarget();
  if (backButton) backButton.style.display = fromMaster ? "inline-block" : "none";
  if (sheetKindLabel) sheetKindLabel.textContent = getSheetKindTitle();
}

function applySheetKindUI(kind) {
  const resourcesRow = document.querySelector(".resources-row");
  const sanityCard = document.getElementById("sanityCard");
  const charFactionGroup = document.getElementById("charFactionGroup");
  const charRaceGroup = document.getElementById("charRaceGroup");
  const ownedMemoriesSection = document.getElementById("ownedMemoriesSection");
  const charFaction = document.getElementById("charFaction");
  const inventorySection = document.getElementById("inventorySection");
  const memorySection = document.getElementById("memorySection");
  const identityLoreCard = document.getElementById("identityLoreCard");
  const vidaCard = document.getElementById("vidaCard");
  const isMonster = kind === "monster";

  if (resourcesRow) resourcesRow.classList.remove("resources-single");
  if (sanityCard) {
    sanityCard.hidden = false;
    sanityCard.style.display = "";
  }
  if (charFactionGroup) {
    charFactionGroup.hidden = isMonster;
    charFactionGroup.style.display = isMonster ? "none" : "";
  }
  if (charRaceGroup) charRaceGroup.classList.toggle("form-group-full", isMonster);
  if (charFaction && isMonster) charFaction.value = "";
  if (ownedMemoriesSection) {
    ownedMemoriesSection.hidden = isMonster;
    ownedMemoriesSection.style.display = isMonster ? "none" : "";
  }
  if (inventorySection) {
    inventorySection.hidden = isMonster;
    inventorySection.style.display = isMonster ? "none" : "";
  }
  if (memorySection) {
    memorySection.hidden = !isMonster;
    memorySection.style.display = isMonster ? "" : "none";
  }
  if (identityLoreCard) {
    identityLoreCard.hidden = isMonster;
    identityLoreCard.style.display = isMonster ? "none" : "";
  }
  if (vidaCard) vidaCard.classList.remove("resource-card-wide");
  renderProgressionField(kind);
}

function formatCurrentSheetTarget() {
  if (!currentSheetTarget) return "";
  if (currentSheetTarget.kind === "npc") return `${currentSheetTarget.label} | NPC`;
  if (currentSheetTarget.kind === "monster") return `${currentSheetTarget.label} | Monstro`;
  return currentSheetTarget.label;
}

function getSheetKindTitle() {
  if (!currentSheetTarget) return "Ficha do personagem";
  if (currentSheetTarget.kind === "npc") return "Ficha do NPC";
  if (currentSheetTarget.kind === "monster") return "Ficha do monstro";
  return "Ficha do personagem";
}

function syncDirectoryName(charName) {
  const cleanName = String(charName || "").trim();
  if (!cleanName || !currentSheetTarget) return;

  if (currentSheetTarget.kind === "player") {
    const players = AUTH.getPlayers();
    const index = players.findIndex(player => player.username === currentSheetTarget.owner);
    if (index >= 0) {
      players[index] = {
        ...players[index],
        charname: cleanName,
        inventorySlots,
        usedSlots: inv.length
      };
      AUTH.setPlayers(players);
    }

    if (isBackendMode()) {
      const directory = AUTH.getDirectoryCache();
      const directoryPlayers = directory.players.map(player =>
        player.username === currentSheetTarget.owner
          ? {
              ...player,
              charname: cleanName,
              inventorySlots,
              usedSlots: inv.length
            }
          : player
      );
      AUTH.setDirectoryCache({
        ...directory,
        players: directoryPlayers
      });
    }
    currentSheetTarget.label = cleanName;
    updateSheetHeader(document.getElementById("btnBackMaster").style.display !== "none");
    return;
  }

  if (currentSheetTarget.kind === "npc") {
    const npcs = readNpcs();
    const index = npcs.findIndex(npc => npc.id === currentSheetTarget.npcId);
    if (index >= 0 && npcs[index].name !== cleanName) {
      npcs[index] = { ...npcs[index], name: cleanName };
      writeNpcs(npcs);
    }
    currentSheetTarget.label = cleanName;
    updateSheetHeader(document.getElementById("btnBackMaster").style.display !== "none");
    return;
  }

  const monsters = readMonsters();
  const index = monsters.findIndex(monster => monster.id === currentSheetTarget.monsterId);
  if (index >= 0 && monsters[index].name !== cleanName) {
    monsters[index] = { ...monsters[index], name: cleanName };
    writeMonsters(monsters);
  }
  currentSheetTarget.label = cleanName;
  updateSheetHeader(document.getElementById("btnBackMaster").style.display !== "none");
}
