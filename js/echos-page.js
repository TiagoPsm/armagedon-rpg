/* ── echos-page.js ─────────────────────────────────────────────────────
   Renderização da página de Echos: filtros, grade de cards e modal de
   detalhes/edição. Jogador edita apelido, anotações e imagem do próprio
   Echo; o mestre edita tudo, concede XP, transfere e remove. */

let echoEventsBound = false;

function getEchoDom(id) {
  return document.getElementById(id);
}

function showEchosNotice(message) {
  const grid = getEchoDom("echosGrid");
  if (grid) {
    grid.innerHTML = `<p class="empty-msg echos-empty">${escEcho(message)}</p>`;
  }
}

async function loadEchos() {
  if (!AUTH.isBackendEnabled()) {
    echosState.echos = [];
    renderEchosPage();
    showEchosNotice("Os Echos ficam disponíveis quando o servidor está ativo (modo online).");
    return;
  }

  try {
    const response = await APP.listEchos();
    echosState.echos = Array.isArray(response?.echos) ? response.echos : [];
  } catch (error) {
    echosState.echos = [];
    UI.toast(error.message || "Falha ao carregar os Echos.");
  }

  renderEchosPage();
}

function renderEchosPage() {
  renderEchoFilters();
  renderEchoGrid();
}

function renderEchoFilters() {
  const ownerWrap = getEchoDom("echoOwnerFilterWrap");
  const ownerSelect = getEchoDom("echoOwnerFilter");

  if (ownerWrap) ownerWrap.hidden = !echosState.isMaster;

  if (ownerSelect && echosState.isMaster) {
    const options = getEchoOwnerOptions();
    const current = echosState.filter.owner;
    ownerSelect.innerHTML = [
      '<option value="all">Todos os donos</option>',
      ...options.map(opt => `<option value="${escEcho(opt.value)}">${escEcho(opt.label)}</option>`)
    ].join("");
    ownerSelect.value = options.some(opt => opt.value === current) ? current : "all";
  }

  const countBadge = getEchoDom("echoCountBadge");
  if (countBadge) {
    const total = echosState.echos.length;
    countBadge.textContent = total === 1 ? "1 Echo" : `${total} Echos`;
  }
}

function renderEchoGrid() {
  const grid = getEchoDom("echosGrid");
  if (!grid) return;

  const list = getVisibleEchos();

  if (!echosState.echos.length) {
    grid.innerHTML = `<p class="empty-msg echos-empty">${escEcho(
      echosState.isMaster
        ? "Nenhum Echo concedido ainda. Configure o drop de Echo na ficha de um monstro."
        : "Você ainda não possui Echos. Derrote monstros para ter a chance de obtê-los."
    )}</p>`;
    return;
  }

  if (!list.length) {
    grid.innerHTML = `<p class="empty-msg echos-empty">Nenhum Echo corresponde ao filtro atual.</p>`;
    return;
  }

  grid.innerHTML = list.map(renderEchoCard).join("");
}

function renderEchoStatChips(stats = {}) {
  return [
    ["FOR", stats.forca],
    ["AGI", stats.agilidade],
    ["INT", stats.inteligencia],
    ["RES", stats.resistencia],
    ["ALM", stats.alma]
  ]
    .map(([label, value]) => `<span class="echo-stat-chip">${label} <strong>${Number(value || 0)}</strong></span>`)
    .join("");
}

function renderEchoCard(echo) {
  const rarity = normalizeEchoRarityValue(echo.rarity);
  const avatar = String(echo.avatar || "").trim();
  const saturation = Math.max(0, Math.min(1, Number(echo.saturation || 0)));
  const xpText = echo.xpLimit > 0 ? `${echo.xp} / ${echo.xpLimit} XP` : "Rank máximo";
  const ownerTag = echosState.isMaster && echo.ownerName
    ? ` · ${escEcho(echo.ownerName)}`
    : "";

  return `
    <article class="echo-card" data-rarity="${escEcho(rarity)}" data-echo-id="${escEcho(echo.id)}">
      <div class="echo-card-portrait">
        ${
          avatar
            ? `<img src="${escEcho(avatar)}" alt="${escEcho(echoDisplayName(echo))}" loading="lazy" decoding="async" />`
            : `<span class="echo-portrait-fallback">${escEcho(echoInitials(echo))}</span>`
        }
        <span class="echo-rarity-badge" data-rarity="${escEcho(rarity)}">${escEcho(getEchoRarityLabel(rarity))}</span>
      </div>

      <div class="echo-card-body">
        <span class="item-meta">Echo${ownerTag}</span>
        <h3 class="echo-card-name">${escEcho(echoDisplayName(echo))}</h3>
        <p class="echo-card-source">De ${escEcho(echo.sourceMonsterName || "origem desconhecida")}</p>

        <div class="echo-card-rank">
          <div class="echo-rank-row">
            <span class="echo-rank-name">${escEcho(getEchoRankLabel(echo.rank))}</span>
            <span class="echo-rank-num">Rank ${Number(echo.rank || 1)}</span>
          </div>
          <div class="echo-xp-track"><div class="echo-xp-fill" style="width:${(saturation * 100).toFixed(1)}%"></div></div>
          <span class="echo-xp-text">${escEcho(xpText)}</span>
        </div>

        <div class="echo-card-stats">${renderEchoStatChips(echo.stats)}</div>

        <div class="echo-card-foot">
          <span>${(echo.habs || []).length} hab · ${(echo.passives || []).length} pass</span>
          <span>${escEcho(formatEchoDate(echo.obtainedAt))}</span>
        </div>
      </div>

      <div class="echo-card-actions">
        <button type="button" class="btn-inline" data-echo-action="details" data-echo-id="${escEcho(echo.id)}">Detalhes</button>
        <button type="button" class="btn-inline" data-echo-action="transfer" data-echo-id="${escEcho(echo.id)}">Transferir</button>
        ${
          echosState.isMaster
            ? `<button type="button" class="btn-inline echo-action-danger" data-echo-action="delete" data-echo-id="${escEcho(echo.id)}">Excluir</button>`
            : ""
        }
      </div>
    </article>
  `;
}

/* ── MODAL ──────────────────────────────────────────────────────────── */

function openEchoModal(id) {
  const echo = getEchoById(id);
  if (!echo) return;

  echosState.editingId = id;
  echosState.editing = { rarity: normalizeEchoRarityValue(echo.rarity) };

  const content = getEchoDom("echoModalContent");
  if (content) content.innerHTML = renderEchoModalContent(echo);

  const root = getEchoDom("echoModalRoot");
  const panel = root?.querySelector(".app-modal-panel");
  if (root && panel) {
    root.hidden = false;
    UI.activateModal(root, panel, {
      onDismiss: () => closeEchoModal()
    });
  }
}

function closeEchoModal() {
  const root = getEchoDom("echoModalRoot");
  if (!root) return;
  UI.deactivateModal(root);
  root.hidden = true;
  echosState.editingId = null;
  echosState.editing = null;
}

function renderEchoAbilitiesList(echo) {
  const habs = Array.isArray(echo.habs) ? echo.habs : [];
  const passives = Array.isArray(echo.passives) ? echo.passives : [];

  const habsHtml = habs.length
    ? habs
        .map(
          hab => `
            <li class="echo-ability">
              <div class="echo-ability-head">
                <strong>${escEcho(hab.name || "Habilidade")}</strong>
                <span class="echo-ability-type">${hab.type === "passiva" ? "Passiva" : "Ativa"}</span>
              </div>
              ${hab.trigger ? `<span class="echo-ability-trigger">${escEcho(hab.trigger)}</span>` : ""}
              ${hab.desc ? `<p>${escEcho(hab.desc)}</p>` : ""}
            </li>
          `
        )
        .join("")
    : '<li class="echo-ability echo-ability-empty">Nenhuma habilidade.</li>';

  const passivesHtml = passives.length
    ? passives
        .map(
          passive => `
            <li class="echo-ability">
              <div class="echo-ability-head">
                <strong>${escEcho(passive.name || "Passiva")}</strong>
                ${passive.source ? `<span class="echo-ability-type">${escEcho(passive.source)}</span>` : ""}
              </div>
              ${passive.effect ? `<p>${escEcho(passive.effect)}</p>` : ""}
            </li>
          `
        )
        .join("")
    : '<li class="echo-ability echo-ability-empty">Nenhuma característica permanente.</li>';

  return `
    <div class="echo-modal-block">
      <span class="item-meta">Habilidades</span>
      <ul class="echo-ability-list">${habsHtml}</ul>
    </div>
    <div class="echo-modal-block">
      <span class="item-meta">Características permanentes</span>
      <ul class="echo-ability-list">${passivesHtml}</ul>
    </div>
  `;
}

function renderEchoMasterStats(stats = {}) {
  const attr = (key, label) => `
    <label class="echo-stat-field">
      <span>${label}</span>
      <input type="number" min="0" id="echoStat-${key}" value="${Number(stats[key] || 0)}" />
    </label>
  `;

  return `
    <div class="echo-modal-block echo-master-block">
      <span class="item-meta">Atributos (mestre)</span>
      <div class="echo-stat-grid">
        ${attr("forca", "Força")}
        ${attr("agilidade", "Agilidade")}
        ${attr("inteligencia", "Inteligência")}
        ${attr("resistencia", "Resistência")}
        ${attr("alma", "Alma")}
      </div>
      <div class="echo-stat-grid echo-stat-grid-res">
        ${attr("vidaAtual", "Vida")}
        ${attr("vidaMax", "Vida máx.")}
        ${attr("integAtual", "Integridade")}
        ${attr("integMax", "Integr. máx.")}
      </div>
    </div>
  `;
}

function renderEchoModalContent(echo) {
  const isMaster = echosState.isMaster;
  const rarity = normalizeEchoRarityValue(echo.rarity);
  const avatar = String(echo.avatar || "").trim();
  const saturation = Math.max(0, Math.min(1, Number(echo.saturation || 0)));
  const xpText = echo.xpLimit > 0 ? `${echo.xp} / ${echo.xpLimit} XP` : "Rank máximo";

  return `
    <p class="section-label echo-modal-kicker">// Echo</p>

    <div class="echo-modal-hero">
      <div class="echo-modal-portrait" data-rarity="${escEcho(rarity)}">
        ${
          avatar
            ? `<img src="${escEcho(avatar)}" alt="${escEcho(echoDisplayName(echo))}" />`
            : `<span class="echo-portrait-fallback">${escEcho(echoInitials(echo))}</span>`
        }
        <label class="btn btn-ghost btn-sm echo-avatar-btn">
          Trocar imagem
          <input type="file" id="echoAvatarFile" accept="image/*" hidden />
        </label>
      </div>

      <div class="echo-modal-headline">
        <span class="echo-rarity-badge" data-rarity="${escEcho(rarity)}">${escEcho(getEchoRarityLabel(rarity))}</span>
        <h2 class="echo-modal-title">${escEcho(echoDisplayName(echo))}</h2>
        <p class="echo-modal-source">De ${escEcho(echo.sourceMonsterName || "origem desconhecida")}${
          isMaster && echo.ownerName ? ` · Dono: ${escEcho(echo.ownerName)}` : ""
        }</p>
        <div class="echo-modal-rank">
          <div class="echo-rank-row">
            <span class="echo-rank-name">${escEcho(getEchoRankLabel(echo.rank))} · Rank ${Number(echo.rank || 1)}</span>
            <span class="echo-xp-text">${escEcho(xpText)}</span>
          </div>
          <div class="echo-xp-track"><div class="echo-xp-fill" style="width:${(saturation * 100).toFixed(1)}%"></div></div>
        </div>
      </div>
    </div>

    <div class="echo-modal-grid">
      <label class="echo-modal-field">
        <span class="item-meta">Apelido</span>
        <input type="text" id="echoCustomName" class="form-input" maxlength="80" placeholder="${escEcho(echo.name || "Nome do Echo")}" value="${escEcho(echo.customName || "")}" />
      </label>

      ${
        isMaster
          ? `
        <label class="echo-modal-field">
          <span class="item-meta">Nome original (mestre)</span>
          <input type="text" id="echoName" class="form-input" maxlength="80" value="${escEcho(echo.name || "")}" />
        </label>

        <div class="echo-modal-field">
          <span class="item-meta">Raridade (mestre)</span>
          <button type="button" class="btn-inline echo-rarity-btn" data-echo-modal-action="pick-rarity">
            <span class="echo-rarity-label" data-rarity="${escEcho(rarity)}">${escEcho(getEchoRarityLabel(rarity))}</span>
            <span class="memory-picker-hint">Alterar</span>
          </button>
        </div>

        <label class="echo-modal-field echo-modal-field-compact">
          <span class="item-meta">Rank</span>
          <input type="number" id="echoRank" class="form-input" min="1" max="7" value="${Number(echo.rank || 1)}" />
        </label>

        <label class="echo-modal-field echo-modal-field-compact">
          <span class="item-meta">XP no rank</span>
          <input type="number" id="echoXp" class="form-input" min="0" value="${Number(echo.xp || 0)}" />
        </label>
      `
          : ""
      }

      <label class="echo-modal-field echo-modal-field-full">
        <span class="item-meta">Anotações</span>
        <textarea id="echoNotes" class="notes-input" rows="3" placeholder="Registre a história ou observações deste Echo...">${escEcho(echo.notes || "")}</textarea>
      </label>

      <label class="echo-modal-field echo-modal-field-full">
        <span class="item-meta">Descrição${isMaster ? "" : " (somente leitura)"}</span>
        ${
          isMaster
            ? `<textarea id="echoDesc" class="notes-input" rows="3">${escEcho(echo.desc || "")}</textarea>`
            : `<p class="echo-readonly-text">${escEcho(echo.desc || "Sem descrição.")}</p>`
        }
      </label>
    </div>

    ${isMaster ? renderEchoMasterStats(echo.stats) : `<div class="echo-modal-block"><span class="item-meta">Atributos</span><div class="echo-card-stats">${renderEchoStatChips(echo.stats)}</div></div>`}

    ${renderEchoAbilitiesList(echo)}

    ${
      isMaster
        ? `
      <div class="echo-modal-block echo-master-block">
        <span class="item-meta">Conceder XP (mestre)</span>
        <div class="echo-xp-grant">
          <input type="number" id="echoXpAmount" class="form-input" min="1" placeholder="Ex: 50" />
          <button type="button" class="btn-inline" data-echo-modal-action="grant-xp">Conceder XP</button>
        </div>
      </div>
    `
        : ""
    }

    <div class="echo-modal-actions">
      <button type="button" class="btn btn-ghost" data-echo-modal-action="transfer">Transferir</button>
      ${isMaster ? '<button type="button" class="btn btn-ghost echo-action-danger" data-echo-modal-action="delete">Excluir</button>' : ""}
      <button type="button" class="btn btn-primary" data-echo-modal-action="save">Salvar</button>
    </div>
  `;
}

function collectModalStats() {
  const read = key => Math.max(0, Number.parseInt(getEchoDom(`echoStat-${key}`)?.value, 10) || 0);
  return {
    forca: read("forca"),
    agilidade: read("agilidade"),
    inteligencia: read("inteligencia"),
    resistencia: read("resistencia"),
    alma: read("alma"),
    vidaAtual: read("vidaAtual"),
    vidaMax: read("vidaMax"),
    integAtual: read("integAtual"),
    integMax: read("integMax")
  };
}

async function saveEchoEdits() {
  const echo = getEchoById(echosState.editingId);
  if (!echo || echosState.saving) return;

  const patch = {};
  const customName = getEchoDom("echoCustomName");
  if (customName) patch.customName = customName.value;
  const notes = getEchoDom("echoNotes");
  if (notes) patch.notes = notes.value;

  if (echosState.isMaster) {
    const nameInput = getEchoDom("echoName");
    if (nameInput) patch.name = nameInput.value;
    patch.rarity = echosState.editing?.rarity ?? echo.rarity;
    const rankInput = getEchoDom("echoRank");
    if (rankInput) patch.rank = Math.min(7, Math.max(1, Number.parseInt(rankInput.value, 10) || 1));
    const xpInput = getEchoDom("echoXp");
    if (xpInput) patch.xp = Math.max(0, Number.parseInt(xpInput.value, 10) || 0);
    const descInput = getEchoDom("echoDesc");
    if (descInput) patch.desc = descInput.value;
    patch.stats = collectModalStats();
  }

  echosState.saving = true;
  try {
    await APP.updateEcho(echo.id, patch);
    UI.toast("Echo atualizado.");
    await loadEchos();
    closeEchoModal();
  } catch (error) {
    UI.alert(error.message || "Falha ao salvar o Echo.");
  } finally {
    echosState.saving = false;
  }
}

async function pickModalRarity() {
  if (!echosState.isMaster) return;
  const current = echosState.editing?.rarity || "comum";
  const selected = await UI.pickOption({
    title: "Raridade do Echo",
    kicker: "// Raridade",
    message: "Escolha a raridade deste Echo.",
    options: ECHO_RARITY_ORDER.map(rarity => ({
      value: rarity,
      label: ECHO_RARITY_LABELS[rarity],
      meta: "Raridade",
      selected: rarity === current
    }))
  });
  if (!selected) return;

  echosState.editing = { ...(echosState.editing || {}), rarity: selected };
  const label = getEchoDom("echoModalContent")?.querySelector(".echo-rarity-btn .echo-rarity-label");
  if (label) {
    label.textContent = ECHO_RARITY_LABELS[selected];
    label.setAttribute("data-rarity", selected);
  }
}

async function grantEchoXpFromModal() {
  const echo = getEchoById(echosState.editingId);
  if (!echo) return;
  const input = getEchoDom("echoXpAmount");
  const amount = Math.max(0, Number.parseInt(input?.value, 10) || 0);
  if (!amount) {
    UI.alert("Informe uma quantidade de XP maior que zero.");
    return;
  }

  try {
    const result = await APP.grantEchoXp(echo.id, amount);
    UI.toast(
      result?.summary?.rankUps?.length
        ? `Echo evoluiu para ${result.summary.rankName}!`
        : "XP concedido ao Echo."
    );
    await loadEchos();
    openEchoModal(echo.id);
  } catch (error) {
    UI.alert(error.message || "Falha ao conceder XP ao Echo.");
  }
}

async function transferEchoFlow(id) {
  const echo = getEchoById(id);
  if (!echo) return;

  const targets = getEchoTransferTargets(echo);
  if (!targets.length) {
    UI.alert("Não há outro jogador disponível para receber este Echo.");
    return;
  }

  const selected = await UI.pickOption({
    title: "Transferir Echo",
    kicker: "// Jogadores",
    message: "Escolha quem vai receber este Echo.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: `Jogador | ${target.meta}`
    }))
  });
  if (!selected) return;

  const targetLabel = targets.find(target => target.value === selected)?.label || "jogador";
  const confirmed = await UI.confirm(`Transferir "${echoDisplayName(echo)}" para ${targetLabel}?`, {
    title: "Transferir Echo",
    kicker: "// Echos",
    confirmLabel: "Transferir"
  });
  if (!confirmed) return;

  try {
    const result = await APP.createTransferProposal({
      transferType: "echo",
      sourceKey: echo.ownerKey,
      targetKey: selected,
      echoId: echo.id
    });
    UI.toast(
      result?.direct
        ? "Echo transferido."
        : "Proposta enviada. O Echo muda de dono quando o destinatário aceitar."
    );
    await loadEchos();
    if (echosState.editingId === id) closeEchoModal();
  } catch (error) {
    UI.alert(error.message || "Falha ao transferir o Echo.");
  }
}

async function deleteEchoFlow(id) {
  const echo = getEchoById(id);
  if (!echo || !echosState.isMaster) return;

  const confirmed = await UI.confirm(`Excluir o Echo "${echoDisplayName(echo)}"? Esta ação não pode ser desfeita.`, {
    title: "Excluir Echo",
    kicker: "// Echos",
    confirmLabel: "Excluir",
    variant: "danger"
  });
  if (!confirmed) return;

  try {
    await APP.deleteEcho(echo.id);
    UI.toast("Echo removido.");
    if (echosState.editingId === id) closeEchoModal();
    await loadEchos();
  } catch (error) {
    UI.alert(error.message || "Falha ao remover o Echo.");
  }
}

async function handleEchoAvatarUpload(file) {
  const echo = getEchoById(echosState.editingId);
  if (!echo || !file) return;

  try {
    const blob = await compressEchoImage(file);
    const result = await APP.uploadEchoAvatar(echo.id, blob);
    UI.toast("Imagem do Echo atualizada.");
    await loadEchos();
    if (result?.echo?.id) openEchoModal(result.echo.id);
  } catch (error) {
    UI.alert(error.message || "Falha ao enviar a imagem do Echo.");
  }
}

function compressEchoImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const ratio = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const type = canvas.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
        canvas.toBlob(
          blob => (blob ? resolve(blob) : reject(new Error("Falha ao processar a imagem."))),
          type,
          type === "image/webp" ? 0.85 : 0.82
        );
      };
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.src = String(event.target.result || "");
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function bindEchoPageEvents() {
  if (echoEventsBound) return;
  echoEventsBound = true;

  const search = getEchoDom("echoSearch");
  if (search) {
    search.addEventListener("input", () => {
      echosState.filter.search = search.value;
      renderEchoGrid();
    });
  }

  const rarity = getEchoDom("echoRarityFilter");
  if (rarity) {
    rarity.addEventListener("change", () => {
      echosState.filter.rarity = rarity.value;
      renderEchoGrid();
    });
  }

  const sort = getEchoDom("echoSortFilter");
  if (sort) {
    sort.addEventListener("change", () => {
      echosState.filter.sort = sort.value;
      renderEchoGrid();
    });
  }

  const owner = getEchoDom("echoOwnerFilter");
  if (owner) {
    owner.addEventListener("change", () => {
      echosState.filter.owner = owner.value;
      renderEchoGrid();
    });
  }

  const grid = getEchoDom("echosGrid");
  if (grid) {
    grid.addEventListener("click", event => {
      const button = event.target.closest("[data-echo-action]");
      if (!button) return;
      const id = button.dataset.echoId;
      const action = button.dataset.echoAction;
      if (action === "details") openEchoModal(id);
      else if (action === "transfer") transferEchoFlow(id);
      else if (action === "delete") deleteEchoFlow(id);
    });
  }

  const modalRoot = getEchoDom("echoModalRoot");
  if (modalRoot) {
    modalRoot.addEventListener("click", event => {
      if (event.target.closest("[data-echo-modal-close]") || event.target.classList.contains("app-modal-backdrop")) {
        closeEchoModal();
        return;
      }

      const button = event.target.closest("[data-echo-modal-action]");
      if (!button) return;
      const action = button.dataset.echoModalAction;
      if (action === "save") saveEchoEdits();
      else if (action === "transfer") transferEchoFlow(echosState.editingId);
      else if (action === "delete") deleteEchoFlow(echosState.editingId);
      else if (action === "pick-rarity") pickModalRarity();
      else if (action === "grant-xp") grantEchoXpFromModal();
    });

    modalRoot.addEventListener("change", event => {
      const fileInput = event.target.closest("#echoAvatarFile");
      if (fileInput && fileInput.files?.[0]) {
        handleEchoAvatarUpload(fileInput.files[0]);
      }
    });
  }
}
