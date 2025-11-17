// renderer/index.js
// Main entry point for the Nebula overlay renderer.
// Runs in the browser context with contextIsolation + preload.

// Core
import { state } from "./core/state.js";
import { loadStatSettings } from "./core/settings.js";
import { updateOverlaySize } from "./core/resize.js";

// UI
import { initPanels, openPanel } from "./ui/panels.js";
import { initSidebar } from "./ui/sidebar.js";
import { initTopbar } from "./ui/topbar.js";
import { bindGlobalUI } from "./ui/bindings.js";
import {
  autoStartSessionFromSettings,
  updateSessionTime,
} from "./ui/sessionPanel.js";

// ---- Local state for this module ----

console.log('NEBULA LOADED - Version:', new Date().toISOString());
let statSettings = null;

// ---- Bootstrapping ----

window.addEventListener("DOMContentLoaded", () => {
  // Load settings once on startup
  statSettings = loadStatSettings();

  // Initialise basic UI building blocks
  initTopbar();
  initSidebar();
  initPanels();
  bindGlobalUI();

  // Open default panel (overlay)
  openPanel("overlay");

  // Start session automatically if username is stored
  autoStartSessionFromSettings();

  // First overlay size calculation
  safeUpdateOverlaySize();

  // Keep session time text ticking once per minute
  setInterval(() => {
    updateSessionTime();
  }, 60_000);

  console.log("[Nebula] Renderer initialised", {
    statSettings,
  });
});

// ---- Helper to guard against missing settings ----

function safeUpdateOverlaySize() {
  if (!statSettings) {
    statSettings = loadStatSettings();
  }
  updateOverlaySize(statSettings);
}

// ---- Optional: expose a tiny debug API on window ----

window.nebula = {
  state,
  getStatSettings: () => statSettings,
  refreshOverlaySize: safeUpdateOverlaySize,
  openPanel,
};
