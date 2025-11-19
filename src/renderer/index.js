// renderer/index.js
// Main entry point for the Nebula overlay renderer.
// Runs in the browser context with contextIsolation + preload.

console.log('NEBULA LOADED - Version:', new Date().toISOString());

var userProfile = null;
var authTokens = null;

try { window.window.ipcRenderer = window.ipcRenderer; } catch (_) { /* noop */ }
const rows = document.getElementById("rows");
const input = document.getElementById("playerInput");
let queue = [];

// Session tracking variables
let startStats = null;        // Stats when session started
let startTime = new Date();   // Session start time
let sessionUsername = null;   // Current session username
let sessionUpdateInterval = null; // Interval for updating session
let sessionUuid = null;       // UUID für Avatar

// Account Metrics Tracking
let accountMetrics = JSON.parse(localStorage.getItem('accountMetrics') || JSON.stringify({
  memberSince: Date.now(),
  players: [],  // stored as array, converted to Set in memory
  sessionsCount: 0,
  totalLookups: 0
}));

// Convert stored array to Set for players
accountMetrics.players = new Set(accountMetrics.players || []);

function saveAccountMetrics() {
  const toStore = {
    ...accountMetrics,
    players: Array.from(accountMetrics.players) // Set -> Array for JSON
  };
  localStorage.setItem('accountMetrics', JSON.stringify(toStore));
  console.log('[Metrics] Local data saved:', toStore);
}

function trackStatsLookup(playerName) {
  if (!playerName) return;
  
  const normalizedName = playerName.toLowerCase().trim();
  const wasNew = !accountMetrics.players.has(normalizedName);
  
  accountMetrics.players.add(normalizedName);
  accountMetrics.totalLookups++;
  
  saveAccountMetrics();
  
  if (wasNew) {
    console.log('[Metrics] New player tracked:', playerName, '- Total:', accountMetrics.players.size);
  }
}

function trackSessionStart() {
  accountMetrics.sessionsCount++;
  saveAccountMetrics();
  console.log('[Metrics] Session started - Total:', accountMetrics.sessionsCount);
}

// Auto-resize overlay logic (defined early so it can be called anywhere)
const TOPBAR_HEIGHT = 50; // fallback topbar height (will be measured dynamically)
const MIN_HEIGHT = 120; // minimum window height for empty overlay
const DEFAULT_HEIGHT = 560; // default full height
let resizeTimeout = null;

function updateOverlaySize() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const activePanel = document.querySelector('.panel.active');
    const panelOverlay = document.getElementById('panel-overlay');
    const sidebar = document.getElementById('sidebar');

    // Get appearance settings safely
    const appearanceSettings = JSON.parse(localStorage.getItem('appearanceSettings') || '{}');

    // Only auto-resize if:
    // 1. Feature is enabled
    // 2. Overlay panel is active
    // 3. Sidebar is closed
    const allowAuto = appearanceSettings.autoResize !== false; // default true
    if (sidebar?.classList.contains('open')) {
      // Sidebar offen: auf Default-Höhe gehen (volle Ansicht)
        window.ipcRenderer.invoke('window:setBounds', { height: DEFAULT_HEIGHT });
        return;
    }
    if (!allowAuto || !activePanel || activePanel !== panelOverlay) {
      // Keine Größenanpassung außerhalb des Overlays
      return;
    }

    // Calculate table content height
    const table = document.getElementById('table');
    const rowCount = table?.querySelectorAll('tbody tr').length || 0;
    
    if (rowCount === 0) {
      // No players: minimal overlay
      window.ipcRenderer.invoke('window:setBounds', { height: MIN_HEIGHT });
      return;
    }

    // Calculate needed height: topbar + thead + rows + padding
    const theadHeight = table?.querySelector('thead')?.offsetHeight || 40;
    
    // Get actual row height from first row, or estimate based on font size
    let rowHeight = 24; // base minimum
    const firstRow = table?.querySelector('tbody tr');
    if (firstRow) {
      rowHeight = firstRow.offsetHeight;
    } else {
      // Estimate: font size + padding (4px top + 4px bottom) + line-height
      const fontSize = appearanceSettings.fontSize || 14;
      rowHeight = Math.ceil(fontSize * 1.4) + 8; // line-height 1.4 + 8px padding
    }
    
const padding = 8; // minimal breathing room

// Dynamic measurements
const topbarEl = document.querySelector('.topbar');
const topbarHeight = topbarEl?.offsetHeight || TOPBAR_HEIGHT;
const contentEl = document.querySelector('.content');
const wrapEl = document.querySelector('.table-wrap');
const contentPadTop = contentEl ? parseInt(getComputedStyle(contentEl).paddingTop) || 0 : 0;
const wrapPadTop = wrapEl ? parseInt(getComputedStyle(wrapEl).paddingTop) || 0 : 0;

// Total needed height: topbar + content top padding + table-wrap top padding + header + rows + padding
const extra = 12; // small extra slack below table
const neededHeight = topbarHeight + contentPadTop + wrapPadTop + theadHeight + (rowCount * rowHeight) + padding + extra;

// Set a reasonable maximum based on screen height (80% of screen height or at least 800px)
const screenHeight = window.screen.availHeight;
const maxHeight = Math.max(800, Math.floor(screenHeight * 0.8));
const finalHeight = Math.min(neededHeight, maxHeight);

    window.ipcRenderer.invoke('window:setBounds', { height: finalHeight });

    // Auto-adjust width based on number of columns
    const dynamicStats = statSettings.layout.filter(k => k && statSettings.visible.includes(k));
    const totalCols = 2 + dynamicStats.length + 1; // lvl + name + stats + actions
    const baseWidth = 280; // minimum for lvl+name+actions
    const colWidth = 80; // average width per stat column
    const calculatedWidth = baseWidth + (dynamicStats.length * colWidth);
    const finalWidth = Math.max(calculatedWidth, 400); // minimum 400px
    window.ipcRenderer.invoke('window:setBounds', { width: finalWidth });
  }, 100); // debounce
}

// Track currently displayed players and their sources
// displayedPlayers: set of normalized names (lowercase of displayed name)

const displayedPlayers = new Set();
const nickedPlayers = new Set(); // tracks players originally added via nick
// playerSources: map normalized name -> set of sources ('username'|'manual'|'party'|'who'|'chat'|'invite'|'guild')
const playerSources = new Map();
// Track invite timeouts: map normalized name -> timeout ID
const inviteTimeouts = new Map();
// Cache for all loaded player objects (keyed by normalized name)
let playerCache = {};
// Tracks whether a registered nick is CURRENTLY active (i.e. we saw the nick-form in /who or chat)
// key: realName(lower) -> boolean
const activeNickState = {};
console.log('displayedPlayers initialized:', displayedPlayers);
const originalNicks = {}; // realName(lower) -> originally eingegebener Nick
let nickDisplayMode = localStorage.getItem('nickDisplayMode') || 'nick';
// Pinned players cannot be removed by any automatic source removal
let pinnedPlayers = new Set(JSON.parse(localStorage.getItem('pinnedPlayers') || '[]').map(s => String(s).toLowerCase()));
function savePinned() { localStorage.setItem('pinnedPlayers', JSON.stringify(Array.from(pinnedPlayers))); }
// Track whether we are in the pre-game lobby phase (after "Sending you to..." and before game start)
let preGameLobby = false;
// Track whether we are currently in an active game (after gameStart until next server change / lobby join)
let gameInProgress = false;
let guildListMode = false; // Tracks if we're currently parsing guild list output
let guildBatchAccepted = false; // Only add members if guild was enabled when the list started

// Nick management (moved earlier to ensure availability before initial renders)
let nicks = JSON.parse(localStorage.getItem('nicks') || '[]');
function saveNicks() { localStorage.setItem('nicks', JSON.stringify(nicks)); }
function getRealName(name) {
const nick = nicks.find(n => n.nick.toLowerCase() === String(name).toLowerCase());
return nick ? nick.real : name;
}

function getNickFromReal(realName) {
const entry = nicks.find(n => n.real.toLowerCase() === String(realName).toLowerCase());
return entry ? entry.nick : undefined;
}

function isNick(name) { return nicks.some(n => n.nick.toLowerCase() === String(name).toLowerCase()); }


// Session Stats Functions
function normalizeBedwarsStats(player) {
if (!player || typeof player !== 'object') return {
  name: '', level: 0, ws: 0,
  fk: 0, fd: 0, fkdr: 0,
  wins: 0, losses: 0, wlr: 0,
  bb: 0, bl: 0, bblr: 0,
  uuid: null
};

// Level / Stars
const level = (typeof player.level === 'number')
  ? player.level
  : (player.stats?.Bedwars?.Experience != null
      ? getBedWarsLevel(Number(player.stats.Bedwars.Experience))
      : 0);

// Raw values with multiple fallbacks
const fk = Number(
  player.fk ??
  player.finalKills ??
  player.stats?.Bedwars?.final_kills_bedwars ?? 0
);
const fd = Number(
  player.fd ??
  player.finalDeaths ??
  player.stats?.Bedwars?.final_deaths_bedwars ?? 0
);
const wins = Number(
  player.wins ??
  player.stats?.Bedwars?.wins_bedwars ?? 0
);
const losses = Number(
  player.losses ??
  player.stats?.Bedwars?.losses_bedwars ?? 0
);
const bb = Number(
  player.bb ??
  player.bedsBroken ??
  player.stats?.Bedwars?.beds_broken_bedwars ?? 0
);
const bl = Number(
  player.bl ??
  player.bedsLost ??
  player.stats?.Bedwars?.beds_lost_bedwars ?? 0
);
const ws = Number(
  player.ws ??
  player.winstreak ??
  player.stats?.Bedwars?.winstreak ?? 0
);

// Derived ratios (avoid division by zero)
const fkdr = fd > 0 ? fk / fd : fk > 0 ? fk : 0;
const wlr = losses > 0 ? wins / losses : wins > 0 ? wins : 0;
const bblr = bl > 0 ? bb / bl : bb > 0 ? bb : 0;

const uuid = (player.uuid || player.id || null);
return { name: player.name || player.username || player.displayName || '', level, ws, fk, fd, fkdr, wins, losses, wlr, bb, bl, bblr, uuid };
}

async function fetchMojangUuid(name) {
if (!name) return null;
try {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return (data && data.id) ? data.id : null; // already ohne Bindestriche
} catch { return null; }
}

async function startSession(username) {
if (!username || username.trim() === '') {
  console.log('Cannot start session: no username provided');
  return;
}

// Wait for IPC to be available
if (!window.window.ipcRenderer) {
  console.log('IPC not ready yet, waiting...');
  setTimeout(() => startSession(username), 500);
  return;
}

console.log('Starting session for:', username);
sessionUsername = username;
startTime = new Date();

// Show loading state
const sessionStats = document.getElementById('sessionStats');
if (sessionStats) {
  sessionStats.innerHTML = `
    <div style="text-align:center;color:var(--muted);padding:40px 20px;">
      <svg class="icon" aria-hidden="true" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;animation:spin 2s linear infinite;"><use href="#i-session"/></svg>
      <div style="font-size:16px;margin-bottom:8px;color:var(--text);">Loading Session Stats</div>
      <div style="font-size:13px;">Fetching current stats for ${username}...</div>
    </div>
    <style>
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  `;
}

try {
  // First check API status
  const apiStatus = await window.window.ipcRenderer.invoke('api:getStatus');
  console.log('API Status:', apiStatus);
  
const rawResult = await window.window.ipcRenderer.invoke('bedwars:stats', username);
  console.log('Session API raw result:', rawResult);
  const normalized = normalizeBedwarsStats(rawResult);
  console.log('Session API normalized result:', normalized);
  
  if (rawResult && !rawResult.error && (rawResult.name || normalized.name)) {
    startStats = normalized; // store normalized for diff calculations
    sessionUuid = normalized.uuid || rawResult.uuid || null;
    if (usernameInput) {
      // Initial value from settings (or from normalized stats if you prefer)
      usernameInput.value = (basicSettings.username || '').trim();

      const applyUsernameChange = () => {
        const prev = (basicSettings.username || '').trim();
        const next = (usernameInput.value || '').trim();

        if (prev === next) return;

        // Remove old player source if needed
        if (prev) {
          removePlayerSource(prev, 'username');
        }

        basicSettings.username = next;
        localStorage.setItem('username', next);
        updateSidebarUsername();

        // Use the preload bridge instead of require('electron')
        try {
          if (window.window.ipcRenderer) {
            window.window.ipcRenderer.send('set:username', basicSettings.username || '');
          } else if (window.electronAPI && window.electronAPI.setUsername) {
            window.electronAPI.setUsername(basicSettings.username || '');
          }
        } catch (e) {
          console.error('Failed to send username IPC update:', e);
        }

        // Restart session if IGN changed
        if (next && next !== sessionUsername) {
          startSession(next);
        }
      };

      // Trigger on blur (user leaves the field)
      usernameInput.addEventListener('blur', applyUsernameChange);

      // Optional: also trigger on Enter key
      usernameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          applyUsernameChange();
          usernameInput.blur();
        }
      });

      // Start session on app load if username exists (delayed)
      const savedUsername = basicSettings.username || '';
      if (savedUsername) {
        console.log('Found saved username on app load:', savedUsername);
        localStorage.setItem('username', savedUsername);
        setTimeout(() => {
          if (!sessionUsername) {
            console.log('Starting session on app load for:', savedUsername);
            startSession(savedUsername);
          }
        }, 400);
      }
    }
    // Create detailed error message with API status
    let detailedError = `
      <div style="text-align:center;color:#ef4444;padding:40px 20px;">
        <svg class="icon" aria-hidden="true" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;"><use href="#i-session"/></svg>
        <div style="font-size:16px;margin-bottom:8px;">Session Start Failed</div>
        <div style="font-size:13px;line-height:1.5;margin-bottom:12px;">
          ${errorMsg}
        </div>
    `;
    
    // Add API status information if available
    if (apiStatus) {
      detailedError += `
        <div style="font-size:11px;color:var(--muted);text-align:left;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin:16px 0;">
          <strong>API Status:</strong><br>
          Backend: ${apiStatus.backendAvailable ? '🟢 Available' : '🔴 Down'}<br>
          User Key: ${apiStatus.config.hasUserKey ? '🟢 Set' : '🔴 Not Set'}<br>
          Enhanced System: ${apiStatus.config.useEnhanced ? 'Enabled' : 'Disabled'}
        </div>
      `;
    }
    
    detailedError += `
        <div style="font-size:13px;line-height:1.5;">
          <strong>What Session Stats Do:</strong><br>
          • Track your progress since app start<br>
          • Show stat changes (wins, kills, etc.)<br>
          • Update automatically while playing
        </div>
      </div>
    `;
    
    // Show specific error message
    if (sessionStats) {
      sessionStats.innerHTML = detailedError;
    }
  }
} catch (error) {
console.error('Failed to start session (exception):', error);
  
  // Show network error with API diagnostics
  if (sessionStats) {
    sessionStats.innerHTML = `
      <div style="text-align:center;color:#ef4444;padding:40px 20px;">
        <svg class="icon" aria-hidden="true" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;"><use href="#i-session"/></svg>
        <div style="font-size:16px;margin-bottom:8px;">Connection Error</div>
        <div style="font-size:13px;line-height:1.5;margin-bottom:12px;">
          Could not connect to Hypixel API.
        </div>
        <div style="font-size:11px;color:var(--muted);text-align:left;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin:16px 0;">
          <strong>Error Details:</strong><br>
          ${error.message || error}<br><br>
          <strong>Current API Setup:</strong><br>
          Enhanced API System: Active<br>
          .env HYPIXEL_KEY: ${process?.env?.HYPIXEL_KEY ? 'Set' : 'Missing'}<br>
          User API Key: Check Client Settings
        </div>
        <div style="font-size:13px;line-height:1.5;">
          You can configure API keys in <strong>Client Settings</strong>.<br>
          Try using your own API key if the backend is down.
        </div>
      </div>
    `;
  }
}
}

async function updateSession() {
if (!startStats || !sessionUsername) return;

// Wait for IPC to be available
if (!window.window.ipcRenderer) {
  console.log('IPC not ready for session update, skipping...');
  return;
}

console.log('Updating session for:', sessionUsername);

try {
  const rawCurrent = await window.window.ipcRenderer.invoke('bedwars:stats', sessionUsername);
  console.log('Session update raw result:', rawCurrent);
  const currentNormalized = normalizeBedwarsStats(rawCurrent);
  console.log('Session update normalized:', currentNormalized);
  
  if (rawCurrent && !rawCurrent.error) {
    generateSessionHTML(startStats, currentNormalized);
  } else {
    console.error('Session update error:', rawCurrent?.error);
  }
} catch (error) {
  console.error('Failed to update session:', error);
}
}

function updateSessionDisplay() {
const sessionIgn = document.getElementById('sessionIgn');
const sessionTime = document.getElementById('sessionTime');
const sessionAvatar = document.getElementById('sessionAvatar');

if (sessionUsername) {
  sessionIgn.textContent = sessionUsername;
  console.log(sessionUuid);
  if (sessionUuid) {
    sessionAvatar.src = `https://crafatar.com/avatars/${sessionUuid}?size=48&default=MHF_Steve&overlay`;
  } else {
// Username fallback: load Mojang UUID asynchronously; until then use Steve placeholder skin
sessionAvatar.src = `https://crafatar.com/avatars/8667ba71b85a4004af54457a9734eed7?size=48&default=MHF_Steve&overlay`; // Steve placeholder
  }
  updateSessionTime();
}
}

function updateSessionTime() {
const sessionTime = document.getElementById('sessionTime');
if (!sessionTime || !startTime) return;

const secsElapsed = Math.floor((new Date() - startTime) / 1000);
const minsElapsed = Math.floor(secsElapsed / 60);
const hoursElapsed = Math.floor(minsElapsed / 60);

let timeText = 'Session: ';
if (hoursElapsed > 0) {
  timeText += `${hoursElapsed}h ${minsElapsed % 60}m`;
} else {
  timeText += `${minsElapsed}m`;
}

sessionTime.textContent = timeText;
}

function sessionStatHTML(startVal, currentVal, isNegativeStat = false) {
if (startVal === undefined || currentVal === undefined) {
  return '<span style="color: #ef4444;">?</span>';
}

const diff = currentVal - startVal;
const diffDisplay = Math.abs(diff) < 0.001 ? diff.toFixed(3) : diff.toLocaleString();

let diffClass = 'neutral';
if (diff > 0) {
  diffClass = isNegativeStat ? 'negative' : 'positive';
} else if (diff < 0) {
  diffClass = isNegativeStat ? 'positive' : 'negative';
}

return `
  <div class="session-stat-value">
    <span class="session-stat-start">${startVal.toLocaleString()}</span>
    <span class="session-stat-arrow">→</span>
    <span class="session-stat-current">${currentVal.toLocaleString()}</span>
    <span class="session-stat-diff ${diffClass}">[${diff > 0 ? '+' : ''}${diffDisplay}]</span>
  </div>
`;
}

function generateSessionHTML(startPlayer, currentPlayer) {
const sessionStats = document.getElementById('sessionStats');
const sessionTitle = document.getElementById('sessionTitle');

sessionTitle.textContent = 'Bedwars Session Stats';

console.log('Generating session HTML:', { startPlayer, currentPlayer });

let html = '';

// Helper function to safely get stat value
function getStat(player, statName) {
  if (!player) return 0;
  if (typeof player[statName] === 'number') return player[statName];
  return 0;
}

// Level/Stars - Use the same logic as main table
const startLevel = startPlayer?.level ?? (startPlayer?.stats?.Bedwars?.Experience != null ? getBedWarsLevel(Number(startPlayer.stats.Bedwars.Experience)) : 0);
const currentLevel = currentPlayer?.level ?? (currentPlayer?.stats?.Bedwars?.Experience != null ? getBedWarsLevel(Number(currentPlayer.stats.Bedwars.Experience)) : 0);

html += `
  <div class="session-category">
    <div class="session-category-title">
      <svg class="icon" aria-hidden="true"><use href="#i-stats"/></svg>
      General
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Stars</span>
      ${sessionStatHTML(startLevel, currentLevel)}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Win Streak</span>
      ${sessionStatHTML(getStat(startPlayer, 'ws'), getStat(currentPlayer, 'ws'))}
    </div>
  </div>
`;

// Combat Stats
html += `
  <div class="session-category">
    <div class="session-category-title">
      <svg class="icon" aria-hidden="true"><use href="#i-target"/></svg>
      Combat
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Final Kills</span>
      ${sessionStatHTML(getStat(startPlayer, 'fk'), getStat(currentPlayer, 'fk'))}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Final Deaths</span>
      ${sessionStatHTML(getStat(startPlayer, 'fd'), getStat(currentPlayer, 'fd'), true)}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">FKDR</span>
      ${sessionStatHTML(getStat(startPlayer, 'fkdr'), getStat(currentPlayer, 'fkdr'))}
    </div>
  </div>
`;

// Game Stats  
html += `
  <div class="session-category">
    <div class="session-category-title">
      <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>
      Games
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Wins</span>
      ${sessionStatHTML(getStat(startPlayer, 'wins'), getStat(currentPlayer, 'wins'))}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Losses</span>
      ${sessionStatHTML(getStat(startPlayer, 'losses'), getStat(currentPlayer, 'losses'), true)}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">WLR</span>
      ${sessionStatHTML(getStat(startPlayer, 'wlr'), getStat(currentPlayer, 'wlr'))}
    </div>
  </div>
`;

// Bed Stats
html += `
  <div class="session-category">
    <div class="session-category-title">
      <svg class="icon" aria-hidden="true"><use href="#i-overlay"/></svg>
      Beds
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Beds Broken</span>
      ${sessionStatHTML(getStat(startPlayer, 'bb'), getStat(currentPlayer, 'bb'))}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">Beds Lost</span>
      ${sessionStatHTML(getStat(startPlayer, 'bl'), getStat(currentPlayer, 'bl'), true)}
    </div>
    <div class="session-stat-row">
      <span class="session-stat-label">BBLR</span>
      ${sessionStatHTML(getStat(startPlayer, 'bblr'), getStat(currentPlayer, 'bblr'))}
    </div>
  </div>
`;

sessionStats.innerHTML = html;
updateSessionTime();
}

// Column definitions (labeling + optional derived calculators)
const STATS = {
// Core
level: { name: 'Level', short: 'Lvl', type: 'number' }, // No colorRules - uses prestige coloring
ws: { name: 'Win Streak', short: 'WS', type: 'number', colorRules: true },
mode: { name: 'Most Played Mode', short: 'Mode', type: 'text' },
fkdr: { name: 'Final K/D Ratio', short: 'FKDR', type: 'number', colorRules: true },
wlr: { name: 'Win/Loss Ratio', short: 'WLR', type: 'number', colorRules: true },
bblr: { name: 'Bed Break/Loss Ratio', short: 'BBLR', type: 'number', colorRules: true },
fk: { name: 'Final Kills', short: 'F. Kills', type: 'number', colorRules: true },
fd: { name: 'Final Deaths', short: 'F. Deaths', type: 'number', colorRules: true },
wins: { name: 'Wins', short: 'Wins', type: 'number', colorRules: true },
losses: { name: 'Losses', short: 'Losses', type: 'number', colorRules: true },
bedsBroken: { name: 'Beds Broken', short: 'Beds', type: 'number', colorRules: true },
bedsLost: { name: 'Beds Lost', short: 'Beds L.', type: 'number', colorRules: true },
kills: { name: 'Kills', short: 'Kills', type: 'number', colorRules: true },
deaths: { name: 'Deaths', short: 'Deaths', type: 'number', colorRules: true },

// Derived
winsPerLevel: { name: 'Wins per Level', short: 'Wins/Level', type: 'number', colorRules: true, calc: (p) => {
  const lvl = (p && (typeof p.level === 'number' ? p.level : (p.stats?.Bedwars?.Experience != null ? Math.floor(getBedWarsLevel(Number(p.stats.Bedwars.Experience))) : 0))) || 0;
  const wins = Number(p?.wins ?? 0);
  return lvl > 0 ? wins / lvl : 0;
}},
fkPerLevel: { name: 'Final Kills per Level', short: 'FK/Level', type: 'number', colorRules: true, calc: (p) => {
  const lvl = (p && (typeof p.level === 'number' ? p.level : (p.stats?.Bedwars?.Experience != null ? Math.floor(getBedWarsLevel(Number(p.stats.Bedwars.Experience))) : 0))) || 0;
  const fk = Number(p?.fk ?? 0);
  return lvl > 0 ? fk / lvl : 0;
}},
bedwarsScore: { name: 'Bedwars Score', short: 'Score', type: 'number', colorRules: true, calc: (p) => {
  // Konsistente Formel mit Backend (multiplikativ): fkdr * wlr * (level / 100)
  // Fallback: wenn level fehlt -> aus Experience berechnen
  let level = Number(p?.level ?? 0);
  if ((!level || !Number.isFinite(level)) && p?.experience != null) {
    try { level = Math.floor(getBedWarsLevel(Number(p.experience))); } catch {}
  }
  const fkdr = Number(p?.fkdr ?? 0);
  const wlr = Number(p?.wlr ?? 0);
  if (!Number.isFinite(fkdr) || !Number.isFinite(wlr) || !Number.isFinite(level)) return 0;
  const score = fkdr * wlr * (level / 100);
  return Number.isFinite(score) ? +score.toFixed(2) : 0;
}},

// Monthly (if provided by backend)
mfkdr: { name: 'Monthly Final K/D Ratio', short: 'Monthly FKDR', type: 'number', colorRules: true, disabled: true },
mwlr: { name: 'Monthly Win/Loss Ratio', short: 'Monthly WLR', type: 'number', colorRules: true, disabled: true },
mbblr: { name: 'Monthly Bed Break/Loss Ratio', short: 'Monthly BBLR', type: 'number', colorRules: true, disabled: true },

// Meta
guildName: { name: 'Guild Name', short: 'Guild', type: 'text' },
guildTag: { name: 'Guild Tag', short: 'Tag', type: 'text' },
};

// Sorting state
let sortKey = null; // keys from STATS, e.g. 'level' | 'ws' | 'fkdr' | 'wlr' | 'bblr' | 'fk' | 'wins' | 'bedwarsScore' | ...
let sortDir = 'asc'; // 'asc' | 'desc'
// Restore persisted sort if exists
try {
const sk = localStorage.getItem('sortKey');
const sd = localStorage.getItem('sortDir');
if (sk) sortKey = (sk === 'score' ? 'bedwarsScore' : sk);
if (sd === 'asc' || sd === 'desc') sortDir = sd;
} catch {}

function getNumeric(value) {
const n = Number(value);
return Number.isFinite(n) ? n : NaN;
}

// Apply color rules to stat values
function getColorForValue(column, value) {
const rules = statSettings.colorRules[column];
if (!rules || !Array.isArray(rules)) return '';

// Ensure value is numeric
const numValue = typeof value === 'number' ? value : Number(value);
if (!Number.isFinite(numValue)) return '';

for (const rule of rules) {
  if (rule.op === '>=' && numValue >= rule.value) {
    return `style="color:${rule.color}"`;
  }
  if (rule.op === '<' && numValue < rule.value) {
    return `style="color:${rule.color}"`;
  }
}
return '';
}

function getSortValue(player, key) {
switch (key) {
  case 'level': {
    if (player?.level != null) return getNumeric(player.level);
    const exp = player?.stats?.Bedwars?.Experience ?? player?.experience;
    return exp != null ? Math.floor(getBedWarsLevel(Number(exp))) : 0;
  }
  case 'networkLevel': return getNumeric(player?.networkLevel ?? 0);
  case 'ws': return getNumeric(player?.ws ?? 0);
  case 'fkdr': return getNumeric(player?.fkdr ?? 0);
  case 'wlr': return getNumeric(player?.wlr ?? 0);
  case 'bblr': return getNumeric(player?.bblr ?? 0);
  case 'fk': return getNumeric(player?.fk ?? 0);
  case 'fd': return getNumeric(player?.fd ?? 0);
  case 'wins': return getNumeric(player?.wins ?? 0);
  case 'losses': return getNumeric(player?.losses ?? 0);
  case 'bedsBroken': return getNumeric(player?.bedsBroken ?? 0);
  case 'bedsLost': return getNumeric(player?.bedsLost ?? 0);
  case 'kills': return getNumeric(player?.kills ?? 0);
  case 'deaths': return getNumeric(player?.deaths ?? 0);
  case 'winsPerLevel': return getNumeric(STATS.winsPerLevel.calc(player));
  case 'fkPerLevel': return getNumeric(STATS.fkPerLevel.calc(player));
case 'score': // legacy alias
case 'bedwarsScore': {
    const v = (player && typeof player.bedwarsScore === 'number') ? player.bedwarsScore : STATS.bedwarsScore.calc(player);
    return getNumeric(v);
  }
  case 'mfkdr': return getNumeric(player?.mfkdr ?? NaN);
  case 'mwlr': return getNumeric(player?.mwlr ?? NaN);
  case 'mbblr': return getNumeric(player?.mbblr ?? NaN);
  default: return 0;
}
}

// Insert row for this player (used by both fetchPlayerStats and renderTable)
function renderPlayerRow(player, wasNick, dynamicStats) {
console.log('[DEBUG] renderPlayerRow', player?.name, player);
const levelHTML = updatePlayerLevel(player);
const realName = player.name;
// Player might not have loaded (error placeholder) -> mark as nick
const isUnresolved = player.error || player.unresolved;
const key = realName.toLowerCase();
const sources = playerSources.get(key);
const isPartyMember = sources && sources.has('party');
const lowerReal = realName.toLowerCase();
const originalNick = originalNicks[lowerReal] || getNickFromReal(realName);
const hasNick = !!originalNick;
// Only show nickname if (a) mode is nick AND (b) we determined the player is actually nicked right now
const isActiveNick = !!activeNickState[lowerReal];
const showNick = hasNick && nickDisplayMode === 'nick' && isActiveNick;
const displayName = showNick ? originalNick : realName;
const tooltipOther = hasNick ? (showNick ? realName : originalNick) : '';
const selectedStats = dynamicStats || statSettings.layout.filter(k => k && statSettings.visible.includes(k));
const dynamicCells = selectedStats.map(key => {
  if (key === 'level' || key === 'name') return '';
  let val = player[key];
  // Support calc functions for derived stats if backend didn't send field
  const statDef = STATS[key];
  if ((val == null || (typeof val === 'number' && isNaN(val))) && statDef && typeof statDef.calc === 'function') {
    try { val = statDef.calc(player); } catch { val = null; }
  }
  const colorStyle = getColorForValue(key, typeof val === 'number' ? val : Number(val));
  return `<td class="metric" ${colorStyle}>${fmt(val)}</td>`;
}).join('');
const orderedCells = [
  `<td class="lvl">${levelHTML}</td>`,
  `<td class="name">
    ${(() => {
      if (showNick || isUnresolved) return `<span class="rank-tag" style="color:#ffffff">[NICK]</span>`;
      return player.rankTag ? `<span class="rank-tag" style="color:${player.rankColor || '#ffffff'}">${player.rankTag}</span>` : '';
    })()}
    ${(() => {
      if (showNick || isUnresolved) return `<span class="player-name" style="color:#ffffff">${esc(displayName)}</span>`;
      if (player.rankTag) return `<span class="player-name" style="color:${player.rankColor || '#ffffff'}">${esc(displayName)}</span>`;
      // Unranked -> grau wie Stone Prestige
      return `<span class="player-name" style="color:#AAAAAA">${esc(displayName)}</span>`;
    })()}
    ${hasNick ? `<span class="nick-indicator" title="${esc(tooltipOther)}"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-ghost"/></svg></span>` : ''}
${isPartyMember ? `<span class="party-indicator" title="Party Member"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-party"/></svg></span>` : ''}
${pinnedPlayers.has(key) ? `<span class="pin-indicator" title="Gepinnt"><svg class="icon icon-inline" aria-hidden="true"><use href="#i-pin"/></svg></span>` : ''}
    ${sessionUsername && String(player.name).trim().toLowerCase() === String(sessionUsername).trim().toLowerCase() ? `<span class="self-indicator" title="You"><svg class="icon icon-inline" aria-hidden="true" style="color: var(--accent);"><use href="#i-self"/></svg></span>` : ''}
  </td>`,
  dynamicCells
].join('');
const pinned = pinnedPlayers.has(key);
rows.insertAdjacentHTML("beforeend", `
  <tr data-name="${escAttr(player.name)}" ${pinned ? 'class="pinned"' : ''}>
    ${orderedCells}
    <td class="actions">
      <button class="icon-btn row-menu-btn">⋮</button>
      <div class="menu">
        <button class="pin-btn">${pinned ? 'Unpin' : 'Pin'}</button>
        <button class="remove-btn">Remove</button>
      </div>
    </td>
  </tr>
`);
}

// Hypixel color constants (used for level/star coloring)
const HypixelColors = {
    "AQUA": "#55FFFF",
    "BLACK": "#000000",
    "BLUE": "#5555FF",
    "DARK_AQUA": "#00AAAA",
    "DARK_BLUE": "#0000AA",
    "DARK_GRAY": "#555555",
    "DARK_GREEN": "#00AA00",
    "DARK_PURPLE": "#AA00AA",
    "DARK_RED": "#AA0000",
    "GOLD": "#FFAA00",
    "GRAY": "#AAAAAA",
    "GREEN": "#55FF55",
    "LIGHT_PURPLE": "#FF55FF",
    "RED": "#FF5555",
    "WHITE": "#FFFFFF",
    "YELLOW": "#FFFF55"
};

function formatStars(level, star, ...colors) {
  const span = (color, string) => `<span style="color: ${color}">${string}</span>`;
  let template = ``;
  const levelString = level.toString();

  if (colors.length === levelString.length + 3) {
    const digits = levelString.split('');
    template += span(colors[0], "[");
    for (let i = 0; i < digits.length; i++) {
      template += span(colors[i + 1], digits[i]);
    }
    template += span(colors[colors.length - 2], star);
    template += span(colors[colors.length - 1], "]");
  } else {
    template += span(colors.length == 1 ? colors[0] : '#AAAAAA', `[${level}${star}]`);
  }

  return template;
}

function starColor(stars) {
  const { AQUA, BLACK, BLUE, DARK_AQUA, DARK_BLUE, DARK_GRAY, DARK_GREEN, DARK_PURPLE, DARK_RED, GOLD, GRAY, GREEN, LIGHT_PURPLE, RED, WHITE, YELLOW } = HypixelColors;

  if (stars < 100) return formatStars(stars, '✫', GRAY);
  else if (stars < 200) return formatStars(stars, '✫', WHITE);
  else if (stars < 300) return formatStars(stars, '✫', GOLD);
  else if (stars < 400) return formatStars(stars, '✫', AQUA);
  else if (stars < 500) return formatStars(stars, '✫', DARK_GREEN);
  else if (stars < 600) return formatStars(stars, '✫', DARK_AQUA);
  else if (stars < 700) return formatStars(stars, '✫', DARK_RED);
  else if (stars < 800) return formatStars(stars, '✫', LIGHT_PURPLE);
  else if (stars < 900) return formatStars(stars, '✫', BLUE);
  else if (stars < 1000) return formatStars(stars, '✫', DARK_PURPLE);
  else if (stars < 1100) return formatStars(stars, '✫', RED, GOLD, YELLOW, GREEN, AQUA, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 1200) return formatStars(stars, '✪', GRAY, WHITE, WHITE, WHITE, WHITE, GRAY, GRAY);
  else if (stars < 1300) return formatStars(stars, '✪', GRAY, YELLOW, YELLOW, YELLOW, YELLOW, GOLD, GRAY);
  else if (stars < 1400) return formatStars(stars, '✪', GRAY, AQUA, AQUA, AQUA, AQUA, DARK_AQUA, GRAY);
  else if (stars < 1500) return formatStars(stars, '✪', GRAY, GREEN, GREEN, GREEN, GREEN, DARK_GREEN, GRAY);
  else if (stars < 1600) return formatStars(stars, '✪', GRAY, DARK_AQUA, DARK_AQUA, DARK_AQUA, DARK_AQUA, BLUE, GRAY);
  else if (stars < 1700) return formatStars(stars, '✪', GRAY, RED, RED, RED, RED, DARK_RED, GRAY);
  else if (stars < 1800) return formatStars(stars, '✪', GRAY, LIGHT_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE, GRAY);
  else if (stars < 1900) return formatStars(stars, '✪', GRAY, BLUE, BLUE, BLUE, BLUE, DARK_BLUE, GRAY);
  else if (stars < 2000) return formatStars(stars, '✪', GRAY, DARK_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_GRAY, GRAY);
  else if (stars < 2100) return formatStars(stars, '✪', DARK_GRAY, GRAY, WHITE, WHITE, GRAY, GRAY, DARK_GRAY);
  else if (stars < 2200) return formatStars(stars, '⚝', WHITE, WHITE, YELLOW, YELLOW, GOLD, GOLD, GOLD);
  else if (stars < 2300) return formatStars(stars, '⚝', GOLD, GOLD, WHITE, WHITE, AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 2400) return formatStars(stars, '⚝', DARK_PURPLE, DARK_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, GOLD, YELLOW, YELLOW);
  else if (stars < 2500) return formatStars(stars, '⚝', AQUA, AQUA, WHITE, WHITE, GRAY, GRAY, DARK_GRAY);
  else if (stars < 2600) return formatStars(stars, '⚝', WHITE, WHITE, GREEN, GREEN, DARK_GRAY, DARK_GRAY, DARK_GRAY);
  else if (stars < 2700) return formatStars(stars, '⚝', DARK_RED, DARK_RED, RED, RED, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 2800) return formatStars(stars, '⚝', YELLOW, YELLOW, WHITE, WHITE, DARK_GRAY, DARK_GRAY, DARK_GRAY);
  else if (stars < 2900) return formatStars(stars, '⚝', GREEN, GREEN, DARK_GREEN, DARK_GREEN, GOLD, GOLD, YELLOW);
  else if (stars < 3000) return formatStars(stars, '⚝', AQUA, AQUA, DARK_AQUA, DARK_AQUA, BLUE, BLUE, DARK_BLUE);
  else if (stars < 3100) return formatStars(stars, '⚝', YELLOW, YELLOW, GOLD, GOLD, RED, RED, DARK_RED);
  else if (stars < 3200) return formatStars(stars, '✥', BLUE, BLUE, AQUA, AQUA, GOLD, GOLD, YELLOW);
  else if (stars < 3300) return formatStars(stars, '✥', RED, DARK_RED, GRAY, GRAY, DARK_RED, RED, RED);
  else if (stars < 3400) return formatStars(stars, '✥', BLUE, BLUE, BLUE, LIGHT_PURPLE, RED, RED, DARK_RED);
  else if (stars < 3500) return formatStars(stars, '✥', DARK_GREEN, GREEN, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_GREEN);
  else if (stars < 3600) return formatStars(stars, '✥', RED, RED, DARK_RED, DARK_RED, DARK_GREEN, GREEN, GREEN);
  else if (stars < 3700) return formatStars(stars, '✥', GREEN, GREEN, GREEN, AQUA, BLUE, BLUE, DARK_BLUE);
  else if (stars < 3800) return formatStars(stars, '✥', DARK_RED, DARK_RED, RED, RED, AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 3900) return formatStars(stars, '✥', DARK_BLUE, DARK_BLUE, BLUE, DARK_PURPLE, DARK_PURPLE, LIGHT_PURPLE, DARK_BLUE);
  else if (stars < 4000) return formatStars(stars, '✥', RED, RED, GREEN, GREEN, AQUA, BLUE, BLUE);
  else if (stars < 4100) return formatStars(stars, '✥', DARK_PURPLE, DARK_PURPLE, RED, RED, GOLD, GOLD, YELLOW);
  else if (stars < 4200) return formatStars(stars, '✥', YELLOW, YELLOW, GOLD, RED, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 4300) return formatStars(stars, '✥', DARK_BLUE, BLUE, DARK_AQUA, AQUA, WHITE, GRAY, GRAY);
  else if (stars < 4400) return formatStars(stars, '✥', BLACK, DARK_PURPLE, DARK_GRAY, DARK_GRAY, DARK_PURPLE, DARK_PURPLE, BLACK);
  else if (stars < 4500) return formatStars(stars, '✥', DARK_GREEN, DARK_GREEN, GREEN, YELLOW, GOLD, DARK_PURPLE, LIGHT_PURPLE);
  else if (stars < 4600) return formatStars(stars, '✥', WHITE, WHITE, AQUA, AQUA, DARK_AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 4700) return formatStars(stars, '✥', DARK_AQUA, AQUA, YELLOW, YELLOW, GOLD, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 4800) return formatStars(stars, '✥', WHITE, DARK_RED, RED, RED, BLUE, DARK_BLUE, BLUE);
  else if (stars < 4900) return formatStars(stars, '✥', DARK_PURPLE, DARK_PURPLE, RED, GOLD, YELLOW, AQUA, DARK_AQUA);
  else if (stars < 5000) return formatStars(stars, '✥', DARK_GREEN, GREEN, WHITE, WHITE, GREEN, GREEN, DARK_GREEN);
  else return formatStars(stars, '✥', DARK_RED, DARK_RED, DARK_PURPLE, BLUE, BLUE, DARK_BLUE, BLACK);
}

function getBedWarsLevel(exp) {
  let level = 100 * (Math.floor(exp / 487000));
  exp = exp % 487000;
  if (exp < 500) return level + exp / 500;
  level++;
  if (exp < 1500) return level + (exp - 500) / 1000;
  level++;
  if (exp < 3500) return level + (exp - 1500) / 2000;
  level++;
  if (exp < 7000) return level + (exp - 3500) / 3500;
  level++;
  exp -= 7000;
  return level + exp / 5000;
}

// Update player level display. Accepts either a player object with stats or a stats-like object
function updatePlayerLevel(player) {
  const exp = player?.stats?.Bedwars?.Experience ?? player?.experience;
  if (exp != null && !isNaN(Number(exp))) {
    const level = Math.floor(getBedWarsLevel(Number(exp)));
    return starColor(level);
  }
  const levelNum = player?.level ?? 0;
  return `[${fmt(levelNum)}✫]`;
}

// Fetch stats for a single player and update UI
async function fetchPlayerStats(name) {
  console.log('[DEBUG] fetchPlayerStats called for', name);
  // Normalize by real name to reduce duplicates
  const realName = getRealName(name);
  const key = realName.toLowerCase();
  if (displayedPlayers.has(key)) return; // Skip if already displayed
  const wasNick = isNick(name);
  
  const res = await window.ipcRenderer.invoke("bedwars:stats", realName);

  if (res.error) {
    console.error('[DEBUG] Stats error for', realName, ':', res.error);
    return;
  }

console.log('Received stats for', realName, ':', res);

// Track successful stats lookup for metrics
trackStatsLookup(res.name || realName);

const normName = String(res.name || realName).toLowerCase();
displayedPlayers.add(normName);
playerCache[normName] = res;
if (wasNick) { nickedPlayers.add(normName); originalNicks[res.name.toLowerCase()] = name; } else nickedPlayers.delete(normName);
  
  // After caching stats simply re-render table (row rendering centralised there)
  renderTable();

  // Rebind menu events for the new row
  bindMenus();
}

// Remove a player row and all state completely
function removePlayer(name) {
  const key = String(getRealName(name) || name).trim().toLowerCase();
  
  // NEVER remove the session username (own user)
  if (sessionUsername && key === String(sessionUsername).trim().toLowerCase()) {
    console.log('Preventing removal of session username:', name);
    return;
  }
  // Prevent removal if pinned
  if (pinnedPlayers.has(key)) {
    console.log('Preventing removal of pinned player:', name);
    return;
  }
  
  const row = rows.querySelector(`tr[data-name="${escAttr(name)}"]`);
  if (row) row.remove();
  displayedPlayers.delete(key);
  playerSources.delete(key);
nickedPlayers.delete(key);
  delete originalNicks[key];
  try { delete activeNickState[key]; } catch {}
  updateOverlaySize();
}

// Add/track a source for a player
function addPlayerSource(name, source) {
  // Guard: check if source is disabled
  if (source === 'manual' && !sourcesSettings?.manual?.enabled) return;
  if (source === 'chat' && !sourcesSettings?.chat?.enabled) return;
  if (source === 'party' && !sourcesSettings?.party?.enabled) return;
  if (source === 'who' && !sourcesSettings?.game?.addFromWho) return;
if (source === 'guild' && (!sourcesSettings?.guild?.enabled)) return;
  if (source === 'invite' && (!sourcesSettings?.party?.enabled || !sourcesSettings?.party?.showInviteTemp || !sourcesSettings?.partyInvites?.enabled)) return;
  
  const key = String(getRealName(name) || name).toLowerCase();
  const set = playerSources.get(key) || new Set();
  set.add(source);
  playerSources.set(key, set);
}

function removePlayerSource(name, source) {
  const key = String(getRealName(name) || name).toLowerCase();
  
  // NEVER remove sources for session username (own user)
  if (sessionUsername && key === String(sessionUsername).trim().toLowerCase()) {
    console.log('Preventing source removal for session username:', name, 'source:', source);
    return;
  }
  // Do not alter sources for pinned players (they are immutable except manual unpin)
  if (pinnedPlayers.has(key)) {
    console.log('Preventing source removal for pinned player:', name, 'source:', source);
    return;
  }
  
  const set = playerSources.get(key);
  if (!set) return;
  set.delete(source);
  if (set.size === 0) {
    removePlayer(name);
  } else {
    playerSources.set(key, set);
    updateOverlaySize();
  }
}

// Manage invite timeouts
function addInviteTimeout(name) {
  const key = String(getRealName(name) || name).toLowerCase();
  
  // Clear any existing timeout
  if (inviteTimeouts.has(key)) {
    clearTimeout(inviteTimeouts.get(key));
  }
  
  // Set 60 second timeout to remove invite source
  const timeoutId = setTimeout(() => {
    console.log('Invite timeout expired for:', name);
    removePlayerSource(name, 'invite');
    inviteTimeouts.delete(key);
    renderTable();
    updateOverlaySize();
  }, 60000); // 60 seconds
  
  inviteTimeouts.set(key, timeoutId);
  console.log('Set invite timeout for:', name, 'expires in 60s');
}

function clearInviteTimeout(name) {
  const key = String(getRealName(name) || name).toLowerCase();
  if (inviteTimeouts.has(key)) {
    clearTimeout(inviteTimeouts.get(key));
    inviteTimeouts.delete(key);
  }
}

function clearAllButUsername() {
  // Remove all non-username-backed players; keep username-only
  const selfKey = sessionUsername ? String(sessionUsername).trim().toLowerCase() : null;
  for (const [key, set] of Array.from(playerSources.entries())) {
    // Always preserve the session user even if it (temporarily) lacks an explicit 'username' source
    if (selfKey && key === selfKey) {
      playerSources.set(key, new Set(['username']));
      continue;
    }
    // Preserve pinned players entirely
    if (pinnedPlayers.has(key)) {
      continue;
    }
    if (set.has('username')) {
      // Keep only username source
      playerSources.set(key, new Set(['username']));
      continue;
    }
    // remove entirely
    const tr = rows.querySelector(`tr[data-name="${escAttr(key)}"]`);
    if (tr) tr.remove();
    displayedPlayers.delete(key);
    playerSources.delete(key);
nickedPlayers.delete(key);
    delete originalNicks[key];
  }
  // Clean any stray rows
  rows.querySelectorAll('tr[data-name]').forEach(tr => {
    const dn = tr.getAttribute('data-name')?.toLowerCase();
    if (dn && !playerSources.has(dn)) tr.remove();
  });
  updateOverlaySize(); // Update window size after clearing
}

function addPlayer(name, source) {
  name = String(name || '').trim();
  if (!name) return;
  addPlayerSource(name, source);
  const key = String(getRealName(name) || name).trim().toLowerCase();
  // Update activeNickState heuristic: if user supplied the nick (not real) and it's registered, mark active.
  try {
    const registered = nicks.find(n => n.nick.toLowerCase() === name.toLowerCase());
    if (registered) {
      activeNickState[registered.real.toLowerCase()] = true;
    } else {
      // If they added the real name explicitly, mark inactive when previously unknown.
      const reverse = nicks.find(n => n.real.toLowerCase() === name.toLowerCase());
      if (reverse && activeNickState[reverse.real.toLowerCase()] == null) {
        activeNickState[reverse.real.toLowerCase()] = false;
      }
    }
  } catch {}
  if (!displayedPlayers.has(key)) {
    fetchPlayerStats(name).then(() => {
      updateOverlaySize();
      renderTable();
    });
  }
}

// Handle incoming player lists (from chat logger)
window.ipcRenderer.on('chat:players', (_e, newPlayers) => {
  try {
    if (!Array.isArray(newPlayers)) return;
    if (!sourcesSettings?.game?.addFromWho) return; // feature disabled
// Remove diffed old /who entries (only if not held by other sources)
const incomingSet = new Set(newPlayers.map(p => String(p).trim().toLowerCase()));
    for (const [key, sources] of Array.from(playerSources.entries())) {
      if (sources.has('who') && !incomingSet.has(key)) {
        // Don't remove the session username - keep it in the overlay
        if (sessionUsername && key === String(sessionUsername).trim().toLowerCase()) {
          // Keep session username but remove the 'who' source
          sources.delete('who');
          playerSources.set(key, sources);
          continue;
        }
        // Skip removal if pinned
        if (pinnedPlayers.has(key)) {
          continue;
        }
        
        // Remove only the 'who' source; other sources may still keep the player
        sources.delete('who');
        if (sources.size === 0) {
          if (!pinnedPlayers.has(key)) {
            removePlayer(key);
          } else {
            playerSources.set(key, sources);
          }
        } else {
          playerSources.set(key, sources);
        }
      }
    }
// Now add new players / set 'who' source
    newPlayers.forEach(player => {
      if (!player || typeof player !== 'string') return;
      addPlayer(player, 'who');
      // Active-nick Erkennung: Wenn der /who Name selbst ein registrierter Nick ist -> aktiv
      const entry = nicks.find(n => n.nick.toLowerCase() === player.toLowerCase());
      if (entry) {
        activeNickState[entry.real.toLowerCase()] = true;
      } else {
        // Falls der Name ein Realname einer Registrierung ist -> markiere als nicht nicked
        const rev = nicks.find(n => n.real.toLowerCase() === player.toLowerCase());
        if (rev) activeNickState[rev.real.toLowerCase()] = false;
      }
    });
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:players', err);
  }
});

// Remove on Final Death (if enabled in settings)
window.ipcRenderer.on('chat:finalKill', (_e, name) => {
  try {
    if (!name || typeof name !== 'string') return;
    if (sourcesSettings?.game?.removeOnDeath) {
      // Only remove the 'who' source; keep other sources (manual, party, chat, username)
      removePlayerSource(name, 'who');
    }
  } catch (err) {
    console.error('Error handling chat:finalKill', err);
  }
});

// Guild members handling (source: guild)
window.ipcRenderer.on('chat:guildMembers', (_e, guildMembers) => {
  try {
    if (!Array.isArray(guildMembers)) return;
    if (!sourcesSettings?.guild?.enabled) return; // feature disabled -> ignore this batch entirely
    if (!guildBatchAccepted) return; // only apply if guild was enabled when the list started
    console.log('Guild settings check:', sourcesSettings?.guild?.enabled, 'Adding', guildMembers.length, 'guild members');
    
    // Add all guild members with 'guild' source
    guildMembers.forEach(member => {
      if (!member || typeof member !== 'string') return;
      addPlayer(member, 'guild');
    });
    
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:guildMembers', err);
  }
});

// Guild member left: remove guild source if onlineOnly is enabled
window.ipcRenderer.on('chat:guildMemberLeft', (_e, name) => {
  try {
    if (!name || typeof name !== 'string') return;
    if (!sourcesSettings?.guild?.enabled) return;
    // Only enforce removal when onlineOnly is active AND we're in pre-game lobby or in-game.
    // In normal lobbies, keep showing guild members even if a live "Guild > name left." arrives.
    if (sourcesSettings?.guild?.onlineOnly && (preGameLobby || gameInProgress)) {
      console.log('Guild member left (onlineOnly active):', name);
      removePlayerSource(name, 'guild');
      renderTable();
      updateOverlaySize();
    }
  } catch (err) {
    console.error('Error handling chat:guildMemberLeft', err);
  }
});

// Party members handling (source: party)
window.ipcRenderer.on('chat:party', (_e, members) => {
  try {
    if (!Array.isArray(members)) return;
    const incoming = new Set(members.filter(m => typeof m === 'string').map(m => m.toLowerCase()));
    // Add new members
    members.forEach(member => {
      if (!member || typeof member !== 'string') return;
      addPlayer(member, 'party');
      // Clear invite timeout since they're now in party
      clearInviteTimeout(member);
      // Remove any lingering 'invite' source so player is fully promoted to party
      removePlayerSource(member, 'invite');
    });
    // Remove party source for players no longer in party
    if (sourcesSettings?.party?.removeOnMemberLeave) {
      for (const [key, sources] of Array.from(playerSources.entries())) {
        if (sources.has('party') && !incoming.has(key)) {
          sources.delete('party');
          if (sources.size === 0) {
            if (!pinnedPlayers.has(key)) {
              removePlayer(key);
            } else {
              playerSources.set(key, sources);
            }
          } else {
            playerSources.set(key, sources);
          }
        }
      }
    }
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:party', err);
  }
});

// Party invite (only fetch stats, don't add to party source)
window.ipcRenderer.on('chat:partyInvite', (_e, inviter) => {
  try {
    if (!inviter || typeof inviter !== 'string') return;
    if (!sourcesSettings?.party?.enabled || !sourcesSettings?.party?.showInviteTemp || !sourcesSettings?.partyInvites?.enabled) return;
    
    console.log('Party invite received from:', inviter);
    addPlayer(inviter, 'invite');
    addInviteTimeout(inviter);
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:partyInvite', err);
  }
});

// Party invite expired - remove invite source immediately
window.ipcRenderer.on('chat:partyInviteExpired', (_e, player) => {
  try {
    if (!player || typeof player !== 'string') return;
    console.log('Party invite expired for:', player);
    
    // Clear timeout and remove invite source
    clearInviteTimeout(player);
    removePlayerSource(player, 'invite');
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:partyInviteExpired', err);
  }
});

// Party cleared (You left the party)
window.ipcRenderer.on('chat:partyCleared', () => {
  try {
    if (sourcesSettings?.party?.removeAllOnLeaveOrDisband) {
      for (const [key, sources] of Array.from(playerSources.entries())) {
        if (sources.has('party')) {
          sources.delete('party');
          if (sources.size === 0) {
            if (!pinnedPlayers.has(key)) {
              removePlayer(key);
            } else {
              playerSources.set(key, sources);
            }
          } else {
            playerSources.set(key, sources);
          }
        }
      }
    }
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:partyCleared', err);
  }
});

function esc(s) { return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }

function fmt(n) {
  if (n == null) return "—";
  if (typeof n === 'string') return n || "—";
  if (typeof n === 'number') return isNaN(n) ? "—" : n;
  return String(n);
}

// Nick management (definition moved earlier)

// Nicks Panel UI
function renderNicks() {
  const list = document.getElementById('nicksList');
  if (!list) return;

  list.innerHTML = nicks.map(({nick, real}) => `
    <div class="nick-row" data-nick="${escAttr(nick)}">
      <span class="nick-name">${esc(nick)}</span>
      <span class="nick-real">${esc(real)}</span>
      <button class="delete-btn" title="Remove nick">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const row = e.target.closest('.nick-row');
      const nick = row.getAttribute('data-nick');
      nicks = nicks.filter(n => n.nick !== nick);
      saveNicks();
      renderNicks();
      renderTable();
    });
  });
}

// Nick form handling
const addNickBtn = document.getElementById('addNickBtn');
const addNickForm = document.getElementById('addNickForm');
const nickInput = document.getElementById('nickInput');
const realNameInput = document.getElementById('realNameInput');
const saveNickBtn = document.getElementById('saveNickBtn');
const nickDisplayModeSelect = document.getElementById('nickDisplayMode');
if (nickDisplayModeSelect) {
  nickDisplayModeSelect.value = nickDisplayMode;
  nickDisplayModeSelect.addEventListener('change', () => {
    nickDisplayMode = nickDisplayModeSelect.value;
    localStorage.setItem('nickDisplayMode', nickDisplayMode);
    renderTable();
  });
}

// Show/hide form when + button is clicked
addNickBtn?.addEventListener('click', () => {
  addNickForm.style.display = 'block';
  nickInput.focus();
});

// Save nick when form is submitted
saveNickBtn?.addEventListener('click', () => {
  const nick = nickInput.value.trim();
  const real = realNameInput.value.trim();

  // Limit für nicht-Plus-Nutzer
  const isPlus = (localStorage.getItem('demoPlus') === 'true') || (window.userProfile && window.userProfile.isPlus);
  if (!isPlus && nicks.length >= 10) {
    showNotification('Maximum of 10 nicknames without Plus allowed. Upgrade to Plus for unlimited entries!');
    return;
  }

  if (nick && real) {
    if (!nicks.some(n => n.nick.toLowerCase() === nick.toLowerCase())) {
      nicks.push({nick, real});
      saveNicks();
      renderNicks();
      renderTable();

      // Reset form
      nickInput.value = '';
      realNameInput.value = '';
      addNickForm.style.display = 'none';
    }
  }
});

// Enter in second input also submits
realNameInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    saveNickBtn.click();
  }
});

// Escape closes form
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && addNickForm.style.display === 'block') {
    addNickForm.style.display = 'none';
    nickInput.value = '';
    realNameInput.value = '';
  }
});

// Chat strings → add player who matches any configured string (case-insensitive)
// Also handles guild list parsing
window.ipcRenderer.on('chat:message', (_e, payload) => {
  try {
    if (!payload || typeof payload.text !== 'string') return;
    const { name, text } = payload;
    const msg = text;

    // 1. Guild list parsing (always check, independent of chat settings)
    // Detect guild list start: "Guild Name: ..."
    if (msg.indexOf('Guild Name: ') === 0) {
      guildListMode = true;
      guildBatchAccepted = !!sourcesSettings?.guild?.enabled; // snapshot enabled state
      console.log('[Guild] Guild list mode activated (accepted=', guildBatchAccepted, ')');
      return;
    }

    // Parse guild member lines (online: " ●  ", offline: " ?  ")
if (guildListMode && guildBatchAccepted && (msg.indexOf(' ●  ') !== -1 || msg.indexOf(' ?  ') !== -1)) {
      const isOnline = msg.indexOf(' ●  ') !== -1;
      
      // Skip offline members if onlineOnly is enabled
      if (!isOnline && sourcesSettings?.guild?.onlineOnly) {
        return;
      }

      const separator = isOnline ? ' ●  ' : ' ?  ';
      const members = msg.split(separator);

      for (let member of members) {
        member = member.trim();
        if (!member) continue;

        // Remove rank prefix if present (e.g., "[MVP+] PlayerName" → "PlayerName")
        if (member[0] === '[') {
          const spaceIdx = member.indexOf(' ');
          if (spaceIdx !== -1) {
            member = member.substring(spaceIdx + 1).trim();
          }
        }

        if (member) {
          addPlayer(member, 'guild');
        }
      }
      return;
    }

    // Detect guild list end: "Total Members: ..."
    if (guildListMode && msg.indexOf('Total Members:') === 0) {
      guildListMode = false;
      guildBatchAccepted = false;
      console.log('[Guild] Guild list mode deactivated');
      return;
    }

    // 2. Chat trigger strings
    if (!sourcesSettings?.chat?.enabled || !name) return;
    const patterns = (sourcesSettings.chat.strings || []).filter(Boolean).map(String);
    if (patterns.length) {
      const t = String(text).toLowerCase();
      if (patterns.some(p => t.includes(String(p).toLowerCase()))) {
        addPlayer(name, 'chat');
      }
    }

    // 3. Game setting: addFromChat (players speaking pre-game in lobby)
    if (sourcesSettings?.game?.addFromChat && preGameLobby && name) {
      addPlayer(name, 'chat');
    }
  } catch (err) {
    console.error('Error handling chat:message', err);
  }
});

// Username mention → add player if enabled under chat settings
window.ipcRenderer.on('chat:usernameMention', (_e, name) => {
  try {
    if (!name || typeof name !== 'string') return;
    if (!sourcesSettings?.chat?.enabled) return;
    if (sourcesSettings?.chat?.addOnMention) {
      addPlayer(name, 'chat');
    }
  } catch (err) {
    console.error('Error handling chat:usernameMention', err);
  }
});

// Server change → remove who/chat/username/guild sources if enabled
window.ipcRenderer.on('chat:serverChange', () => {
  try {
    // Enter pre-game lobby phase on server change; game not yet started
    preGameLobby = true;
    gameInProgress = false;
    if (!sourcesSettings?.game?.removeOnServerChange && !sourcesSettings?.chat?.removeOnServerChange && !sourcesSettings?.guild?.removeOnServerChange) return;
    const allKeys = Array.from(playerSources.keys());
    allKeys.forEach(key => {
      const sources = playerSources.get(key);
      if (!sources) return;
      let changed = false;
      if (sourcesSettings?.game?.removeOnServerChange && sources.has('who')) {
        sources.delete('who');
        changed = true;
      }
      if (sourcesSettings?.chat?.removeOnServerChange) {
        if (sources.has('chat')) {
          sources.delete('chat');
          changed = true;
        }
        if (sources.has('username')) {
          sources.delete('username');
          changed = true;
        }
      }
      if (sourcesSettings?.guild?.removeOnServerChange && sources.has('guild')) {
        sources.delete('guild');
        changed = true;
      }
      if (changed) {
        if (sources.size === 0) {
          if (!pinnedPlayers.has(key)) {
            removePlayer(key);
          } else {
            playerSources.set(key, sources); // keep empty set for pinned
          }
        } else {
          playerSources.set(key, sources);
        }
      }
    });
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:serverChange', err);
  }
});

// Lobby join → remove who/chat/username sources if enabled
window.ipcRenderer.on('chat:lobbyJoined', () => {
  try {
    // Leaving game back to lobby: disable pre-game chat auto-add
    preGameLobby = false;
    gameInProgress = false;
    if (!sourcesSettings?.game?.removeOnServerChange && !sourcesSettings?.chat?.removeOnServerChange) return;
    const allKeys = Array.from(playerSources.keys());
    allKeys.forEach(key => {
      const sources = playerSources.get(key);
      if (!sources) return;
      let changed = false;
      if (sourcesSettings?.game?.removeOnServerChange && sources.has('who')) {
        sources.delete('who');
        changed = true;
      }
      if (sourcesSettings?.chat?.removeOnServerChange) {
        if (sources.has('chat')) {
          sources.delete('chat');
          changed = true;
        }
        if (sources.has('username')) {
          sources.delete('username');
          changed = true;
        }
      }
      if (changed) {
        if (sources.size === 0) {
          if (!pinnedPlayers.has(key)) {
            removePlayer(key);
          } else {
            playerSources.set(key, sources);
          }
        } else {
          playerSources.set(key, sources);
        }
      }
    });
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:lobbyJoined', err);
  }
});

// Game start → optionally clear manually added players and guild members
window.ipcRenderer.on('chat:gameStart', () => {
  try {
    // Game started: disable pre-game chat auto-add
    preGameLobby = false;
    gameInProgress = true;
    
    // Clear manually added players if setting is enabled
    if (sourcesSettings?.manual?.clearOnGameStart) {
      for (const [key, sources] of Array.from(playerSources.entries())) {
        if (sources.has('manual')) {
          sources.delete('manual');
          if (sources.size === 0) {
            removePlayer(key);
          } else {
            playerSources.set(key, sources);
          }
        }
      }
    }
    
    // Always clear guild members when game starts (they should not persist in actual games)
    for (const [key, sources] of Array.from(playerSources.entries())) {
      if (sources.has('guild')) {
        sources.delete('guild');
        if (sources.size === 0) {
          if (!pinnedPlayers.has(key)) {
            removePlayer(key);
          } else {
            playerSources.set(key, sources);
          }
        } else {
          playerSources.set(key, sources);
        }
      }
    }
    
    renderTable();
    updateOverlaySize();
  } catch (err) {
    console.error('Error handling chat:gameStart', err);
  }
});

async function fetchAll() {
  // Add all queued players as manual entries (does not clear current list)
  for (const inputName of queue) {
    addPlayer(inputName, 'manual');
  }
  queue = [];
}

function bindMenus() {
  const btns = Array.from(document.querySelectorAll(".row-menu-btn"));
  const removes = Array.from(document.querySelectorAll(".remove-btn"));
  const pins = Array.from(document.querySelectorAll('.pin-btn'));

  btns.forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      closeAllMenus();
      const menu = btn.nextElementSibling;
      menu.classList.add("open");
    });
  });

  removes.forEach(b => {
    b.addEventListener("click", e => {
      e.stopPropagation();
      const tr = b.closest("tr");
      const name = tr.getAttribute("data-name");
      queue = queue.filter(n => n.toLowerCase() !== name.toLowerCase());
      // Do not remove if pinned
      if (!pinnedPlayers.has(String(name).toLowerCase())) {
        removePlayer(name);
      }
      closeAllMenus();
    });
  });

  pins.forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const tr = b.closest('tr');
      const name = tr.getAttribute('data-name');
      const key = String(name || '').toLowerCase();
      if (pinnedPlayers.has(key)) {
        pinnedPlayers.delete(key);
        b.textContent = 'Pin';
        tr.classList.remove('pinned');
      } else {
        pinnedPlayers.add(key);
        b.textContent = 'Unpin';
        tr.classList.add('pinned');
      }
      savePinned();
      closeAllMenus();
      renderTable();
    });
  });

  document.addEventListener("click", closeAllMenus);
}

function closeAllMenus() {
  document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
}

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const names = input.value.split(",").map(s => s.trim()).filter(Boolean);
    queue.push(...names);
    input.value = "";
    fetchAll();
  }
});

document.getElementById("clearAll").addEventListener("click", () => {
  queue = [];
  clearAllButUsername();
  updateOverlaySize();
});

document.getElementById("refresh").addEventListener("click", fetchAll);
document.getElementById("minBtn").addEventListener("click", () => window.ipcRenderer.send("window:minimize"));
document.getElementById("closeBtn").addEventListener("click", () => window.ipcRenderer.send("window:close"));

// Shortcut-triggered actions from main
window.ipcRenderer.on('shortcut:refresh', () => fetchAll());
window.ipcRenderer.on('shortcut:clear', () => {
  queue = [];
  clearAllButUsername();
});

// --- resize grips
let resizing = null;
function onDown(e) {
  const edge = e.target.getAttribute("data-edge");
  if (!edge) return;
  resizing = { edge, startX: e.screenX, startY: e.screenY };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp, { once: true });
}
function onMove(e) {
  if (!resizing) return;
  const dx = e.screenX - resizing.startX;
  const dy = e.screenY - resizing.startY;
  window.ipcRenderer.invoke("window:resize", { edge: resizing.edge, dx, dy });
  resizing.startX = e.screenX;
  resizing.startY = e.screenY;
}
function onUp() {
  resizing = null;
  window.removeEventListener("mousemove", onMove);
}

// Sidebar toggle + interactions
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');

if (menuBtn && sidebar) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opened = sidebar.classList.toggle('open');
    sidebar.setAttribute('aria-hidden', String(!opened));
    updateOverlaySize(); // recalculate when sidebar opens/closes
  });

  // Close sidebar when clicking outside
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    if (e.target.closest && (e.target.closest('#sidebar') || e.target.closest('#menuBtn'))) return;
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    updateOverlaySize(); // recalculate
  });

  // Close with Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      sidebar.setAttribute('aria-hidden', 'true');
      updateOverlaySize(); // recalculate
    }
  });

// Removed: generic activation of all nav items (caused conflicts with sub-items)
}

document.querySelectorAll(".grip").forEach(g => g.addEventListener("mousedown", onDown));

// --- Panel switching (flat list)
function showPanel(id) {
  // Get current panel before switching
  const currentPanel = document.querySelector('.panel.active')?.id?.replace('panel-', '');
  
  // If leaving columns panel, remove empty slots
  if (currentPanel === 'columns' && id !== 'columns') {
    const beforeLength = statSettings.layout.length;
    statSettings.layout = statSettings.layout.filter(slot => slot !== null);
    
    // Ensure we always have at least 6 slots
    while (statSettings.layout.length < 6) {
      statSettings.layout.push(null);
    }
    
    // Only save if something changed
    if (beforeLength !== statSettings.layout.length) {
      saveStatSettings();
    }
  }
  
  // Session panel specific logic
  if (id === 'session') {
    console.log('=== Session Panel Debug ===');
    console.log('typeof basicSettings:', typeof basicSettings);
    console.log('basicSettings exists:', !!basicSettings);
    console.log('basicSettings object:', basicSettings);
    
    // Ensure basicSettings is available
    if (typeof basicSettings === 'undefined' || !basicSettings) {
      console.log('basicSettings not available, loading from localStorage');
      basicSettings = JSON.parse(localStorage.getItem('basicSettings') || JSON.stringify(defaultBasic));
      console.log('Loaded basicSettings:', basicSettings);
    }
    
    // Get username from basicSettings (not localStorage)
    const username = basicSettings.username?.trim();
    console.log('Session panel opened, username from basicSettings:', username);
    console.log('sessionUsername:', sessionUsername);
    console.log('startStats:', startStats);
    
    if (!username) {
      // No username set - show instructions
      const sessionStats = document.getElementById('sessionStats');
      const sessionIgn = document.getElementById('sessionIgn');
      const sessionTime = document.getElementById('sessionTime');
      
      if (sessionStats) {
        sessionStats.innerHTML = `
          <div style="text-align:center;color:var(--muted);padding:40px 20px;">
            <svg class="icon" aria-hidden="true" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;"><use href="#i-profile"/></svg>
            <div style="font-size:16px;margin-bottom:8px;color:var(--text);">No Username Set</div>
            <div style="font-size:13px;line-height:1.5;">
              Go to <strong>Profile</strong> and enter your Minecraft IGN to start tracking session stats.<br><br>
              Session stats show your progress since opening the app!
            </div>
          </div>
        `;
      }
      if (sessionIgn) sessionIgn.textContent = 'No player selected';
      if (sessionTime) sessionTime.textContent = 'Session not started';
    } else if (username !== sessionUsername) {
      console.log('Starting session because username changed:', username, '!==', sessionUsername);
      startSession(username);
    } else if (sessionUsername && startStats) {
      console.log('Updating existing session');
      updateSession();
    } else {
      console.log('Session state unclear - startStats:', !!startStats, 'sessionUsername:', sessionUsername);
    }
    console.log('=== End Session Panel Debug ===');
  }
  
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${id}`);
  });
  localStorage.setItem('activePanel', id);
  document.querySelectorAll('.nav > .nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-panel') === id);
  });
  
  // Update account stats when switching to profile panel
  if (id === 'profile') {
    setTimeout(() => updateAccountStats(), 100);
  }
  
  updateOverlaySize();
}

// Sidebar navigation (all direct panels now, no submenu)
document.querySelectorAll('.nav > .nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.getAttribute('data-panel');
    if (panel) showPanel(panel);
  });
});

// Remove old settings submenu persistence (no longer needed)
localStorage.removeItem('settingsExpanded');
localStorage.removeItem('activeSettingsSection');
// Always start in Overlay panel on launch
showPanel('overlay');

// Default color rules for each stat
const DEFAULT_COLOR_RULES = {
  fkdr: [
    { op: '>=', value: 100, color: '#ff00ff' },
    { op: '>=', value: 50, color: '#ff69b4' },
    { op: '>=', value: 30, color: '#dc143c' },
    { op: '>=', value: 20, color: '#ff7f50' },
    { op: '>=', value: 10, color: '#ffa500' },
    { op: '>=', value: 7, color: '#ffff00' },
    { op: '>=', value: 5, color: '#00ff00' },
    { op: '>=', value: 3, color: '#00ff00' },
    { op: '>=', value: 1, color: '#ffffff' },
    { op: '>=', value: 0, color: '#808080' }
  ],
  wlr: [
    { op: '>=', value: 100, color: '#ff00ff' },
    { op: '>=', value: 50, color: '#ff69b4' },
    { op: '>=', value: 30, color: '#dc143c' },
    { op: '>=', value: 20, color: '#ff7f50' },
    { op: '>=', value: 10, color: '#ffa500' },
    { op: '>=', value: 7, color: '#ffff00' },
    { op: '>=', value: 5, color: '#00ff00' },
    { op: '>=', value: 3, color: '#00ff00' },
    { op: '>=', value: 1, color: '#ffffff' },
    { op: '>=', value: 0, color: '#808080' }
  ],
  ws: [
    { op: '>=', value: 100, color: '#ff0000' },
    { op: '>=', value: 50, color: '#ffff00' }
  ],
  bedwarsScore: [
    { op: '>=', value: 1000, color: '#ff00ff' },
    { op: '>=', value: 500, color: '#ff69b4' },
    { op: '>=', value: 300, color: '#dc143c' },
    { op: '>=', value: 200, color: '#ff7f50' },
    { op: '>=', value: 100, color: '#ffa500' },
    { op: '>=', value: 70, color: '#ffff00' },
    { op: '>=', value: 50, color: '#00ff00' },
    { op: '>=', value: 30, color: '#00ff00' },
    { op: '>=', value: 10, color: '#ffffff' },
    { op: '>=', value: 0, color: '#808080' }
  ],
  bblr: [
    { op: '>=', value: 50, color: '#ff00ff' },
    { op: '>=', value: 30, color: '#ff69b4' },
    { op: '>=', value: 20, color: '#dc143c' },
    { op: '>=', value: 10, color: '#ff7f50' },
    { op: '>=', value: 5, color: '#ffa500' },
    { op: '>=', value: 3, color: '#ffff00' },
    { op: '>=', value: 2, color: '#00ff00' },
    { op: '>=', value: 1, color: '#00ff00' },
    { op: '>=', value: 0.5, color: '#ffffff' },
    { op: '>=', value: 0, color: '#808080' }
  ],
  fk: [
    { op: '>=', value: 50000, color: '#ff00ff' },
    { op: '>=', value: 25000, color: '#ff0000' },
    { op: '>=', value: 10000, color: '#ffa500' },
    { op: '>=', value: 5000, color: '#ffff00' },
    { op: '>=', value: 1000, color: '#00ff00' },
    { op: '>=', value: 0, color: '#ffffff' }
  ],
  wins: [
    { op: '>=', value: 10000, color: '#ff00ff' },
    { op: '>=', value: 5000, color: '#ff0000' },
    { op: '>=', value: 2500, color: '#ffa500' },
    { op: '>=', value: 1000, color: '#ffff00' },
    { op: '>=', value: 500, color: '#00ff00' },
    { op: '>=', value: 0, color: '#ffffff' }
  ]
};

// Load/save stat settings
let statSettings = JSON.parse(localStorage.getItem('statSettings') || JSON.stringify({
  visible: Object.keys(STATS),
  order: Object.keys(STATS),
  layout: ['ws','fkdr','wlr','bblr','fk','wins','mode'], 
  colorRules: DEFAULT_COLOR_RULES
}));

// Migration: Ensure all STATS are in visible array (for users with old localStorage)
if (!statSettings.visible || !Array.isArray(statSettings.visible)) {
  statSettings.visible = Object.keys(STATS).filter(k => !STATS[k]?.disabled);
} else {
  // Add any missing stats to visible
  const allStats = Object.keys(STATS).filter(k => !STATS[k]?.disabled);
  for (const stat of allStats) {
    if (!statSettings.visible.includes(stat)) {
      statSettings.visible.push(stat);
    }
  }
}

// Migration: Ensure order contains all stats
if (!statSettings.order || !Array.isArray(statSettings.order)) {
  statSettings.order = Object.keys(STATS).filter(k => !STATS[k]?.disabled);
} else {
  const allStats = Object.keys(STATS).filter(k => !STATS[k]?.disabled);
  for (const stat of allStats) {
    if (!statSettings.order.includes(stat)) {
      statSettings.order.push(stat);
    }
  }
}

if (!Array.isArray(statSettings.layout)) {
  statSettings.layout = ['ws','fkdr','wlr','bblr','fk','wins','mode'];
}
// Ensure layout has between 6 and 12 slots
while (statSettings.layout.length < 6) {
  statSettings.layout.push(null);
}
if (statSettings.layout.length > 12) {
  statSettings.layout = statSettings.layout.slice(0, 12);
}

// Migration: convert legacy color names to hex once on load
(function migrateColorRules() {
  const map = { good: '#00ff00', warn: '#ffff00', bad: '#ff0000' };
  try {
    if (statSettings && statSettings.colorRules) {
      let changed = false;
      for (const key of Object.keys(statSettings.colorRules)) {
        const arr = statSettings.colorRules[key];
        if (!Array.isArray(arr)) continue;
        for (const rule of arr) {
          if (rule && typeof rule.color === 'string' && map[rule.color]) {
            rule.color = map[rule.color];
            changed = true;
          }
        }
      }
      if (changed) {
        localStorage.setItem('statSettings', JSON.stringify(statSettings));
      }
    }
  } catch {}
})();

function saveStatSettings() {
  // Purge disabled stats from layout and visible/order if present (migration)
  try {
    const disabledKeys = Object.keys(STATS).filter(k => STATS[k]?.disabled);
    if (disabledKeys.length) {
      statSettings.layout = statSettings.layout.map(x => (disabledKeys.includes(x) ? null : x));
      statSettings.visible = (statSettings.visible || []).filter(k => !disabledKeys.includes(k));
      statSettings.order = (statSettings.order || []).filter(k => !disabledKeys.includes(k));
      if (disabledKeys.includes(sortKey)) { sortKey = null; }
    }
  } catch {}
  localStorage.setItem('statSettings', JSON.stringify(statSettings));
  renderTable();
  renderStatLayoutSlots();
  renderStatLayoutPalette();
}

// Rebuild the entire table from cache (used when stat settings change)
function renderTable() {
  const table = document.getElementById('table');
  if (!table) return;
  console.log('[DEBUG] renderTable called. displayedPlayers:', Array.from(displayedPlayers));
  const dynamicStats = statSettings.layout.filter(k => k && statSettings.visible.includes(k));
  const colgroup = table.querySelector('colgroup');
  const thead = table.querySelector('thead');
  if (colgroup) {
    colgroup.innerHTML = ['c-lvl','c-name', ...dynamicStats.map(s => 'c-'+s), 'c-actions']
      .map(cls => `<col class="${cls}">`).join('');
  }
  if (thead) {
    // Include bedwarsScore header explicitly if part of dynamicStats; dynamicStats already filtered from layout.
    thead.innerHTML = `<tr>
      <th data-sort-key="level">${`Lvl${sortKey === 'level' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}`}</th>
      <th>Name</th>
      ${dynamicStats.map(s => {
        const stat = STATS[s];
        const sortable = stat.type === 'number';
        let label = stat.short || stat.name;
        if (sortable && sortKey === s) {
          label += sortDir === 'asc' ? ' ▲' : ' ▼';
        }
        return `<th class="metric-h${sortKey === s ? ' sorted' : ''}" ${sortable ? `data-sort-key="${s}"` : ''}>${label}</th>`;
      }).join('')}
      <th></th>
    </tr>`;
  }
  const tbody = document.getElementById('rows');
  if (!tbody) return;
  tbody.innerHTML = '';
    // Ensure uniqueness & latest player object wins
    const seen = new Set();
    const entriesRaw = Array.from(displayedPlayers).map(n => [n, playerCache[n]]).filter(([,p]) => Boolean(p));
    const entries = [];
    for (const [n,p] of entriesRaw) { if (!seen.has(n)) { seen.add(n); entries.push([n,p]); } }
  if (sortKey) {
    const dir = sortDir === 'asc' ? 1 : -1;
    entries.sort(([, a], [, b]) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const na = Number.isFinite(va) ? va : -Infinity;
      const nb = Number.isFinite(vb) ? vb : -Infinity;
      return dir * (na - nb);
    });
  }
  for (const [normName, player] of entries) {
    const wasNick = typeof nickedPlayers !== 'undefined' && nickedPlayers.has(normName);
    renderPlayerRow(player, wasNick, dynamicStats);
  }
  bindMenus();
  bindSortHeaders(); // Bind click handlers for sorting
  updateOverlaySize();
}

// Bind sort handlers to table headers
function bindSortHeaders() {
  const headers = document.querySelectorAll('thead th[data-sort-key]');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      if (!key) return;
      
      // Toggle sort direction if clicking same column, else default to descending
      // Neue Logik:
      // - Erster Klick auf eine Spalte -> aufsteigend (klein -> groß)
      // - Erneuter Klick toggelt wie bisher
      // - Shift+Klick erzwingt sofort Gegenrichtung beim Initialisieren
      const shift = window.event instanceof MouseEvent ? window.event.shiftKey : false;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = shift ? 'desc' : 'asc'; // Default jetzt auf ASC; mit Shift direkt DESC
      }
      // Hinweis für zukünftige Devs: Falls Nutzer lieber High->Low zuerst hätten,
      // kann hier wieder auf 'desc' gewechselt oder ein Setting eingeführt werden.
      
      // Update visual indicators
        try { localStorage.setItem('sortKey', sortKey); localStorage.setItem('sortDir', sortDir); } catch {}
      
      // Re-render table with new sort
      renderTable();
    });
  });
}

// Color rules modal
function showColorRules(column) {
  const modal = document.getElementById('colorRulesModal');
  const title = document.getElementById('colorRuleTitle');
  const rulesList = document.getElementById('colorRulesList');
  
  title.textContent = STATS[column].name;
  modal.classList.add('open');

  function renderRules() {
    const rules = statSettings.colorRules[column] || [];
    rulesList.innerHTML = rules.map((rule, i) => {
      // Migration: convert old CSS variable names to hex colors
      let color = rule.color;
      if (color === 'good') color = '#00ff00';
      if (color === 'warn') color = '#ffff00';
      if (color === 'bad') color = '#ff0000';
      return `
      <div class="color-rule" data-index="${i}">
        <select class="rule-operator">
          <option value=">=" ${rule.op === '>=' ? 'selected' : ''}>≥</option>
          <option value="<" ${rule.op === '<' ? 'selected' : ''}>＜</option>
        </select>
        <input type="number" class="rule-value" value="${rule.value}" step="0.1">
        <div class="color-picker">
          <div class="color-preview" style="background: ${color}"></div>
          <input type="color" class="color-input" value="${color}">
        </div>
        <button class="rule-delete">×</button>
      </div>
    `;
    }).join('');

    // Bind rule events
    rulesList.querySelectorAll('.color-rule').forEach(rule => {
      const i = parseInt(rule.dataset.index);
      
      rule.querySelector('.rule-operator').addEventListener('change', e => {
        statSettings.colorRules[column][i].op = e.target.value;
        saveStatSettings();
      });

      rule.querySelector('.rule-value').addEventListener('change', e => {
        statSettings.colorRules[column][i].value = parseFloat(e.target.value);
        saveStatSettings();
      });

      rule.querySelector('.color-input').addEventListener('change', e => {
        statSettings.colorRules[column][i].color = e.target.value;
        rule.querySelector('.color-preview').style.background = e.target.value;
        saveStatSettings();
      });

      rule.querySelector('.rule-delete').addEventListener('click', () => {
        statSettings.colorRules[column].splice(i, 1);
        saveStatSettings();
        renderRules();
      });
    });
  }

  renderRules();

  // Add rule button
  document.querySelector('.add-rule-btn').onclick = () => {
    if (!statSettings.colorRules[column]) {
      statSettings.colorRules[column] = [];
    }
    statSettings.colorRules[column].push({
      op: '>=',
      value: 0,
      color: '#00ff00'
    });
    saveStatSettings();
    renderRules();
  };

  // Reset to default button
  document.getElementById('resetRulesBtn').onclick = () => {
    if (DEFAULT_COLOR_RULES[column]) {
      // Deep copy default rules
      statSettings.colorRules[column] = JSON.parse(JSON.stringify(DEFAULT_COLOR_RULES[column]));
    } else {
      // No defaults for this stat, clear all rules
      statSettings.colorRules[column] = [];
    }
    saveStatSettings();
    renderRules();
  };

  // Close modal
  modal.querySelector('.modal-close').onclick = () => {
    modal.classList.remove('open');
  };
}

// Initialize settings
renderStatLayoutPalette();
renderStatLayoutSlots();
renderNicks(); // Initialize Nicks panel list on load

// Notification modal helper
function showNotification(message) {
  const modal = document.getElementById('notificationModal');
  const messageEl = document.getElementById('notificationMessage');
  const okBtn = document.getElementById('notificationOkBtn');
  
  messageEl.textContent = message;
  modal.classList.add('open');
  
  const closeModal = () => {
    modal.classList.remove('open');
    okBtn.removeEventListener('click', closeModal);
  };
  
  okBtn.addEventListener('click', closeModal);
}

// Add slot button
const addSlotBtn = document.getElementById('addSlotBtn');
if (addSlotBtn) {
  addSlotBtn.addEventListener('click', () => {
    if (statSettings.layout.length < 12) {
      statSettings.layout.push(null);
      saveStatSettings();
    } else {
      showNotification('Maximum 12 slots reached');
    }
  });
}

// --- Layout Editor Functions ---
function renderStatLayoutPalette() {
  const palette = document.getElementById('layoutPalette');
  if (!palette) return;
  const used = new Set(statSettings.layout.filter(Boolean));
  // Palette zeigt auch deaktivierte Stats (disabled:true) ausgegraut & nicht draggable
  const stats = Object.keys(STATS)
    .filter(k => !['level','name'].includes(k));
  
  console.log('[DEBUG] renderStatLayoutPalette - Total STATS:', Object.keys(STATS).length);
  console.log('[DEBUG] renderStatLayoutPalette - Filtered stats (no level/name):', stats.length, stats);
  console.log('[DEBUG] renderStatLayoutPalette - Currently used in layout:', Array.from(used));
  
// In settings palette show human-readable names
palette.innerHTML = stats.map(k => {
    const def = STATS[k];
    const isUsed = used.has(k);
    const isDisabled = !!def.disabled;
    const draggable = (!isUsed && !isDisabled) ? 'true' : 'false';
    const cls = `stat-pill${isDisabled ? ' disabled' : ''}`;
    const usedAttr = isUsed ? 'data-used="1"' : '';
    const disabledAttr = isDisabled ? 'data-disabled="1" title="Currently unavailable"' : '';
    return `<div class="${cls}" draggable="${draggable}" data-stat="${k}" ${usedAttr} ${disabledAttr}>${def.name}</div>`;
  }).join('');
  
  palette.querySelectorAll('.stat-pill[draggable="true"]').forEach(pill => {
    pill.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/stat', pill.dataset.stat);
    });
  });
  
  // Allow dropping stats back to palette (removes them from layout)
  palette.addEventListener('dragover', e => {
    e.preventDefault();
    palette.style.backgroundColor = 'rgba(102,234,255,0.08)';
  });
  
  palette.addEventListener('dragleave', () => {
    palette.style.backgroundColor = '';
  });
  
  palette.addEventListener('drop', e => {
    e.preventDefault();
    palette.style.backgroundColor = '';
    
    const sourceSlotIdx = e.dataTransfer.getData('text/sourceSlot');
    if (sourceSlotIdx) {
      // Dragging from a slot to palette - remove it
      const idx = parseInt(sourceSlotIdx);
      statSettings.layout[idx] = null;
      saveStatSettings();
    }
  });
}

function renderStatLayoutSlots() {
  const slotsEl = document.getElementById('layoutSlots');
  if (!slotsEl) return;
  const layout = statSettings.layout;
  slotsEl.innerHTML = layout.map((stat, i) => {
    if (!stat) return `<div class="slot" data-slot="${i}" data-empty="1">Empty</div>`;
// In settings slots show explicit names
const label = STATS[stat]?.name || stat;
return `<div class="slot filled" data-slot="${i}" data-stat="${stat}" draggable="true">${label}<button class="slot-remove" title="Remove">×</button></div>`;
  }).join('');
  
  slotsEl.querySelectorAll('.slot').forEach(slot => {
    let dragStartX = 0;
    let dragStartY = 0;
    let isDragging = false;
    
    // Dragstart for filled slots (allows dragging out or swapping)
    if (!slot.dataset.empty) {
      slot.addEventListener('dragstart', e => {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        isDragging = true;
        const stat = slot.dataset.stat;
        e.dataTransfer.setData('text/stat', stat);
        e.dataTransfer.setData('text/sourceSlot', slot.dataset.slot);
        slot.style.opacity = '0.4';
      });
      
      slot.addEventListener('dragend', e => {
        slot.style.opacity = '1';
        isDragging = false;
      });
    }
    
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });
    
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      
      const stat = e.dataTransfer.getData('text/stat');
      const sourceSlotIdx = e.dataTransfer.getData('text/sourceSlot');
      if (!stat) return;
      
      const targetIdx = parseInt(slot.dataset.slot);
      
      // Case 1: Dragging from palette to slot
      if (!sourceSlotIdx) {
        // Remove existing occurrence
        const idxExisting = statSettings.layout.indexOf(stat);
        if (idxExisting !== -1) statSettings.layout[idxExisting] = null;
        // Put into this slot
        statSettings.layout[targetIdx] = stat;
        saveStatSettings();
        return;
      }
      
      // Case 2: Dragging from slot to slot (swap)
      const sourceIdx = parseInt(sourceSlotIdx);
      if (sourceIdx === targetIdx) return; // Same slot, do nothing
      
      // Swap the two slots
      const temp = statSettings.layout[targetIdx];
      statSettings.layout[targetIdx] = statSettings.layout[sourceIdx];
      statSettings.layout[sourceIdx] = temp;
      saveStatSettings();
    });
    
    // Click on filled slot: open color rules (if stat supports it)
    // Only trigger if NOT dragging (detect by minimal movement)
    if (!slot.dataset.empty && slot.dataset.stat) {
      const statKey = slot.dataset.stat;
      let mouseDownX = 0;
      let mouseDownY = 0;
      
      slot.addEventListener('mousedown', e => {
        // Ignore if clicking remove button
        if (e.target.closest('.slot-remove')) return;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
      });
      
      if (STATS[statKey]?.colorRules) {
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', e => {
          // Ignore click if user clicked remove button
          if (e.target.closest('.slot-remove')) return;
          
          // Calculate movement since mousedown
          const deltaX = Math.abs(e.clientX - mouseDownX);
          const deltaY = Math.abs(e.clientY - mouseDownY);
          
          // Only treat as click if movement was minimal (< 5px)
          if (deltaX < 5 && deltaY < 5) {
            showColorRules(statKey);
          }
        });
      }
    }
    
    const removeBtn = slot.querySelector('.slot-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent triggering slot click
        const idx = parseInt(slot.dataset.slot);
        statSettings.layout[idx] = null;
        saveStatSettings();
      });
    }
  });
}

// --- Keyboard Shortcuts
const ACTIONS = [
  { id: 'toggleOverlay', label: 'Hide or show' },
  { id: 'refreshAll', label: 'Refresh all players' },
  { id: 'clearAll', label: 'Remove all players' },
  { id: 'toggleClickThrough', label: 'Toggle click-through' }
];

const DEFAULT_SHORTCUTS = {
  toggleOverlay: 'F9',
  refreshAll: '',
  clearAll: 'F8',
  toggleClickThrough: ''
};

let shortcuts = JSON.parse(localStorage.getItem('shortcuts') || JSON.stringify(DEFAULT_SHORTCUTS));

function saveShortcuts() {
  localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
  // Inform main to (re)register
  window.ipcRenderer.invoke('shortcuts:register', shortcuts);
}

function renderShortcuts() {
  const grid = document.getElementById('kbGrid');
  if (!grid) return;
  grid.innerHTML = ACTIONS.map(a => `
    <div class="kb-row" data-action="${a.id}">
      <div class="kb-action">${a.label}</div>
      <div class="kb-input" tabindex="0">${shortcuts[a.id] || '—'}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.kb-input').forEach(inputEl => {
    inputEl.addEventListener('click', () => startListen(inputEl));
    inputEl.addEventListener('keydown', (e) => startListen(inputEl, e));
  });
}

function startListen(inputEl, evt) {
  const row = inputEl.closest('.kb-row');
  const action = row.getAttribute('data-action');
  inputEl.classList.add('listening');
  inputEl.textContent = 'Press key…';

  const onKey = (e) => {
    e.preventDefault(); e.stopPropagation();
    // ESC clears the shortcut (unassigned)
    if (e.key === 'Escape') {
      shortcuts[action] = '';
      inputEl.textContent = '—';
      inputEl.classList.remove('listening');
      window.removeEventListener('keydown', onKey, true);
      saveShortcuts();
      return;
    }
    const acc = toAccelerator(e);
    shortcuts[action] = acc;
    inputEl.textContent = acc || '—';
    inputEl.classList.remove('listening');
    window.removeEventListener('keydown', onKey, true);
    saveShortcuts();
  };
  window.addEventListener('keydown', onKey, true);
}

function toAccelerator(e) {
  // Allow only F-keys or simple combos
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = e.key;
  let key = '';
  if (/^F\d{1,2}$/i.test(k)) key = k.toUpperCase();
  else if (k.length === 1) key = k.toUpperCase();
  else if (k === 'Escape') key = 'Esc';
  else if (k === ' ') key = 'Space';
  else return '';
  return [...parts, key].join('+');
}

// initial render and register
renderShortcuts();
window.ipcRenderer.invoke('shortcuts:register', shortcuts);

// --- Appearance Settings
const defaultAppearance = {
  opacity: 0.78,
  fontSize: 14,
  alwaysOnTop: true,
  autoResize: false,
  bgColor: '#14141c' // matches rgba(20,20,28,alpha)
};

let appearance = JSON.parse(localStorage.getItem('appearanceSettings') || JSON.stringify(defaultAppearance));

function saveAppearance() {
  localStorage.setItem('appearanceSettings', JSON.stringify(appearance));
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 20, g: 20, b: 28 };
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}

function applyAppearance() {
  const { r,g,b } = hexToRgb(appearance.bgColor);
  const rgba = `rgba(${r},${g},${b},${appearance.opacity})`;
  document.documentElement.style.setProperty('--bg', rgba);
  document.documentElement.style.setProperty('--table-font-size', appearance.fontSize + 'px');
  // also set body background directly to ensure immediate effect
  document.body && (document.body.style.background = rgba);
  // sync always-on-top with main
  window.ipcRenderer.invoke('window:setAlwaysOnTop', !!appearance.alwaysOnTop);
  // Update UI labels
  const ov = document.getElementById('opacityValue'); if (ov) ov.textContent = Math.round(appearance.opacity*100)+'%';
  const fv = document.getElementById('fontSizeValue'); if (fv) fv.textContent = appearance.fontSize+'px';
}

// Bind inputs
const opacityRange = document.getElementById('opacityRange');
const fontSizeRange = document.getElementById('fontSizeRange');
const alwaysOnTopToggle = document.getElementById('alwaysOnTopToggle');
const autoResizeToggle = document.getElementById('autoResizeToggle');
const bgColorInput = document.getElementById('bgColorInput');

if (opacityRange) {
  opacityRange.value = String(appearance.opacity);
  opacityRange.addEventListener('input', () => {
    appearance.opacity = Number(opacityRange.value);
    saveAppearance();
    applyAppearance();
  });
}

if (fontSizeRange) {
  fontSizeRange.value = String(appearance.fontSize);
  fontSizeRange.addEventListener('input', () => {
    appearance.fontSize = parseInt(fontSizeRange.value,10);
    saveAppearance();
    applyAppearance();
  });
}

if (alwaysOnTopToggle) {
  alwaysOnTopToggle.checked = !!appearance.alwaysOnTop;
  alwaysOnTopToggle.addEventListener('change', () => {
    appearance.alwaysOnTop = !!alwaysOnTopToggle.checked;
    saveAppearance();
    applyAppearance();
  });
}

if (autoResizeToggle) {
  autoResizeToggle.checked = !!appearance.autoResize;
  autoResizeToggle.addEventListener('change', () => {
    appearance.autoResize = !!autoResizeToggle.checked;
    saveAppearance();
    updateOverlaySize();
  });
}

if (bgColorInput) {
  bgColorInput.value = appearance.bgColor;
  bgColorInput.addEventListener('input', () => {
    appearance.bgColor = bgColorInput.value;
    saveAppearance();
    applyAppearance();
  });
}

// Apply on load
applyAppearance();

// --- Basic Settings
const defaultBasic = {
  logFile: 'badlion', // selected client key OR 'custom'
  customLogPath: '', // manual path if logFile === 'custom'
  username: '',
  lastDetected: { client: '', path: '' }
};

let basicSettings = JSON.parse(localStorage.getItem('basicSettings') || JSON.stringify(defaultBasic));

function saveBasicSettings(opts) {
  const options = Object.assign({ propagateUsername: true }, opts);
  localStorage.setItem('basicSettings', JSON.stringify(basicSettings));
  console.log('Basic settings saved:', basicSettings);
  updateSidebarUsername();
  // Ensure username entry exists when set
  if (basicSettings.username && basicSettings.username.trim()) {
    addPlayer(basicSettings.username.trim(), 'username');
  }
}

function updateSidebarUsername() {
const sidebarUsernameEl = document.getElementById('sidebarUsername');
if (sidebarUsernameEl) {
    sidebarUsernameEl.textContent = basicSettings.username || 'username';
}
}

// Bind Basic inputs
// Client selection elements
const clientGrid = document.getElementById('clientSelectGrid');
const clientStatusEl = document.getElementById('clientStatus');
const autoDetectBtn = document.getElementById('autoDetectBtn');
const customRow = document.getElementById('customPathRow');
const customPathInput = document.getElementById('customLogPathInput');
const applyCustomBtn = document.getElementById('applyCustomPathBtn');
const usernameInput = document.getElementById('usernameInput');

function updateClientButtons() {
  if (!clientGrid) return;
  const selected = basicSettings.logFile || 'badlion';
  clientGrid.querySelectorAll('button.client-btn').forEach(btn => {
    const key = btn.getAttribute('data-client');
    if (key === selected) btn.classList.add('active'); else btn.classList.remove('active');
    // mark detected (if different from selected and not custom)
    if (basicSettings.lastDetected?.client === key && key !== selected) {
      btn.setAttribute('data-detected','1');
    } else {
      btn.removeAttribute('data-detected');
    }
  });
  if (selected === 'custom') {
    if (customRow) customRow.style.display = 'flex';
  } else {
    if (customRow) customRow.style.display = 'none';
  }
}

function updateClientStatus(extra) {
  if (!clientStatusEl) return;
  clientStatusEl.classList.remove('warn','ok');
  let line = '';
  const sel = basicSettings.logFile;
  if (sel === 'custom') {
line = `Custom path active: ${basicSettings.customLogPath || '(empty)'}`;
  } else {
line = `Active client: ${sel}`;
  }
  if (basicSettings.lastDetected?.client && basicSettings.lastDetected.client !== sel) {
line += ` • Last detected: ${basicSettings.lastDetected.client}`;
    clientStatusEl.classList.add('warn');
  } else if (basicSettings.lastDetected?.client === sel) {
    clientStatusEl.classList.add('ok');
  }
  if (extra) line += ` • ${extra}`;
  clientStatusEl.textContent = line;
}

if (clientGrid) {
  clientGrid.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('client-btn')) return;
    const key = target.getAttribute('data-client');
    if (!key) return;
    basicSettings.logFile = key;
    saveBasicSettings();
    updateClientButtons();
    updateClientStatus();
    try {
      if (key === 'custom') {
        // do nothing yet; wait for Apply
      } else {
        window.ipcRenderer.send('set:client', key);
      }
    } catch {}
  });
  updateClientButtons();
  updateClientStatus();
}

if (applyCustomBtn && customPathInput) {
  applyCustomBtn.addEventListener('click', () => {
    const p = (customPathInput.value || '').trim();
    basicSettings.customLogPath = p;
    saveBasicSettings();
    updateClientStatus();
    if (basicSettings.logFile === 'custom' && p) {
      try { window.ipcRenderer.send('set:logPath', p); } catch {}
    }
  });
}

if (autoDetectBtn) {
  autoDetectBtn.addEventListener('click', async () => {
    try {
      const res = await window.ipcRenderer.invoke('chat:autoDetect');
      if (Array.isArray(res) && res.length === 2) {
        basicSettings.lastDetected = { client: res[0], path: res[1] };
        // If user hasn't manually chosen custom, adopt detected client
        if (basicSettings.logFile !== 'custom') {
          basicSettings.logFile = res[0];
          try { window.ipcRenderer.send('set:client', res[0]); } catch {}
        }
        saveBasicSettings();
        updateClientButtons();
        updateClientStatus('Auto-detect succeeded');
      } else {
        updateClientStatus('No logs found');
      }
    } catch (err) {
      updateClientStatus('Auto-detect error');
    }
  });
}

// Listen for backend log path changes to reflect status
try {
  window.ipcRenderer.on('chat:logPathChanged', (_e, payload) => {
    if (payload?.client && basicSettings.logFile !== 'custom') {
      // Sync chosen client if backend auto switched due to detection
      if (!basicSettings.logFile) basicSettings.logFile = payload.client;
    }
updateClientStatus('Path switched');
  });
} catch {}

if (usernameInput) {
  usernameInput.value = basicSettings.username || '';
  usernameInput.addEventListener('input', () => {
    const prev = (basicSettings.username || '').trim();
    const next = (usernameInput.value || '').trim();
    if (prev && prev.toLowerCase() !== next.toLowerCase()) {
      // Remove old username source (but keep row if other sources exist)
      removePlayerSource(prev, 'username');
    }
    basicSettings.username = next;
    localStorage.setItem('username', next); // For session tracking (keep for compatibility)
    saveBasicSettings();
    
    // Start new session if username changed and we have a valid username
    if (next && next !== sessionUsername) {
      setTimeout(() => startSession(next), 100); // Small delay to ensure save completes
    }
  });
  
  // Start session on app load if username exists (delayed)
  const savedUsername = basicSettings.username || '';
  if (savedUsername) {
    console.log('Found saved username on app load:', savedUsername);
    localStorage.setItem('username', savedUsername);
    // Wait a bit for IPC to be ready
    setTimeout(() => {
      if (window.window.ipcRenderer) {
        console.log('Starting session on app load for:', savedUsername);
        startSession(savedUsername);
      } else {
        console.log('IPC not ready, session start skipped');
      }
    }, 1000);
  }
}

// API Management
const apiKeyInput = document.getElementById('apiKeyInput');
const pasteApiKeyBtn = document.getElementById('pasteApiKeyBtn');
const testApiKeyBtn = document.getElementById('testApiKeyBtn');
const fallbackKeyToggle = document.getElementById('fallbackKeyToggle');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const refreshApiStatusBtn = document.getElementById('refreshApiStatusBtn');
const hypixelApiLink = document.getElementById('hypixelApiLink');
const backendStatus = document.getElementById('backendStatus');
const userKeyStatus = document.getElementById('userKeyStatus');

// Load API settings
const apiSettings = {
  userApiKey: localStorage.getItem('nebula-api-key') || '',
  useFallback: localStorage.getItem('nebula-use-fallback') !== 'false'
};

if (apiKeyInput) {
  apiKeyInput.value = apiSettings.userApiKey;
  apiKeyInput.addEventListener('change', () => {
    apiSettings.userApiKey = apiKeyInput.value.trim();
    localStorage.setItem('nebula-api-key', apiSettings.userApiKey);
    updateApiStatus();
  });
}

if (fallbackKeyToggle) {
  fallbackKeyToggle.checked = apiSettings.useFallback;
  fallbackKeyToggle.addEventListener('change', () => {
    apiSettings.useFallback = fallbackKeyToggle.checked;
    localStorage.setItem('nebula-use-fallback', apiSettings.useFallback.toString());
    window.window.ipcRenderer.invoke('api:toggleFallback', apiSettings.useFallback);
  });
}

if (pasteApiKeyBtn) {
  pasteApiKeyBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.length === 36) {
        apiKeyInput.value = text.trim();
        apiSettings.userApiKey = text.trim();
        localStorage.setItem('nebula-api-key', apiSettings.userApiKey);
        showNotification('API key pasted from clipboard', 'success');
        updateApiStatus();
      } else {
        showNotification('Invalid API key format in clipboard', 'error');
      }
    } catch (err) {
      showNotification('Could not access clipboard', 'error');
    }
  });
}

if (testApiKeyBtn) {
  testApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showNotification('Please enter an API key first', 'warning');
      return;
    }

    testApiKeyBtn.textContent = 'Testing...';
    testApiKeyBtn.disabled = true;

    try {
      const result = await window.window.ipcRenderer.invoke('api:setUserKey', apiKey);
      if (result.success) {
        showNotification('API key is valid!', 'success');
        apiSettings.userApiKey = apiKey;
        localStorage.setItem('nebula-api-key', apiKey);
        updateApiStatus();
      } else {
        showNotification(result.error || 'API key validation failed', 'error');
      }
    } catch (err) {
      showNotification('Failed to test API key', 'error');
    } finally {
      testApiKeyBtn.textContent = 'Test';
      testApiKeyBtn.disabled = false;
    }
  });
}

if (clearCacheBtn) {
  clearCacheBtn.addEventListener('click', async () => {
    clearCacheBtn.textContent = 'Clearing...';
    clearCacheBtn.disabled = true;

    try {
      await window.window.ipcRenderer.invoke('api:clearCache');
      showNotification('API cache cleared', 'success');
    } catch (err) {
      showNotification('Failed to clear cache', 'error');
    } finally {
      clearCacheBtn.textContent = 'Clear Cache';
      clearCacheBtn.disabled = false;
    }
  });
}

if (refreshApiStatusBtn) {
  refreshApiStatusBtn.addEventListener('click', () => {
    updateApiStatus();
  });
}

if (hypixelApiLink) {
  hypixelApiLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.window.ipcRenderer.invoke('external:open', 'https://developer.hypixel.net/');
  });
}

// Update API status display
async function updateApiStatus() {
  try {
    const status = await window.window.ipcRenderer.invoke('api:getStatus');
    
    if (backendStatus) {
      if (status.backendAvailable) {
        if (status.backendThrottled) {
          backendStatus.innerHTML = '<span style="color:#fbbf24;">●</span> Backend available (rate limited)';
        } else {
          backendStatus.innerHTML = '<span style="color:#10b981;">●</span> Backend available';
        }
      } else {
        backendStatus.innerHTML = '<span style="color:#ef4444;">●</span> Backend unavailable - using fallback';
      }
    }

    if (userKeyStatus) {
      if (status.config.hasUserKey) {
        if (status.userKeyValid) {
          userKeyStatus.innerHTML = '<span style="color:#10b981;">●</span> User API key valid';
        } else {
          userKeyStatus.innerHTML = '<span style="color:#ef4444;">●</span> User API key invalid or expired';
        }
      } else {
        userKeyStatus.innerHTML = '<span style="color:#9ca3af;">●</span> No user API key configured';
      }
    }

    // Show overall system status
    const hasWorkingApi = (status.backendAvailable && !status.backendThrottled) || 
                          (status.config.useFallback && status.userKeyValid);
    
    if (!hasWorkingApi && status.hypixelApiDown) {
      showNotification('Hypixel API appears to be down', 'warning');
    }

  } catch (err) {
    console.error('Failed to update API status:', err);
  }
}

// Initialize API status
updateApiStatus();

// Auto-refresh status every 30 seconds
setInterval(updateApiStatus, 30000);

// Initialize sidebar username on load and ensure presence in list
updateSidebarUsername();
if (basicSettings.username && basicSettings.username.trim()) {
addPlayer(basicSettings.username.trim(), 'username');
renderTable();
}
// Send initial username to main on load
try { window.ipcRenderer.send('set:username', basicSettings.username || ''); } catch (e) {}

// --- Sources Settings
const defaultSources = {
  game: {
    enabled: true,
    addFromWho: true,
    addFromChat: true,
    removeOnDeath: true,
    removeOnReconnect: true,
    removeOnServerChange: true
  },
  party: {
    enabled: true,
    removeOnMemberLeave: true,
    removeAllOnLeaveOrDisband: true,
    showInviteTemp: true,
    autoRefreshServerChange: false, // plus placeholder
    autoRefreshGameEnd: false // plus placeholder
  },
  partyInvites: {
    enabled: true
  },
  chat: {
    enabled: true,
    removeOnServerChange: true,
    addOnMention: true,
    strings: []
  },
  guild: {
    enabled: true,
    removeOnServerChange: true,
    onlineOnly: true
  },
  manual: {
    enabled: true,
    clearOnGameStart: false
  }
};

// Load saved settings and merge with defaults to ensure all keys exist
let sourcesSettings = JSON.parse(localStorage.getItem('sourcesSettings') || JSON.stringify(defaultSources));
// Merge defaults (ensures new settings fields exist even if saved data is old)
sourcesSettings = {
  game: { ...defaultSources.game, ...(sourcesSettings.game || {}) },
  party: { ...defaultSources.party, ...(sourcesSettings.party || {}) },
  partyInvites: { ...defaultSources.partyInvites, ...(sourcesSettings.partyInvites || {}) },
  chat: { ...defaultSources.chat, ...(sourcesSettings.chat || {}) },
  guild: { ...defaultSources.guild, ...(sourcesSettings.guild || {}) },
  manual: { ...defaultSources.manual, ...(sourcesSettings.manual || {}) }
};

function saveSourcesSettings() {
  localStorage.setItem('sourcesSettings', JSON.stringify(sourcesSettings));
  console.log('Sources settings saved:', sourcesSettings);
}

// Helper function to toggle subsection disabled state
function toggleSubsectionEnabled(containerId, enabled) {
  const container = document.getElementById(containerId);
  if (container) {
    const inputs = container.querySelectorAll('input, button');
    inputs.forEach(input => {
      input.disabled = !enabled;
    });
    container.style.opacity = enabled ? '1' : '0.5';
    container.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

// Bind Sources inputs
const sourceGameToggle = document.getElementById('sourceGameToggle');
const gameAddFromWho = document.getElementById('gameAddFromWho');
const gameAddFromChat = document.getElementById('gameAddFromChat');
const gameRemoveOnDeath = document.getElementById('gameRemoveOnDeath');
const gameRemoveOnDisconnect = document.getElementById('gameRemoveOnDisconnect');
const gameRemoveOnServerChange = document.getElementById('gameRemoveOnServerChange');

const sourcePartyToggle = document.getElementById('sourcePartyToggle');
const partyRemoveOnMemberLeave = document.getElementById('partyRemoveOnMemberLeave');
const partyRemoveAllOnLeaveOrDisband = document.getElementById('partyRemoveAllOnLeaveOrDisband');
const partyShowInviteTemp = document.getElementById('partyShowInviteTemp');
const partyRefreshServerChange = document.getElementById('partyRefreshServerChange');
const partyRefreshGameEnd = document.getElementById('partyRefreshGameEnd');

const sourcePartyInvitesToggle = document.getElementById('sourcePartyInvitesToggle');

const sourceChatToggle = document.getElementById('sourceChatToggle');
const chatRemoveOnServerChange = document.getElementById('chatRemoveOnServerChange');
const chatAddOnMention = document.getElementById('chatAddOnMention');
const chatStringList = document.getElementById('chatStringList');
const addChatStringBtn = document.getElementById('addChatString');
// Manual source elements
const sourceManualToggle = document.getElementById('sourceManualToggle');
const manualClearOnGameStart = document.getElementById('manualClearOnGameStart');

if (sourceGameToggle) {
  sourceGameToggle.checked = sourcesSettings.game.enabled;
  toggleSubsectionEnabled('gameSourceOptions', sourcesSettings.game.enabled);
  sourceGameToggle.addEventListener('change', () => {
    sourcesSettings.game.enabled = sourceGameToggle.checked;
    toggleSubsectionEnabled('gameSourceOptions', sourcesSettings.game.enabled);
    saveSourcesSettings();
  });
}

if (gameAddFromChat) {
  gameAddFromChat.checked = sourcesSettings.game.addFromChat;
  gameAddFromChat.addEventListener('change', () => {
    sourcesSettings.game.addFromChat = gameAddFromChat.checked;
    saveSourcesSettings();
  });
}

if (gameAddFromWho) {
  gameAddFromWho.checked = sourcesSettings.game.addFromWho;
  gameAddFromWho.addEventListener('change', () => {
    sourcesSettings.game.addFromWho = gameAddFromWho.checked;
    saveSourcesSettings();
  });
}

if (gameRemoveOnDeath) {
  gameRemoveOnDeath.checked = sourcesSettings.game.removeOnDeath;
  gameRemoveOnDeath.addEventListener('change', () => {
    sourcesSettings.game.removeOnDeath = gameRemoveOnDeath.checked;
    saveSourcesSettings();
  });
}

if (gameRemoveOnDisconnect) {
  gameRemoveOnDisconnect.checked = sourcesSettings.game.removeOnReconnect;
  gameRemoveOnDisconnect.addEventListener('change', () => {
    sourcesSettings.game.removeOnReconnect = gameRemoveOnDisconnect.checked;
    saveSourcesSettings();
  });
}

if (gameRemoveOnServerChange) {
  gameRemoveOnServerChange.checked = sourcesSettings.game.removeOnServerChange;
  gameRemoveOnServerChange.addEventListener('change', () => {
    sourcesSettings.game.removeOnServerChange = gameRemoveOnServerChange.checked;
    saveSourcesSettings();
  });
}

if (sourcePartyToggle) {
  sourcePartyToggle.checked = sourcesSettings.party.enabled;
  toggleSubsectionEnabled('partySourceOptions', sourcesSettings.party.enabled);
  // Also control party invites toggle
  if (sourcePartyInvitesToggle) {
    sourcePartyInvitesToggle.disabled = !sourcesSettings.party.enabled;
  }
  sourcePartyToggle.addEventListener('change', () => {
    sourcesSettings.party.enabled = sourcePartyToggle.checked;
    toggleSubsectionEnabled('partySourceOptions', sourcesSettings.party.enabled);
    // Also control party invites toggle
    if (sourcePartyInvitesToggle) {
      sourcePartyInvitesToggle.disabled = !sourcesSettings.party.enabled;
    }
    saveSourcesSettings();
  });
}

if (partyRemoveOnMemberLeave) {
  partyRemoveOnMemberLeave.checked = !!sourcesSettings.party.removeOnMemberLeave;
  partyRemoveOnMemberLeave.addEventListener('change', () => {
    sourcesSettings.party.removeOnMemberLeave = partyRemoveOnMemberLeave.checked;
    saveSourcesSettings();
  });
}

if (partyRemoveAllOnLeaveOrDisband) {
  partyRemoveAllOnLeaveOrDisband.checked = !!sourcesSettings.party.removeAllOnLeaveOrDisband;
  partyRemoveAllOnLeaveOrDisband.addEventListener('change', () => {
    sourcesSettings.party.removeAllOnLeaveOrDisband = partyRemoveAllOnLeaveOrDisband.checked;
    saveSourcesSettings();
  });
}

if (partyShowInviteTemp) {
  partyShowInviteTemp.checked = !!sourcesSettings.party.showInviteTemp;
  partyShowInviteTemp.addEventListener('change', () => {
    sourcesSettings.party.showInviteTemp = partyShowInviteTemp.checked;
    saveSourcesSettings();
  });
}

// Party auto-refresh options
if (partyRefreshServerChange) {
  partyRefreshServerChange.checked = !!sourcesSettings.party.autoRefreshServerChange;
  partyRefreshServerChange.addEventListener('change', () => {
    sourcesSettings.party.autoRefreshServerChange = partyRefreshServerChange.checked;
    saveSourcesSettings();
  });
}

if (partyRefreshGameEnd) {
  partyRefreshGameEnd.checked = !!sourcesSettings.party.autoRefreshGameEnd;
  partyRefreshGameEnd.addEventListener('change', () => {
    sourcesSettings.party.autoRefreshGameEnd = partyRefreshGameEnd.checked;
    saveSourcesSettings();
  });
}

if (sourcePartyInvitesToggle) {
  sourcePartyInvitesToggle.checked = sourcesSettings.partyInvites.enabled;
  sourcePartyInvitesToggle.addEventListener('change', () => {
    sourcesSettings.partyInvites.enabled = sourcePartyInvitesToggle.checked;
    saveSourcesSettings();
  });
}

if (sourceChatToggle) {
  sourceChatToggle.checked = sourcesSettings.chat.enabled;
  toggleSubsectionEnabled('chatSourceOptions', sourcesSettings.chat.enabled);
  sourceChatToggle.addEventListener('change', () => {
    sourcesSettings.chat.enabled = sourceChatToggle.checked;
    toggleSubsectionEnabled('chatSourceOptions', sourcesSettings.chat.enabled);
    saveSourcesSettings();
  });
}

if (chatRemoveOnServerChange) {
  chatRemoveOnServerChange.checked = sourcesSettings.chat.removeOnServerChange;
  chatRemoveOnServerChange.addEventListener('change', () => {
    sourcesSettings.chat.removeOnServerChange = chatRemoveOnServerChange.checked;
    saveSourcesSettings();
  });
}

if (chatAddOnMention) {
  chatAddOnMention.checked = sourcesSettings.chat.addOnMention;
  chatAddOnMention.addEventListener('change', () => {
    sourcesSettings.chat.addOnMention = chatAddOnMention.checked;
    saveSourcesSettings();
  });
}

// Guild bindings
const sourceGuildToggle = document.getElementById('sourceGuildToggle');
const guildRemoveOnServerChange = document.getElementById('guildRemoveOnServerChange');
const guildOnlineOnly = document.getElementById('guildOnlineOnly');

if (sourceGuildToggle) {
  sourceGuildToggle.checked = !!sourcesSettings.guild?.enabled;
  toggleSubsectionEnabled('guildSourceOptions', sourcesSettings.guild.enabled);
  sourceGuildToggle.addEventListener('change', () => {
    if (!sourcesSettings.guild) sourcesSettings.guild = {};
    sourcesSettings.guild.enabled = sourceGuildToggle.checked;
    toggleSubsectionEnabled('guildSourceOptions', sourcesSettings.guild.enabled);
    saveSourcesSettings();
  });
}

// Removed guildAddFromList toggle; guild additions are implicit when guild source is enabled.

if (guildRemoveOnServerChange) {
  guildRemoveOnServerChange.checked = !!sourcesSettings.guild?.removeOnServerChange;
  guildRemoveOnServerChange.addEventListener('change', () => {
    if (!sourcesSettings.guild) sourcesSettings.guild = {};
    sourcesSettings.guild.removeOnServerChange = guildRemoveOnServerChange.checked;
    saveSourcesSettings();
  });
}

if (guildOnlineOnly) {
  guildOnlineOnly.checked = !!sourcesSettings.guild?.onlineOnly;
  guildOnlineOnly.addEventListener('change', () => {
    if (!sourcesSettings.guild) sourcesSettings.guild = {};
    sourcesSettings.guild.onlineOnly = guildOnlineOnly.checked;
    saveSourcesSettings();
  });
}

// Manual bindings
if (sourceManualToggle) {
  sourceManualToggle.checked = !!sourcesSettings.manual.enabled;
  toggleSubsectionEnabled('manualSourceOptions', sourcesSettings.manual.enabled);
  sourceManualToggle.addEventListener('change', () => {
    sourcesSettings.manual.enabled = sourceManualToggle.checked;
    toggleSubsectionEnabled('manualSourceOptions', sourcesSettings.manual.enabled);
    saveSourcesSettings();
  });
}

if (manualClearOnGameStart) {
  manualClearOnGameStart.checked = !!sourcesSettings.manual.clearOnGameStart;
  manualClearOnGameStart.addEventListener('change', () => {
    sourcesSettings.manual.clearOnGameStart = manualClearOnGameStart.checked;
    saveSourcesSettings();
  });
}

function renderChatStrings() {
  if (!chatStringList) return;
  chatStringList.innerHTML = '';
  (sourcesSettings.chat.strings || []).forEach((str, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.innerHTML = `
      <input type="text" value="${str.replace(/"/g,'&quot;')}" data-idx="${idx}" style="flex:1;padding:6px 8px;background:var(--row);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:12px;" />
      <button type="button" data-remove="${idx}" style="background:rgba(255,255,255,0.08);border:0;color:var(--text);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">Remove</button>`;
    chatStringList.appendChild(row);
  });
}

function syncChatStringsFromDOM() {
  if (!chatStringList) return;
  const inputs = Array.from(chatStringList.querySelectorAll('input[type="text"]'));
  const values = [];
  for (var j=0;j<inputs.length;j++) {
    var el = inputs[j];
    var val = el && el.value != null ? String(el.value).trim() : '';
    if (val.length>0) values.push(val);
  }
  sourcesSettings.chat.strings = values;
  saveSourcesSettings();
}

if (addChatStringBtn) {
  addChatStringBtn.addEventListener('click', () => {
    sourcesSettings.chat.strings.push('');
    renderChatStrings();
    saveSourcesSettings();
  });
}

if (chatStringList) {
  chatStringList.addEventListener('input', function(e) {
    var tgt = e && e.target ? e.target : null;
    if (tgt && tgt.tagName === 'INPUT') {
      syncChatStringsFromDOM();
    }
  });
  chatStringList.addEventListener('click', function(e) {
    var t = e && e.target ? e.target : null;
    if (t && t.dataset && t.dataset.remove) {
      var idx = parseInt(t.dataset.remove, 10);
      sourcesSettings.chat.strings.splice(idx,1);
      renderChatStrings();
      saveSourcesSettings();
    }
  });
}

// Initial render for chat strings
renderChatStrings();


// ==========================================
// Firebase Cloud Sync (via Main Process)
// ==========================================

// Firebase is now handled in main process to avoid CSP issues
let firebaseInitialized = false;

// Check if Firebase is available
async function checkFirebase() {
  try {
    const config = await window.ipcRenderer.invoke('firebase:getConfig');
    firebaseInitialized = !!config.apiKey;
    console.log('[Firebase] Available:', firebaseInitialized);
    return firebaseInitialized;
  } catch (error) {
    console.error('[Firebase] Check failed:', error);
    return false;
  }
}

// Cloud Sync Functions (now using IPC)
async function uploadUserSettings(userId) {
  try {
    // Collect all local settings
    const settings = {
      nicks: JSON.parse(localStorage.getItem('nicks') || '[]'),
      appearanceSettings: JSON.parse(localStorage.getItem('appearanceSettings') || '{}'),
      shortcuts: JSON.parse(localStorage.getItem('shortcuts') || '[]'),
      basicSettings: JSON.parse(localStorage.getItem('basicSettings') || '{}'),
      statSettings: JSON.parse(localStorage.getItem('statSettings') || '{}'),
      sourcesSettings: JSON.parse(localStorage.getItem('sourcesSettings') || '{}'),
      nickDisplayMode: localStorage.getItem('nickDisplayMode') || 'nick',
    };
    
    // Upload via main process
    const result = await window.ipcRenderer.invoke('firebase:upload', userId, settings);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // Update local sync timestamp
    localStorage.setItem('lastSyncTime', Date.now().toString());
    
    console.log('[Firebase] Settings uploaded successfully');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Upload failed:', error);
    throw error;
  }
}

async function downloadUserSettings(userId) {
  try {
    const result = await window.ipcRenderer.invoke('firebase:download', userId);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    if (!result.data) {
      console.log('[Firebase] No cloud settings found');
      return { success: true, data: null };
    }
    
    const settings = result.data;
    
    // Apply settings to localStorage
    if (settings.nicks) localStorage.setItem('nicks', JSON.stringify(settings.nicks));
    if (settings.appearanceSettings) localStorage.setItem('appearanceSettings', JSON.stringify(settings.appearanceSettings));
    if (settings.shortcuts) localStorage.setItem('shortcuts', JSON.stringify(settings.shortcuts));
    if (settings.basicSettings) localStorage.setItem('basicSettings', JSON.stringify(settings.basicSettings));
    if (settings.statSettings) localStorage.setItem('statSettings', JSON.stringify(settings.statSettings));
    if (settings.sourcesSettings) localStorage.setItem('sourcesSettings', JSON.stringify(settings.sourcesSettings));
    if (settings.nickDisplayMode) localStorage.setItem('nickDisplayMode', settings.nickDisplayMode);
    
    // Update local sync timestamp
    localStorage.setItem('lastSyncTime', Date.now().toString());
    
    console.log('[Firebase] Settings downloaded successfully');
    return { success: true, data: settings, timestamp: result.timestamp };
  } catch (error) {
    console.error('[Firebase] Download failed:', error);
    throw error;
  }
}

async function syncUserSettings(userId, direction = 'auto') {
  console.log('[Firebase] Starting sync:', userId);
  if (!userId) {
    throw new Error('User not logged in');
  }
  
  try {
    if (direction === 'upload') {
      return await uploadUserSettings(userId);
    } else if (direction === 'download') {
      const result = await downloadUserSettings(userId);
      if (result.data) {
        // Reload page to apply all settings
        location.reload();
      }
      return result;
    } else {
      // Auto: Check which is newer
      const downloadResult = await window.ipcRenderer.invoke('firebase:download', userId);
      
      if (downloadResult.error) {
        throw new Error(downloadResult.error);
      }
      
      const lastLocalSync = parseInt(localStorage.getItem('lastSyncTime') || '0');
      
      if (!downloadResult.data) {
        // No cloud data, upload local
        return await uploadUserSettings(userId);
      }
      
      const cloudTimestamp = downloadResult.timestamp || 0;
      
      if (cloudTimestamp > lastLocalSync) {
        // Cloud is newer, download
        console.log('[Firebase] Cloud settings are newer, downloading...');
        const result = await downloadUserSettings(userId);
        if (result.data) {
          location.reload();
        }
        return result;
      } else {
        // Local is newer or equal, upload
        console.log('[Firebase] Local settings are newer, uploading...');
        return await uploadUserSettings(userId);
      }
    }
  } catch (error) {
    console.error('[Firebase] Sync failed:', error);
    throw error;
  }
}

// Update profile UI
export function updateProfileUI() {
  const avatar = document.getElementById('profileAvatar');
  const username = document.getElementById('profileUsername');
  const status = document.getElementById('profileStatus');
  const loginBtn = document.getElementById('discordLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const syncStatus = document.getElementById('syncStatus');
  const syncTime = document.getElementById('syncTime');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const accountStatsCard = document.getElementById('accountStatsCard');

  if (window.userProfile) {
    // Logged in state
    if (avatar) {
      avatar.classList.remove('empty');
      if (window.userProfile.avatar) {
        avatar.innerHTML = `<img src="${window.userProfile.avatar}" alt="${window.userProfile.username}" />`;
      } else {
        // Show first letter of username if no avatar
        avatar.innerHTML = `<div style="font-size:36px;font-weight:700">${window.userProfile.username[0].toUpperCase()}</div>`;
      }
    }
    if (username) username.textContent = window.userProfile.tag || window.userProfile.username;
    if (status) {
      status.classList.remove('offline');
      status.innerHTML = '<span class="status-dot"></span><span>Connected via Discord</span>';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'flex';
    if (syncStatus) syncStatus.textContent = 'Ready to sync';
    if (syncTime) {
      const lastSync = localStorage.getItem('lastSyncTime');
      syncTime.textContent = lastSync 
        ? `Last synced: ${new Date(lastSync).toLocaleString()}`
        : 'Never synced - click Sync Now to upload your settings';
    }
    if (syncNowBtn) syncNowBtn.disabled = false;
    if (accountStatsCard) {
      accountStatsCard.style.display = 'block';
      updateAccountStats(); // Update stats when shown
    }
  } else {
    // Logged out state
    if (avatar) {
      avatar.classList.add('empty');
      avatar.innerHTML = '';
    }
    if (username) username.textContent = 'Not logged in';
    if (status) {
      status.classList.add('offline');
      status.innerHTML = '<span class="status-dot"></span><span>Local account only</span>';
    }
    if (loginBtn) loginBtn.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (syncStatus) syncStatus.textContent = 'Not available';
    if (syncTime) syncTime.textContent = 'Login with Discord to enable cloud sync';
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (accountStatsCard) {
      accountStatsCard.style.display = 'block'; // Still show stats when logged out
      updateAccountStats(); // Show local metrics
    }
  }

  // Update Plus status (async for both logged in/out states)
  updatePlusStatus();
}

// Update Plus UI status
async function updatePlusStatus() {
  const plusStatusText = document.getElementById('plusStatusText');
  const upgradePlusBtn = document.getElementById('upgradePlusBtn');
  
  if (!plusStatusText || !upgradePlusBtn) return;

  // Check for demo plus (local session only) with time limit
  const demoPlus = localStorage.getItem('demoPlus') === 'true';
  const demoStartTime = parseInt(localStorage.getItem('demoPlusStartTime') || '0');
  const now = Date.now();
  const demoTimeLeft = 10 * 60 * 1000 - (now - demoStartTime); // 10 minutes
  const isDemoExpired = demoPlus && demoTimeLeft <= 0;

  if (window.userProfile) {

    try {
      const plusData = await window.ipcRenderer.invoke('plus:checkStatus', window.userProfile.id);
      
      if (plusData.isPlus) {
        const expiresDate = new Date(plusData.expiresAt).toLocaleDateString();
        const isPaidPlus = plusData.type === 'paid';
        const isTestPlus = plusData.type === 'test';
        
        if (isPaidPlus) {
          plusStatusText.innerHTML = `
            <span style="font-weight:600;font-size:14px;color:var(--accent)">✨ Plus Active</span>
            <span style="font-size:12px;color:var(--muted)">Expires: ${expiresDate}</span>
          `;
          upgradePlusBtn.textContent = 'Manage';
          upgradePlusBtn.disabled = false;
        } else if (isTestPlus) {
          const hoursLeft = Math.ceil((plusData.expiresAt - Date.now()) / (60 * 60 * 1000));
          plusStatusText.innerHTML = `
            <span style="font-weight:600;font-size:14px;color:var(--warning)">🧪 Test Plus Active</span>
            <span style="font-size:12px;color:var(--muted)">${hoursLeft} hours left of monthly test</span>
          `;
          upgradePlusBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade to Full</span>';
          upgradePlusBtn.disabled = false;
        }
      } else {
        plusStatusText.innerHTML = `
          <span style="font-weight:600;font-size:14px">Free Plan</span>
          <span style="font-size:12px;color:var(--muted)">Unlock all features with Plus</span>
        `;
        upgradePlusBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade</span>';
        upgradePlusBtn.disabled = false;
      }
    } catch (error) {
      console.error('[Plus] Status check failed:', error);
    }
  } else if (demoPlus && !isDemoExpired) {
    // Demo plus mode (with time limit)
    const minutesLeft = Math.ceil(demoTimeLeft / (60 * 1000));
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px;color:var(--accent)">✨ Demo Plus</span>
      <span style="font-size:12px;color:var(--muted)">${minutesLeft} minutes left - Get unlimited access</span>
    `;
    upgradePlusBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade Now</span>';
    upgradePlusBtn.disabled = false;
  } else if (isDemoExpired) {
    // Demo expired - reset demo
    localStorage.removeItem('demoPlus');
    localStorage.removeItem('demoPlusStartTime');
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px">Demo Expired</span>
      <span style="font-size:12px;color:var(--muted)">Try again or upgrade to Plus</span>
    `;
    upgradePlusBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Try Again</span>';
    upgradePlusBtn.disabled = false;
  } else {
    // Logged out state - but allow demo plus for testing
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px">Free Plan</span>
      <span style="font-size:12px;color:var(--muted)">Try Plus (Demo Mode)</span>
    `;
    upgradePlusBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Try Demo</span>';
    upgradePlusBtn.disabled = false; // Enable demo even without login
  }
}

// Update Account Statistics Display
async function updateAccountStats() {
  const memberSinceEl = document.getElementById('memberSince');
  const playersTrackedEl = document.getElementById('playersTracked');
  const sessionsCountEl = document.getElementById('sessionsCount');
  const totalLookupsEl = document.getElementById('totalLookups');

  if (!memberSinceEl || !playersTrackedEl || !sessionsCountEl || !totalLookupsEl) {
    console.warn('[Metrics] Account stats elements not found');
    return;
  }

  try {
    let finalMetrics = { ...accountMetrics };
    let isCloudData = false;

    // If logged in, try to sync with cloud
    if (window.userProfile?.id) {
      try {
        const cloudResult = await window.ipcRenderer.invoke('metrics:get', window.userProfile.id);
        if (cloudResult.success && cloudResult.data) {
          isCloudData = cloudResult.source === 'cloud';
          finalMetrics = {
            memberSince: cloudResult.data.memberSince || accountMetrics.memberSince,
            players: new Set([...accountMetrics.players, ...(cloudResult.data.players || [])]),
            sessionsCount: Math.max(cloudResult.data.sessionsCount || 0, accountMetrics.sessionsCount),
            totalLookups: Math.max(cloudResult.data.totalLookups || 0, accountMetrics.totalLookups)
          };

          // Push local data to cloud if we have more data
          if (accountMetrics.totalLookups > (cloudResult.data.totalLookups || 0) ||
              accountMetrics.players.size > (cloudResult.data.playersTracked || 0)) {
            const updateData = {
              memberSince: Math.min(accountMetrics.memberSince, cloudResult.data.memberSince || Date.now()),
              playersTracked: Math.max(accountMetrics.players.size, cloudResult.data.playersTracked || 0),
              sessionsCount: Math.max(accountMetrics.sessionsCount, cloudResult.data.sessionsCount || 0),
              totalLookups: Math.max(accountMetrics.totalLookups, cloudResult.data.totalLookups || 0)
            };
            
            window.ipcRenderer.invoke('metrics:update', window.userProfile.id, updateData).then(result => {
              if (result.success) {
                console.log('[Metrics] Local data synced to cloud');
              }
            });
          }
        }
      } catch (error) {
        console.warn('[Metrics] Cloud sync failed, using local data:', error);
      }
    }

    // Update UI
    const memberSinceDate = new Date(finalMetrics.memberSince);
    memberSinceEl.textContent = memberSinceDate.toLocaleDateString();
    playersTrackedEl.textContent = finalMetrics.players.size.toLocaleString();
    sessionsCountEl.textContent = finalMetrics.sessionsCount.toLocaleString();
    totalLookupsEl.textContent = finalMetrics.totalLookups.toLocaleString();

    // Add visual indicator for data source
    const indicator = isCloudData ? '☁️' : '💾';
    const title = isCloudData ? 'Data synced from cloud' : 'Local data only';
    [memberSinceEl, playersTrackedEl, sessionsCountEl, totalLookupsEl].forEach(el => {
      el.setAttribute('title', title);
      el.style.opacity = isCloudData ? '1' : '0.8';
    });

  } catch (error) {
    console.error('[Metrics] Failed to update display:', error);
    // Fallback to local data
    memberSinceEl.textContent = new Date(accountMetrics.memberSince).toLocaleDateString();
    playersTrackedEl.textContent = accountMetrics.players.size.toString();
    sessionsCountEl.textContent = accountMetrics.sessionsCount.toString();
    totalLookupsEl.textContent = accountMetrics.totalLookups.toString();
  }
}

// Auto-update account stats when switching to profile panel
function scheduleAccountStatsUpdate() {
  const activePanel = document.querySelector('.panel.active');
  if (activePanel && activePanel.id === 'panel-profile') {
    updateAccountStats();
  }
}


// Sync Now Handler (Firebase Cloud Sync)
const syncNowBtn = document.getElementById('syncNowBtn');
if (syncNowBtn) {
  syncNowBtn.addEventListener('click', async () => {
    if (!window.userProfile) {
      showNotification('Please login with Discord first');
      return;
    }

    if (!firebaseInitialized) {
      showNotification('Firebase not configured. Please check your .env settings.');
      return;
    }

    try {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';
      
      // Sync user settings with Firebase
      await syncUserSettings(window.userProfile.id, 'auto');
      
      // Update UI timestamp
      updateProfileUI();
      
      showNotification('Settings synced successfully!');
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
    } catch (err) {
      console.error('Sync error:', err);
      showNotification('Sync failed: ' + (err.message || err));
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
    }
  });
}

// Plus Upgrade Handler
const upgradePlusBtn = document.getElementById('upgradePlusBtn');
if (upgradePlusBtn) {
  upgradePlusBtn.addEventListener('click', async () => {
    // Check if demo reset
    if (upgradePlusBtn.textContent === 'Reset Demo') {
      localStorage.removeItem('demoPlus');
      showNotification('Demo Plus reset');
      updatePlusStatus();
      return;
    }

    if (!window.userProfile) {
      // Demo mode without login
      showNotification('🎉 Demo Plus activated! Try all Plus features this session.');
      localStorage.setItem('demoPlus', 'true');
      updatePlusStatus();
      return;
    }

    // Check existing Plus status
    const plusData = await window.ipcRenderer.invoke('plus:checkStatus', window.userProfile.id);
    const isPaidPlus = plusData.type === 'paid';
    if (isPaidPlus) {
      showNotification('Opening your Nebula Plus management page...');
      const result = await window.ipcRenderer.invoke('plus:manageSubscription', window.userProfile.id);
      if (result.error) {
        showNotification('❌ ' + result.error);
        return;
      }
      return;
    }

    // Open our new plan selection dialog instead of direct checkout
    showPlusVerificationDialog();
  });
}

// Plus verification dialog
function showPlusVerificationDialog() {
  // Create different dialogs based on login status
  const modal = document.getElementById('notificationModal');
  const messageEl = document.getElementById('notificationMessage');
  const okBtn = document.getElementById('notificationOkBtn');
  
  if (window.userProfile) {

    // LOGGED IN USER: Direct purchase options 
    messageEl.innerHTML = `
      <div style="text-align:left;padding:12px 0">
        <h3 style="margin:0 0 12px 0;color:var(--accent)">Upgrade to Nebula Plus</h3>
        <p style="margin:0 0 20px 0">Choose your plan and unlock all Plus features:</p>
        <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
          <button id="monthlyPlanBtn" style="background:var(--surface2);color:var(--text);border:2px solid var(--border);padding:16px 24px;border-radius:12px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;min-width:140px">
            � Monthly<br>
            <span style="font-size:18px;font-weight:700;color:var(--accent)">€1.99</span><br>
            <small style="opacity:0.7">per month</small>
          </button>
          <button id="yearlyPlanBtn" style="background:linear-gradient(135deg,#20B2AA,#17A2B8);color:white;border:2px solid #20B2AA;padding:16px 24px;border-radius:12px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;min-width:140px;position:relative;box-shadow:0 4px 12px rgba(32,178,170,0.3)">
            <div style="position:absolute;top:-8px;right:-8px;background:#FF6B35;color:white;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">-16%</div>
            � Yearly<br>
            <span style="font-size:18px;font-weight:700">€19.99</span><br>
            <small style="opacity:0.9">save €4/year</small>
          </button>
        </div>
        <div style="text-align:center;margin-top:16px">
          <button id="cancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Cancel</button>
        </div>
        <p style="margin:16px 0 0 0;font-size:12px;color:var(--muted);text-align:center">
          � Secure payment via Stripe • Cancel anytime
        </p>
      </div>
    `;
  } else {
    // NOT LOGGED IN: Only demo available
    messageEl.innerHTML = `
      <div style="text-align:left;padding:12px 0">
        <h3 style="margin:0 0 12px 0;color:var(--accent)">Try Nebula Plus</h3>
        <p style="margin:0 0 16px 0">Login with Discord for more options, or try a quick demo:</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="loginForTrialBtn" style="background:var(--accent);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500">� Login for 7-Day Trial</button>
          <button id="quickDemoBtn" style="background:var(--surface2);color:var(--text);border:none;padding:8px 16px;border-radius:6px;cursor:pointer">⚡ 10-Min Demo</button>
          <button id="cancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Cancel</button>
        </div>
      </div>
    `;
  }
  
  modal.classList.add('open');
  
  const closeModal = () => {
    modal.classList.remove('open');
    messageEl.innerHTML = ''; // Clear custom content
  };

  // Handle monthly plan (€1.99/month)
  const monthlyPlanBtn = document.getElementById('monthlyPlanBtn');
  if (monthlyPlanBtn) {
    monthlyPlanBtn.onclick = async () => {
      closeModal();
      
      try {
        const result = await window.ipcRenderer.invoke('plus:createCheckout', window.userProfile.id, { plan: 'monthly' });
        
        if (result.error) {
          showNotification('❌ ' + result.error);
          return;
        }
        
        showNotification('💳 Opening monthly payment (€1.99/month)...');
        
        // After a delay, show payment verification dialog
        setTimeout(() => {
          showPaymentVerificationDialog();
        }, 3000);
      } catch (err) {
        showNotification('❌ Error: ' + (err.message || err));
      }
    };
  }

  // Handle yearly plan (€19.99/year - save 16%!)
  const yearlyPlanBtn = document.getElementById('yearlyPlanBtn');
  if (yearlyPlanBtn) {
    yearlyPlanBtn.onclick = async () => {
      closeModal();
      
      try {
        const result = await window.ipcRenderer.invoke('plus:createCheckout', window.userProfile.id, { plan: 'yearly' });
        
        if (result.error) {
          showNotification('❌ ' + result.error);
          return;
        }
        
        showNotification('💎 Opening yearly payment (€19.99/year - save 16%)...');
        
        // After a delay, show payment verification dialog
        setTimeout(() => {
          showPaymentVerificationDialog();
        }, 3000);
      } catch (err) {
        showNotification('❌ Error: ' + (err.message || err));
      }
    };
  }

  // Handle login prompt for trial
  const loginForTrialBtn = document.getElementById('loginForTrialBtn');
  if (loginForTrialBtn) {
    loginForTrialBtn.onclick = () => {
      closeModal();
      showNotification('Please login with Discord first to start your 7-day trial!');
      // Scroll to login section
      document.getElementById('discordSection').scrollIntoView({ behavior: 'smooth' });
    };
  }

  // Handle quick demo (non-logged in users)
  const quickDemoBtn = document.getElementById('quickDemoBtn');
  if (quickDemoBtn) {
    quickDemoBtn.onclick = () => {
      closeModal();
      const existingDemo = localStorage.getItem('demoPlus') === 'true';
      const demoStartTime = parseInt(localStorage.getItem('demoPlusStartTime') || '0');
      const now = Date.now();
      const timeSinceDemo = now - demoStartTime;
      
      // Allow new demo if more than 24 hours passed or no demo yet
      if (!existingDemo || timeSinceDemo > 24 * 60 * 60 * 1000) {
        localStorage.setItem('demoPlus', 'true');
        localStorage.setItem('demoPlusStartTime', String(now));
        showNotification('⚡ 10-minute Quick Demo activated! Try Nebula Plus features now.');
        updatePlusStatus();
      } else {
        showNotification('⏰ Demo already used today. Login for 7-day trial or wait 24h!');
      }
    };
  }

  // Handle cancel
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.onclick = closeModal;
  }
}

// Payment verification dialog (after Stripe checkout)
function showPaymentVerificationDialog() {
  const modal = document.getElementById('notificationModal');
  const messageEl = document.getElementById('notificationMessage');
  
  messageEl.innerHTML = `
    <div style="text-align:left;padding:12px 0">
      <h3 style="margin:0 0 12px 0;color:var(--accent)">Payment Completed?</h3>
      <p style="margin:0 0 16px 0">Did you successfully complete your payment on Stripe?</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button id="verifyPaymentBtn" style="background:var(--accent);color:white;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:8px"><svg class="icon" aria-hidden="true" style="opacity:0.9"><use href="#i-check"/></svg>Yes, I Paid</button>
        <button id="paymentCancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Not Yet</button>
      </div>
      <p style="margin:16px 0 0 0;font-size:12px;color:var(--muted);text-align:center">
        We'll verify your payment and activate Plus automatically
      </p>
    </div>
  `;
  
  modal.classList.add('open');
  
  const closeModal = () => {
    modal.classList.remove('open');
    messageEl.innerHTML = '';
  };

  // Handle payment verification
  document.getElementById('verifyPaymentBtn').onclick = async () => {
    closeModal();
    
    if (!window.userProfile) {
      showNotification('⚠️ Please login with Discord first');
      return;
    }
    
    try {
      // Extract session_id from URL if available (after Stripe redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      
      if (sessionId) {
        // Verify with actual session ID
        const result = await window.ipcRenderer.invoke('plus:verify', window.userProfile.id, sessionId);
        
        if (result.error) {
          showNotification('❌ Payment verification failed: ' + result.error);
          return;
        }
        
        showNotification('🎉 Plus activated successfully! Welcome to Nebula Plus!');
        updatePlusStatus();
      } else {
        // Fallback: Manual check or demo activation
        showNotification('Checking payment status... This may take a moment.');
        
        // For demo purposes, you could activate demo plus here
        // Or implement a webhook-based verification system
        setTimeout(() => {
          showNotification('⚠️ Payment verification in progress. Plus will activate automatically once confirmed.');
        }, 2000);
      }
    } catch (err) {
      showNotification('❌ Verification error: ' + (err.message || err));
    }
  };

  // Handle cancellation
  document.getElementById('paymentCancelBtn').onclick = closeModal;
}

// Verify plus purchase
async function verifyPlusPurchase(purchaseToken) {
  try {
    const result = await window.ipcRenderer.invoke('plus:verify', window.userProfile.id, purchaseToken);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    showNotification('🎉 Plus activated successfully! Welcome to Nebula Plus!');
    updateProfileUI(); // Refresh plus status
    
  } catch (err) {
    console.error('Plus verification error:', err);
    showNotification('Plus verification failed: ' + (err.message || err));
  }
}

// Token refresh logic (check if token needs refresh on app start)
async function checkAndRefreshToken() {
  if (!authTokens || !authTokens.refreshToken) return;

  const authTimestamp = parseInt(localStorage.getItem('authTimestamp') || '0');
  const now = Date.now();
  const tokenAge = now - authTimestamp;
  const expiresIn = (authTokens.expiresIn || 604800) * 1000; // Default 7 days

  // Refresh if token is older than 80% of expiry time
  if (tokenAge > expiresIn * 0.8) {
    console.log('Refreshing Discord token...');
    const result = await window.ipcRenderer.invoke('auth:discord:refresh', authTokens.refreshToken);
    
    if (result.success) {
      authTokens = result.tokens;
      localStorage.setItem('authTokens', JSON.stringify(authTokens));
      localStorage.setItem('authTimestamp', Date.now().toString());
      console.log('Token refreshed successfully');
    } else {
      console.error('Token refresh failed:', result.error);
      // Optionally logout user if refresh fails
    }
  }
}

// Initialize Firebase and profile UI on load
async function initialize() {
  const firebaseReady = await checkFirebase();
  updateProfileUI();
  checkAndRefreshToken();
  
  // Only start auto-sync if Firebase is ready
  if (firebaseReady) {
    setInterval(async () => {
      if (window.userProfile && firebaseInitialized) {
        try {
          console.log('[Firebase] Auto-sync check...');
          await syncUserSettings(window.userProfile.id, 'auto');
        } catch (error) {
          console.warn('[Firebase] Auto-sync failed:', error);
          // Don't show notification for background sync failures
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Start initialization
initialize();

