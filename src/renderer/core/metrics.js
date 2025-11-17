// renderer/core/metrics.js

/**
 * Tracks local account metrics for the user of the overlay.
 * Everything here is stored in localStorage only and never leaves the client.
 */

const METRICS_KEY = "accountMetrics";

function loadInitialMetrics() {
  const raw = localStorage.getItem(METRICS_KEY);
  if (!raw) {
    return {
      memberSince: Date.now(),
      players: new Set(),
      sessionsCount: 0,
      totalLookups: 0,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      memberSince: parsed.memberSince || Date.now(),
      players: new Set(parsed.players || []),
      sessionsCount: parsed.sessionsCount || 0,
      totalLookups: parsed.totalLookups || 0,
    };
  } catch {
    // Fallback if data is corrupted
    return {
      memberSince: Date.now(),
      players: new Set(),
      sessionsCount: 0,
      totalLookups: 0,
    };
  }
}

export const accountMetrics = loadInitialMetrics();

/**
 * Persist the metrics back to localStorage.
 */
export function saveAccountMetrics() {
  const toStore = {
    memberSince: accountMetrics.memberSince,
    players: Array.from(accountMetrics.players),
    sessionsCount: accountMetrics.sessionsCount,
    totalLookups: accountMetrics.totalLookups,
  };

  localStorage.setItem(METRICS_KEY, JSON.stringify(toStore));
}

/**
 * Track a stats lookup for a given player.
 */
export function trackStatsLookup(playerName) {
  if (!playerName) return;

  const normalized = String(playerName).trim().toLowerCase();
  const isNew = !accountMetrics.players.has(normalized);

  accountMetrics.players.add(normalized);
  accountMetrics.totalLookups += 1;

  saveAccountMetrics();

  if (isNew) {
    console.log(
      "[Metrics] New player tracked:",
      playerName,
      "- Total:",
      accountMetrics.players.size
    );
  }
}

/**
 * Should be called when a new overlay session starts.
 */
export function trackSessionStart() {
  accountMetrics.sessionsCount += 1;
  saveAccountMetrics();
  console.log(
    "[Metrics] Session started - Total sessions:",
    accountMetrics.sessionsCount
  );
}
