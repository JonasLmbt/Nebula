// session/sessionAnalytics.js

async function loadSessionsFromBackend() {
  try {
    const res = await window.ipcRenderer.invoke("sessions:get");
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error("[Analytics] Failed to load sessions:", err);
    return [];
  }
}

// ---------- CONFIG ----------

const MODE_LABELS = {
  overall: "Overall",
  eight_one: "Solo",
  eight_two: "Doubles",
  four_three: "3s",
  four_four: "4s",
  two_four: "4v4",
};

const RANGE_CONFIG = {
  today: { label: "Today", days: 0 },
  "7d": { label: "Last 7 Days", days: 7 },
  "30d": { label: "Last 30 Days", days: 30 },
  "365d": { label: "Last 12 Months", days: 365 },
  all: { label: "All sessions", days: null },
};

// Stat-Konfiguration für den Chart
const STAT_CONFIG = {
  fkdr: {
    label: "FKDR (end of session)",
    type: "ratio-end",
    accessor(session, modeKey) {
      const endMode = getModeStats(session.endStats, modeKey);
      return endMode ? safeNumber(endMode.fkdr) : 0;
    },
  },
  wlr: {
    label: "WLR (end of session)",
    type: "ratio-end",
    accessor(session, modeKey) {
      const endMode = getModeStats(session.endStats, modeKey);
      return endMode ? safeNumber(endMode.wlr) : 0;
    },
  },
  level: {
    label: "Bedwars Level (end of session)",
    type: "absolute-end",
    accessor(session) {
      return safeNumber(session.endStats?.level);
    },
  },
  games: {
    label: "Games per Session (Δ)",
    type: "delta",
    accessor(session, modeKey) {
      const diff = computeSessionDiff(session, modeKey);
      return diff.gamesPlayed;
    },
  },
  wins: {
    label: "Wins per Session (Δ)",
    type: "delta",
    accessor(session, modeKey) {
      const diff = computeSessionDiff(session, modeKey);
      return diff.wins;
    },
  },
  fk: {
    label: "Final Kills per Session (Δ)",
    type: "delta",
    accessor(session, modeKey) {
      const diff = computeSessionDiff(session, modeKey);
      return diff.fk;
    },
  },
  bb: {
    label: "Beds Broken per Session (Δ)",
    type: "delta",
    accessor(session, modeKey) {
      const diff = computeSessionDiff(session, modeKey);
      return diff.bb;
    },
  },
};

// ---------- STATE ----------

const analyticsState = {
  sessions: [],
  filtered: [],
  currentMode: "overall",
  currentRange: "all",
  currentStat: "fkdr",
  chart: null,
};

// ---------- HELPERS (NUMBERS & MODES) ----------

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtNumber(v) {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000 && Number.isInteger(v)) {
    return v.toLocaleString();
  }
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

function fmtMinutes(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

function getModeStats(stats, modeKey) {
  if (!stats || !stats.modes) return null;
  return stats.modes[modeKey] || stats.modes.overall || null;
}

function computeSessionDiff(session, modeKey) {
  const startMode = getModeStats(session.startStats, modeKey);
  const endMode = getModeStats(session.endStats, modeKey);
  if (!startMode || !endMode) {
    return {
      gamesPlayed: 0,
      fk: 0,
      fd: 0,
      wins: 0,
      losses: 0,
      bb: 0,
      bl: 0,
      kills: 0,
      deaths: 0,
    };
  }

  const delta = (endVal, startVal) =>
    safeNumber(endVal) - safeNumber(startVal);

  return {
    gamesPlayed: delta(endMode.gamesPlayed, startMode.gamesPlayed),
    fk: delta(endMode.fk, startMode.fk),
    fd: delta(endMode.fd, startMode.fd),
    wins: delta(endMode.wins, startMode.wins),
    losses: delta(endMode.losses, startMode.losses),
    bb: delta(endMode.bb, startMode.bb),
    bl: delta(endMode.bl, startMode.bl),
    kills: delta(endMode.kills, startMode.kills),
    deaths: delta(endMode.deaths, startMode.deaths),
  };
}

// ---------- FILTERING ----------

function filterSessionsByRange(sessions, rangeKey) {
  const cfg = RANGE_CONFIG[rangeKey] || RANGE_CONFIG.all;
  if (!cfg.days && cfg.days !== 0) return [...sessions];

  const now = new Date();
  const startBoundary = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  if (cfg.days > 0) {
    startBoundary.setDate(startBoundary.getDate() - cfg.days);
  }

  return sessions.filter((s) => {
    const end = new Date(s.endTime);
    return end >= startBoundary;
  });
}

// ---------- AGGREGATION ----------

function computeAggregates(sessions, modeKey) {
  let totalDurationSec = 0;
  let totalGames = 0;
  let totalWins = 0;
  let totalFinals = 0;
  let totalBeds = 0;
  let totalFk = 0;
  let totalFd = 0;

  for (const session of sessions) {
    totalDurationSec += safeNumber(session.durationSec);
    const diff = computeSessionDiff(session, modeKey);
    totalGames += diff.gamesPlayed;
    totalWins += diff.wins;
    totalFinals += diff.fk;
    totalBeds += diff.bb;
    totalFk += diff.fk;
    totalFd += diff.fd;
  }

  const sessionCount = sessions.length;
  const avgDurationSec =
    sessionCount > 0 ? totalDurationSec / sessionCount : 0;
  const avgFkdr = totalFd > 0 ? totalFk / totalFd : totalFk > 0 ? totalFk : 0;
  const winrate =
    totalGames > 0 ? (totalWins / totalGames) * 100 : totalWins > 0 ? 100 : 0;

  return {
    sessionCount,
    totalDurationSec,
    avgDurationSec,
    totalGames,
    totalWins,
    totalFinals,
    totalBeds,
    avgFkdr,
    winrate,
  };
}

function computeModeOverview(sessions) {
  const modes = Object.keys(MODE_LABELS);
  const result = {};

  for (const modeKey of modes) {
    let games = 0;
    let wins = 0;
    let finals = 0;
    let beds = 0;
    let fk = 0;
    let fd = 0;
    let bl = 0;

    for (const session of sessions) {
      const diff = computeSessionDiff(session, modeKey);
      games += diff.gamesPlayed;
      wins += diff.wins;
      finals += diff.fk;
      beds += diff.bb;
      fk += diff.fk;
      fd += diff.fd;

      const endMode = getModeStats(session.endStats, modeKey);
      if (endMode) {
        bl += safeNumber(endMode.bl);
      }
    }

    const wlr = games > 0 ? (wins / games) * 100 : wins > 0 ? 100 : 0;
    const fkdr = fd > 0 ? fk / fd : fk > 0 ? fk : 0;
    const bblr = bl > 0 ? beds / bl : beds > 0 ? beds : 0;

    result[modeKey] = {
      games,
      wins,
      wlr,
      finals,
      fkdr,
      beds,
      bblr,
    };
  }

  return result;
}

// ---------- UI: CARDS, SUMMARY, TABLE ----------

function updateOverviewCards() {
  const {
    sessionCount,
    totalDurationSec,
    avgDurationSec,
    totalGames,
    totalWins,
    totalFinals,
    avgFkdr,
  } = computeAggregates(analyticsState.filtered, analyticsState.currentMode);

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.querySelector(".card-value").textContent = value;
  };

  set("an_totalSessions", sessionCount.toString());
  set("an_totalPlaytime", fmtMinutes(totalDurationSec));
  set("an_avgDuration", fmtNumber(avgDurationSec / 60)); // in minutes
  set("an_totalGames", fmtNumber(totalGames));
  set("an_totalWins", fmtNumber(totalWins));
  set("an_avgFkdr", fmtNumber(avgFkdr));
}

function updateModeOverviewTable() {
  const tableBody = document.querySelector(
    "#modeSummaryTable tbody"
  );
  if (!tableBody) return;

  const overview = computeModeOverview(analyticsState.filtered);

  tableBody.innerHTML = "";

  for (const modeKey of Object.keys(MODE_LABELS)) {
    const rowData = overview[modeKey];
    if (!rowData) continue;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${MODE_LABELS[modeKey]}</td>
      <td>${fmtNumber(rowData.games)}</td>
      <td>${fmtNumber(rowData.wins)}</td>
      <td>${fmtNumber(rowData.wlr)}%</td>
      <td>${fmtNumber(rowData.finals)}</td>
      <td>${fmtNumber(rowData.fkdr)}</td>
      <td>${fmtNumber(rowData.beds)}</td>
      <td>${fmtNumber(rowData.bblr)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

// ---------- UI: CHART ----------

function updateStatHistoryChart() {
  const canvas = document.getElementById("chart_dynamic");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cfg = STAT_CONFIG[analyticsState.currentStat];
  if (!ctx || !cfg) return;

  const sessions = [...analyticsState.filtered].sort(
    (a, b) => new Date(a.endTime) - new Date(b.endTime)
  );

  const labels = sessions.map((s, idx) => {
    const d = new Date(s.endTime);
    return `${idx + 1} • ${d.toLocaleDateString()} ${d
      .toTimeString()
      .slice(0, 5)}`;
  });

  const data = sessions.map((s) =>
    cfg.accessor(s, analyticsState.currentMode)
  );

  if (!analyticsState.chart) {
    analyticsState.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: cfg.label,
            data,
            tension: 0.25,
            pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { maxRotation: 45, minRotation: 0, autoSkip: true },
          },
          y: {
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            display: true,
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
      },
    });
  } else {
    analyticsState.chart.data.labels = labels;
    analyticsState.chart.data.datasets[0].data = data;
    analyticsState.chart.data.datasets[0].label = cfg.label;
    analyticsState.chart.update();
  }
}

// ---------- CSV EXPORT ----------

function exportCsv() {
  const rows = [];
  const header = [
    "endTime",
    "mode",
    "durationSec",
    "gamesPlayed",
    "wins",
    "losses",
    "fk",
    "fd",
    "bb",
    "bl",
    "fkdr_end",
    "wlr_end",
  ];
  rows.push(header.join(","));

  for (const session of analyticsState.filtered) {
    const diff = computeSessionDiff(session, analyticsState.currentMode);
    const endMode = getModeStats(
      session.endStats,
      analyticsState.currentMode
    );

    rows.push(
      [
        new Date(session.endTime).toISOString(),
        analyticsState.currentMode,
        fmtNumber(session.durationSec),
        fmtNumber(diff.gamesPlayed),
        fmtNumber(diff.wins),
        fmtNumber(diff.losses),
        fmtNumber(diff.fk),
        fmtNumber(diff.fd),
        fmtNumber(diff.bb),
        fmtNumber(diff.bl),
        endMode ? fmtNumber(endMode.fkdr) : "0",
        endMode ? fmtNumber(endMode.wlr) : "0",
      ].join(",")
    );
  }

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "nebula_sessions.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- MAIN UPDATE PIPELINE ----------

function applyFiltersAndRender() {
  analyticsState.filtered = filterSessionsByRange(
    analyticsState.sessions,
    analyticsState.currentRange
  );

  updateOverviewCards();
  updateModeOverviewTable();
  updateStatHistoryChart();
}

// ---------- EVENT WIRING ----------

function setupDropdowns() {
  // Mode dropdown
  const modeDropdown = document.getElementById("analyticsModeDropdown");
  const modeSelected = document.getElementById("analyticsModeSelected");
  const modeList = document.getElementById("analyticsModeList");

  if (modeDropdown && modeSelected && modeList) {
    modeDropdown.addEventListener("click", () => {
      modeList.style.display =
        modeList.style.display === "flex" ? "none" : "flex";
    });

    modeList.querySelectorAll("div").forEach((item) => {
      item.addEventListener("click", () => {
        const value = item.dataset.value;
        analyticsState.currentMode = value || "overall";
        modeSelected.textContent = MODE_LABELS[analyticsState.currentMode];
        modeList.style.display = "none";
        applyFiltersAndRender();
      });
    });

    document.addEventListener("click", (e) => {
      if (!modeDropdown.contains(e.target)) {
        modeList.style.display = "none";
      }
    });
  }

  // Range dropdown (Period)
  const rangeDropdown = document.getElementById("rangeDropdown");
  const rangeSelected = document.getElementById("rangeSelected");
  const rangeList = document.getElementById("rangeList");

  if (rangeDropdown && rangeSelected && rangeList) {
    rangeDropdown.addEventListener("click", () => {
      rangeList.style.display =
        rangeList.style.display === "flex" ? "none" : "flex";
    });

    rangeList.querySelectorAll("div").forEach((item) => {
      item.addEventListener("click", () => {
        const value = item.dataset.value;
        analyticsState.currentRange = value || "all";
        rangeSelected.textContent =
          RANGE_CONFIG[analyticsState.currentRange].label;
        rangeList.style.display = "none";
        applyFiltersAndRender();
      });
    });

    document.addEventListener("click", (e) => {
      if (!rangeDropdown.contains(e.target)) {
        rangeList.style.display = "none";
      }
    });
  }

  // Stat dropdown (Chart)
  const statDropdown = document.getElementById("statDropdown");
  const statSelected = document.getElementById("statSelected");
  const statList = document.getElementById("statList");

  if (statDropdown && statSelected && statList) {
    statDropdown.addEventListener("click", () => {
      statList.style.display =
        statList.style.display === "flex" ? "none" : "flex";
    });

    statList.querySelectorAll("div").forEach((item) => {
      item.addEventListener("click", () => {
        const value = item.dataset.value;
        analyticsState.currentStat = value || "fkdr";
        statSelected.textContent = item.textContent || "FKDR";
        statList.style.display = "none";
        updateStatHistoryChart();
      });
    });

    document.addEventListener("click", (e) => {
      if (!statDropdown.contains(e.target)) {
        statList.style.display = "none";
      }
    });
  }

  // CSV Export
  const exportBtn = document.getElementById("exportCsvBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportCsv());
  }
}

// ---------- ENTRY POINT ----------

export async function setupStatHistory() {

    if (analyticsState.initialized) {
        // nur Filter neu anwenden, KEIN neues Setup
        applyFiltersAndRender();
        return;
    }

  analyticsState.initialized = true;
  
  // Sessions direkt holen
  const sessions = await loadSessionsFromBackend();

  analyticsState.sessions = Array.isArray(sessions) ? sessions : [];

  // sortieren wie vorher
  analyticsState.sessions.sort(
    (a, b) => new Date(a.endTime) - new Date(b.endTime)
  );

  setupDropdowns();
  applyFiltersAndRender();
}
