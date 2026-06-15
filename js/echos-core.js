/* ── echos-core.js ─────────────────────────────────────────────────────
   Estado e utilitários da página de Echos. Echos são manifestações
   residuais de monstros derrotados, com rank e XP próprios, pertencentes
   a um jogador (ou NPC, visível só para o mestre). */

const ECHO_RARITY_LABELS = {
  comum: "Comum",
  raro: "Raro",
  epico: "Épico",
  lendario: "Lendário"
};
const ECHO_RARITY_ORDER = ["comum", "raro", "epico", "lendario"];
const ECHO_RANK_NAMES = {
  1: "Fragmento",
  2: "Sombra",
  3: "Forma",
  4: "Essência",
  5: "Manifestação",
  6: "Eco Verdadeiro",
  7: "Ressonância"
};
const ECHO_ATTRIBUTE_LABELS = {
  forca: "Força",
  agilidade: "Agilidade",
  inteligencia: "Inteligência",
  resistencia: "Resistência",
  alma: "Alma"
};

const echosState = {
  session: null,
  isMaster: false,
  echos: [],
  filter: { search: "", rarity: "all", sort: "recent", owner: "all" },
  editingId: null,
  saving: false,
  realtimeBound: false
};

function escEcho(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeEchoRarityValue(value) {
  const normalized = String(value || "comum").trim().toLowerCase();
  return ECHO_RARITY_ORDER.includes(normalized) ? normalized : "comum";
}

function getEchoRarityLabel(value) {
  return ECHO_RARITY_LABELS[normalizeEchoRarityValue(value)] || ECHO_RARITY_LABELS.comum;
}

function getEchoRankLabel(rank) {
  const numeric = Math.min(7, Math.max(1, Number.parseInt(rank, 10) || 1));
  return ECHO_RANK_NAMES[numeric] || ECHO_RANK_NAMES[1];
}

function echoDisplayName(echo) {
  return String(echo?.customName || echo?.name || "Echo").trim() || "Echo";
}

function echoInitials(echo) {
  const name = echoDisplayName(echo);
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(part => part.charAt(0)).join("");
  return (initials || name.slice(0, 2) || "EC").toUpperCase();
}

function formatEchoDate(value) {
  if (!value) return "Data desconhecida";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(value));
  } catch {
    return "Data desconhecida";
  }
}

function getEchoById(id) {
  return echosState.echos.find(echo => echo.id === id) || null;
}

function canEditEchoFully() {
  return echosState.isMaster === true;
}

// Filtro + ordenação aplicados no cliente.
function getVisibleEchos() {
  const { search, rarity, sort, owner } = echosState.filter;
  const term = String(search || "").trim().toLowerCase();

  let list = echosState.echos.slice();

  if (rarity && rarity !== "all") {
    list = list.filter(echo => normalizeEchoRarityValue(echo.rarity) === rarity);
  }

  if (echosState.isMaster && owner && owner !== "all") {
    list = list.filter(echo => String(echo.ownerKey || "") === owner);
  }

  if (term) {
    list = list.filter(echo => {
      const haystack = [
        echoDisplayName(echo),
        echo.name,
        echo.sourceMonsterName,
        echo.ownerName,
        getEchoRarityLabel(echo.rarity),
        getEchoRankLabel(echo.rank)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  const rarityWeight = r => ECHO_RARITY_ORDER.indexOf(normalizeEchoRarityValue(r));

  list.sort((a, b) => {
    switch (sort) {
      case "name":
        return echoDisplayName(a).localeCompare(echoDisplayName(b), "pt-BR");
      case "rank":
        return (b.rank || 0) - (a.rank || 0);
      case "rarity":
        return rarityWeight(b.rarity) - rarityWeight(a.rarity);
      case "recent":
      default:
        return String(b.obtainedAt || "").localeCompare(String(a.obtainedAt || ""));
    }
  });

  return list;
}

// Opções de dono para o filtro do mestre (derivadas dos Echos carregados).
function getEchoOwnerOptions() {
  const seen = new Map();
  echosState.echos.forEach(echo => {
    const key = String(echo.ownerKey || "");
    if (!key || seen.has(key)) return;
    seen.set(key, echo.ownerName || key);
  });
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
}

// Jogadores que podem receber um Echo (exclui o dono atual).
function getEchoTransferTargets(echo) {
  const ownerKey = String(echo?.ownerKey || "").trim().toLowerCase();
  const players = typeof AUTH?.getPlayers === "function" ? AUTH.getPlayers() : [];
  return players
    .map(player => {
      const username = String(player.username || "").trim();
      const key = String(player.key || username).trim().toLowerCase();
      return {
        value: key,
        username,
        label: player.charname || username,
        meta: username
      };
    })
    .filter(target => target.value && target.value !== ownerKey);
}
