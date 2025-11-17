// renderer/preload.js
// Runs in the isolated preload context (before any renderer code).
// Responsible for exposing a safe, limited bridge into the renderer.

const { contextBridge, ipcRenderer } = require("electron");

// Expose a single API object in the renderer world: window.electronAPI
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Fetch Bedwars stats for a given username via IPC.
   * Main process should have: ipcMain.handle('bedwars:stats', ...)
   */
  async getBedwarsStats(username) {
    return await ipcRenderer.invoke("bedwars:stats", username);
  },

  /**
   * Ask backend/main for current API status.
   * Main process should have: ipcMain.handle('api:getStatus', ...)
   */
  async getApiStatus() {
    try {
      return await ipcRenderer.invoke("api:getStatus");
    } catch (e) {
      console.warn("[Preload] getApiStatus failed:", e);
      return null;
    }
  },

  /**
   * Inform main about the current in-game name / username.
   * Main process should have: ipcMain.on('set:username', ...)
   */
  setUsername(username) {
    ipcRenderer.send("set:username", username || "");
  },

  /**
   * Request the main process to resize the overlay window.
   * Main process should have: ipcMain.handle('window:setBounds', ...)
   */
  async setWindowBounds(bounds) {
    try {
      await ipcRenderer.invoke("window:setBounds", bounds);
    } catch (e) {
      console.warn("[Preload] setWindowBounds failed:", e);
    }
  },

  /**
   * Focus the overlay window (optional helper).
   * Main process sollte: ipcMain.handle('window:focus', ...)
   */
  async focusWindow() {
    try {
      await ipcRenderer.invoke("window:focus");
    } catch (e) {
      console.warn("[Preload] focusWindow failed:", e);
    }
  },

  /**
   * Start the Discord login flow.
   * Main process: ipcMain.handle('auth:discord:login', ...)
   */
  async loginWithDiscord() {
    try {
      return await ipcRenderer.invoke("auth:discord:login");
    } catch (e) {
      console.error("[Preload] loginWithDiscord failed:", e);
      throw e;
    }
  },

  /**
   * Subscribe to Minecraft-related events coming from main.
   *
   * Main process side should do:
   *   win.webContents.send('mc:event', { type: 'chat', payload: ... })
   *
   * Returns an unsubscribe function.
   */
  onMinecraftEvent(handler) {
    const listener = (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error("[Preload] Minecraft event handler failed:", e);
      }
    };

    ipcRenderer.on("mc:event", listener);

    // Unsubscribe function
    return () => {
      ipcRenderer.removeListener("mc:event", listener);
    };
  },
});
