const { contextBridge, ipcRenderer } = require("electron");

// EXPOSE SAFE APIS TO RENDERER
contextBridge.exposeInMainWorld("electronAPI", {

    // --- AUTH ---
    loginWithDiscord: () => ipcRenderer.invoke("auth:discord:login"),
    getUser: () => ipcRenderer.invoke("auth:discord:getUser"),
    setUser: (user) => ipcRenderer.send("auth:setUser", user),
    logout: () => ipcRenderer.invoke("auth:logout"),
    firebaseLogin: (token) => ipcRenderer.invoke("auth:firebase:login", token),

    // --- WINDOW CONTROLS ---
    minimize: () => ipcRenderer.send("window:minimize"),
    close: () => ipcRenderer.send("window:close"),

    // --- SHORTCUTS ---
    registerShortcuts: (map) => ipcRenderer.invoke("shortcuts:register", map),

    // --- CHAT LOGGER ---
    autoDetectChat: () => ipcRenderer.invoke("chat:autoDetect"),

    // --- METRICS ---
    getMetrics: (userId) => ipcRenderer.invoke("metrics:get", userId),
    updateMetrics: (userId, metrics) => ipcRenderer.invoke("metrics:update", userId),

    // --- PLUS SYSTEM ---
    createCheckout: (userId, options) =>
        ipcRenderer.invoke("plus:createCheckout", userId, options),
    openPortal: (userId) =>
        ipcRenderer.invoke("plus:manageSubscription", userId),

    // --- EVENT LISTENERS FROM MAIN ---
    onChatPlayers: (callback) => ipcRenderer.on("chat:players", (_e, p) => callback(p)),
    onChatParty: (callback) => ipcRenderer.on("chat:party", (_e, p) => callback(p)),
    onChatMessage: (callback) => ipcRenderer.on("chat:message", (_e, p) => callback(p)),
});

// Optional: alte globale Variable nachbilden, falls du sie viel benutzt
contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (...args) => ipcRenderer.send(...args),
  invoke: (...args) => ipcRenderer.invoke(...args),
  on: (...args) => ipcRenderer.on(...args),
  once: (...args) => ipcRenderer.once(...args),
  removeListener: (...args) => ipcRenderer.removeListener(...args)
});
