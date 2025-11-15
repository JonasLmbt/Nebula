import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nebulaAPI", {
  requestConfig: () => ipcRenderer.send("config-request"),
  onConfig: (callback: (cfg: any) => void) =>
    ipcRenderer.on("config-data", (_, data) => callback(data)),
});
