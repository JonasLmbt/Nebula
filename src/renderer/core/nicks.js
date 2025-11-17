// renderer/core/nicks.js

/**
 * Stores and resolves nick ↔ real name mappings.
 */

import { state } from "./state.js";

const NICKS_KEY = "nicks";

// In-memory list: { nick: string, real: string }[]
export let nicks = loadInitialNicks();

/**
 * Load nick mappings from localStorage.
 */
function loadInitialNicks() {
  try {
    const raw = localStorage.getItem(NICKS_KEY) || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((n) => ({
      nick: String(n.nick || ""),
      real: String(n.real || ""),
    }));
  } catch {
    return [];
  }
}

/**
 * Persist nick mappings to localStorage.
 */
export function saveNicks() {
  localStorage.setItem(NICKS_KEY, JSON.stringify(nicks));
}

/**
 * Get the current in-memory nick list.
 */
export function getNicks() {
  return nicks;
}

/**
 * Replace the in-memory nick list and persist it.
 */
export function setNicks(list) {
  if (!Array.isArray(list)) {
    nicks = [];
  } else {
    nicks = list.map((n) => ({
      nick: String(n.nick || ""),
      real: String(n.real || ""),
    }));
  }
  saveNicks();
}

/**
 * Returns the real name for a given nick or real name.
 * If the name is not found, returns the input.
 */
export function getRealName(name) {
  const lower = String(name || "").toLowerCase();
  const entry = nicks.find(
    (n) =>
      (n.nick && n.nick.toLowerCase() === lower) ||
      (n.real && n.real.toLowerCase() === lower)
  );
  return entry ? entry.real : name;
}

/**
 * Returns the nick for a given real name, or undefined if none exists.
 */
export function getNickFromReal(realName) {
  const lower = String(realName || "").toLowerCase();
  const entry = nicks.find(
    (n) => n.real && n.real.toLowerCase() === lower
  );
  return entry ? entry.nick : undefined;
}

/**
 * Returns true if the given name is stored as a nick.
 */
export function isNick(name) {
  const lower = String(name || "").toLowerCase();
  return nicks.some(
    (n) => n.nick && n.nick.toLowerCase() === lower
  );
}

/**
 * Add or update a nick mapping.
 */
export function setNickMapping(nick, real) {
  const nLower = String(nick || "").toLowerCase();
  const existing = nicks.find(
    (n) => n.nick && n.nick.toLowerCase() === nLower
  );

  if (existing) {
    existing.real = String(real || "");
  } else {
    nicks.push({ nick: String(nick || ""), real: String(real || "") });
  }

  saveNicks();
}

/**
 * Remove a nick mapping.
 */
export function removeNick(nick) {
  const nLower = String(nick || "").toLowerCase();
  nicks = nicks.filter(
    (n) => !n.nick || n.nick.toLowerCase() !== nLower
  );
  saveNicks();
}

/**
 * Get the current nick display mode ('nick' | 'real').
 * Backed by state.nickDisplayMode.
 */
export function getNickDisplayMode() {
  return state.nickDisplayMode;
}

/**
 * Update nick display mode and persist it.
 */
export function setNickDisplayMode(mode) {
  const normalized =
    mode === "real" ? "real" : "nick";
  state.nickDisplayMode = normalized;
  localStorage.setItem("nickDisplayMode", normalized);
}
