const RANKS = [
  { rank: 1, name: "Adormecido" },
  { rank: 2, name: "Despertado" },
  { rank: 3, name: "Ascendido" },
  { rank: 4, name: "Transcendido" },
  { rank: 5, name: "Supremo" },
  { rank: 6, name: "Sagrado" },
  { rank: 7, name: "Divino" }
];

const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const XP_LIMIT_BY_RANK = {
  1: 1000,
  2: 2500,
  3: 5000,
  4: 10000,
  5: 20000,
  6: 40000
};
const XP_LIMIT = XP_LIMIT_BY_RANK[1];
const XP_PER_ATTRIBUTE_POINT = 25;
const OVERLOAD_XP_MULTIPLIER = 0.2;
const CREATURE_CLASSES = [
  { key: "Beast", label: "Beast", coreCount: 1 },
  { key: "Monster", label: "Monster", coreCount: 2 },
  { key: "Demon", label: "Demon", coreCount: 3 },
  { key: "Devil", label: "Devil", coreCount: 4 },
  { key: "Tyrant", label: "Tyrant", coreCount: 5 },
  { key: "Terror", label: "Terror", coreCount: 6 },
  { key: "Titan", label: "Titan", coreCount: 7 }
];

const ATTRIBUTE_CAP_RANGES = {
  mortal: {
    1: [8, 12],
    2: [13, 18],
    3: [19, 26],
    4: [27, 36],
    5: [37, 50],
    6: [51, 68],
    7: [69, 90]
  },
  monster: {
    1: [11, 16],
    2: [17, 24],
    3: [25, 34],
    4: [35, 48],
    5: [49, 66],
    6: [67, 88],
    7: [89, 115]
  }
};

const EXPERIENCE_TO_NEXT_RANK = { ...XP_LIMIT_BY_RANK };

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

function normalizeNumber(value, fallback = 0) {
  const numeric = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeInteger(value, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? fallback : numeric;
}

function roundToQuarter(value) {
  return Math.round((normalizeNumber(value, 0) + Number.EPSILON) * 4) / 4;
}

function formatXp(value) {
  const rounded = roundToQuarter(value);
  return Number.isInteger(rounded) ? String(rounded) : String(Number(rounded.toFixed(2)));
}

function getRankName(rank) {
  return RANKS.find(entry => entry.rank === clampRank(rank))?.name || RANKS[0].name;
}

function getNextRankRequirement(rank) {
  return EXPERIENCE_TO_NEXT_RANK[clampRank(rank)] || 0;
}

function getCapKind(kind) {
  return kind === "monster" ? "monster" : "mortal";
}

function attrKey(attr) {
  return `attr${attr}`;
}

function readAttributeValue(source, attr) {
  const value = source?.[attrKey(attr)] ?? source?.[attr];
  const numeric = normalizeInteger(value, 0);
  return Math.max(0, numeric);
}

function readAttributes(source = {}) {
  return Object.fromEntries(ATTRIBUTES.map(attr => [attr, readAttributeValue(source, attr)]));
}

function hashString(value) {
  const text = String(value || "soul-core");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function capSeedFromOptions(value, options = {}) {
  return String(
    value?.attributeCaps?.seed ||
    options.seed ||
    options.characterKey ||
    options.charName ||
    "soul-core"
  );
}

function rollCap(kind, rank, attr, currentValue, seed) {
  const capKind = getCapKind(kind);
  const [min, max] = ATTRIBUTE_CAP_RANGES[capKind]?.[clampRank(rank)] || ATTRIBUTE_CAP_RANGES.mortal[1];
  const span = Math.max(1, max - min + 1);
  const rolled = min + (hashString(`${seed}:${capKind}:${rank}:${attr}`) % span);
  return Math.max(rolled, Math.max(0, normalizeInteger(currentValue, 0)));
}

function normalizeAttributeCaps(value = {}, kind = "mortal", rank = 1, attributes = {}, seed = "soul-core") {
  const capKind = getCapKind(value.kind || kind);
  const byRank = {};

  Object.entries(value.byRank || {}).forEach(([rankKey, caps]) => {
    const normalizedRank = clampRank(rankKey);
    byRank[normalizedRank] = {};
    ATTRIBUTES.forEach(attr => {
      const cap = normalizeInteger(caps?.[attr], 0);
      if (cap > 0) byRank[normalizedRank][attr] = cap;
    });
  });

  const currentRank = clampRank(rank);
  const currentAttributes = readAttributes(attributes);
  byRank[currentRank] = byRank[currentRank] || {};
  ATTRIBUTES.forEach(attr => {
    const existing = normalizeInteger(byRank[currentRank][attr], 0);
    byRank[currentRank][attr] = existing > 0
      ? Math.max(existing, currentAttributes[attr])
      : rollCap(capKind, currentRank, attr, currentAttributes[attr], seed);
  });

  return { kind: capKind, seed, byRank };
}

function normalizeSoulCore(value = {}, legacyRank = 1, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rank = clampRank(source.rank ?? legacyRank);
  const xpLimit = getNextRankRequirement(rank);
  const rawXp = roundToQuarter(Math.max(0, normalizeNumber(source.xp, 0)));
  const xp = xpLimit > 0 ? Math.min(xpLimit, rawXp) : 0;
  const migratedOverloadXp = xpLimit > 0 && rawXp > xpLimit ? roundToQuarter(rawXp - xpLimit) : 0;
  const overloadXp = xpLimit > 0
    ? roundToQuarter(Math.max(0, normalizeNumber(source.overloadXp, 0) + migratedOverloadXp))
    : 0;
  const attributes = options.attributes || options.currentAttributes || {};
  const seed = capSeedFromOptions(source, options);
  const attributeCaps = normalizeAttributeCaps(source.attributeCaps || {}, options.kind || "mortal", rank, attributes, seed);
  const overloaded = rank < 7 && xpLimit > 0 && (Boolean(source.overloaded) || overloadXp > 0);
  const pendingNightmare = rank < 7 && xpLimit > 0 && (Boolean(source.pendingNightmare) || xp >= xpLimit || overloaded);

  return {
    rank,
    xp,
    xpLimit,
    saturation: xpLimit > 0 ? Number(Math.min(1, xp / xpLimit).toFixed(3)) : 1,
    pendingNightmare,
    overloaded,
    overloadXp,
    attributeGainProgress: Math.max(0, roundToQuarter(source.attributeGainProgress || 0)),
    weakKillsToday: Math.max(0, normalizeInteger(source.weakKillsToday, 0)),
    attributeCaps,
    lastAttributeGain: Array.isArray(source.lastAttributeGain) ? source.lastAttributeGain.slice(0, 10) : [],
    history: Array.isArray(source.history) ? source.history.slice(0, 20) : []
  };
}

function normalizeCreatureClass(value) {
  const text = String(value || "Beast").trim().toLowerCase();
  return CREATURE_CLASSES.find(entry => entry.key.toLowerCase() === text)?.key || "Beast";
}

function getCreatureClassInfo(value) {
  const key = normalizeCreatureClass(value);
  return CREATURE_CLASSES.find(entry => entry.key === key) || CREATURE_CLASSES[0];
}

// A modulacao de XP por nivel da criatura vem somente da diferenca de rank
// (2^(rankCriatura - rankPersonagem)): criatura mais fraca rende menos,
// mais forte rende mais. O antigo multiplicador de farm por contagem
// diaria (weakKillsToday) foi removido por decisao de regra (2026-06-12).
function calculateCreatureExperience(core, creatureRank, creatureClass, amount = 1) {
  const normalizedCore = normalizeSoulCore(core);
  const normalizedCreatureRank = clampRank(creatureRank);
  const normalizedAmount = clampAmount(amount);
  const classInfo = getCreatureClassInfo(creatureClass);
  const rankDifference = normalizedCreatureRank - normalizedCore.rank;
  const baseXp = roundToQuarter(classInfo.coreCount * (2 ** rankDifference));
  let totalXp = 0;
  const applications = [];

  for (let index = 0; index < normalizedAmount; index += 1) {
    totalXp = roundToQuarter(totalXp + baseXp);
    applications.push({
      creatureRank: normalizedCreatureRank,
      creatureClass: classInfo.key,
      baseXp,
      gainedXp: baseXp
    });
  }

  return {
    creatureRank: normalizedCreatureRank,
    creatureClass: classInfo.key,
    creatureCoreCount: classInfo.coreCount,
    amount: normalizedAmount,
    baseXp,
    totalXp,
    applications
  };
}

function getEligibleAttributes(attributes, caps) {
  return ATTRIBUTES.filter(attr => readAttributeValue(attributes, attr) < normalizeInteger(caps?.[attr], 0));
}

function calculatePotentialAttributeGains(core, xpGained, attributes = {}) {
  const normalizedCore = normalizeSoulCore(core, core?.rank || 1, { attributes });
  const caps = normalizedCore.attributeCaps.byRank[normalizedCore.rank] || {};
  const currentAttributes = readAttributes(attributes);
  const availableXp = normalizedCore.xpLimit > 0
    ? Math.max(0, roundToQuarter(xpGained))
    : 0;
  const rawPoints = Math.floor((normalizedCore.attributeGainProgress + availableXp) / XP_PER_ATTRIBUTE_POINT);
  const totalRoom = ATTRIBUTES.reduce((sum, attr) => {
    return sum + Math.max(0, normalizeInteger(caps[attr], 0) - currentAttributes[attr]);
  }, 0);
  return {
    availableXp,
    points: Math.min(rawPoints, totalRoom),
    rawPoints,
    totalRoom,
    saturated: totalRoom <= 0
  };
}

function calculateExperienceApplication(core, xpGained) {
  const normalizedCore = normalizeSoulCore(core);
  const totalExperience = Math.max(0, roundToQuarter(xpGained));

  if (normalizedCore.xpLimit <= 0 || totalExperience <= 0) {
    return {
      totalExperience,
      appliedExperience: 0,
      rankExperience: 0,
      overloadExperience: 0,
      overloadMultiplier: normalizedCore.overloaded ? OVERLOAD_XP_MULTIPLIER : 1,
      xpAfter: normalizedCore.xp,
      overloadXpAfter: normalizedCore.overloadXp,
      overloadedAfter: normalizedCore.overloaded
    };
  }

  if (normalizedCore.overloaded) {
    const overloadExperience = roundToQuarter(totalExperience * OVERLOAD_XP_MULTIPLIER);
    return {
      totalExperience,
      appliedExperience: overloadExperience,
      rankExperience: 0,
      overloadExperience,
      overloadMultiplier: OVERLOAD_XP_MULTIPLIER,
      xpAfter: normalizedCore.xp,
      overloadXpAfter: roundToQuarter(normalizedCore.overloadXp + overloadExperience),
      overloadedAfter: true
    };
  }

  const remainingRankXp = Math.max(0, normalizedCore.xpLimit - normalizedCore.xp);
  const rankExperience = roundToQuarter(Math.min(totalExperience, remainingRankXp));
  const overloadExperience = roundToQuarter(Math.max(0, totalExperience - rankExperience));

  return {
    totalExperience,
    appliedExperience: roundToQuarter(rankExperience + overloadExperience),
    rankExperience,
    overloadExperience,
    overloadMultiplier: 1,
    xpAfter: roundToQuarter(normalizedCore.xp + rankExperience),
    overloadXpAfter: overloadExperience,
    overloadedAfter: overloadExperience > 0
  };
}

function chooseAttribute(eligible, random = Math.random) {
  const index = Math.floor(Math.max(0, Math.min(0.999999, random())) * eligible.length);
  return eligible[index] || eligible[0];
}

function aggregateGains(gains) {
  const byAttr = {};
  gains.forEach(gain => {
    byAttr[gain.attr] = byAttr[gain.attr] || { attr: gain.attr, amount: 0, value: gain.value };
    byAttr[gain.attr].amount += 1;
    byAttr[gain.attr].value = gain.value;
  });
  return Object.values(byAttr);
}

function applyAttributeGainProgress(attributes, caps, startingProgress, experience, random = Math.random) {
  const progressPool = roundToQuarter(Math.max(0, normalizeNumber(startingProgress, 0)) + Math.max(0, normalizeNumber(experience, 0)));
  let pointsToGenerate = Math.floor(progressPool / XP_PER_ATTRIBUTE_POINT);
  const gains = [];
  let discardedAttributePoints = 0;

  while (pointsToGenerate > 0) {
    const eligible = getEligibleAttributes(attributes, caps);
    if (!eligible.length) {
      discardedAttributePoints += pointsToGenerate;
      break;
    }
    const attr = chooseAttribute(eligible, random);
    attributes[attr] += 1;
    gains.push({ attr, value: attributes[attr] });
    pointsToGenerate -= 1;
  }

  return {
    attributeGainProgress: roundToQuarter(progressPool - Math.floor(progressPool / XP_PER_ATTRIBUTE_POINT) * XP_PER_ATTRIBUTE_POINT),
    gains,
    aggregatedGains: aggregateGains(gains),
    discardedAttributePoints
  };
}

function applySoulExperience(data = {}, kind = "player", payload = {}, random = Math.random) {
  const nextData = { ...data };
  const attributes = readAttributes(nextData);
  const seed = nextData.charName || payload.characterKey || payload.targetKey || "soul-core";
  const before = normalizeSoulCore(nextData.soulCore || {}, nextData.charLevel || 1, { kind, attributes, seed });
  const calculation = calculateCreatureExperience(
    before,
    payload.creatureRank ?? payload.essenceRank ?? 1,
    payload.creatureClass ?? payload.className ?? "Beast",
    payload.amount ?? 1
  );
  const application = calculateExperienceApplication(before, calculation.totalXp);
  const appliedExperience = application.appliedExperience;
  const nextXp = application.xpAfter;
  const caps = before.attributeCaps.byRank[before.rank] || {};
  const attributeProgress = applyAttributeGainProgress(attributes, caps, before.attributeGainProgress, application.rankExperience, random);

  ATTRIBUTES.forEach(attr => {
    nextData[attrKey(attr)] = String(attributes[attr]);
  });

  const aggregatedGains = attributeProgress.aggregatedGains;
  const nextCore = normalizeSoulCore(
    {
      ...before,
      xp: nextXp,
      pendingNightmare: before.rank < 7 && (nextXp >= before.xpLimit || application.overloadedAfter),
      overloaded: application.overloadedAfter,
      overloadXp: application.overloadXpAfter,
      attributeGainProgress: attributeProgress.attributeGainProgress,
      attributeCaps: before.attributeCaps,
      lastAttributeGain: aggregatedGains,
      history: [
        {
          type: "soul-xp",
          at: new Date().toISOString(),
          creatureRank: calculation.creatureRank,
          creatureClass: calculation.creatureClass,
          amount: calculation.amount,
          totalXp: calculation.totalXp,
          appliedXp: appliedExperience,
          rankXp: application.rankExperience,
          overloadXp: application.overloadExperience,
          overloadMultiplier: application.overloadMultiplier,
          attributeGains: aggregatedGains
        },
        ...before.history
      ].slice(0, 20)
    },
    before.rank,
    { kind, attributes, seed }
  );

  nextData.soulCore = nextCore;
  nextData.charLevel = String(nextCore.rank);

  return {
    data: nextData,
    core: nextCore,
    summary: {
      before,
      after: nextCore,
        calculation,
        totalExperience: calculation.totalXp,
        appliedExperience,
        rankExperience: application.rankExperience,
        overloadExperience: application.overloadExperience,
        overloadMultiplier: application.overloadMultiplier,
        attributeGains: aggregatedGains,
        discardedAttributePoints: attributeProgress.discardedAttributePoints
      }
    };
}

function completeSoulNightmare(data = {}, kind = "player", random = Math.random) {
  const nextData = { ...data };
  const attributes = readAttributes(nextData);
  const seed = nextData.charName || "soul-core";
  const before = normalizeSoulCore(nextData.soulCore || {}, nextData.charLevel || 1, { kind, attributes, seed });

  if (!before.pendingNightmare || before.rank >= 7) {
    return {
      completed: false,
      data: nextData,
      core: before,
      summary: {
        before,
        after: before,
        reason: before.rank >= 7 ? "Rank maximo alcancado." : "O nucleo ainda nao esta pronto para o pesadelo."
      }
    };
  }

  const nextRank = clampRank(before.rank + 1);
  const nextCaps = normalizeAttributeCaps(before.attributeCaps, kind, nextRank, attributes, seed);
  const nextRankLimit = getNextRankRequirement(nextRank);
  const overloadToApply = roundToQuarter(before.overloadXp || 0);
  const nextRankExperience = nextRankLimit > 0 ? roundToQuarter(Math.min(overloadToApply, nextRankLimit)) : 0;
  const nextOverloadXp = nextRankLimit > 0 ? roundToQuarter(Math.max(0, overloadToApply - nextRankExperience)) : 0;
  const caps = nextCaps.byRank[nextRank] || {};
  const attributeProgress = applyAttributeGainProgress(attributes, caps, 0, nextRankExperience, random);

  ATTRIBUTES.forEach(attr => {
    nextData[attrKey(attr)] = String(attributes[attr]);
  });

  const nextCore = normalizeSoulCore(
    {
      ...before,
      rank: nextRank,
      xp: nextRankExperience,
      pendingNightmare: nextRank < 7 && nextRankLimit > 0 && (nextRankExperience >= nextRankLimit || nextOverloadXp > 0),
      overloaded: nextOverloadXp > 0,
      overloadXp: nextOverloadXp,
      attributeGainProgress: attributeProgress.attributeGainProgress,
      attributeCaps: nextCaps,
      lastAttributeGain: attributeProgress.aggregatedGains,
      history: [
        {
          type: "nightmare-complete",
          at: new Date().toISOString(),
          from: before.rank,
          to: nextRank,
          appliedOverloadXp: nextRankExperience,
          remainingOverloadXp: nextOverloadXp,
          attributeGains: attributeProgress.aggregatedGains
        },
        ...before.history
      ].slice(0, 20)
    },
    nextRank,
    { kind, attributes, seed }
  );

  nextData.soulCore = nextCore;
  nextData.charLevel = String(nextRank);

  return {
    completed: true,
    data: nextData,
    core: nextCore,
    summary: {
        before,
        after: nextCore,
        newCaps: nextCore.attributeCaps.byRank[nextRank],
        appliedOverloadExperience: nextRankExperience,
        remainingOverloadExperience: nextOverloadXp,
        attributeGains: attributeProgress.aggregatedGains
      }
    };
}

function getSoulState(core, attributes = {}) {
  const normalized = normalizeSoulCore(core, core?.rank || 1, { attributes });
  if (normalized.rank >= 7) return "Rank maximo";
  if (normalized.overloaded) return "Sobrecarregado";
  if (normalized.pendingNightmare) return "Pronto para pesadelo";
  if (calculatePotentialAttributeGains(normalized, 0, attributes).saturated) return "Saturado";
  return "Em crescimento";
}

function calculateEssenceExperience(characterRank, essenceRank) {
  return calculateCreatureExperience({ rank: characterRank, xp: 0 }, essenceRank, "Beast", 1).totalXp;
}

function getExperienceMultiplier(characterRank, essenceRank) {
  return 2 ** (clampRank(essenceRank) - clampRank(characterRank));
}

function getEssenceBaseExperience(rank) {
  return 1 * (2 ** (clampRank(rank) - 1));
}

function addExperience(core, amount) {
  const before = normalizeSoulCore(core);
  const xp = before.xpLimit > 0
    ? roundToQuarter(before.xp + Math.max(0, normalizeNumber(amount, 0)))
    : before.xp;
  const nextCore = normalizeSoulCore({
    ...before,
    xp,
    pendingNightmare: before.rank < 7 && before.xpLimit > 0 && xp >= before.xpLimit
  }, before.rank);
  return { core: nextCore, rankUps: [], leftover: 0 };
}

function absorbSoulEssences(core, essenceRank, amount = 1) {
  const before = normalizeSoulCore(core);
  const calculation = calculateCreatureExperience(before, essenceRank, "Beast", amount);
  const progress = addExperience(before, calculation.totalXp);
  return {
    core: progress.core,
    applications: calculation.applications,
    totalExperience: calculation.totalXp,
    rankUps: [],
    essenceRank: calculation.creatureRank,
    amount: calculation.amount
  };
}

function buildProgressLabel(core) {
  const normalized = normalizeSoulCore(core);
  if (!normalized.xpLimit) return "Rank maximo alcancado";
  return `${formatXp(normalized.xp)} / ${formatXp(normalized.xpLimit)} XP`;
}

export {
  RANKS,
  ATTRIBUTES,
  XP_LIMIT,
  XP_LIMIT_BY_RANK,
  XP_PER_ATTRIBUTE_POINT,
  OVERLOAD_XP_MULTIPLIER,
  CREATURE_CLASSES,
  ATTRIBUTE_CAP_RANGES,
  EXPERIENCE_TO_NEXT_RANK,
  clampAmount,
  clampRank,
  roundToQuarter,
  formatXp,
  getRankName,
  getNextRankRequirement,
  getExperienceMultiplier,
  getEssenceBaseExperience,
  normalizeSoulCore,
  normalizeAttributeCaps,
  calculateEssenceExperience,
  calculateCreatureExperience,
  calculateExperienceApplication,
  calculatePotentialAttributeGains,
  applySoulExperience,
  completeSoulNightmare,
  getSoulState,
  addExperience,
  absorbSoulEssences,
  buildProgressLabel
};
