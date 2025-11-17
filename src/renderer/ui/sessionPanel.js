// renderer/ui/sessionPanel.js

import { state } from "../core/state.js";
import { normalizeBedwarsStats } from "../core/stats.js";
import { loadBasicSettings } from "../core/settings.js";

/**
 * Begin a Bedwars session for a given username.
 */
export async function startSession(username) {
  state.sessionUsername = username;
  state.startTime = new Date();

  const sessionStats = document.getElementById("sessionStats");
  if (sessionStats) {
    sessionStats.textContent = "Loading session...";
  }

  try {
    const raw = await window.electronAPI.getBedwarsStats(username);
    const normalized = normalizeBedwarsStats(raw);

    state.startStats = normalized;
    state.sessionUuid = normalized.uuid || null;

    updateSessionDisplay();
  } catch (e) {
    console.error("Session start failed:", e);
  }
}

/**
 * Update frequently with latest stats.
 */
export async function updateSession() {
  if (!state.startStats || !state.sessionUsername) return;

  try {
    const raw = await window.electronAPI.getBedwarsStats(
      state.sessionUsername
    );
    const normalized = normalizeBedwarsStats(raw);
    generateSessionHTML(state.startStats, normalized);
    updateSessionTime();
  } catch (e) {
    console.error("Session update failed:", e);
  }
}

/**
 * Update the basic info on top of the session panel.
 */
export function updateSessionDisplay() {
  const ign = document.getElementById("sessionIgn");
  const avatar = document.getElementById("sessionAvatar");

  if (!ign || !avatar) return;

  ign.textContent = state.sessionUsername;

  if (state.sessionUuid) {
    avatar.src = `https://crafatar.com/avatars/${state.sessionUuid}?size=48&overlay`;
  } else {
    avatar.src =
      "https://crafatar.com/avatars/8667ba71b85a4004af54457a9734eed7?overlay";
  }
}

/**
 * Update the "Session: X minutes" text.
 */
export function updateSessionTime() {
  const el = document.getElementById("sessionTime");
  if (!el || !state.startTime) return;

  const secs = Math.floor((new Date() - state.startTime) / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);

  el.textContent =
    hrs > 0 ? `Session: ${hrs}h ${mins % 60}m` : `Session: ${mins}m`;
}

/**
 * Fill session panel with stat deltas.
 * Placeholder — real HTML kommt später.
 */
export function generateSessionHTML(start, current) {
  const el = document.getElementById("sessionStats");
  if (!el) return;

  el.innerHTML = `
    <div>Stars: ${current.level - start.level}</div>
    <div>FKDR: ${(current.fkdr - start.fkdr).toFixed(2)}</div>
  `;
}

/**
 * Automatically start the session if username exists.
 */
export function autoStartSessionFromSettings() {
  const settings = loadBasicSettings();
  if (settings.username) {
    startSession(settings.username);
  }
}
