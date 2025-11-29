// sessionManager.js
import { renderInitialSessionUI, renderSessionStats, showSessionError } from "./sessionRenderer.js";
import { calculateDiff } from "./sessionDiff.js";

class SessionManager {
  constructor() {
    this.ign = null;
    this.uuid = null;

    this.startStats = null;
    this.lastStats = null;

    this.startTime = null;
    this.timerInterval = null;
  }

  get ipc() {
    if (window.electronAPI?.invoke) {
      return { invoke: window.electronAPI.invoke, send: window.electronAPI.send };
    }
    return window.ipcRenderer || null;
  }

  async start(ign = null) {
    if (!this.ipc) return showSessionError("IPC bridge missing.");
    if (!ign) {
      ign = await this.ipc.invoke("get:ign");
    }
    if (!ign) return showSessionError("No ign provided.");

    this.ign = ign;
    this.startTime = new Date();
    this.startStats = null;

    renderInitialSessionUI(ign);
    document.getElementById('sessionIgn').textContent = ign;

    try {
      const raw = await this.ipc.invoke("bedwars:stats", ign);
      if (!raw || raw.error) {
        return showSessionError(raw?.error || "Could not load stats.");
      }

      const normalized = raw;

      this.startStats = normalized;
      this.lastStats = normalized;
      this.uuid = normalized.uuid;

      renderSessionStats(normalized, normalized);
      this.startTimer();

      window.ipcRenderer?.send("session:started");
    } catch (err) {
      showSessionError(err.message);
    }
  }

  async update() {
    if (!this.ign || !this.startStats) return;
    document.getElementById('sessionIgn').textContent = this.ign;
    try {
      const raw = await this.ipc.invoke("bedwars:stats", this.ign, true);
      if (!raw || raw.error) return;

      const normalized = raw;
      this.lastStats = normalized;

      renderSessionStats(this.startStats, normalized);
    } catch (err) {
      console.error("[Session] Update failed", err);
    }
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const el = document.getElementById("sessionTime");
      if (!el) return;

      const elapsed = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      const m = Math.floor(elapsed / 60);
      const h = Math.floor(m / 60);

      el.textContent = h > 0 ? `Session: ${h}h ${m % 60}m` : `Session: ${m}m`;
    }, 1000);
  }

  async stop() {
    if (!this.startStats) return;

    const endStats = this.lastStats || this.startStats;
    const endTime = new Date();

    const diff = calculateDiff(this.startStats, endStats);

    const hasChanges = Object.values(diff).some(v => v !== 0);
    if (!hasChanges) {
      console.log("[Session] No stat changes detected, not saving session.");
      window.ipcRenderer?.send("session:ended");
      return;
    }

    const sessionData = {
      ign: this.ign,
      uuid: this.uuid,
      startTime: this.startTime,
      endTime,
      durationSec: (endTime - this.startTime) / 1000,
      startStats: this.startStats,
      endStats,
      diff
    };

    try {
      await this.ipc.invoke("sessions:save", sessionData);
    } catch (err) {
      console.error("[Session] Failed to save:", err);
    }

    window.ipcRenderer?.send("session:ended");
  }
}

export const sessionManager = new SessionManager();
