const RANKS = [
  { rank: 1, name: "Adormecido" },
  { rank: 2, name: "Despertado" },
  { rank: 3, name: "Ascendido" },
  { rank: 4, name: "Transcendido" },
  { rank: 5, name: "Supremo" },
  { rank: 6, name: "Sagrado" },
  { rank: 7, name: "Divino" }
];

const ESSENCE_BASE_EXPERIENCE = {
  1: 10,
  2: 25,
  3: 50,
  4: 100,
  5: 200,
  6: 400,
  7: 800
};

// Regra de progressão:
// subir de rank exige o equivalente a absorver 100 essências/criaturas do mesmo rank do personagem.
// Ex.: um Adormecido precisa de 100 x 10 XP = 1000 XP para alcançar Despertado.
const SAME_RANK_ESSENCES_PER_RANK_UP = 100;

const EXPERIENCE_TO_NEXT_RANK = Object.fromEntries(
  RANKS
    .filter(entry => entry.rank < 7)
    .map(entry => [entry.rank, getEssenceBaseExperience(entry.rank) * SAME_RANK_ESSENCES_PER_RANK_UP])
);

function clampRank(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 1;
  return Math.min(7, Math.max(1, numeric));
}

function clampAmount(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 1;
  return Math.min(999, Math.max(1, numeric));
}

function getRankName(rank) {
  return RANKS.find(entry => entry.rank === clampRank(rank))?.name || RANKS[0].name;
}

function getNextRankRequirement(rank) {
  return EXPERIENCE_TO_NEXT_RANK[clampRank(rank)] || 0;
}

function getEssenceBaseExperience(rank) {
  return ESSENCE_BASE_EXPERIENCE[clampRank(rank)] || 0;
}

function getExperienceMultiplier(characterRank, essenceRank) {
  const difference = clampRank(essenceRank) - clampRank(characterRank);

  if (difference >= 2) return 1.5;
  if (difference === 1) return 1.25;
  if (difference === 0) return 1;
  if (difference === -1) return 0.5;
  if (difference === -2) return 0.2;
  return 0;
}

function normalizeSoulCore(value, legacyRank = 1) {
  const rank = clampRank(value?.rank ?? legacyRank);
  const requirement = getNextRankRequirement(rank);
  const numericXp = Number.parseInt(value?.xp, 10);
  const xp = rank >= 7
    ? 0
    : Math.max(0, Math.min(Number.isNaN(numericXp) ? 0 : numericXp, Math.max(requirement - 1, 0)));

  return { rank, xp };
}

function calculateEssenceExperience(characterRank, essenceRank) {
  const baseExperience = getEssenceBaseExperience(essenceRank);
  const multiplier = getExperienceMultiplier(characterRank, essenceRank);

  return Math.floor(baseExperience * multiplier);
}

function addExperience(core, amount) {
  const nextCore = normalizeSoulCore(core);
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  const rankUps = [];

  while (remaining > 0 && nextCore.rank < 7) {
    const requirement = getNextRankRequirement(nextCore.rank);
    const available = requirement - nextCore.xp;

    if (remaining < available) {
      nextCore.xp += remaining;
      remaining = 0;
      break;
    }

    remaining -= available;
    const previousRank = nextCore.rank;
    nextCore.rank = clampRank(nextCore.rank + 1);
    nextCore.xp = 0;
    rankUps.push({
      from: previousRank,
      to: nextCore.rank,
      name: getRankName(nextCore.rank)
    });

    if (nextCore.rank >= 7) {
      remaining = 0;
    }
  }

  if (nextCore.rank >= 7) {
    nextCore.xp = 0;
  }

  return {
    core: nextCore,
    rankUps,
    leftover: remaining
  };
}

function absorbSoulEssences(core, essenceRank, amount = 1) {
  let nextCore = normalizeSoulCore(core);
  const applications = [];
  let totalExperience = 0;
  const allRankUps = [];
  const normalizedEssenceRank = clampRank(essenceRank);
  const normalizedAmount = clampAmount(amount);

  for (let index = 0; index < normalizedAmount; index += 1) {
    const gainedExperience = calculateEssenceExperience(nextCore.rank, normalizedEssenceRank);
    const before = { ...nextCore };
    const progress = addExperience(nextCore, gainedExperience);

    totalExperience += gainedExperience;
    nextCore = progress.core;
    allRankUps.push(...progress.rankUps);
    applications.push({
      essenceRank: normalizedEssenceRank,
      before,
      gainedExperience,
      after: { ...nextCore }
    });
  }

  return {
    core: nextCore,
    applications,
    totalExperience,
    rankUps: allRankUps,
    essenceRank: normalizedEssenceRank,
    amount: normalizedAmount
  };
}

export {
  RANKS,
  EXPERIENCE_TO_NEXT_RANK,
  SAME_RANK_ESSENCES_PER_RANK_UP,
  clampAmount,
  clampRank,
  getRankName,
  getNextRankRequirement,
  getExperienceMultiplier,
  getEssenceBaseExperience,
  normalizeSoulCore,
  calculateEssenceExperience,
  addExperience,
  absorbSoulEssences
};
