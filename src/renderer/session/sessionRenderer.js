export function renderInitialSessionUI(ign) {
  document.getElementById('sessionIgn').textContent = ign;
  const el = document.getElementById("sessionStats");
  if (!el) return;

  el.innerHTML = `
    <div style="text-align:center;color:var(--muted);padding:40px 20px;">
      <svg class="icon" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;animation:spin 2s linear infinite;">
        <use href="#i-session"/>
      </svg>
      <div style="font-size:16px;color:var(--text);">Loading Session Stats</div>
      <div style="font-size:13px;">Fetching current stats for ${ign}...</div>
    </div>
  `;
}

export function showSessionError(message) {
  const el = document.getElementById("sessionStats");
  if (!el) return;

  el.innerHTML = `
    <div style="text-align:center;color:#ef4444;padding:40px 20px;">
      <div style="font-size:16px;">Session Start Failed</div>
      <div style="font-size:13px;">${message}</div>
    </div>
  `;
}

export function renderSessionStats(start, current) {
  const container = document.getElementById("sessionStats");
  if (!container) return;

  // Retrieve selected mode from dropdown
  const modeSelect = document.getElementById("sessionModeSelect");
  const modeKey = modeSelect?.value || "overall";

  const startMode = start.modes[modeKey];
  const currentMode = current.modes[modeKey];

  if (!startMode || !currentMode) {
    container.innerHTML = `<div style="color:red;">Invalid mode selected</div>`;
    return;
  }

  container.innerHTML = `

    <!-- ==================== GENERAL ==================== -->
    <div class="session-category">
      <div class="session-category-title">
        <svg class="icon"><use href="#i-stats"/></svg> General
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Stars</span>
        ${sessionStatHTML(start.level, current.level)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Win Streak</span>
        ${sessionStatHTML(start.ws, current.ws)}
      </div>
    </div>


    <!-- ==================== MODE INDICATOR ==================== -->
    <div class="session-category">
      <div class="session-category-title">
        <svg class="icon"><use href="#i-filter"/></svg>
        Mode: ${modeKey}
      </div>
      <div class="session-stat-row">
        <span class="session-stat-label">Games Played</span>
        ${sessionStatHTML(startMode.gamesPlayed, currentMode.gamesPlayed)}
      </div>
    </div>


    <!-- ==================== FINAL KILLS ==================== -->
    <div class="session-category">
      <div class="session-category-title">
        <svg class="icon"><use href="#i-target"/></svg> Final Kills
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Final Kills</span>
        ${sessionStatHTML(startMode.fk, currentMode.fk)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Final Deaths</span>
        ${sessionStatHTML(startMode.fd, currentMode.fd, true)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">FKDR</span>
        ${sessionStatHTML(startMode.fkdr, currentMode.fkdr)}
      </div>
    </div>


    <!-- ==================== GAMES ==================== -->
    <div class="session-category">
      <div class="session-category-title">
        <svg class="icon"><use href="#i-check"/></svg> Games
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Wins</span>
        ${sessionStatHTML(startMode.wins, currentMode.wins)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Losses</span>
        ${sessionStatHTML(startMode.losses, currentMode.losses, true)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">WLR</span>
        ${sessionStatHTML(startMode.wlr, currentMode.wlr)}
      </div>
    </div>


    <!-- ==================== BEDS ==================== -->
    <div class="session-category">
      <div class="session-category-title">
        <svg class="icon"><use href="#i-overlay"/></svg> Beds
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Beds Broken</span>
        ${sessionStatHTML(startMode.bb, currentMode.bb)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">Beds Lost</span>
        ${sessionStatHTML(startMode.bl, currentMode.bl, true)}
      </div>

      <div class="session-stat-row">
        <span class="session-stat-label">BBLR</span>
        ${sessionStatHTML(startMode.bblr, currentMode.bblr)}
      </div>
    </div>

  `;
}

export function sessionStatHTML(startVal, currentVal, isNegativeStat = false) {
  if (startVal === undefined || currentVal === undefined) {
    return '<span style="color: #ef4444;">?</span>';
  }

  const diff = currentVal - startVal;
  const diffDisplay = fmt(Math.abs(diff));

  let diffClass = "neutral";
  if (diff > 0) diffClass = isNegativeStat ? "negative" : "positive";
  else if (diff < 0) diffClass = isNegativeStat ? "positive" : "negative";

  return `
    <div class="session-stat-value">
      <span class="session-stat-start">${fmt(startVal)}</span>
      <span class="session-stat-arrow">→</span>
      <span class="session-stat-current">${fmt(currentVal)}</span>
      <span class="session-stat-diff ${diffClass}">
        [${diff > 0 ? "+" : ""}${diffDisplay}]
      </span>
    </div>
  `;
}

function fmt(value) {
  if (value == null || isNaN(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}
