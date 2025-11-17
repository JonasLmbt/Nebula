// renderer/util/format.js
// Formatting helpers for text, numbers, HTML escaping, etc.

/**
 * Escape HTML to prevent injection.
 */
export function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape HTML attribute values.
 */
export function escAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format numbers with thousands separators.
 */
export function fmt(num) {
  if (num == null || isNaN(num)) return "0";
  return Number(num).toLocaleString();
}

/**
 * Format ratio with N digits.
 */
export function fmtRatio(num, digits = 2) {
  if (num == null || isNaN(num)) return "0";
  return Number(num).toFixed(digits);
}

/**
 * Ensures a number is finite before formatting.
 */
export function fmtMaybe(num, fallback = "0") {
  if (!Number.isFinite(Number(num))) return fallback;
  return fmt(num);
}

/**
 * Pluralize words: pluralize(3, "win") -> "3 wins"
 */
export function pluralize(value, singular, plural = null) {
  const v = Number(value);
  if (!Number.isFinite(v)) return `0 ${singular}`;
  if (v === 1) return `1 ${singular}`;
  return `${v} ${plural || singular + "s"}`;
}

/**
 * Optional: shorten large numbers:
 *  1,200 → 1.2k
 *  3,500,000 → 3.5M
 */
export function shortNum(num) {
  num = Number(num) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
  return String(num);
}
