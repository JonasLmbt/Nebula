// src/ipc/settings.ts
// IPC for reading/writing app configuration stored on disk.

import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

export interface SettingsObject {
  [key: string]: any;
}

const SETTINGS_FILE_NAME = "settings.json";

/**
 * Returns the absolute path to the JSON settings file.
 */
function getSettingsFilePath(): string {
  const userData = app.getPath("userData");
  return path.join(userData, SETTINGS_FILE_NAME);
}

/**
 * Read settings from disk. Returns an empty object on failure.
 */
export function loadSettingsFromDisk(): SettingsObject {
  const file = getSettingsFilePath();
  try {
    if (!fs.existsSync(file)) {
      return {};
    }
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as SettingsObject;
  } catch (error) {
    console.error("[Settings] Failed to read settings:", error);
    return {};
  }
}

/**
 * Write settings to disk.
 */
export function saveSettingsToDisk(settings: SettingsObject): void {
  const file = getSettingsFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("[Settings] Failed to write settings:", error);
  }
}

/**
 * Register IPC handlers for settings.
 *
 * Renderer side (wenn du später was brauchst):
 *   const settings = await window.electronAPI.getSettings();
 *   await window.electronAPI.saveSettings(settings);
 */
export function registerSettingsIpcHandlers() {
  ipcMain.handle("settings:get", async () => {
    return loadSettingsFromDisk();
  });

  ipcMain.handle("settings:set", async (_event, newSettings: SettingsObject) => {
    try {
      const current = loadSettingsFromDisk();
      const merged = { ...current, ...(newSettings || {}) };
      saveSettingsToDisk(merged);
      return { success: true };
    } catch (error: any) {
      console.error("[Settings] settings:set failed:", error);
      return { success: false, error: String(error?.message || error) };
    }
  });
}
