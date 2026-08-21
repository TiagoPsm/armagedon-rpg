/* ============================================================
 * mesa-permissions.js — FONTE UNICA DE VERDADE das permissoes
 * da Mesa Virtual (Etapa 75, 2026-08-02).
 *
 * Por que este arquivo existe
 * ---------------------------
 * Antes da Etapa 75 a permissao da Mesa estava espalhada em
 * quatro lugares que nao se conversavam:
 *   1. atributo `hidden` no mesa.html (alguns elementos, nem todos);
 *   2. regra de CSS `.is-master #x` (mesa-map.css);
 *   3. `hidden = !isMaster()` dentro de cada modulo (roster, fog,
 *      grid, cenas, iniciativa);
 *   4. um `showPanel()` inline no fim do mesa.html que dava
 *      `el.hidden = false` em blocos inteiros SEM olhar o papel —
 *      desfazendo (3) a cada clique na barra de ferramentas.
 * O resultado eram controles de mestre aparecendo para jogador
 * (escalacao, tracker de iniciativa com "Proximo/Reiniciar/
 * Encerrar", chrome do mapa "Sem mapa / Abrir mapa").
 *
 * Como funciona agora
 * -------------------
 * - `<body data-role="player">` ja vem no HTML: o padrao e FECHADO.
 *   Se o JS quebrar, o jogador continua sem os controles do mestre.
 * - Todo elemento exclusivo do mestre carrega `data-mesa-master-only`
 *   e some por CSS enquanto `body[data-role]` nao for "master"
 *   (css/mesa-permissions.css).
 * - `applyMesaRolePermissions()` reforca com `hidden` no DOM. Ela SO
 *   ESCONDE, nunca revela: quem decide quando um controle do mestre
 *   aparece continua sendo o modulo dono (mapa, nevoa, cenas...).
 * - `requireMesaMaster(cap)` e a trava das FUNCOES: esconder o botao
 *   nao basta, porque `onclick` global e chamavel pelo console.
 *
 * O backend (Worker + Durable Object) continua sendo a barreira
 * real: este arquivo cuida da camada de UI/UX do cliente.
 * ============================================================ */

"use strict";

/* ── CAPACIDADES ─────────────────────────────────────────────
 * Cada acao da Mesa tem um nome. Quem NAO estiver na lista de
 * capacidade compartilhada e exclusivo do mestre — o default e
 * fechado tambem aqui.
 * Referencia de regra: SYSTEM_RULES.md > "Mesa Virtual".
 */

// Acoes liberadas para TODO participante (mestre e jogador).
const MESA_SHARED_CAPS = new Set([
  "scene.view",        // ver o palco compartilhado
  "draw",              // desenhar (camada unica compartilhada, Etapa 73)
  "ping",              // Alt+clique no palco
  "ruler",             // regua
  "dice",              // dados da Mesa (o servidor rola)
  "zoom",              // zoom/pan do palco (local, nao sincroniza)
  "fullscreen",        // tela cheia
  "initiative.roll",   // rolar a PROPRIA iniciativa
  "self.token.move",   // mover o proprio token (se a trava estiver aberta)
  "self.stats",        // editar Vida/Integridade atuais do proprio token
  "self.echo"          // invocar/retirar o proprio Echo
]);

// Acoes exclusivas do mestre. A lista e documental: qualquer nome
// fora de MESA_SHARED_CAPS ja e negado para jogador.
const MESA_MASTER_CAPS = new Set([
  "roster.stage",      // escalacao: colocar/tirar personagens da cena
  "scene.save",        // salvar a cena oficial
  "scene.clear",       // limpar a cena
  "scene.manage",      // multiplas cenas: criar, renomear, ativar, excluir
  "scene.movelock",    // travar/liberar movimento dos jogadores
  "draw.clearAll",     // limpar o quadro inteiro (jogador so apaga o proprio traco)
  "map.manage",        // abrir, importar, limpar e transformar o mapa
  "grid.manage",       // grade funcional
  "fog.manage",        // fog of war
  "layer.dm",          // camada secreta do mestre
  "layer.map",         // camada de mapa
  "inspector",         // inspetor lateral de token
  "markers",           // marcadores de status
  "token.manage",      // criar/remover/mover qualquer token
  "initiative.control" // ativar, proximo turno, reiniciar, encerrar, remover
]);

/* ── PAPEL ───────────────────────────────────────────────────
 * Ordem de leitura (fail-closed): estado da Mesa > atributo do
 * body > "player". NUNCA le localStorage direto — antes da Etapa
 * 75 o mesa-map.js fazia isso e virava uma segunda verdade que
 * divergia de `state.role` (que respeita AUTH e mesaRolePreview).
 */
function getMesaRole() {
  try {
    if (typeof state === "object" && state && typeof state.role === "string" && state.role.trim()) {
      return state.role.trim().toLowerCase() === "master" ? "master" : "player";
    }
  } catch (e) { /* state ainda nao existe no boot */ }

  const bodyRole = document.body?.dataset?.role;
  return String(bodyRole || "").trim().toLowerCase() === "master" ? "master" : "player";
}

function isMesaMasterRole() {
  return getMesaRole() === "master";
}

/**
 * Pergunta se o papel atual pode executar uma capacidade.
 * @param {string} cap nome da capacidade (ver listas acima)
 * @returns {boolean}
 */
function mesaCan(cap) {
  const key = String(cap || "").trim();
  if (!key) return false;
  if (MESA_SHARED_CAPS.has(key)) return true;
  return isMesaMasterRole();
}

/**
 * Trava de funcao. Use na PRIMEIRA linha de toda funcao exclusiva
 * do mestre — esconder o botao nao protege nada, porque as funcoes
 * da Mesa sao globais (scripts classicos, chamadas por onclick).
 *
 * @param {string} cap capacidade exigida
 * @param {string} [acao] texto amigavel para o aviso ("abrir mapa")
 * @returns {boolean} true quando permitido
 */
function requireMesaMaster(cap, acao) {
  if (mesaCan(cap)) return true;
  const label = acao ? `Apenas o mestre pode ${acao}.` : "Apenas o mestre pode fazer isso.";
  try {
    if (window.UI?.toast) window.UI.toast(label, "warn");
    else console.warn("[mesa-permissions]", label, `(cap: ${cap})`);
  } catch (e) { /* toast indisponivel */ }
  return false;
}

/**
 * Aplica o papel no DOM.
 *
 * REGRA DE OURO: esta funcao so desfaz o que ELA MESMA fez.
 * Quase todo controle do mestre tem visibilidade condicional propria
 * (mapa ativo, combate ativo, backend online, painel aberto, token
 * selecionado). Se aqui saisse revelando tudo para o mestre, o
 * `hidden` legitimo desses modulos seria atropelado.
 *
 * Por isso o que e escondido aqui recebe a marca `data-mesa-perm-hidden`,
 * e so o marcado volta quando o papel vira mestre. Elemento que ja
 * nascia `hidden` no HTML nunca e marcado — logo, nunca e revelado.
 *
 * O boot chama esta funcao com "player" antes de a sessao resolver
 * (fail-closed) e depois com o papel real; a marca e o que torna essa
 * sequencia reversivel sem perder a logica de cada modulo.
 *
 * Chame depois de qualquer coisa que mexa em `hidden` de bloco inteiro
 * (showPanel, troca de camada, render de controles).
 *
 * @param {string} [role] papel a aplicar; omitido = deduz de getMesaRole()
 */
/* Rotulo acessivel do botao da camada de tokens (Etapa 116).
 * O texto e o icone visiveis trocam por CSS (data-role-label/-icon), mas
 * `title` e `aria-label` sao atributos: quem le por leitor de tela ou passa o
 * mouse ouviria/veria o nome do outro papel se ninguem os trocasse aqui. */
const MESA_TOKENS_BTN_TITLE = {
  master: "Camada de Tokens — selecionar e mover fichas",
  player: "Meu token — ver e ajustar o proprio personagem"
};

function applyMesaTokensButtonRole(resolved) {
  const btn = document.getElementById("mesaLayerTokensBtn");
  if (!btn) return;
  btn.title = MESA_TOKENS_BTN_TITLE[resolved] || MESA_TOKENS_BTN_TITLE.player;
  btn.setAttribute("aria-label", resolved === "master" ? "Camada de Tokens" : "Meu token");
}

function applyMesaRolePermissions(role) {
  if (!document.body) return;
  const resolved = String(role || getMesaRole()).trim().toLowerCase() === "master" ? "master" : "player";
  document.body.dataset.role = resolved;
  applyMesaTokensButtonRole(resolved);
  // `.is-master` continua existindo por compatibilidade com regras de
  // CSS antigas (css/mesa-map.css); data-role e a fonte oficial.
  document.body.classList.toggle("is-master", resolved === "master");

  if (resolved === "master") {
    document.querySelectorAll("[data-mesa-master-only][data-mesa-perm-hidden]").forEach(el => {
      delete el.dataset.mesaPermHidden;
      el.hidden = false;
      el.removeAttribute("aria-hidden");
      if ("disabled" in el) el.disabled = false;
    });
    return;
  }

  document.querySelectorAll("[data-mesa-master-only]").forEach(el => {
    if (!el.hidden) {
      el.dataset.mesaPermHidden = "1";
      el.hidden = true;
      if ("disabled" in el) el.disabled = true;
    }
    el.setAttribute("aria-hidden", "true");
  });
}

/* Globais (scripts classicos, sem bundler) */
window.getMesaRole               = getMesaRole;
window.isMesaMasterRole          = isMesaMasterRole;
window.mesaCan                   = mesaCan;
window.requireMesaMaster         = requireMesaMaster;
window.applyMesaRolePermissions  = applyMesaRolePermissions;
window.MESA_SHARED_CAPS          = MESA_SHARED_CAPS;
window.MESA_MASTER_CAPS          = MESA_MASTER_CAPS;

// Passada inicial: garante o estado fechado assim que o DOM existir,
// antes mesmo de o boot da Mesa resolver a sessao.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => applyMesaRolePermissions(), { once: true });
} else {
  applyMesaRolePermissions();
}
