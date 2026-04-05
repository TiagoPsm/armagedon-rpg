const RULES_KEY = "tc_rules_posts";

let currentSession = null;
let editingRuleId = null;
let rulesCache = [];
let rulesRealtimeBound = false;

document.addEventListener("DOMContentLoaded", async () => {
  await AUTH_READY;
  currentSession = AUTH.requireAuth();
  if (!currentSession) return;

  setupRulesPage();
  bindRulesRealtime();
  await renderRules();

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
  const rulesUser = document.getElementById("rulesUser");
  const rulesRoleLabel = document.getElementById("rulesRoleLabel");
  const rulesHeaderRole = document.getElementById("rulesHeaderRole");
  const rulesIntro = document.getElementById("rulesIntro");
  const rulesEditor = document.getElementById("rulesEditor");
  const playerNotice = document.getElementById("playerNotice");
  const ruleContent = document.getElementById("ruleContent");
  const isMaster = currentSession.role === "master";

  if (rulesUser) rulesUser.textContent = currentSession.username || "";
  if (rulesRoleLabel) rulesRoleLabel.textContent = isMaster  "Mestre" : "Jogador";
  if (rulesHeaderRole) rulesHeaderRole.textContent = isMaster  "Painel do mestre" : "Arquivo de regras";

  if (rulesIntro) {
    rulesIntro.textContent = isMaster
       "Você pode publicar, editar e manter organizadas as regras oficiais da campanha."
      : "Aqui ficam as regras oficiais publicadas pelo mestre para consulta de todos os jogadores.";
  }

  if (rulesEditor) rulesEditor.hidden = !isMaster;
  if (playerNotice) playerNotice.hidden = isMaster;

  if (ruleContent instanceof HTMLTextAreaElement) {
    ruleContent.addEventListener("input", () => autoGrowTextarea(ruleContent));
    autoGrowTextarea(ruleContent);
  }

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

async function loadRules() {
  if (AUTH.isBackendEnabled()) {
    const remoteRules = await APP.listRules();
    rulesCache = remoteRules
      .map(rule =>
        normalizeRule({
          id: rule.id,
          title: rule.title,
          tag: rule.tag,
          content: rule.content,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt
        })
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
    return rulesCache;
  }

  rulesCache = readRulesLocal();
  return rulesCache;
}

function normalizeRule(rule) {
  const now = Date.now();
  const createdAt = Number(new Date(rule.createdAt || now)) || now;
  const updatedAt = Number(new Date(rule.updatedAt || createdAt)) || createdAt;

  return {
    id: String(rule.id || createRuleId()),
    title: String(rule.title || "").trim(),
    tag: String(rule.tag || "").trim(),
    content: String(rule.content || "").trim(),
    createdAt,
    updatedAt
  };
}

function createRuleId() {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function renderRules() {
  const rules = await loadRules();
  const ruleCount = document.getElementById("ruleCount");
  const lastRuleUpdate = document.getElementById("lastRuleUpdate");
  const rulesUpdatedText = document.getElementById("rulesUpdatedText");
  const rulesList = document.getElementById("rulesList");
  const isMaster = currentSession.role === "master";

  if (ruleCount) ruleCount.textContent = String(rules.length);
  if (lastRuleUpdate) {
    lastRuleUpdate.textContent = rules.length  formatRuleDate(rules[0].updatedAt) : "Nenhuma";
  }
  if (rulesUpdatedText) {
    rulesUpdatedText.textContent = rules.length
       `Atualizado em ${formatRuleDateTime(rules[0].updatedAt)}`
      : "Nenhuma regra publicada.";
  }

  if (!rulesList) return;

  if (!rules.length) {
    rulesList.innerHTML = '<p class="empty-msg">Nenhuma regra publicada.</p>';
    return;
  }

  rulesList.innerHTML = rules
    .map(
      rule => `
        <article class="rule-card">
          <div class="rule-card-head">
            <div class="rule-card-head-main">
              ${rule.tag  `<span class="rule-tag">${esc(rule.tag)}</span>` : ""}
              <h3 class="rule-card-title">${esc(rule.title || "Regra sem título")}</h3>
              <div class="rule-card-meta">
                <span>Criada em ${esc(formatRuleDateTime(rule.createdAt))}</span>
                <span>Atualizada em ${esc(formatRuleDateTime(rule.updatedAt))}</span>
              </div>
            </div>
            ${
              isMaster
                 `
                  <div class="rule-actions">
                    <button class="rule-btn" onclick="editRule('${jsEsc(rule.id)}')">Editar</button>
                    <button class="rule-btn rule-btn-danger" onclick="deleteRule('${jsEsc(rule.id)}')">Excluir</button>
                  </div>
                `
                : ""
            }
          </div>

          <p class="rule-card-content">${esc(rule.content || "Sem conteúdo.")}</p>
        </article>
      `
    )
    .join("");
}

function resetRuleForm() {
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
  if (currentSession.role !== "master") return;

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
  const ruleContent = document.getElementById("ruleContent");

  if (cancelEditBtn) cancelEditBtn.hidden = false;
  if (ruleFormTitle) ruleFormTitle.textContent = "Editar postagem";
  if (saveRuleBtn) saveRuleBtn.textContent = "Salvar alterações";
  if (ruleFormStatus) {
    ruleFormStatus.textContent = "Modo de edição ativo.";
    ruleFormStatus.className = "rules-form-status";
  }
  if (ruleContent instanceof HTMLTextAreaElement) autoGrowTextarea(ruleContent);

  document.getElementById("rulesEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveRule() {
  if (currentSession.role !== "master") return;

  const wasEditing = Boolean(editingRuleId);
  const title = getFormValue("ruleTitle").trim();
  const tag = getFormValue("ruleTag").trim();
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
    document.getElementById("ruleTitle").focus();
    return;
  }

  if (!content) {
    if (ruleFormError) ruleFormError.textContent = "Escreva o conteúdo da regra.";
    document.getElementById("ruleContent").focus();
    return;
  }

  if (AUTH.isBackendEnabled()) {
    try {
      if (editingRuleId) {
        await APP.updateRule(editingRuleId, { title, tag, content });
      } else {
        await APP.createRule({ title, tag, content });
      }
    } catch (error) {
      if (ruleFormError) ruleFormError.textContent = error.message || "Falha ao salvar a postagem.";
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
          content,
          createdAt: now,
          updatedAt: now
        })
      );
    }

    writeRulesLocal(rules);
  }

  await renderRules();
  resetRuleForm();

  if (ruleFormStatus) {
    ruleFormStatus.textContent = wasEditing
       "Postagem atualizada com sucesso."
      : "Nova regra publicada com sucesso.";
    ruleFormStatus.className = "rules-form-status is-success";
  }
}

async function deleteRule(ruleId) {
  if (currentSession.role !== "master") return;

  const rule = rulesCache.find(candidate => candidate.id === ruleId);
  if (!rule) return;

  const confirmed = await UI.confirm(`Excluir a postagem "${rule.title || "Regra sem título"}"`, {
    title: "Excluir regra",
    kicker: "// Arquivo da campanha",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (AUTH.isBackendEnabled()) {
    await APP.deleteRule(ruleId);
  } else {
    writeRulesLocal(rulesCache.filter(candidate => candidate.id !== ruleId));
  }

  if (editingRuleId === ruleId) {
    resetRuleForm();
  }

  await renderRules();
}

function getFormValue(id) {
  return document.getElementById(id).value || "";
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
