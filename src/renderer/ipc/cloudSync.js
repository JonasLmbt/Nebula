// renderer/ipc/cloudSync.js

/**
 * Cloud sync helpers for user settings via Firebase (handled in main).
 * This module ONLY talks to the main process and localStorage.
 */

function getApi() {
  const api = window.electronAPI;
  if (!api || typeof api.invoke !== "function") {
    console.warn("[Firebase] electronAPI.invoke not available");
    throw new Error("electronAPI.invoke not available");
  }
  return api;
}

// Local helper to read JSON from localStorage safely
function getJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Check if Firebase config is available in main process.
 */
export async function checkFirebase() {
  try {
    const api = getApi();
    const config = await api.invoke("firebase:getConfig");
    const initialized = !!config?.apiKey;
    console.log("[Firebase] Available:", initialized);
    return initialized;
  } catch (error) {
    console.error("[Firebase] Check failed:", error);
    return false;
  }
}

/**
 * Upload all relevant local settings for the given userId.
 */
export async function uploadUserSettings(userId) {
  try {
    if (!userId) throw new Error("Missing userId for upload");

    // Collect all local settings
    const settings = {
      nicks: getJson("nicks", []),
      appearanceSettings: getJson("appearanceSettings", {}),
      shortcuts: getJson("shortcuts", []),
      basicSettings: getJson("basicSettings", {}),
      statSettings: getJson("statSettings", {}),
      sourcesSettings: getJson("sourcesSettings", {}),
      nickDisplayMode: localStorage.getItem("nickDisplayMode") || "nick",
    };

    const api = getApi();
    const result = await api.invoke("firebase:upload", userId, settings);

    if (result?.error) {
      throw new Error(result.error);
    }

    localStorage.setItem("lastSyncTime", Date.now().toString());
    console.log("[Firebase] Settings uploaded successfully");
    return { success: true };
  } catch (error) {
    console.error("[Firebase] Upload failed:", error);
    throw error;
  }
}

/**
 * Download cloud settings for userId and apply them to localStorage.
 */
export async function downloadUserSettings(userId) {
  try {
    if (!userId) throw new Error("Missing userId for download");

    const api = getApi();
    const result = await api.invoke("firebase:download", userId);

    if (result?.error) {
      throw new Error(result.error);
    }

    if (!result?.data) {
      console.log("[Firebase] No cloud settings found");
      return { success: true, data: null };
    }

    const settings = result.data;

    if (settings.nicks)
      localStorage.setItem("nicks", JSON.stringify(settings.nicks));
    if (settings.appearanceSettings)
      localStorage.setItem(
        "appearanceSettings",
        JSON.stringify(settings.appearanceSettings)
      );
    if (settings.shortcuts)
      localStorage.setItem("shortcuts", JSON.stringify(settings.shortcuts));
    if (settings.basicSettings)
      localStorage.setItem(
        "basicSettings",
        JSON.stringify(settings.basicSettings)
      );
    if (settings.statSettings)
      localStorage.setItem("statSettings", JSON.stringify(settings.statSettings));
    if (settings.sourcesSettings)
      localStorage.setItem(
        "sourcesSettings",
        JSON.stringify(settings.sourcesSettings)
      );
    if (settings.nickDisplayMode)
      localStorage.setItem("nickDisplayMode", settings.nickDisplayMode);

    localStorage.setItem("lastSyncTime", Date.now().toString());

    console.log("[Firebase] Settings downloaded successfully");
    return {
      success: true,
      data: settings,
      timestamp: result.timestamp,
    };
  } catch (error) {
    console.error("[Firebase] Download failed:", error);
    throw error;
  }
}

/**
 * Auto-sync logic:
 * - 'upload' → always upload local → cloud
 * - 'download' → always download cloud → local (+ reload)
 * - 'auto' → compare timestamps, pick newer side
 */
export async function syncUserSettings(userId, direction = "auto") {
  if (!userId) {
    throw new Error("User not logged in");
  }

  try {
    if (direction === "upload") {
      return await uploadUserSettings(userId);
    } else if (direction === "download") {
      const result = await downloadUserSettings(userId);
      if (result.data) {
        // Reload page to apply all settings
        location.reload();
      }
      return result;
    } else {
      const api = getApi();
      const downloadResult = await api.invoke("firebase:download", userId);

      if (downloadResult?.error) {
        throw new Error(downloadResult.error);
      }

      const lastLocalSync = parseInt(
        localStorage.getItem("lastSyncTime") || "0",
        10
      );

      if (!downloadResult?.data) {
        // No cloud data, upload local
        return await uploadUserSettings(userId);
      }

      const cloudTimestamp = downloadResult.timestamp || 0;

      if (cloudTimestamp > lastLocalSync) {
        console.log("[Firebase] Cloud settings are newer, downloading...");
        const result = await downloadUserSettings(userId);
        if (result.data) {
          location.reload();
        }
        return result;
      } else {
        console.log("[Firebase] Local settings are newer, uploading...");
        return await uploadUserSettings(userId);
      }
    }
  } catch (error) {
    console.error("[Firebase] Sync failed:", error);
    throw error;
  }
}