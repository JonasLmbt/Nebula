// sessionManager.js
import { renderInitialSessionUI, renderSessionStats, showSessionError } from "./sessionRenderer.js";
import { calculateDiff } from "./sessionDiff.js";
import { skip } from "node:test";

class SessionManager {
  constructor() {
    this.ign = null;
    this.uuid = null;

    this.startStats = null;
    this.lastStats = null;

    this.startTime = null;
    this.timerInterval = null;
    
    this.lastUncachedRequest = 0;
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

  async update(skipCache = false) {
      if (!this.ign || !this.startStats) return;

      const now = Date.now();

      // If caller forces skipCache → always uncached
      if (skipCache) {
          this.lastUncachedRequest = now;
      } else {
          // Automatic uncached only if 50s passed
          const elapsed = now - (this.lastUncachedRequest || 0);
          if (elapsed >= 50000) {
              skipCache = true;
              this.lastUncachedRequest = now;
          }
      }

      try {
          const raw = await this.ipc.invoke("bedwars:stats", this.ign, skipCache);
          if (!raw || raw.error) return;

          this.lastStats = raw;
          renderSessionStats(this.startStats, raw);

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

    this.update(true)

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
