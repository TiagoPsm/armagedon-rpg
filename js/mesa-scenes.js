/* ============================================================
 * mesa-scenes.js — Gaveta de cenas (Etapa 49; reescrita na Etapa 89)
 *
 * O gerenciador de cenas era uma listinha dentro do painel do mapa, com
 * window.prompt() para nomear e window.confirm() para excluir. Os dois sao
 * barreira de acessibilidade: o leitor de tela anuncia mal, nao ha como
 * marcar qual campo e qual, o dialogo nativo trava a aba inteira e nao
 * aceita estilo nenhum. Agora e uma gaveta que desce sobre a mesa, com
 * dialogo proprio, foco preso enquanto aberta, Esc para fechar e foco de
 * volta no botao que abriu.
 *
 * Master-only e so com backend: multi-cena vive no D1, o modo local
 * continua com a cena unica de sempre. As acoes batem nas rotas da Etapa 48
 * pela fachada window.APP; a troca chega a todos por mesa:scene:switch
 * (tratado em mesa-core.js).
 * ============================================================ */

"use strict";

let _scenesCache = [];
let _foldersCache = [];
// "" = raiz ("Todas as cenas"). Filtro de tela, nao viaja para lugar nenhum.
let _activeFolderId = "";
let _scenesBusy = false;
let _drawerOpen = false;
let _sceneSearchTerm = "";
// Estado do dialogo de nome: qual acao ele vai executar quando salvar.
let _nameDialogMode = null;   // "create" | "rename" | "folder-create" | "folder-rename"
let _nameDialogSceneId = "";

function _isScenesManagerEnabled() {
  return (
    typeof isMaster === "function" && isMaster()
    && window.AUTH?.isBackendEnabled?.()
    && typeof window.APP?.getMesaScenes === "function"
  );
}

function _el(id) {
  return document.getElementById(id);
}

function _setScenesStatus(message, tone = "info") {
  const status = _el("mesaScenesStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

/* ── VISIBILIDADE / CARGA ────────────────────────────────────── */

/**
 * Revela o botao da gaveta para quem tem direito e recarrega a lista se a
 * gaveta estiver aberta. Chamado pelo boot (depois do papel assentar) e pela
 * troca de cena.
 *
 * A lista NAO e buscada aqui quando a gaveta esta fechada: ninguem paga
 * requisicao por uma tela que nao esta vendo. Ela e buscada ao abrir.
 */
async function refreshMesaScenesUI() {
  const toggle = _el("mesaScenesToggle");
  const enabled = _isScenesManagerEnabled();
  if (toggle) toggle.hidden = !enabled;

  if (!enabled) {
    if (_drawerOpen) closeMesaScenesDrawer();
    return;
  }
  if (_drawerOpen) await _loadMesaScenes();
}

async function _loadMesaScenes() {
  try {
    const data = await window.APP.getMesaScenes();
    _scenesCache = Array.isArray(data?.scenes) ? data.scenes : [];
    _foldersCache = Array.isArray(data?.folders) ? data.folders : [];
    // Pasta aberta que deixou de existir (excluida em outra aba): volta para a
    // raiz em vez de mostrar uma lista vazia sem explicacao.
    if (_activeFolderId && !_foldersCache.some(pasta => pasta.id === _activeFolderId)) {
      _activeFolderId = "";
    }
    _renderMesaScenesFolders();
    _renderMesaScenesList();
  } catch (error) {
    console.warn("Falha ao listar cenas da Mesa.", error);
    _setScenesStatus("Nao foi possivel carregar as cenas.", "error");
  }
}

/* ── ABRIR / FECHAR ──────────────────────────────────────────── */

function openMesaScenesDrawer() {
  if (_drawerOpen || !_isScenesManagerEnabled()) return;
  const root = _el("mesaScenesDrawer");
  const panel = _el("mesaScenesDrawerPanel");
  const toggle = _el("mesaScenesToggle");
  if (!root || !panel) return;

  root.hidden = false;
  _drawerOpen = true;
  toggle?.setAttribute("aria-expanded", "true");

  // Foco inicial na busca: e o primeiro passo de quem chega procurando cena.
  _activateDrawerFocus(_el("mesaScenesSearch") || panel);

  _setScenesStatus("Carregando cenas...");
  void _loadMesaScenes();
}

/**
 * Liga a armadilha de foco da gaveta.
 *
 * Fica separado porque o dialogo de nome DESLIGA a armadilha da gaveta
 * enquanto vive e a religa ao fechar. Sem isso os dois se atropelam: a
 * armadilha da gaveta vigia o foco e puxa de volta tudo que sai do painel
 * dela — inclusive o campo de texto do dialogo que nasceu de dentro dela.
 * Era isso que impedia o cursor de chegar ao campo de nome.
 */
function _activateDrawerFocus(initialFocus) {
  const root = _el("mesaScenesDrawer");
  const panel = _el("mesaScenesDrawerPanel");
  if (!root || !panel || root.hidden) return;
  window.UI?.activateModal?.(root, panel, {
    initialFocus: initialFocus instanceof HTMLElement ? initialFocus : panel,
    onDismiss: () => closeMesaScenesDrawer()
  });
}

function closeMesaScenesDrawer() {
  const root = _el("mesaScenesDrawer");
  if (!root || root.hidden) return;
  _closeSceneNameDialog({ restoreFocus: false, reactivate: false });
  root.hidden = true;
  _drawerOpen = false;
  _el("mesaScenesToggle")?.setAttribute("aria-expanded", "false");
  // restoreFocus devolve o foco ao botao que abriu — sem isso o foco cai no
  // <body> e quem navega por teclado recomeca do topo da pagina.
  window.UI?.deactivateModal?.(root);
}

/* ── LISTA ───────────────────────────────────────────────────── */

function _matchesSceneFolder(scene) {
  if (!_activeFolderId) return true;                 // raiz mostra tudo
  return String(scene?.folderId || "") === _activeFolderId;
}

function _folderName(folderId) {
  return _foldersCache.find(pasta => pasta.id === folderId)?.name || "";
}

/** Chips de pasta: "Todas as cenas" + uma por pasta, com a contagem. */
function _renderMesaScenesFolders() {
  const barra = _el("mesaScenesFolders");
  if (!barra) return;
  barra.textContent = "";

  const chips = [{ id: "", nome: "Todas as cenas", total: _scenesCache.length }].concat(
    _foldersCache.map(pasta => ({
      id: pasta.id,
      nome: pasta.name,
      total: _scenesCache.filter(cena => String(cena.folderId || "") === pasta.id).length
    }))
  );

  chips.forEach(chip => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "mesa-scene-folder" + (chip.id === _activeFolderId ? " is-active" : "");
    botao.dataset.folderFilter = chip.id;
    // aria-pressed diz qual pasta esta aberta para quem nao ve o destaque.
    botao.setAttribute("aria-pressed", chip.id === _activeFolderId ? "true" : "false");
    botao.textContent = chip.nome;
    const contagem = document.createElement("span");
    contagem.className = "mesa-scene-folder-count";
    contagem.textContent = String(chip.total);
    botao.appendChild(contagem);
    barra.appendChild(botao);
  });

  // Renomear/excluir so fazem sentido com uma pasta aberta.
  const renomear = _el("mesaSceneFolderRenameBtn");
  const excluir = _el("mesaSceneFolderDeleteBtn");
  if (renomear) renomear.hidden = !_activeFolderId;
  if (excluir) excluir.hidden = !_activeFolderId;
}

function _matchesSceneSearch(scene) {
  if (!_sceneSearchTerm) return true;
  return String(scene?.name || "")
    .toLocaleLowerCase("pt-BR")
    .includes(_sceneSearchTerm);
}

function _renderMesaScenesList() {
  const grid = _el("mesaScenesGrid");
  const empty = _el("mesaScenesEmpty");
  if (!grid) return;

  const visible = _scenesCache.filter(cena => _matchesSceneFolder(cena) && _matchesSceneSearch(cena));
  grid.textContent = "";
  visible.forEach(scene => grid.appendChild(_buildSceneCard(scene)));

  if (empty) {
    empty.hidden = visible.length > 0;
    empty.textContent = _sceneSearchTerm
      ? `Nenhuma cena com "${_sceneSearchTerm}".`
      : (_activeFolderId
          ? `A pasta "${_folderName(_activeFolderId)}" esta vazia. Use "Mover" num cartao para trazer uma cena.`
          : "Nenhuma cena ainda. Crie a primeira.");
  }

  const titulo = _el("mesaScenesListTitle");
  if (titulo) titulo.textContent = _activeFolderId ? _folderName(_activeFolderId) : "Todas as cenas";

  const active = _scenesCache.find(scene => scene.active);
  const activeLabel = _el("mesaScenesActiveLabel");
  if (activeLabel) {
    activeLabel.textContent = "";
    if (active) {
      activeLabel.append("Cena ativa: ");
      const strong = document.createElement("strong");
      strong.textContent = active.name;
      activeLabel.appendChild(strong);
    }
  }

  // O contador fala do que esta NA TELA: com pasta aberta ou busca ativa,
  // dizer o total geral (4) enquanto se ve 2 e mentira util para ninguem.
  const plural = visible.length === 1 ? "cena" : "cenas";
  _setScenesStatus(
    _sceneSearchTerm
      ? `${visible.length} ${visible.length === 1 ? "cena encontrada" : "cenas encontradas"}.`
      : (_activeFolderId
          ? `${visible.length} ${plural} em "${_folderName(_activeFolderId)}".`
          : `${visible.length} ${plural}.`)
  );
}

function _buildSceneCard(scene) {
  const item = document.createElement("li");
  item.className = "mesa-scene-card" + (scene.active ? " is-active" : "");
  item.dataset.sceneId = scene.id;

  // Botao principal do cartao = ativar a cena. Para a cena ja ativa ele fica
  // desabilitado: nao ha acao, e um botao que nao faz nada confunde tanto o
  // mouse quanto o leitor de tela.
  const open = document.createElement("button");
  open.type = "button";
  open.className = "mesa-scene-card-open";
  open.dataset.sceneAction = "activate";
  open.dataset.sceneId = scene.id;
  if (scene.active) {
    open.disabled = true;
    open.setAttribute("aria-current", "true");
    open.setAttribute("aria-label", `${scene.name} — cena ativa`);
  } else {
    open.setAttribute("aria-label", `Ativar a cena ${scene.name} para todos`);
  }

  const thumb = document.createElement("span");
  thumb.className = "mesa-scene-thumb";
  if (scene.mapUrl) {
    const img = document.createElement("img");
    // loading/decoding nativos: a imagem so e baixada quando o cartao entra
    // na tela, e a decodificacao nao trava a rolagem. Sem biblioteca.
    img.loading = "lazy";
    img.decoding = "async";
    img.src = scene.mapUrl;
    img.alt = "";                 // decorativa: o nome vem no texto do cartao
    thumb.appendChild(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "mesa-scene-thumb-empty";
    placeholder.textContent = "▦";
    placeholder.setAttribute("aria-hidden", "true");
    thumb.appendChild(placeholder);
  }
  if (scene.active) {
    const badge = document.createElement("span");
    badge.className = "mesa-scene-badge";
    badge.textContent = "ATIVA";
    thumb.appendChild(badge);
  }
  open.appendChild(thumb);

  const body = document.createElement("span");
  body.className = "mesa-scene-card-body";
  const name = document.createElement("span");
  name.className = "mesa-scene-card-name";
  name.textContent = scene.name;
  body.appendChild(name);
  const meta = document.createElement("span");
  meta.className = "mesa-scene-card-meta";
  const count = Number(scene.tokenCount) || 0;
  meta.textContent = count === 1 ? "1 token" : `${count} tokens`;
  body.appendChild(meta);
  open.appendChild(body);
  item.appendChild(open);

  const actions = document.createElement("div");
  actions.className = "mesa-scene-card-actions";
  actions.appendChild(_sceneActionButton("rename", scene.id, "Renomear", `Renomear a cena ${scene.name}`));
  // "Mover para" por MENU, nao so arrastando: arrastar sozinho e
  // intransponivel por teclado.
  actions.appendChild(_sceneActionButton("move", scene.id, "Mover", `Mover a cena ${scene.name} para outra pasta`));
  // A cena ativa e a default nao podem ser excluidas: uma esta em uso, a
  // outra e o chao da mesa (o Worker recusa as duas de qualquer jeito).
  if (!scene.active && scene.id !== "default") {
    actions.appendChild(
      _sceneActionButton("delete", scene.id, "Excluir", `Excluir a cena ${scene.name}`, "is-danger")
    );
  }
  item.appendChild(actions);

  return item;
}

function _sceneActionButton(action, sceneId, label, ariaLabel, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mesa-scene-action ${extraClass}`.trim();
  button.dataset.sceneAction = action;
  button.dataset.sceneId = sceneId;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

/* ── DIALOGO DE NOME (criar / renomear) ──────────────────────── */

function _openSceneNameDialog(mode, scene) {
  const root = _el("mesaSceneNameDialog");
  const panel = _el("mesaSceneNameForm");
  const field = _el("mesaSceneNameField");
  const title = _el("mesaSceneNameTitle");
  if (!root || !panel || !field) return;

  _nameDialogMode = mode;
  _nameDialogSceneId = scene?.id || "";
  const titulos = {
    "create": "Nova cena",
    "rename": "Renomear cena",
    "folder-create": "Nova pasta",
    "folder-rename": "Renomear pasta"
  };
  if (title) title.textContent = titulos[mode] || "Nome";
  const rotulo = _el("mesaSceneNameDialog")?.querySelector(".mesa-scene-name-label");
  if (rotulo) rotulo.textContent = mode.startsWith("folder") ? "Nome da pasta" : "Nome da cena";
  field.value = mode.endsWith("create") ? "" : String(scene?.name || "");
  _setSceneNameError("");

  // Desliga a armadilha da gaveta enquanto este dialogo vive (ver
  // _activateDrawerFocus) — e tambem faz o Esc pertencer so a ele.
  window.UI?.deactivateModal?.(_el("mesaScenesDrawer"), { restoreFocus: false });

  root.hidden = false;
  window.UI?.activateModal?.(root, panel, {
    initialFocus: field,
    onDismiss: () => _closeSceneNameDialog()
  });
  // Texto pre-selecionado: renomear costuma ser substituir, nao completar.
  if (mode.endsWith("rename")) window.requestAnimationFrame(() => field.select());
}

function _closeSceneNameDialog(options = {}) {
  const root = _el("mesaSceneNameDialog");
  if (!root || root.hidden) return;
  root.hidden = true;
  _nameDialogMode = null;
  _nameDialogSceneId = "";
  window.UI?.deactivateModal?.(root, options);
  // Religa a armadilha da gaveta onde o foco acabou de parar: no Esc, no
  // botao que abriu o dialogo; depois de salvar, em quem o chamador escolher.
  if (_drawerOpen && options.reactivate !== false) {
    _activateDrawerFocus(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
}

function _setSceneNameError(message) {
  const error = _el("mesaSceneNameError");
  const field = _el("mesaSceneNameField");
  if (error) error.textContent = message || "";
  // aria-invalid conta ao leitor de tela o que a borda vermelha conta ao olho.
  if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
}

async function _submitSceneNameDialog(event) {
  event.preventDefault();
  if (_scenesBusy || !_isScenesManagerEnabled()) return;

  const field = _el("mesaSceneNameField");
  const name = String(field?.value || "").trim();
  if (!name) {
    _setSceneNameError("Escreva um nome para a cena.");
    field?.focus();
    return;
  }

  const mode = _nameDialogMode;
  const sceneId = _nameDialogSceneId;
  _scenesBusy = true;
  try {
    if (mode === "folder-create") {
      const criada = await window.APP.createMesaSceneFolder(name);
      _closeSceneNameDialog({ restoreFocus: false, reactivate: false });
      // Abre a pasta recem-criada: quem acabou de cria-la quer por algo nela.
      _activeFolderId = String(criada?.id || "");
      await _loadMesaScenes();
      _setScenesStatus(`Pasta "${name}" criada.`);
      _activateDrawerFocus(_el("mesaSceneFolderCreateBtn"));
      return;
    }
    if (mode === "folder-rename") {
      await window.APP.renameMesaSceneFolder(_activeFolderId, name);
      _closeSceneNameDialog({ restoreFocus: false, reactivate: false });
      await _loadMesaScenes();
      _setScenesStatus(`Pasta renomeada para "${name}".`);
      _activateDrawerFocus(_el("mesaSceneFolderRenameBtn"));
      return;
    }
    if (mode === "create") {
      await window.APP.createMesaScene(name);
      _closeSceneNameDialog({ restoreFocus: false, reactivate: false });
      await _loadMesaScenes();
      _setScenesStatus(`Cena "${name}" criada.`);
      // O foco vai para a busca porque o botao que abriu o dialogo continua
      // existindo, mas a lista mudou embaixo dele. A armadilha da gaveta so
      // religa aqui, ja apontando para o destino final — religar antes faria
      // ela disputar o foco com esta linha.
      _activateDrawerFocus(_el("mesaScenesSearch"));
      return;
    }
    if (mode === "rename") {
      await window.APP.renameMesaScene(sceneId, name);
      _closeSceneNameDialog({ restoreFocus: false, reactivate: false });
      await _loadMesaScenes();
      _setScenesStatus(`Cena renomeada para "${name}".`);
      _focusSceneCard(sceneId);
    }
  } catch (error) {
    console.warn("Acao de cena falhou.", error);
    _setSceneNameError(String(error?.message || "Nao foi possivel salvar."));
  } finally {
    _scenesBusy = false;
  }
}

/** Devolve o foco ao cartao mexido — quem usa teclado nao pode se perder. */
function _focusSceneCard(sceneId) {
  const card = _el("mesaScenesGrid")?.querySelector(`.mesa-scene-card[data-scene-id="${CSS.escape(String(sceneId))}"]`);
  const target = card?.querySelector("button:not([disabled])");
  _activateDrawerFocus(target instanceof HTMLElement ? target : _el("mesaScenesSearch"));
}

/* ── ACOES ───────────────────────────────────────────────────── */

async function _handleMesaScenesClick(event) {
  const button = event.target.closest(
    "[data-scene-action], [data-folder-filter], #mesaSceneCreateBtn, #mesaSceneFolderCreateBtn," +
    " #mesaSceneFolderRenameBtn, #mesaSceneFolderDeleteBtn, [data-scenes-close]"
  );
  if (!button || _scenesBusy || !_isScenesManagerEnabled()) return;

  if (button.hasAttribute("data-scenes-close")) {
    closeMesaScenesDrawer();
    return;
  }

  if (button.id === "mesaSceneCreateBtn") {
    _openSceneNameDialog("create", null);
    return;
  }

  if (button.id === "mesaSceneFolderCreateBtn") {
    _openSceneNameDialog("folder-create", null);
    return;
  }

  if (button.id === "mesaSceneFolderRenameBtn") {
    if (!_activeFolderId) return;
    _openSceneNameDialog("folder-rename", { id: _activeFolderId, name: _folderName(_activeFolderId) });
    return;
  }

  if (button.id === "mesaSceneFolderDeleteBtn") {
    await _excluirPastaAtiva();
    return;
  }

  // Chip de pasta: filtro de tela, sem ida ao servidor.
  if (button.hasAttribute("data-folder-filter")) {
    _activeFolderId = String(button.dataset.folderFilter || "");
    _renderMesaScenesFolders();
    _renderMesaScenesList();
    return;
  }

  const action = button.dataset.sceneAction;
  const sceneId = button.dataset.sceneId;
  const scene = _scenesCache.find(entry => entry.id === sceneId);

  if (action === "rename") {
    _openSceneNameDialog("rename", scene);
    return;
  }

  if (action === "move") {
    await _moverCenaParaPasta(scene);
    return;
  }

  if (action === "activate") {
    _scenesBusy = true;
    try {
      _setScenesStatus(`Ativando "${scene?.name || sceneId}"...`);
      // O broadcast mesa:scene:switch (disparado pelo Worker) recarrega a cena
      // em todos os clientes, inclusive neste — aqui so pedimos.
      await window.APP.activateMesaScene(sceneId);
      await _loadMesaScenes();
      _setScenesStatus(`Cena "${scene?.name || sceneId}" ativada para todos.`);
    } catch (error) {
      console.warn("Acao de cena falhou.", error);
      _setScenesStatus(String(error?.message || "Nao foi possivel ativar a cena."), "error");
    } finally {
      _scenesBusy = false;
    }
    return;
  }

  if (action === "delete") {
    const label = scene?.name || sceneId;
    // UI.confirm no lugar de window.confirm: mesmo dialogo do resto do site,
    // com foco preso e Esc, em vez do popup nativo que trava a aba.
    const confirmed = await (window.UI?.confirm
      ? window.UI.confirm(
          `Excluir a cena "${label}"? Os tokens, desenhos e nevoa dela serao perdidos.`,
          { title: "Excluir cena", kicker: "// Cenas", confirmLabel: "Excluir", variant: "danger" }
        )
      : Promise.resolve(false));
    if (!confirmed) return;

    _scenesBusy = true;
    try {
      await window.APP.deleteMesaScene(sceneId);
      await _loadMesaScenes();
      _setScenesStatus(`Cena "${label}" excluida.`);
      _el("mesaScenesSearch")?.focus();
    } catch (error) {
      console.warn("Acao de cena falhou.", error);
      _setScenesStatus(String(error?.message || "Nao foi possivel excluir a cena."), "error");
    } finally {
      _scenesBusy = false;
    }
  }
}

/**
 * Move uma cena de pasta pelo dialogo de escolha do site (UI.pickOption) — o
 * mesmo componente acessivel usado nas outras escolhas. Arrastar pode vir
 * depois como atalho; menu e o caminho que funciona no teclado.
 */
async function _moverCenaParaPasta(scene) {
  if (!scene || !window.UI?.pickOption) return;
  const atual = String(scene.folderId || "");
  const opcoes = [{
    value: "__raiz__",
    label: "Todas as cenas",
    description: "Fora de qualquer pasta",
    selected: !atual
  }].concat(_foldersCache.map(pasta => ({
    value: pasta.id,
    label: pasta.name,
    selected: pasta.id === atual
  })));

  const escolha = await window.UI.pickOption({
    title: `Mover "${scene.name}"`,
    kicker: "// Cenas",
    message: _foldersCache.length
      ? "Escolha a pasta de destino."
      : "Nenhuma pasta ainda — crie uma na barra de pastas.",
    options: opcoes
  });
  if (escolha === null) return;

  const destino = escolha === "__raiz__" ? "" : String(escolha);
  if (destino === atual) return;               // ja esta la: nada a fazer

  _scenesBusy = true;
  try {
    await window.APP.setMesaSceneFolder(scene.id, destino);
    await _loadMesaScenes();
    _setScenesStatus(destino
      ? `"${scene.name}" foi para "${_folderName(destino)}".`
      : `"${scene.name}" voltou para a raiz.`);
  } catch (error) {
    console.warn("Acao de cena falhou.", error);
    _setScenesStatus(String(error?.message || "Nao foi possivel mover a cena."), "error");
  } finally {
    _scenesBusy = false;
    _focusSceneCard(scene.id);
  }
}

/**
 * Excluir pasta NUNCA exclui cena — as de dentro voltam para a raiz. O texto
 * do dialogo diz isso, porque "excluir" ao lado de uma lista de cenas assusta.
 */
async function _excluirPastaAtiva() {
  if (!_activeFolderId) return;
  const nome = _folderName(_activeFolderId);
  const dentro = _scenesCache.filter(cena => String(cena.folderId || "") === _activeFolderId).length;
  const confirmado = await (window.UI?.confirm
    ? window.UI.confirm(
        dentro
          ? `Excluir a pasta "${nome}"? As ${dentro} cenas dela voltam para a raiz — nenhuma cena e apagada.`
          : `Excluir a pasta "${nome}"?`,
        { title: "Excluir pasta", kicker: "// Cenas", confirmLabel: "Excluir", variant: "danger" }
      )
    : Promise.resolve(false));
  if (!confirmado) return;

  _scenesBusy = true;
  try {
    await window.APP.deleteMesaSceneFolder(_activeFolderId);
    _activeFolderId = "";
    await _loadMesaScenes();
    _setScenesStatus(`Pasta "${nome}" excluida. As cenas dela estao na raiz.`);
  } catch (error) {
    console.warn("Acao de cena falhou.", error);
    _setScenesStatus(String(error?.message || "Nao foi possivel excluir a pasta."), "error");
  } finally {
    _scenesBusy = false;
    _activateDrawerFocus(_el("mesaSceneFolderCreateBtn"));
  }
}

/* ── BOOT ────────────────────────────────────────────────────── */

function initMesaScenes() {
  const toggle = _el("mesaScenesToggle");
  const drawer = _el("mesaScenesDrawer");
  const nameDialog = _el("mesaSceneNameDialog");
  if (!toggle || !drawer) return;

  toggle.addEventListener("click", () => {
    if (_drawerOpen) closeMesaScenesDrawer();
    else openMesaScenesDrawer();
  });
  // data-armed: o botao existe no HTML e o dono dele e este modulo. Sem a
  // marca, npm run test:controles o trata como botao morto (CLAUDE.md).
  toggle.dataset.armed = "1";

  drawer.addEventListener("click", event => { void _handleMesaScenesClick(event); });
  drawer.querySelectorAll(
    "[data-scenes-close], #mesaSceneCreateBtn, #mesaSceneFolderCreateBtn," +
    " #mesaSceneFolderRenameBtn, #mesaSceneFolderDeleteBtn"
  ).forEach(button => {
    button.dataset.armed = "1";
  });

  const search = _el("mesaScenesSearch");
  search?.addEventListener("input", () => {
    _sceneSearchTerm = String(search.value || "").trim().toLocaleLowerCase("pt-BR");
    _renderMesaScenesList();
  });

  if (nameDialog) {
    const form = _el("mesaSceneNameForm");
    form?.addEventListener("submit", event => { void _submitSceneNameDialog(event); });
    nameDialog.addEventListener("click", event => {
      if (event.target.closest("[data-scene-name-close]")) _closeSceneNameDialog();
    });
    nameDialog.querySelectorAll("[data-scene-name-close], #mesaSceneNameSubmit").forEach(button => {
      button.dataset.armed = "1";
    });
  }
  // Visibilidade chega via refreshMesaScenesUI, chamado pelo boot da Mesa
  // depois do papel assentar (nunca decidir master-only no DOMContentLoaded).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaScenes, { once: true });
} else {
  initMesaScenes();
}

window.refreshMesaScenesUI = refreshMesaScenesUI;
window.openMesaScenesDrawer = openMesaScenesDrawer;
window.closeMesaScenesDrawer = closeMesaScenesDrawer;
