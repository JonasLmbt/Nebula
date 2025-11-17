// src/ipc/logs.ts
// Forwards Minecraft log events from your log watcher to the renderer.

import { BrowserWindow } from "electron";
import { EventEmitter } from "events";

export interface MinecraftLogPayload {
  type: string;
  payload?: any;
}

/**
 * The logEmitter is expected to emit Minecraft-related events.
 *
 * Suggested pattern:
 *   logEmitter.emit('mc:event', { type: 'chat', payload: {...} });
 *   logEmitter.emit('mc:event', { type: 'who', payload: {...} });
 *   logEmitter.emit('mc:event', { type: 'party', payload: {...} });
 *
 * Renderer side:
 *   window.electronAPI.onMinecraftEvent(event => { ... });
 */
export function wireMinecraftLogsToRenderer(
  logEmitter: EventEmitter,
  targetWindow: BrowserWindow
) {
  const listener = (event: MinecraftLogPayload) => {
    try {
      targetWindow.webContents.send("mc:event", event);
    } catch (error) {
      console.error("[Logs] Failed to send mc:event to renderer:", error);
    }
  };

  logEmitter.on("mc:event", listener);

  return () => {
    logEmitter.off("mc:event", listener);
  };
}
