const SUGGESTIONS_KEY = "tc_suggestions_posts";

let currentSession = null;
let editingSuggestionId = null;
let suggestionsCache = [];
let suggestionsRealtimeBound = false;

function initSuggestionsPageGlow() {
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

function preFillSuggestionsPage() {
  try {
    const s = JSON.parse(localStorage.getItem("tc_session"));
    if (!s?.username) return;
    const isMaster = s.role === "master";
    const suggestionsUser = document.getElementById("suggestionsUser");
    const suggestionsRoleLabel = document.getElementById("suggestionsRoleLabel");
    const suggestionsHeaderRole = document.getElementById("suggestionsHeaderRole");
    const suggestionsIntro = document.getElementById("suggestionsIntro");
    if (suggestionsUser) suggestionsUser.textContent = s.username;
    if (suggestionsRoleLabel) suggestionsRoleLabel.textContent = isMaster ? "Mestre" : "Jogador";
    if (suggestionsHeaderRole) suggestionsHeaderRole.textContent = isMaster ? "Painel do mestre" : "Sugestoes";
    if (suggestionsIntro) suggestionsIntro.textContent = isMaster
      ? "Todos podem enviar ideias. Voce pode editar ou excluir sugestoes para manter a lista organizada."
      : "Envie ideias de melhoria para o site e acompanhe as sugestoes ja registradas pela campanha.";
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", async () => {
  initSuggestionsPageGlow();
  preFillSuggestionsPage();

  await AUTH_READY;
  currentSession = AUTH.requireAuth();
  if (!currentSession) return;

  setupSuggestionsPage();
  bindSuggestionsRealtime();
  await renderSuggestions({ preferCache: true });
  if (AUTH.isBackendEnabled()) {
    renderSuggestions().catch(() => {});
  }

  if (!AUTH.isBackendEnabled()) {
    window.addEventListener("storage", event => {
      if (event.key === SUGGESTIONS_KEY) renderSuggestions();
    });
  }
});

function bindSuggestionsRealtime() {
  if (suggestionsRealtimeBound || !AUTH.isBackendEnabled()) return;
  suggestionsRealtimeBound = true;

  APP.on("suggestions:changed", async () => {
    try {
      await renderSuggestions();
    } catch {}
  });
}

function setupSuggestionsPage() {
  const suggestionsUser = document.getElementById("suggestionsUser");
  const suggestionsRoleLabel = document.getElementById("suggestionsRoleLabel");
  const suggestionsHeaderRole = document.getElementById("suggestionsHeaderRole");
  const suggestionsIntro = document.getElementById("suggestionsIntro");
  const suggestionContent = document.getElementById("suggestionContent");
  const isMaster = currentSession.role === "master";

  if (suggestionsUser) suggestionsUser.textContent = currentSession.username || "";
  if (suggestionsRoleLabel) suggestionsRoleLabel.textContent = isMaster ? "Mestre" : "Jogador";
  if (suggestionsHeaderRole) suggestionsHeaderRole.textContent = isMaster ? "Painel do mestre" : "Sugestoes";

  if (suggestionsIntro) {
    suggestionsIntro.textContent = isMaster
      ? "Todos podem enviar ideias. Voce pode editar ou excluir sugestoes para manter a lista organizada."
      : "Envie ideias de melhoria para o site e acompanhe as sugestoes ja registradas pela campanha.";
  }

  if (suggestionContent instanceof HTMLTextAreaElement) {
    suggestionContent.addEventListener("input", () => autoGrowTextarea(suggestionContent));
    autoGrowTextarea(suggestionContent);
  }

  resetSuggestionForm();
}

function readSuggestionsLocal() {
  try {
    return JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || "[]")
      .map(normalizeSuggestion)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

function writeSuggestionsLocal(suggestions) {
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions.map(normalizeSuggestion)));
}

async function loadSuggestions(options = {}) {
  const { preferCache = false } = options;

  if (AUTH.isBackendEnabled()) {
    if (preferCache) {
      suggestionsCache = readSuggestionsLocal();
      return suggestionsCache;
    }

    const remoteSuggestions = await APP.listSuggestions();
    suggestionsCache = remoteSuggestions
      .map(suggestion =>
        normalizeSuggestion({
          id: suggestion.id,
          title: suggestion.title,
          category: suggestion.category,
          description: suggestion.description,
          author: suggestion.author,
          createdAt: suggestion.createdAt,
          updatedAt: suggestion.updatedAt
        })
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
    writeSuggestionsLocal(suggestionsCache);
    return suggestionsCache;
  }

  suggestionsCache = readSuggestionsLocal();
  return suggestionsCache;
}

function normalizeSuggestion(suggestion) {
  const now = Date.now();
  const createdAt = Number(new Date(suggestion.createdAt || now)) || now;
  const updatedAt = Number(new Date(suggestion.updatedAt || createdAt)) || createdAt;

  return {
    id: String(suggestion.id || createSuggestionId()),
    title: String(suggestion.title || "").trim(),
    category: String(suggestion.category || suggestion.tag || "").trim(),
    description: String(suggestion.description || suggestion.content || "").trim(),
    author: String(suggestion.author || suggestion.createdBy || "").trim(),
    createdAt,
    updatedAt
  };
}

function createSuggestionId() {
  return `suggestion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function renderSuggestions(options = {}) {
  const suggestions = await loadSuggestions(options);
  const suggestionCount = document.getElementById("suggestionCount");
  const lastSuggestionUpdate = document.getElementById("lastSuggestionUpdate");
  const suggestionsUpdatedText = document.getElementById("suggestionsUpdatedText");
  const suggestionsList = document.getElementById("suggestionsList");
  const isMaster = currentSession.role === "master";

  if (suggestionCount) suggestionCount.textContent = String(suggestions.length);
  if (lastSuggestionUpdate) {
    lastSuggestionUpdate.textContent = suggestions.length ? formatSuggestionDate(suggestions[0].updatedAt) : "Nenhuma";
  }
  if (suggestionsUpdatedText) {
    suggestionsUpdatedText.textContent = suggestions.length
      ? `Atualizado em ${formatSuggestionDateTime(suggestions[0].updatedAt)}`
      : "Nenhuma sugestao enviada.";
  }

  if (!suggestionsList) return;

  if (!suggestions.length) {
    suggestionsList.innerHTML = '<p class="empty-msg">Nenhuma sugestao enviada.</p>';
    return;
  }

  suggestionsList.innerHTML = suggestions
    .map(
      suggestion => `
        <article class="rule-card">
          <div class="rule-card-head">
            <div class="rule-card-head-main">
              ${suggestion.category ? `<span class="rule-tag">${esc(suggestion.category)}</span>` : ""}
              <h3 class="rule-card-title">${esc(suggestion.title || "Sugestao sem titulo")}</h3>
              <div class="rule-card-meta">
                <span>Autor: ${esc(suggestion.author || "Nao informado")}</span>
                <span>Criada em ${esc(formatSuggestionDateTime(suggestion.createdAt))}</span>
                <span>Atualizada em ${esc(formatSuggestionDateTime(suggestion.updatedAt))}</span>
              </div>
            </div>
            ${renderSuggestionActions(suggestion, isMaster)}
          </div>

          <p class="rule-card-content">${esc(suggestion.description || "Sem descricao.")}</p>
        </article>
      `
    )
    .join("");
}

/**
 * Acoes de um card de sugestao (2026-08-02).
 *
 * Mestre: editar + excluir qualquer uma. AUTOR: excluir a propria — quem
 * mandou pode se arrepender e retirar, mas nao reescreve o texto depois
 * de enviado (editar continua so do mestre, no cliente e no Worker).
 * Quem nao e nenhum dos dois nao ve botao nenhum.
 */
function renderSuggestionActions(suggestion, isMaster) {
  const author = String(suggestion?.author || "").trim().toLowerCase();
  const me = String(currentSession?.username || "").trim().toLowerCase();
  const isAuthor = Boolean(author && me && author === me);

  if (!isMaster && !isAuthor) return "";

  const editar = isMaster
    ? `<button class="rule-btn" onclick="editSuggestion('${jsEsc(suggestion.id)}')">Editar</button>`
    : "";

  return `
    <div class="rule-actions">
      ${editar}
      <button class="rule-btn rule-btn-danger" onclick="deleteSuggestion('${jsEsc(suggestion.id)}')">Excluir</button>
    </div>
  `;
}

function resetSuggestionForm() {
  editingSuggestionId = null;

  setFormValue("suggestionTitle", "");
  setFormValue("suggestionCategory", "");
  setFormValue("suggestionContent", "");

  const cancelEditBtn = document.getElementById("cancelSuggestionEditBtn");
  const suggestionFormTitle = document.getElementById("suggestionFormTitle");
  const suggestionFormKicker = document.getElementById("suggestionFormKicker");
  const saveSuggestionBtn = document.getElementById("saveSuggestionBtn");
  const suggestionFormError = document.getElementById("suggestionFormError");
  const suggestionFormStatus = document.getElementById("suggestionFormStatus");
  const suggestionContent = document.getElementById("suggestionContent");

  if (cancelEditBtn) cancelEditBtn.hidden = true;
  if (suggestionFormTitle) suggestionFormTitle.textContent = "Nova sugestao";
  if (suggestionFormKicker) suggestionFormKicker.textContent = "// Enviar sugestao";
  if (saveSuggestionBtn) saveSuggestionBtn.textContent = "Enviar sugestao";
  if (suggestionFormError) suggestionFormError.textContent = "";
  if (suggestionFormStatus) {
    suggestionFormStatus.textContent = "";
    suggestionFormStatus.className = "rules-form-status";
  }
  if (suggestionContent instanceof HTMLTextAreaElement) autoGrowTextarea(suggestionContent);
}

function editSuggestion(suggestionId) {
  if (currentSession.role !== "master") return;

  const suggestion = suggestionsCache.find(candidate => candidate.id === suggestionId);
  if (!suggestion) return;

  editingSuggestionId = suggestion.id;

  setFormValue("suggestionTitle", suggestion.title);
  setFormValue("suggestionCategory", suggestion.category);
  setFormValue("suggestionContent", suggestion.description);

  const cancelEditBtn = document.getElementById("cancelSuggestionEditBtn");
  const suggestionFormTitle = document.getElementById("suggestionFormTitle");
  const suggestionFormKicker = document.getElementById("suggestionFormKicker");
  const saveSuggestionBtn = document.getElementById("saveSuggestionBtn");
  const suggestionFormStatus = document.getElementById("suggestionFormStatus");
  const suggestionsEditor = document.getElementById("suggestionsEditor");
  const suggestionContent = document.getElementById("suggestionContent");

  if (cancelEditBtn) cancelEditBtn.hidden = false;
  if (suggestionFormTitle) suggestionFormTitle.textContent = "Editar sugestao";
  if (suggestionFormKicker) suggestionFormKicker.textContent = "// Painel do mestre";
  if (saveSuggestionBtn) saveSuggestionBtn.textContent = "Salvar alteracoes";
  if (suggestionFormStatus) {
    suggestionFormStatus.textContent = "Modo de edicao ativo.";
    suggestionFormStatus.className = "rules-form-status";
  }
  if (suggestionContent instanceof HTMLTextAreaElement) autoGrowTextarea(suggestionContent);
  if (suggestionsEditor) suggestionsEditor.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveSuggestion() {
  const wasEditing = Boolean(editingSuggestionId);
  if (wasEditing && currentSession.role !== "master") return;

  const title = getFormValue("suggestionTitle").trim();
  const category = getFormValue("suggestionCategory").trim();
  const description = getFormValue("suggestionContent").trim();
  const suggestionFormError = document.getElementById("suggestionFormError");
  const suggestionFormStatus = document.getElementById("suggestionFormStatus");

  if (suggestionFormError) suggestionFormError.textContent = "";
  if (suggestionFormStatus) {
    suggestionFormStatus.textContent = "";
    suggestionFormStatus.className = "rules-form-status";
  }

  if (!title) {
    if (suggestionFormError) suggestionFormError.textContent = "Informe um titulo para a sugestao.";
    document.getElementById("suggestionTitle")?.focus();
    return;
  }

  if (!description) {
    if (suggestionFormError) suggestionFormError.textContent = "Descreva a sugestao.";
    document.getElementById("suggestionContent")?.focus();
    return;
  }

  if (AUTH.isBackendEnabled()) {
    try {
      if (editingSuggestionId) {
        await APP.updateSuggestion(editingSuggestionId, { title, category, description });
      } else {
        await APP.createSuggestion({ title, category, description });
      }
    } catch (error) {
      if (suggestionFormError) suggestionFormError.textContent = error?.message || "Falha ao salvar a sugestao.";
      return;
    }
  } else {
    const suggestions = readSuggestionsLocal();
    const now = Date.now();

    if (editingSuggestionId) {
      const index = suggestions.findIndex(suggestion => suggestion.id === editingSuggestionId);
      if (index >= 0 && currentSession.role === "master") {
        suggestions[index] = normalizeSuggestion({
          ...suggestions[index],
          title,
          category,
          description,
          updatedAt: now
        });
      }
    } else {
      suggestions.push(
        normalizeSuggestion({
          id: createSuggestionId(),
          title,
          category,
          description,
          author: currentSession.username || "",
          createdAt: now,
          updatedAt: now
        })
      );
    }

    writeSuggestionsLocal(suggestions);
  }

  await renderSuggestions();
  resetSuggestionForm();

  if (suggestionFormStatus) {
    suggestionFormStatus.textContent = wasEditing
      ? "Sugestao atualizada com sucesso."
      : "Sugestao enviada com sucesso.";
    suggestionFormStatus.className = "rules-form-status is-success";
  }
}

async function deleteSuggestion(suggestionId) {
  const suggestion = suggestionsCache.find(candidate => candidate.id === suggestionId);
  if (!suggestion) return;

  // Mestre apaga qualquer uma; jogador so a propria (2026-08-02). Mesma
  // regra do Worker — aqui e conforto, la e a barreira.
  if (currentSession.role !== "master") {
    const author = String(suggestion.author || "").trim().toLowerCase();
    const me = String(currentSession?.username || "").trim().toLowerCase();
    if (!author || !me || author !== me) return;
  }

  const confirmed = await UI.confirm(`Excluir a sugestao "${suggestion.title || "Sugestao sem titulo"}"?`, {
    title: "Excluir sugestao",
    kicker: "// Melhorias do site",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (AUTH.isBackendEnabled()) {
    await APP.deleteSuggestion(suggestionId);
  } else {
    writeSuggestionsLocal(suggestionsCache.filter(candidate => candidate.id !== suggestionId));
  }

  if (editingSuggestionId === suggestionId) {
    resetSuggestionForm();
  }

  await renderSuggestions();
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

function formatSuggestionDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatSuggestionDateTime(value) {
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
