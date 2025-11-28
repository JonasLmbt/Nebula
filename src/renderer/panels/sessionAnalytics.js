const Chart = window.Chart;
let dynamicChart = null;

/* -----------------------------------------
   ENTRY POINT
-------------------------------------------- */
export async function renderSessionAnalysis() {
    const ipc = window.ipcRenderer || window.window.ipcRenderer;
    const uid = window.userProfile?.id || window.firebaseUid || null;

    const res = await ipc.invoke("sessions:get", uid);
    let sessions = res.data || [];

    // Filter IGN
    const currentIgn = window.userProfile?.username?.toLowerCase();
    if (currentIgn) {
        sessions = sessions.filter(s => s.username?.toLowerCase() === currentIgn);
    }

    setupListeners(sessions);
    updatePeriodSummary(sessions);
    renderTimeSeriesChart(sessions);
}

/* -----------------------------------------
   TIME RANGE FILTER
-------------------------------------------- */
function filterByRange(sessions, range) {
    const now = Date.now();

    return sessions.filter(s => {
        const t = new Date(s.startTime).getTime();
        switch (range) {
            case "today":
                return new Date(s.startTime).toDateString() === new Date().toDateString();
            case "7d":
                return now - t <= 7 * 86400000;
            case "30d":
                return now - t <= 30 * 86400000;
            case "365d":
                return now - t <= 365 * 86400000;
            default:
                return true;
        }
    });
}

/* -----------------------------------------
   1️⃣ PERIOD SUMMARY
-------------------------------------------- */

function updatePeriodSummary(allSessions) {
    const range = document.getElementById("analysis_range").value;
    const sessions = filterByRange(allSessions, range);

    const box = document.getElementById("periodSummary");
    box.innerHTML = "";

    if (sessions.length < 2) {
        box.innerHTML = `<div style="color:var(--muted);">Not enough data in the period.</div>`;
        return;
    }

    sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    const start = sessions[0].startStats;
    const end = sessions[sessions.length - 1].endStats;

    const diff = statDiff(start, end);

    box.innerHTML = `
        <div class="summary-grid">
            ${summaryRow("Level", diff.level)}
            ${summaryRow("Final Kills", diff.fk)}
            ${summaryRow("Final Deaths", diff.fd)}
            ${summaryRow("FKDR", diff.fkdr)}
            ${summaryRow("Beds Broken", diff.bb)}
            ${summaryRow("Beds Lost", diff.bl)}
            ${summaryRow("BBLR", diff.bblr)}
            ${summaryRow("Wins", diff.wins)}
            ${summaryRow("Losses", diff.losses)}
            ${summaryRow("WLR", diff.wlr)}
        </div>
    `;
}

function statDiff(start, end) {
    const keys = ["level","fk","fd","fkdr","bb","bl","bblr","wins","losses","wlr"];
    const diff = {};

    keys.forEach(k => {
        const a = start?.[k] ?? 0;
        const b = end?.[k] ?? 0;
        diff[k] = +(b - a).toFixed(2);
    });

    return diff;
}

function summaryRow(label, value) {
    const color = value >= 0 ? "#10b981" : "#ef4444";
    return `
        <div class="summary-row">
            <span>${label}</span>
            <span style="color:${color};font-weight:600;">
                ${value >= 0 ? "+" : ""}${value}
            </span>
        </div>
    `;
}

/* -----------------------------------------
   2️⃣ TIME SERIES CHART
-------------------------------------------- */
function setupListeners(sessions) {
    document.getElementById("analysis_range").addEventListener("change", () => {
        updatePeriodSummary(sessions);
        renderTimeSeriesChart(sessions);
    });

    document.getElementById("analysis_stat").addEventListener("change", () => {
        renderTimeSeriesChart(sessions);
    });
}

function renderTimeSeriesChart(allSessions) {
    const range = document.getElementById("analysis_range").value;
    const stat = document.getElementById("analysis_stat").value;

    const sessions = filterByRange(allSessions, range);
    if (!sessions.length) return;

    sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    const labels = sessions.map(s =>
        new Date(s.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );

    const values = sessions.map(s => s.endStats?.[stat] ?? 0);

    if (dynamicChart) dynamicChart.destroy();
    const ctx = document.getElementById("chart_dynamic");

    dynamicChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: stat.toUpperCase(),
                data: values,
                borderWidth: 2,
                tension: 0.25
            }]
        }
    });
}
