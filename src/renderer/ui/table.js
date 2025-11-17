// renderer/ui/table.js

import { state } from "../core/state.js";
import { STATS, getColorForValue, updatePlayerLevel } from "../core/stats.js";
import { getRealName, getNickFromReal } from "../core/nicks.js";
import { esc, escAttr, fmt } from "../util/format.js";

function getRowsContainer() {
  return document.getElementById("rows");
}

/**
 * Clear the entire table body.
 */
export function clearTable() {
  const rows = getRowsContainer();
  if (rows) rows.innerHTML = "";
}

/**
 * Render a single player row into the table.
 *
 * @param {object} player         Normalized player stats object
 * @param {object} statSettings   Settings with layout + visible + colorRules
 * @param {string[]} [dynamicStats] Optional explicit list of stat keys to render
 */
export function renderPlayerRow(player, statSettings, dynamicStats) {
  const rows = getRowsContainer();
  if (!rows || !player) return;

  const realName = player.name;
  const isUnresolved = player.error || player.unresolved;
  const key = realName.toLowerCase();

  // Sources / party flag from global state
  const sources = state.playerSources?.get(key);
  const isPartyMember = !!(sources && sources.has("party"));

  // Nick handling
  const lowerReal = realName.toLowerCase();
  const originalNick =
    (state.originalNicks && state.originalNicks[lowerReal]) ||
    getNickFromReal(realName);
  const hasNick = !!originalNick;

  const activeNickState = state.activeNickState || {};
  const isActiveNick = !!activeNickState[lowerReal];
  const showNick = hasNick && state.nickDisplayMode === "nick" && isActiveNick;

  const displayName = showNick ? originalNick : realName;
  const tooltipOther = hasNick ? (showNick ? realName : originalNick) : "";

  // Determine which stats columns to render
  const selectedStats =
    dynamicStats ||
    ((statSettings?.layout || []).filter(
      (k) => k && statSettings.visible.includes(k)
    ) || []);

  const dynamicCells = selectedStats
    .map((statKey) => {
      if (statKey === "level" || statKey === "name") return "";

      let val = player[statKey];

      // Derived stat via calc() if value missing
      const statDef = STATS[statKey];
      if (
        (val == null ||
          (typeof val === "number" && Number.isNaN(val))) &&
        statDef &&
        typeof statDef.calc === "function"
      ) {
        try {
          val = statDef.calc(player);
        } catch {
          val = null;
        }
      }

      const num = typeof val === "number" ? val : Number(val);
      const colorStyle = getColorForValue(statKey, num, statSettings);

      return `<td class="metric" ${colorStyle}>${fmt(val)}</td>`;
    })
    .join("");

  // Level/star display (uses stats.updatePlayerLevel)
  const levelHTML = updatePlayerLevel(player);

  const pinned = state.pinnedPlayers?.has(key);
  const sessionUsername = state.sessionUsername;

  const orderedCells = [
    `<td class="lvl">${levelHTML}</td>`,
    `<td class="name">
      ${
        showNick || isUnresolved
          ? `<span class="rank-tag" style="color:#ffffff">[NICK]</span>`
          : player.rankTag
          ? `<span class="rank-tag" style="color:${player.rankColor || "#ffffff"}">${player.rankTag}</span>`
          : ""
      }
      ${
        showNick || isUnresolved
          ? `<span class="player-name" style="color:#ffffff">${esc(
              displayName
            )}</span>`
          : player.rankTag
          ? `<span class="player-name" style="color:${
              player.rankColor || "#ffffff"
            }">${esc(displayName)}</span>`
          : `<span class="player-name" style="color:#AAAAAA">${esc(
              displayName
            )}</span>`
      }
      ${
        hasNick
          ? `<span class="nick-indicator" title="${esc(
              tooltipOther
            )}"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-ghost"/></svg></span>`
          : ""
      }
      ${
        isPartyMember
          ? `<span class="party-indicator" title="Party Member"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-party"/></svg></span>`
          : ""
      }
      ${
        pinned
          ? `<span class="pin-indicator" title="Gepinnt"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-pin"/></svg></span>`
          : ""
      }
      ${
        sessionUsername &&
        String(player.name).trim().toLowerCase() ===
          String(sessionUsername).trim().toLowerCase()
          ? `<span class="self-indicator" title="You"><svg class="icon icon-inline" aria-hidden="true" style="color: var(--accent);"><use href="#i-self"/></svg></span>`
          : ""
      }
    </td>`,
    dynamicCells,
  ].join("");

  rows.insertAdjacentHTML(
    "beforeend",
    `
    <tr data-name="${escAttr(player.name)}" ${
      pinned ? 'class="pinned"' : ""
    }>
      ${orderedCells}
      <td class="actions">
        <button class="icon-btn row-menu-btn">⋮</button>
        <div class="menu">
          <button class="pin-btn">${pinned ? "Unpin" : "Pin"}</button>
          <button class="remove-btn">Remove</button>
        </div>
      </td>
    </tr>
  `
  );
}

/**
 * Re-render all players currently in state.displayedPlayers.
 */
export function renderFullTable(statSettings, dynamicStats) {
  clearTable();
  const list = Array.from(state.displayedPlayers || []);

  list.forEach((name) => {
    const obj = state.playerCache?.[name];
    if (obj) {
      renderPlayerRow(obj, statSettings, dynamicStats);
    }
  });
}

// Optional alias to match alten Namen
export const renderTable = renderFullTable;
