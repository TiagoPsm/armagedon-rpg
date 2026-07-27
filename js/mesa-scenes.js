/* ============================================================
 * mesa-scenes.js — Gerenciador de múltiplas cenas (Etapa 49)
 * Grupo "Cenas" no painel do mapa, SÓ para o mestre e SÓ com o
 * backend ativo (multi-cena vive no D1; o modo local continua
 * com a cena única de sempre). Ações batem nas rotas da Etapa 48
 * via fachada window.APP; a troca de cena chega a todos pelo
 * broadcast mesa:scene:switch (tratado em mesa-core.js).
 * ============================================================ */

"use strict";

let _scenesCache = [];
let _scenesBusy = false;

function _isScenesManagerEnabled() {
  return (
    typeof isMaster === "function" && isMaster()
    && window.AUTH?.isBackendEnabled?.()
    && typeof window.APP?.getMesaScenes === "function"
  );
}

/** Recarrega a lista de cenas e (re)desenha o grupo. Master-only. */
async function refreshMesaScenesUI() {
  const group = document.getElementById("mesaScenesGroup");
  if (!group) return;
  const enabled = _isScenesManagerEnabled();
  group.hidden = !enabled;
  if (!enabled) return;

  try {
    const data = await window.APP.getMesaScenes();
    _scenesCache = Array.isArray(data?.scenes) ? data.scenes : [];
  } catch (error) {
    console.warn("Falha ao listar cenas da Mesa.", error);
    return;
  }
  _renderMesaScenesList();
}

function _renderMesaScenesList() {
  const list = document.getElementById("mesaScenesList");
  if (!list) return;
  list.textContent = "";

  _scenesCache.forEach(scene => {
    const row = document.createElement("div");
    row.className = "mesa-scene-row" + (scene.active ? " is-active" : "");

    const name = document.createElement("span");
    name.className = "mesa-scene-name";
    name.textContent = scene.name;
    name.title = scene.active ? `${scene.name} (cena ativa)` : scene.name;
    row.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "mesa-scene-actions";
    if (!scene.active) {
      actions.appendChild(_sceneActionButton("activate", scene.id, "Ativar", "Ativar esta cena para todos"));
    }
    actions.appendChild(_sceneActionButton("rename", scene.id, "✎", "Renomear cena"));
    if (!scene.active && scene.id !== "default") {
      actions.appendChild(_sceneActionButton("delete", scene.id, "×", "Excluir cena"));
    }
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function _sceneActionButton(action, sceneId, label, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mesa-transform-btn mesa-scene-btn" + (action === "activate" ? " is-activate" : "");
  button.dataset.sceneAction = action;
  button.dataset.sceneId = sceneId;
  button.textContent = label;
  button.title = title;
  return button;
}

async function _handleMesaScenesClick(event) {
  const button = event.target.closest("[data-scene-action], #mesaSceneCreateBtn");
  if (!button || _scenesBusy || !_isScenesManagerEnabled()) return;
  _scenesBusy = true;
  try {
    if (button.id === "mesaSceneCreateBtn") {
      const name = window.prompt("Nome da nova cena:", "Nova cena");
      if (name === null) return;
      await window.APP.createMesaScene(name);
      await refreshMesaScenesUI();
      return;
    }

    const action = button.dataset.sceneAction;
    const sceneId = button.dataset.sceneId;
    const scene = _scenesCache.find(entry => entry.id === sceneId);

    if (action === "activate") {
      // O broadcast mesa:scene:switch (disparado pelo Worker) recarrega a
      // cena em todos os clientes, inclusive neste — aqui só pedimos.
      await window.APP.activateMesaScene(sceneId);
      await refreshMesaScenesUI();
      return;
    }
    if (action === "rename") {
      const name = window.prompt("Novo nome da cena:", scene?.name || "");
      if (name === null || !name.trim()) return;
      await window.APP.renameMesaScene(sceneId, name);
      await refreshMesaScenesUI();
      return;
    }
    if (action === "delete") {
      const label = scene?.name || sceneId;
      if (!window.confirm(`Excluir a cena "${label}"? Os tokens, desenhos e névoa dela serão perdidos.`)) return;
      await window.APP.deleteMesaScene(sceneId);
      await refreshMesaScenesUI();
    }
  } catch (error) {
    console.warn("Acao de cena falhou.", error);
    window.UI?.toast?.(String(error?.message || "Ação de cena falhou."), { kicker: "// Mesa" });
  } finally {
    _scenesBusy = false;
  }
}

function initMesaScenes() {
  const group = document.getElementById("mesaScenesGroup");
  if (!group) return;
  group.addEventListener("click", event => { void _handleMesaScenesClick(event); });
  // Visibilidade/lista chegam via refreshMesaScenesUI, chamado pelo boot da
  // Mesa depois do papel assentar (nunca decidir master-only no DOMContentLoaded).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaScenes, { once: true });
} else {
  initMesaScenes();
}

window.refreshMesaScenesUI = refreshMesaScenesUI;
