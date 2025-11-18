// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Minimale, aber kompatible API
contextBridge.exposeInMainWorld('ipc', {
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, listener) => {
    const subscription = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, (_event, ...args) => listener(...args));
  },
  loginWithDiscord: () => ipcRenderer.invoke("auth:discord:login")
});

// Optional: alte globale Variable nachbilden, falls du sie viel benutzt
contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (...args) => ipcRenderer.send(...args),
  invoke: (...args) => ipcRenderer.invoke(...args),
  on: (...args) => ipcRenderer.on(...args),
  once: (...args) => ipcRenderer.once(...args),
  removeListener: (...args) => ipcRenderer.removeListener(...args)
});
