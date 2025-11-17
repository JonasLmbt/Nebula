// renderer/ipc/api.js
// Thin wrapper around functions exposed by preload via window.electronAPI.

/**
 * Safely get the electronAPI object.
 */
function getBridge() {
  const api = window.electronAPI;
  if (!api) {
    throw new Error(
      "electronAPI is not available. Check preload.js and contextIsolation."
    );
  }
  return api;
}

/**
 * Fetch Bedwars stats for a given username via IPC.
 */
export async function getBedwarsStats(username) {
  const api = getBridge();
  if (typeof api.getBedwarsStats !== "function") {
    throw new Error("electronAPI.getBedwarsStats is not defined in preload.");
  }
  return await api.getBedwarsStats(username);
}

/**
 * Ask backend / main process for current API status.
 */
export async function getApiStatus() {
  const api = getBridge();
  if (typeof api.getApiStatus !== "function") {
    // Optional feature – just return null if not implemented
    console.warn("electronAPI.getApiStatus is not defined in preload.");
    return null;
  }
  return await api.getApiStatus();
}

/**
 * Inform main process about the current IGN / username.
 */
export function setUsername(username) {
  const api = getBridge();
  if (typeof api.setUsername !== "function") {
    console.warn("electronAPI.setUsername is not defined in preload.");
    return;
  }
  api.setUsername(username || "");
}

/**
 * Adjust window bounds from renderer (used by auto-resize).
 */
export function setWindowBounds(bounds) {
  const api = getBridge();
  if (typeof api.setWindowBounds !== "function") {
    console.warn("electronAPI.setWindowBounds is not defined in preload.");
    return;
  }
  api.setWindowBounds(bounds);
}

/**
 * Optional helper to focus the overlay window.
 */
export function focusWindow() {
  const api = getBridge();
  if (typeof api.focusWindow !== "function") {
    console.warn("electronAPI.focusWindow is not defined in preload.");
    return;
  }
  api.focusWindow();
}
