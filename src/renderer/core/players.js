// renderer/core/players.js

/**
 * Core helpers for managing players in the overlay:
 * - queue handling
 * - add/remove players
 * - sources (who/chat/party/manual/username/guild/invite)
 * - nick state tracking
 *
 * This module has **no DOM access**.
 */

import { state, normalizeName } from "./state.js";
import {
  nicks,
  getRealName,
  getNickFromReal,
  isNick,
} from "./nicks.js";

const electronApi = window.electronAPI || null;

// Optional callback: UI modules can subscribe to be notified when
// the player list changes and then call renderTable() + updateOverlaySize().
let onPlayersChanged = null;

/**
 * Register a callback that is called whenever players/state changes.
 * @param {() => void} fn
 */
export function setPlayersChangedCallback(fn) {
  onPlayersChanged = typeof fn === "function" ? fn : null;
}

function notifyChanged() {
  if (typeof onPlayersChanged === "function") {
    onPlayersChanged();
  }
}

/**
 * Add/track a source for a player.
 * source: 'username' | 'manual' | 'party' | 'who' | 'chat' | 'invite' | 'guild'
 */
export function addPlayerSource(name, source) {
  const key = normalizeName(getRealName(name) || name);
  const set = state.playerSources.get(key) || new Set();
  set.add(source);
  state.playerSources.set(key, set);
}

/**
 * Remove a single source from a player.
 * If no sources remain and player is not pinned / self, the player is removed.
 */
export function removePlayerSource(name, source) {
  const key = normalizeName(getRealName(name) || name);

  // Never alter sources for session user
  if (
    state.sessionUsername &&
    key === normalizeName(state.sessionUsername)
  ) {
    return;
  }

  // Do not alter sources for pinned players (only manual unpin)
  if (state.pinnedPlayers.has(key)) {
    return;
  }

  const set = state.playerSources.get(key);
  if (!set) return;

  set.delete(source);
  if (set.size === 0) {
    // No sources left -> remove player completely
    removePlayer(name);
  } else {
    state.playerSources.set(key, set);
    notifyChanged();
  }
}

/**
 * Completely remove a player from state (unless session user or pinned).
 */
export function removePlayer(name) {
  const key = normalizeName(getRealName(name) || name);

  // NEVER remove the session username (own user)
  if (
    state.sessionUsername &&
    key === normalizeName(state.sessionUsername)
  ) {
    return;
  }

  // Prevent removal if pinned
  if (state.pinnedPlayers.has(key)) {
    return;
  }

  state.displayedPlayers.delete(key);
  state.playerSources.delete(key);
  state.nickedPlayers.delete(key);
  delete state.originalNicks[key];
  try {
    delete state.activeNickState[key];
  } catch {
    // ignore
  }

  notifyChanged();
}

/**
 * Add an invite timeout for a player; after 60 seconds the 'invite'
 * source is removed automatically.
 */
export function addInviteTimeout(name) {
  const key = normalizeName(getRealName(name) || name);

  // Clear existing timeout
  if (state.inviteTimeouts.has(key)) {
    clearTimeout(state.inviteTimeouts.get(key));
  }

  const timeoutId = setTimeout(() => {
    removePlayerSource(name, "invite");
    state.inviteTimeouts.delete(key);
    notifyChanged();
  }, 60000);

  state.inviteTimeouts.set(key, timeoutId);
}

/**
 * Clear and cancel an invite timeout for a player.
 */
export function clearInviteTimeout(name) {
  const key = normalizeName(getRealName(name) || name);
  if (state.inviteTimeouts.has(key)) {
    clearTimeout(state.inviteTimeouts.get(key));
    state.inviteTimeouts.delete(key);
  }
}

/**
 * Remove all players that are not:
 * - the session username
 * - pinned
 * - or held by the 'username' source
 *
 * For username-backed players, only the 'username' source is kept.
 */
export function clearAllButUsername() {
  const selfKey = state.sessionUsername
    ? normalizeName(state.sessionUsername)
    : null;

  for (const [key, sources] of Array.from(state.playerSources.entries())) {
    // Always preserve the session user; ensure it has 'username' source
    if (selfKey && key === selfKey) {
      state.playerSources.set(key, new Set(["username"]));
      continue;
    }

    // Preserve pinned players entirely
    if (state.pinnedPlayers.has(key)) {
      continue;
    }

    if (sources.has("username")) {
      // Keep only username source
      state.playerSources.set(key, new Set(["username"]));
      continue;
    }

    // Remove completely
    state.playerSources.delete(key);
    state.displayedPlayers.delete(key);
    state.nickedPlayers.delete(key);
    delete state.originalNicks[key];
    try {
      delete state.activeNickState[key];
    } catch {
      // ignore
    }
  }

  notifyChanged();
}

/**
 * Fetch stats for a single player from the backend and update state.
 * This does NOT add sources; use addPlayer(name, source) instead.
 */
export async function fetchPlayerStats(name) {
  if (!electronApi || typeof electronApi.invoke !== "function") {
    console.warn("[players] electronAPI.invoke not available");
    return;
  }

  const realName = getRealName(name);
  const key = normalizeName(realName);
  if (state.displayedPlayers.has(key) && state.playerCache[key]) {
    return; // already cached & shown
  }

  const wasNick = isNick(name);

  const res = await electronApi.invoke("bedwars:stats", realName);

  if (!res || res.error) {
    console.error("[players] Stats error for", realName, ":", res?.error);
    return;
  }

  const normName = normalizeName(res.name || realName);

  state.displayedPlayers.add(normName);
  state.playerCache[normName] = res;

  if (wasNick) {
    state.nickedPlayers.add(normName);
    // Map real->original nick
    state.originalNicks[normName] = name;
  } else {
    state.nickedPlayers.delete(normName);
  }

  notifyChanged();
}

/**
 * High-level helper:
 * - track source
 * - update activeNickState heuristic
 * - fetch stats if not already displayed
 */
export function addPlayer(name, source) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return;

  addPlayerSource(trimmed, source);

  const real = getRealName(trimmed) || trimmed;
  const key = normalizeName(real);

  // Active-nick detection heuristic
  try {
    const entry = nicks.find(
      (n) => n.nick && n.nick.toLowerCase() === trimmed.toLowerCase()
    );
    if (entry) {
      // They added the nick -> mark active
      state.activeNickState[normalizeName(entry.real)] = true;
    } else {
      const reverse = nicks.find(
        (n) => n.real && n.real.toLowerCase() === trimmed.toLowerCase()
      );
      if (reverse && state.activeNickState[normalizeName(reverse.real)] == null) {
        // Real name explicitly added -> mark as not nicked (if previously unknown)
        state.activeNickState[normalizeName(reverse.real)] = false;
      }
    }
  } catch {
    // ignore
  }

  if (!state.displayedPlayers.has(key)) {
    // async, no await needed here
    fetchPlayerStats(trimmed).catch((err) =>
      console.error("[players] fetchPlayerStats failed:", err)
    );
  } else {
    notifyChanged();
  }
}

/**
 * Process the current queue: add all queued players as 'manual'.
 */
export async function fetchAllFromQueue() {
  const q = Array.from(state.queue || []);
  if (!q.length) return;

  for (const inputName of q) {
    addPlayer(inputName, "manual");
  }

  state.queue = [];
  notifyChanged();
}

/**
 * Add names to the queue (e.g. from the input field).
 */
export function enqueueNames(list) {
  const arr = Array.isArray(list) ? list : [list];
  const cleaned = arr
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  state.queue.push(...cleaned);
}
