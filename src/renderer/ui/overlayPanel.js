// renderer/ui/overlayPanel.js

import { state } from "../core/state.js";
import {
  clearAllButUsername,
  fetchAllFromQueue,
  enqueueNames,
  setPlayersChangedCallback,
} from "../core/players.js";
import { renderTable } from "./table.js";
import { updateOverlaySize } from "../core/resize.js"; 

export function initOverlayPanel() {
  setPlayersChangedCallback(() => {
    renderTable();
    updateOverlaySize();
  });

  // Input-Feld für Spielernamen
  const input = document.getElementById("playerInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const names = input.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        enqueueNames(names);
        input.value = "";
        fetchAllFromQueue();
      }
    });
  }

  // Buttons
  const clearAllBtn = document.getElementById("clearAll");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      state.queue = [];
      clearAllButUsername();
      updateOverlaySize();
    });
  }

  const refreshBtn = document.getElementById("refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchAllFromQueue();
    });
  }

  // Minimize/Close
  const minBtn = document.getElementById("minBtn");
  const closeBtn = document.getElementById("closeBtn");
  const api = window.electronAPI;

  if (minBtn && api?.send) {
    minBtn.addEventListener("click", () => api.send("window:minimize"));
  }

  if (closeBtn && api?.send) {
    closeBtn.addEventListener("click", () => api.send("window:close"));
  }

  // resize grips, sidebar, etc. bleiben wie du sie schon in overlayPanel.js eingebaut hast
}
