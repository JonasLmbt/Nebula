// renderer/ipc/auth.js

/**
 * Base URL of your backend for auth calls.
 * You can override this from preload or main by setting window.NEBULA_API_BASE.
 */
function getApiBase() {
  return (
    window.NEBULA_API_BASE ||
    "https://nebula-overlay.online" // fallback
  );
}

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
 * Trigger Discord login via main process.
 * Main will usually open the system browser and handle OAuth.
 */
export async function loginWithDiscord() {
  const api = getBridge();
  if (typeof api.loginWithDiscord !== "function") {
    throw new Error("electronAPI.loginWithDiscord is not defined in preload.");
  }
  return await api.loginWithDiscord();
}

/**
 * Try to fetch the currently authenticated user from the backend.
 * It first tries /api/me, then falls back to /api/auth/me.
 */
export async function fetchCurrentUser() {
  const base = getApiBase();

  async function tryEndpoint(path) {
    const res = await fetch(base + path, {
      credentials: "include",
    });
    if (!res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  // Try modern endpoint first
  const me =
    (await tryEndpoint("/api/me")) ||
    (await tryEndpoint("/api/auth/me"));

  if (!me || typeof me !== "object") return null;
  return me;
}

/**
 * Logout on the backend if supported, then return true/false.
 */
export async function logout() {
  const base = getApiBase();

  try {
    const res = await fetch(base + "/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch (e) {
    console.warn("Logout request failed:", e);
    return false;
  }
}

/**
 * Start polling the current user.
 *
 * @param {(user: any | null) => void} onChange  callback when user changes
 * @param {number} intervalMs                    polling interval
 * @returns {() => void}                         function to stop polling
 */
export function startUserPolling(onChange, intervalMs = 2000) {
  let lastUserId = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const me = await fetchCurrentUser();
      const id = me && (me.id || me.uid || me.userId || null);

      if (id !== lastUserId) {
        lastUserId = id;
        onChange?.(me || null);
      }
    } catch (e) {
      console.warn("User polling failed:", e);
    } finally {
      if (!stopped) {
        setTimeout(tick, intervalMs);
      }
    }
  }

  tick();

  return () => {
    stopped = true;
  };
}
