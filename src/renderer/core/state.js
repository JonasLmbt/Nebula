// renderer/core/state.js

/**
 * Central in-memory state for the overlay.
 * This module contains only plain data structures and small helpers,
 * no DOM access and no Electron calls.
 */

export const state = {
  // Queue of players to be processed
  queue: [],

  // Session tracking
  startStats: null,
  startTime: null,
  sessionUsername: null,
  sessionUpdateInterval: null,
  sessionUuid: null,

  // Players currently displayed in the table
  displayedPlayers: new Set(),

  // Players that were originally added as nick
  nickedPlayers: new Set(),

  // Map: normalizedName -> Set of sources ('username'|'manual'|'party'|'who'|'chat'|'invite'|'guild')
  playerSources: new Map(),

  // Map: normalizedName -> timeout ID (for invites etc.)
  inviteTimeouts: new Map(),

  // Cache for player objects, key = normalized name
  playerCache: {},

  // Tracks whether a registered nick is currently active in game
  // key: realName(lower) -> boolean
  activeNickState: {},

  // Stores the originally entered nick for a real name
  // realName(lower) -> original nick
  originalNicks: {},

  // How to display nicks in the UI: 'nick' | 'real'
  nickDisplayMode: localStorage.getItem("nickDisplayMode") || "nick",

  // Pinned players cannot be removed by automatic cleanup
  pinnedPlayers: new Set(
    JSON.parse(localStorage.getItem("pinnedPlayers") || "[]").map((s) =>
      String(s).toLowerCase()
    )
  ),

  // Game / lobby state flags
  preGameLobby: false,
  gameInProgress: false,
  guildListMode: false,
  guildBatchAccepted: false,
};

/**
 * Persist pinned players to localStorage.
 */
export function savePinnedPlayers() {
  localStorage.setItem(
    "pinnedPlayers",
    JSON.stringify(Array.from(state.pinnedPlayers))
  );
}

/**
 * Helper to normalise player names (for map/set keys).
 */
export function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}
