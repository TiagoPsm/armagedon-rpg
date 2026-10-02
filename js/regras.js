const RULES_KEY = "tc_rules_posts";

let currentSession = null;
let editingRuleId = null;
let rulesSaving = false;
let rulesDeleting = false;
let rulesLoadRequest = 0;
let rulesLoadState = "ready";
let rulesCache = [];
let rulesRealtimeBound = false;
let rulesFilters = {
  query: "",
  tag: ""
};

function initRulesPageGlow() {
  const root = document.body;
  if (!root) return;
  if (typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches) return;

  const setGlow = (x, y) => {
    root.style.setProperty("--page-glow-x", x);
    root.style.setProperty("--page-glow-y", y);
  };

  setGlow("50%", "16%");

  let frameId = 0;
  const updateGlow = (clientX, clientY) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const x = Math.max(0, Math.min(100, (clientX / width) * 100)).toFixed(2);
    const y = Math.max(0, Math.min(100, (clientY / height) * 100)).toFixed(2);
    setGlow(`${x}%`, `${y}%`);
  };

  const handleMove = event => {
    const { clientX, clientY } = event;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => updateGlow(clientX, clientY));
  };

  root.addEventListener("pointermove", handleMove);
  root.addEventListener("pointerleave", () => setGlow("50%", "16%"));
}

function preFillRulesPage() {
  try {
    const s = JSON.parse(localStorage.getItem("tc_session"));
    if (!s?.username) return;
    const isMaster = s.role === "master";
    const rulesUser = document.getElementById("rulesUser");
    const rulesRoleLabel = document.getElementById("rulesRoleLabel");
    const rulesHeaderRole = document.getElementById("rulesHeaderRole");
    const rulesIntro = document.getElementById("rulesIntro");
    const rulesEditor = document.getElementById("rulesEditor");
    const playerNotice = document.getElementById("playerNotice");
    if (rulesUser) rulesUser.textContent = s.username;
    if (rulesRoleLabel) rulesRoleLabel.textContent = isMaster ? "Mestre" : "Jogador";
    if (rulesHeaderRole) rulesHeaderRole.textContent = isMaster ? "Painel do mestre" : "Arquivo de regras";
    if (rulesIntro) rulesIntro.textContent = isMaster
      ? "Você pode publicar, editar e manter organizadas as regras oficiais da campanha."
      : "Aqui ficam as regras oficiais publicadas pelo mestre para consulta de todos os jogadores.";
    if (rulesEditor) rulesEditor.hidden = !isMaster;
    if (playerNotice) playerNotice.hidden = isMaster;
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", async () => {
  initRulesPageGlow();
  preFillRulesPage();

  await AUTH_READY;
  currentSession = AUTH.requireAuth();
  if (!currentSession) return;

  setupRulesPage();
  bindRulesRealtime();
  await renderRules({ preferCache: true });
  if (AUTH.isBackendEnabled()) {
    renderRules().catch(() => {});
  }

  if (!AUTH.isBackendEnabled()) {
    window.addEventListener("storage", event => {
      if (event.key === RULES_KEY) renderRules();
    });
  }
});

function bindRulesRealtime() {
  if (rulesRealtimeBound || !AUTH.isBackendEnabled()) return;
  rulesRealtimeBound = true;

  APP.on("rules:changed", async () => {
    try {
      await renderRules();
    } catch {}
  });
}

function setupRulesPage() {
  document.getElementById("ruleFormError")?.setAttribute("role", "alert");
  document.getElementById("ruleFormStatus")?.setAttribute("role", "status");
  const rulesUser = document.getElementById("rulesUser");
  const rulesRoleLabel = document.getElementById("rulesRoleLabel");
  const rulesHeaderRole = document.getElementById("rulesHeaderRole");
  const rulesIntro = document.getElementById("rulesIntro");
  const rulesEditor = document.getElementById("rulesEditor");
  const playerNotice = document.getElementById("playerNotice");
  const ruleContent = document.getElementById("ruleContent");
  const rulesSearch = document.getElementById("rulesSearch");
  const clearRulesFilters = document.getElementById("clearRulesFilters");
  const rulesTagFilters = document.getElementById("rulesTagFilters");
  const isMaster = currentSession.role === "master";

  if (rulesUser) rulesUser.textContent = currentSession.username || "";
  if (rulesRoleLabel) rulesRoleLabel.textContent = isMaster ? "Mestre" : "Jogador";
  if (rulesHeaderRole) rulesHeaderRole.textContent = isMaster ? "Painel do mestre" : "Arquivo de regras";

  if (rulesIntro) {
    rulesIntro.textContent = isMaster
      ? "Você pode publicar, editar e manter organizadas as regras oficiais da campanha."
      : "Aqui ficam as regras oficiais publicadas pelo mestre para consulta de todos os jogadores.";
  }

  if (rulesEditor) rulesEditor.hidden = !isMaster;
  if (playerNotice) playerNotice.hidden = isMaster;

  if (ruleContent instanceof HTMLTextAreaElement) {
    ruleContent.addEventListener("input", () => autoGrowTextarea(ruleContent));
    autoGrowTextarea(ruleContent);
  }

  if (rulesSearch instanceof HTMLInputElement) {
    rulesSearch.addEventListener("input", () => {
      rulesFilters.query = rulesSearch.value.trim().toLowerCase();
      renderRulesFromCache();
    });
  }

  if (clearRulesFilters) clearRulesFilters.dataset.armed = "1";   // contrato da Etapa 84
  clearRulesFilters?.addEventListener("click", () => {
    rulesFilters = { query: "", tag: "" };
    if (rulesSearch instanceof HTMLInputElement) rulesSearch.value = "";
    renderRulesFromCache();
  });

  rulesTagFilters?.addEventListener("click", event => {
    const button = event.target.closest?.("[data-rule-tag-filter]");
    if (!(button instanceof HTMLElement)) return;
    const tag = String(button.dataset.ruleTagFilter || "");
    rulesFilters.tag = rulesFilters.tag.toLowerCase() === tag.toLowerCase() ? "" : tag;
    renderRulesFromCache();
  });

  resetRuleForm();
}

function readRulesLocal() {
  try {
    return JSON.parse(localStorage.getItem(RULES_KEY) || "[]")
      .map(normalizeRule)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

function writeRulesLocal(rules) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules.map(normalizeRule)));
}

async function loadRules(options = {}) {
  const { preferCache = false } = options;

  if (AUTH.isBackendEnabled()) {
    if (preferCache) {
      return readRulesLocal();
    }

    const remoteRules = await APP.listRules();
    return remoteRules
      .map(rule =>
        normalizeRule({
        id: rule.id,
        title: rule.title,
        tag: rule.tag,
        tags: rule.tags,
        content: rule.content,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt
        })
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  return readRulesLocal();
}

function normalizeRule(rule) {
  const now = Date.now();
  const createdAt = Number(new Date(rule.createdAt || now)) || now;
  const updatedAt = Number(new Date(rule.updatedAt || createdAt)) || createdAt;
  const tags = normalizeRuleTags(rule.tags || rule.tag);

  return {
    id: String(rule.id || createRuleId()),
    title: String(rule.title || "").trim(),
    tag: tags.join(", "),
    tags,
    content: String(rule.content || "").trim(),
    createdAt,
    updatedAt
  };
}

function normalizeRuleTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const seen = new Set();
  return rawTags
    .map(tag => String(tag || "").trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function createRuleId() {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function renderRules(options = {}) {
  const requestId = ++rulesLoadRequest;
  const remote = AUTH.isBackendEnabled() && !options.preferCache;
  if (remote) setRulesLoadState("loading");
  try {
    const loadedRules = await loadRules(options);
    // Realtime, retry and post-save reads may overlap. Only the newest read
    // owns the visible list and its cache; an old response must not undo it.
    if (requestId !== rulesLoadRequest) return;
    rulesCache = loadedRules;
    if (remote) {
      try { writeRulesLocal(rulesCache); } catch {}
    }
    setRulesLoadState("ready");
    renderRulesFromCache();
  } catch (error) {
    if (requestId !== rulesLoadRequest) return;
    setRulesLoadState("error");
    throw error;
  }
}

function setRulesLoadState(state) {
  // A read started before the write outcome (including realtime while it was
  // pending) cannot confirm that outcome. Only a newly issued read may do so.
  if (state === "unconfirmed") rulesLoadRequest++;
  rulesLoadState = state;
  const list = document.getElementById("rulesList");
  if (!list) return;
  let notice = document.getElementById("rulesLoadStatus");
  if (!notice) {
    notice = document.createElement("p");
    notice.id = "rulesLoadStatus";
    notice.className = "rules-form-status";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    list.before(notice);
  }
  list.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  notice.hidden = state === "ready";
  const cached = rulesCache.length > 0;
  notice.replaceChildren(document.createTextNode(state === "loading"
    ? (cached ? "Atualizando regras; a versão anterior continua disponível." : "Carregando regras…")
    : state === "unconfirmed" ? "Confira a lista para confirmar o resultado da ação antes de tentar novamente. "
    : (cached ? "Não foi possível atualizar as regras. A lista exibida pode estar desatualizada. " : "Não foi possível carregar as regras. ")));
  if (state === "error" || state === "unconfirmed") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "rule-btn";
    retry.textContent = state === "unconfirmed" ? "Atualizar lista" : "Tentar novamente";
    retry.addEventListener("click", () => { void renderRules().catch(() => {}); });
    notice.append(retry);
  }
  if (!cached && state !== "ready") {
    list.innerHTML = state === "loading" ? '<p class="empty-msg">Aguarde o carregamento.</p>' : "";
    document.getElementById("ruleCount")?.replaceChildren(document.createTextNode("—"));
    document.getElementById("rulesUpdatedText")?.replaceChildren(document.createTextNode("Lista ainda não confirmada."));
  }
}

function syncRulesMutationControls() {
  const busy = rulesSaving || rulesDeleting;
  ["saveRuleBtn", "cancelEditBtn"].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = busy; });
  ["ruleTitle", "ruleTag", "ruleContent"].forEach(id => { const field = document.getElementById(id); if (field) field.readOnly = busy; });
  document.querySelectorAll("#rulesList .rule-actions button").forEach(button => { button.disabled = busy; });
  const save = document.getElementById("saveRuleBtn");
  if (rulesSaving) save?.setAttribute("aria-busy", "true");
  else save?.removeAttribute("aria-busy");
}

function ruleWriteErrorMessage(error) {
  if ([401, 403].includes(Number(error?.status))) return "Você não tem autorização para salvar esta postagem. Entre novamente com a conta do mestre; seu rascunho foi mantido.";
  if (Number(error?.status) === 400) return "Não foi possível salvar. Revise o título e o conteúdo; seu rascunho foi mantido.";
  if (Number(error?.status) === 409) return "Esta postagem mudou enquanto você a editava. Atualize a lista e confira a versão publicada antes de tentar novamente; seu rascunho foi mantido.";
  return "Não foi possível confirmar o salvamento. Seu rascunho foi mantido. Atualize a lista e confira se a postagem foi salva antes de tentar novamente.";
}

function showRuleWriteError(error) {
  const notice = document.getElementById("ruleFormError");
  if (notice) notice.textContent = ruleWriteErrorMessage(error);
  const status = document.getElementById("ruleFormStatus");
  if (status) status.textContent = "";
  if (AUTH.isBackendEnabled() && ![400, 401, 403].includes(Number(error?.status))) setRulesLoadState("unconfirmed");
}

function renderRulesFromCache() {
  const rules = rulesCache
    .map(normalizeRule)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const filteredRules = filterRules(rules);
  const ruleCount = document.getElementById("ruleCount");
  const lastRuleUpdate = document.getElementById("lastRuleUpdate");
  const rulesUpdatedText = document.getElementById("rulesUpdatedText");
  const rulesList = document.getElementById("rulesList");
  const isMaster = currentSession.role === "master";

  renderRuleTagFilters(rules);

  if (ruleCount) {
    ruleCount.textContent = filteredRules.length === rules.length
      ? String(rules.length)
      : `${filteredRules.length}/${rules.length}`;
  }
  if (lastRuleUpdate) {
    lastRuleUpdate.textContent = rules.length ? formatRuleDate(rules[0].updatedAt) : "Nenhuma";
  }
  if (rulesUpdatedText) {
    rulesUpdatedText.textContent = rules.length
      ? `${filteredRules.length} de ${rules.length} regra(s) exibida(s). Atualizado em ${formatRuleDateTime(rules[0].updatedAt)}`
      : "Nenhuma regra publicada.";
  }

  if (!rulesList) return;

  if (!rules.length) {
    if (rulesLoadState !== "ready") { setRulesLoadState(rulesLoadState); return; }
    rulesList.innerHTML = `<p class="empty-msg">${isMaster ? "Nenhuma regra publicada. Use Nova postagem para publicar a primeira." : "Nenhuma regra publicada. Aguarde as postagens do mestre."}</p>`;
    return;
  }

  if (!filteredRules.length) {
    rulesList.innerHTML = '<p class="empty-msg">Nenhuma regra encontrada com os filtros atuais.</p>';
    return;
  }

  rulesList.innerHTML = filteredRules
    .map(rule => `
      <article class="rule-card">
        <div class="rule-card-head">
          <div class="rule-card-head-main">
            ${renderRuleTags(rule)}
            <h3 class="rule-card-title">${esc(rule.title || "Regra sem titulo")}</h3>
            <div class="rule-card-meta">
              <span>Criada em ${esc(formatRuleDateTime(rule.createdAt))}</span>
              <span>Atualizada em ${esc(formatRuleDateTime(rule.updatedAt))}</span>
            </div>
          </div>
          ${
            isMaster
              ? `
                <div class="rule-actions">
                  <button class="rule-btn" onclick="editRule('${jsEsc(rule.id)}')">Editar</button>
                  <button class="rule-btn rule-btn-danger" data-delete-rule="${esc(rule.id)}" onclick="deleteRule('${jsEsc(rule.id)}')">Excluir</button>
                </div>
              `
              : ""
          }
        </div>

        <p class="rule-card-content">${esc(rule.content || "Sem conteudo.")}</p>
      </article>
    `)
    .join("");
  syncRulesMutationControls();
}

function renderRuleTags(rule) {
  const tags = normalizeRuleTags(rule.tags || rule.tag);
  if (!tags.length) return "";
  return `<div class="rule-tag-row">${tags.map(tag => `<span class="rule-tag rule-tag-chip">${esc(tag)}</span>`).join("")}</div>`;
}

function getAllRuleTags(rules) {
  const tagMap = new Map();
  rules.forEach(rule => {
    normalizeRuleTags(rule.tags || rule.tag).forEach(tag => {
      const key = tag.toLowerCase();
      if (!tagMap.has(key)) tagMap.set(key, tag);
    });
  });
  return [...tagMap.values()].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function renderRuleTagFilters(rules) {
  const filters = document.getElementById("rulesTagFilters");
  if (!filters) return;
  const tags = getAllRuleTags(rules);
  if (!tags.length) {
    filters.innerHTML = '<span class="empty-msg">Nenhuma tag publicada.</span>';
    return;
  }
  filters.innerHTML = tags.map(tag => {
    const active = rulesFilters.tag.toLowerCase() === tag.toLowerCase();
    return `
      <button
        type="button"
        class="rule-tag-filter ${active ? "is-active" : ""}"
        data-rule-tag-filter="${esc(tag)}"
        aria-pressed="${active ? "true" : "false"}"
      >${esc(tag)}</button>
    `;
  }).join("");
}

function filterRules(rules) {
  const query = rulesFilters.query.trim().toLowerCase();
  const selectedTag = rulesFilters.tag.trim().toLowerCase();
  return rules.filter(rule => {
    const tags = normalizeRuleTags(rule.tags || rule.tag);
    const matchesTag = !selectedTag || tags.some(tag => tag.toLowerCase() === selectedTag);
    const haystack = [
      rule.title,
      rule.content,
      ...tags
    ].join(" ").toLowerCase();
    return matchesTag && (!query || haystack.includes(query));
  });
}

function resetRuleForm(force = false) {
  if ((rulesSaving || rulesDeleting) && !force) return;
  editingRuleId = null;

  setFormValue("ruleTitle", "");
  setFormValue("ruleTag", "");
  setFormValue("ruleContent", "");

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const ruleFormTitle = document.getElementById("ruleFormTitle");
  const saveRuleBtn = document.getElementById("saveRuleBtn");
  const ruleFormError = document.getElementById("ruleFormError");
  const ruleFormStatus = document.getElementById("ruleFormStatus");
  const ruleContent = document.getElementById("ruleContent");

  if (cancelEditBtn) cancelEditBtn.hidden = true;
  if (ruleFormTitle) ruleFormTitle.textContent = "Nova postagem";
  if (saveRuleBtn) saveRuleBtn.textContent = "Publicar regra";
  if (ruleFormError) ruleFormError.textContent = "";
  if (ruleFormStatus) {
    ruleFormStatus.textContent = "";
    ruleFormStatus.className = "rules-form-status";
  }
  if (ruleContent instanceof HTMLTextAreaElement) autoGrowTextarea(ruleContent);
}

function editRule(ruleId) {
  if (rulesSaving || rulesDeleting || currentSession.role !== "master") return;

  const rule = rulesCache.find(candidate => candidate.id === ruleId);
  if (!rule) return;

  editingRuleId = rule.id;

  setFormValue("ruleTitle", rule.title);
  setFormValue("ruleTag", rule.tag);
  setFormValue("ruleContent", rule.content);

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const ruleFormTitle = document.getElementById("ruleFormTitle");
  const saveRuleBtn = document.getElementById("saveRuleBtn");
  const ruleFormStatus = document.getElementById("ruleFormStatus");
  const rulesEditor = document.getElementById("rulesEditor");
  const ruleContent = document.getElementById("ruleContent");

  if (cancelEditBtn) cancelEditBtn.hidden = false;
  if (ruleFormTitle) ruleFormTitle.textContent = "Editar postagem";
  if (saveRuleBtn) saveRuleBtn.textContent = "Salvar alterações";
  if (ruleFormStatus) {
    ruleFormStatus.textContent = "Modo de edição ativo.";
    ruleFormStatus.className = "rules-form-status";
  }
  if (ruleContent instanceof HTMLTextAreaElement) autoGrowTextarea(ruleContent);
  if (rulesEditor) rulesEditor.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveRule() {
  if (rulesSaving || rulesDeleting) return;
  rulesSaving = true;
  syncRulesMutationControls();
  try { await saveRuleOnce(); }
  catch (error) { showRuleWriteError(error); }
  finally {
    rulesSaving = false;
    syncRulesMutationControls();
  }
}
async function saveRuleOnce() {
  if (currentSession.role !== "master") return;

  const wasEditing = Boolean(editingRuleId);
  const title = getFormValue("ruleTitle").trim();
  const tags = normalizeRuleTags(getFormValue("ruleTag"));
  const tag = tags.join(", ");
  const content = getFormValue("ruleContent").trim();
  const ruleFormError = document.getElementById("ruleFormError");
  const ruleFormStatus = document.getElementById("ruleFormStatus");

  if (ruleFormError) ruleFormError.textContent = "";
  if (ruleFormStatus) {
    ruleFormStatus.textContent = "";
    ruleFormStatus.className = "rules-form-status";
  }

  if (!title) {
    if (ruleFormError) ruleFormError.textContent = "Informe um título para a postagem.";
    document.getElementById("ruleTitle")?.focus();
    return;
  }

  if (!content) {
    if (ruleFormError) ruleFormError.textContent = "Escreva o conteúdo da regra.";
    document.getElementById("ruleContent")?.focus();
    return;
  }

  if (ruleFormStatus) ruleFormStatus.textContent = "Salvando postagem…";

  if (AUTH.isBackendEnabled()) {
    try {
      if (editingRuleId) {
        await APP.updateRule(editingRuleId, { title, tag, tags, content });
      } else {
        await APP.createRule({ title, tag, tags, content });
      }
    } catch (error) {
      showRuleWriteError(error);
      return;
    }
  } else {
    const rules = readRulesLocal();
    const now = Date.now();

    if (editingRuleId) {
      const index = rules.findIndex(rule => rule.id === editingRuleId);
      if (index >= 0) {
        rules[index] = normalizeRule({
          ...rules[index],
          title,
          tag,
          tags,
          content,
          updatedAt: now
        });
      }
    } else {
      rules.push(
        normalizeRule({
          id: createRuleId(),
          title,
          tag,
          tags,
          content,
          createdAt: now,
          updatedAt: now
        })
      );
    }

    writeRulesLocal(rules);
  }

  // The write succeeded. Reset before refreshing, so a failed list request
  // cannot leave a new post ready to be submitted a second time.
  resetRuleForm(true);
  try { await renderRules(); }
  catch { if (ruleFormStatus) ruleFormStatus.textContent = 'Postagem salva. Não foi possível atualizar a lista; recarregue a página.'; return; }

  if (ruleFormStatus) {
    ruleFormStatus.textContent = wasEditing
      ? "Postagem atualizada com sucesso."
      : "Nova regra publicada com sucesso.";
    ruleFormStatus.className = "rules-form-status is-success";
  }
}

async function deleteRule(ruleId) {
  if (rulesSaving || rulesDeleting || currentSession.role !== "master") return;

  const rule = rulesCache.find(candidate => candidate.id === ruleId);
  if (!rule) return;

  rulesDeleting = true;
  syncRulesMutationControls();
  let deleted = false;
  const deleteButton = [...document.querySelectorAll("[data-delete-rule]")].find(button => button.dataset.deleteRule === ruleId);
  try {
    const confirmed = await UI.confirm(`Excluir a postagem "${rule.title || "Regra sem título"}"?`, {
      title: "Excluir regra",
      kicker: "// Arquivo da campanha",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger"
    });
    if (!confirmed) return;
    if (deleteButton) deleteButton.textContent = "Excluindo…";
    if (AUTH.isBackendEnabled()) await APP.deleteRule(ruleId);
    else writeRulesLocal(rulesCache.filter(candidate => candidate.id !== ruleId));
    deleted = true;
    rulesCache = rulesCache.filter(candidate => candidate.id !== ruleId);
    renderRulesFromCache();

    if (editingRuleId === ruleId) resetRuleForm(true);

    await renderRules();
  } catch (error) {
    if (!deleted && AUTH.isBackendEnabled()) setRulesLoadState("unconfirmed");
    UI.toast(deleted
      ? "Postagem excluída. Não foi possível atualizar a lista; tente novamente na lista."
      : "Não foi possível confirmar a exclusão. Atualize a lista e confira se a postagem ainda existe antes de tentar novamente.", { kicker: "// Regras" });
  } finally {
    if (deleteButton?.isConnected) deleteButton.textContent = "Excluir";
    rulesDeleting = false;
    syncRulesMutationControls();
  }
}

function getFormValue(id) {
  return document.getElementById(id)?.value || "";
}

function setFormValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function formatRuleDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatRuleDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsEsc(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
