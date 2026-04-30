function readMergedSheets() {
  const localSheets = readJsonStorage(SHEETS_KEY, {});
  const remoteSheets = readJsonStorage(REMOTE_SHEETS_KEY, {});
  return {
    ...localSheets,
    ...remoteSheets
  };
}

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function asPositiveInt(value, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return Math.max(0, numeric);
}

function clamp(value, min, max) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeStatsVisibility(type, value) {
  if (type === "player") return true;
  return value === true;
}

function getPercent(current, max) {
  if (!max || max <= 0) return 0;
  return clamp((current / max) * 100, 0, 100);
}

function getBarFillStyle(type, current, max) {
  const percent = getPercent(current, max);

  if (type === "vida") {
    const hue = Math.round((percent / 100) * 120);
    const lightness = 28 + (percent / 100) * 22;
    return `width:${percent}%; background:hsl(${hue} 78% ${lightness}%); box-shadow:0 0 16px hsla(${hue}, 90%, ${Math.max(lightness, 35)}%, 0.22);`;
  }

  const lightness = 14 + (percent / 100) * 50;
  const saturation = 48 + (percent / 100) * 30;
  return `width:${percent}%; background:hsl(204 ${saturation}% ${lightness}%); box-shadow:0 0 16px hsla(204, 90%, ${Math.max(lightness, 28)}%, 0.2);`;
}

function roundTo(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "registro";
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "AR";
  return parts.map(part => part[0]?.toUpperCase() || "").join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
