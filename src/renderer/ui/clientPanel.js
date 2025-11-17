// renderer/ui/clientPanel.js

/**
 * Client & app settings UI:
 * - Minecraft client / log file selection
 * - Auto-detect log path
 * - Username / IGN
 * - Hypixel API key + backend status
 */

import {
  loadBasicSettings,
  saveBasicSettings,
} from "../core/settings.js";
import { showNotification } from "./notifications.js";

const electronApi = window.electronAPI || null;

// ---- BASIC SETTINGS HYDRATION ------------------------------------

const BASIC_DEFAULTS = {
  logFile: "badlion", // selected client key OR 'custom'
  customLogPath: "",
  username: "",
  lastDetected: { client: "", path: "" },
};

let basicSettings = hydrateBasicSettings(loadBasicSettings());

function hydrateBasicSettings(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    ...BASIC_DEFAULTS,
    ...base,
    lastDetected: {
      client: base.lastDetected?.client || "",
      path: base.lastDetected?.path || "",
    },
  };
}

function persistBasicSettings() {
  saveBasicSettings(basicSettings);
  console.log("[ClientPanel] Basic settings saved:", basicSettings);
  updateSidebarUsername();
}

// ---- SIDEBAR USERNAME --------------------------------------------

function updateSidebarUsername() {
  const el = document.getElementById("sidebarUsername");
  if (!el) return;
  el.textContent = basicSettings.username || "username";
}

// ---- CLIENT SELECTION --------------------------------------------

let clientGrid;
let clientStatusEl;
let autoDetectBtn;
let customRow;
let customPathInput;
let applyCustomBtn;
let usernameInput;

function updateClientButtons() {
  if (!clientGrid) return;
  const selected = basicSettings.logFile || "badlion";

  clientGrid
    .querySelectorAll("button.client-btn")
    .forEach((btn) => {
      const key = btn.getAttribute("data-client");
      if (!key) return;

      if (key === selected) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }

      // mark detected (if different from selected and not custom)
      if (basicSettings.lastDetected?.client === key && key !== selected) {
        btn.setAttribute("data-detected", "1");
      } else {
        btn.removeAttribute("data-detected");
      }
    });

  if (customRow) {
    customRow.style.display = selected === "custom" ? "flex" : "none";
  }
}

function updateClientStatus(extra) {
  if (!clientStatusEl) return;
  clientStatusEl.classList.remove("warn", "ok");

  const sel = basicSettings.logFile;
  let line =
    sel === "custom"
      ? `Custom path active: ${
          basicSettings.customLogPath || "(empty)"
        }`
      : `Active client: ${sel || "none"}`;

  if (basicSettings.lastDetected?.client) {
    if (basicSettings.lastDetected.client !== sel) {
      line += ` • Last detected: ${basicSettings.lastDetected.client}`;
      clientStatusEl.classList.add("warn");
    } else {
      clientStatusEl.classList.add("ok");
    }
  }

  if (extra) line += ` • ${extra}`;
  clientStatusEl.textContent = line;
}

function bindClientSelection() {
  clientGrid = document.getElementById("clientSelectGrid");
  clientStatusEl = document.getElementById("clientStatus");
  autoDetectBtn = document.getElementById("autoDetectBtn");
  customRow = document.getElementById("customPathRow");
  customPathInput = document.getElementById("customLogPathInput");
  applyCustomBtn = document.getElementById("applyCustomPathBtn");
  usernameInput = document.getElementById("usernameInput");

  // Client grid click handling
  if (clientGrid) {
    clientGrid.addEventListener("click", (e) => {
      const target = e.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.classList.contains("client-btn")
      ) {
        return;
      }

      const key = target.getAttribute("data-client");
      if (!key) return;

      basicSettings.logFile = key;
      persistBasicSettings();
      updateClientButtons();
      updateClientStatus();

      if (electronApi && typeof electronApi.send === "function") {
        if (key !== "custom") {
          try {
            electronApi.send("set:client", key);
          } catch (err) {
            console.warn("[ClientPanel] set:client failed:", err);
          }
        }
      }
    });

    updateClientButtons();
    updateClientStatus();
  }

  // Custom path apply
  if (applyCustomBtn && customPathInput) {
    applyCustomBtn.addEventListener("click", () => {
      const p = (customPathInput.value || "").trim();
      basicSettings.customLogPath = p;
      persistBasicSettings();
      updateClientStatus();

      if (basicSettings.logFile === "custom" && p && electronApi) {
        try {
          electronApi.send("set:logPath", p);
        } catch (err) {
          console.warn("[ClientPanel] set:logPath failed:", err);
        }
      }
    });
  }

  // Auto-detect logs
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener("click", async () => {
      if (!electronApi || typeof electronApi.invoke !== "function") {
        updateClientStatus("IPC unavailable");
        return;
      }

      try {
        const res = await electronApi.invoke("chat:autoDetect");
        if (Array.isArray(res) && res.length === 2) {
          basicSettings.lastDetected = { client: res[0], path: res[1] };

          // If the user has not explicitly chosen custom, adopt detected client
          if (basicSettings.logFile !== "custom") {
            basicSettings.logFile = res[0];
            try {
              electronApi.send("set:client", res[0]);
            } catch (err) {
              console.warn("[ClientPanel] set:client (autoDetect) failed:", err);
            }
          }

          persistBasicSettings();
          updateClientButtons();
          updateClientStatus("Auto-detect succeeded");
        } else {
          updateClientStatus("No logs found");
        }
      } catch (err) {
        console.warn("[ClientPanel] chat:autoDetect error:", err);
        updateClientStatus("Auto-detect error");
      }
    });
  }

  // Listen for backend log path changes
  if (electronApi && typeof electronApi.on === "function") {
    try {
      electronApi.on("chat:logPathChanged", (_e, payload) => {
        if (payload?.client && basicSettings.logFile !== "custom") {
          if (!basicSettings.logFile) {
            basicSettings.logFile = payload.client;
            persistBasicSettings();
          }
        }
        updateClientStatus("Path switched");
      });
    } catch (err) {
      console.warn("[ClientPanel] chat:logPathChanged listener failed:", err);
    }
  }
}

// ---- USERNAME / IGN ----------------------------------------------

function bindUsername() {
  const input = document.getElementById("usernameInput");
  usernameInput = input;

  if (!input) return;

  input.value = basicSettings.username || "";

  input.addEventListener("input", () => {
    const next = (input.value || "").trim();
    basicSettings.username = next;

    // Keep legacy key for compatibility (session panel etc.)
    try {
      localStorage.setItem("username", next);
    } catch {
      // ignore
    }

    persistBasicSettings();

    // Inform main & other systems about username (no player add here;
    // sessionPanel will take care of stats/session).
    if (electronApi && typeof electronApi.send === "function") {
      try {
        electronApi.send("set:username", next || "");
      } catch (err) {
        console.warn("[ClientPanel] set:username failed:", err);
      }
    }
  });

  // On load: send initial username to main
  if (basicSettings.username && electronApi && typeof electronApi.send === "function") {
    try {
      electronApi.send("set:username", basicSettings.username);
    } catch (err) {
      console.warn("[ClientPanel] initial set:username failed:", err);
    }
  }
}

// ---- API SETTINGS ------------------------------------------------

const apiSettings = {
  userApiKey: localStorage.getItem("nebula-api-key") || "",
  useFallback: localStorage.getItem("nebula-use-fallback") !== "false",
};

let apiKeyInput;
let pasteApiKeyBtn;
let testApiKeyBtn;
let fallbackKeyToggle;
let clearCacheBtn;
let refreshApiStatusBtn;
let hypixelApiLink;
let backendStatusEl;
let userKeyStatusEl;

function bindApiSection() {
  apiKeyInput = document.getElementById("apiKeyInput");
  pasteApiKeyBtn = document.getElementById("pasteApiKeyBtn");
  testApiKeyBtn = document.getElementById("testApiKeyBtn");
  fallbackKeyToggle = document.getElementById("fallbackKeyToggle");
  clearCacheBtn = document.getElementById("clearCacheBtn");
  refreshApiStatusBtn = document.getElementById("refreshApiStatusBtn");
  hypixelApiLink = document.getElementById("hypixelApiLink");
  backendStatusEl = document.getElementById("backendStatus");
  userKeyStatusEl = document.getElementById("userKeyStatus");

  if (apiKeyInput) {
    apiKeyInput.value = apiSettings.userApiKey;
    apiKeyInput.addEventListener("change", () => {
      apiSettings.userApiKey = apiKeyInput.value.trim();
      localStorage.setItem("nebula-api-key", apiSettings.userApiKey);
      updateApiStatus();
    });
  }

  if (fallbackKeyToggle) {
    fallbackKeyToggle.checked = apiSettings.useFallback;
    fallbackKeyToggle.addEventListener("change", () => {
      apiSettings.useFallback = fallbackKeyToggle.checked;
      localStorage.setItem(
        "nebula-use-fallback",
        apiSettings.useFallback.toString()
      );
      if (electronApi && typeof electronApi.invoke === "function") {
        electronApi.invoke("api:toggleFallback", apiSettings.useFallback);
      }
    });
  }

  if (pasteApiKeyBtn && apiKeyInput) {
    pasteApiKeyBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = (text || "").trim();
        if (trimmed && trimmed.length === 36) {
          apiKeyInput.value = trimmed;
          apiSettings.userApiKey = trimmed;
          localStorage.setItem("nebula-api-key", trimmed);
          showNotification("API key pasted from clipboard");
          updateApiStatus();
        } else {
          showNotification("Invalid API key format in clipboard");
        }
      } catch (err) {
        console.warn("[ClientPanel] clipboard error:", err);
        showNotification("Could not access clipboard");
      }
    });
  }

  if (testApiKeyBtn && apiKeyInput) {
    testApiKeyBtn.addEventListener("click", async () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        showNotification("Please enter an API key first");
        return;
      }

      if (!electronApi || typeof electronApi.invoke !== "function") {
        showNotification("IPC not available to test API key");
        return;
      }

      testApiKeyBtn.textContent = "Testing...";
      testApiKeyBtn.disabled = true;

      try {
        const result = await electronApi.invoke("api:setUserKey", apiKey);
        if (result?.success) {
          showNotification("API key is valid!");
          apiSettings.userApiKey = apiKey;
          localStorage.setItem("nebula-api-key", apiKey);
          updateApiStatus();
        } else {
          showNotification(
            result?.error || "API key validation failed"
          );
        }
      } catch (err) {
        console.error("[ClientPanel] api:setUserKey failed:", err);
        showNotification("Failed to test API key");
      } finally {
        testApiKeyBtn.textContent = "Test";
        testApiKeyBtn.disabled = false;
      }
    });
  }

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", async () => {
      if (!electronApi || typeof electronApi.invoke !== "function") {
        showNotification("IPC not available to clear cache");
        return;
      }

      clearCacheBtn.textContent = "Clearing...";
      clearCacheBtn.disabled = true;

      try {
        await electronApi.invoke("api:clearCache");
        showNotification("API cache cleared");
      } catch (err) {
        console.error("[ClientPanel] api:clearCache failed:", err);
        showNotification("Failed to clear cache");
      } finally {
        clearCacheBtn.textContent = "Clear Cache";
        clearCacheBtn.disabled = false;
      }
    });
  }

  if (refreshApiStatusBtn) {
    refreshApiStatusBtn.addEventListener("click", () => {
      updateApiStatus();
    });
  }

  if (hypixelApiLink) {
    hypixelApiLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (electronApi && typeof electronApi.invoke === "function") {
        electronApi.invoke(
          "external:open",
          "https://developer.hypixel.net/"
        );
      }
    });
  }

  // Initial status + periodic refresh
  updateApiStatus();
  setInterval(updateApiStatus, 30000);
}

async function updateApiStatus() {
  if (!electronApi || typeof electronApi.invoke !== "function") return;

  try {
    const status = await electronApi.invoke("api:getStatus");
    if (!status) return;

    // Backend status
    if (backendStatusEl) {
      if (status.backendAvailable) {
        if (status.backendThrottled) {
          backendStatusEl.innerHTML =
            '<span style="color:#fbbf24;">●</span> Backend available (rate limited)';
        } else {
          backendStatusEl.innerHTML =
            '<span style="color:#10b981;">●</span> Backend available';
        }
      } else {
        backendStatusEl.innerHTML =
          '<span style="color:#ef4444;">●</span> Backend unavailable - using fallback';
      }
    }

    // User key status
    if (userKeyStatusEl) {
      if (status.config?.hasUserKey) {
        if (status.userKeyValid) {
          userKeyStatusEl.innerHTML =
            '<span style="color:#10b981;">●</span> User API key valid';
        } else {
          userKeyStatusEl.innerHTML =
            '<span style="color:#ef4444;">●</span> User API key invalid or expired';
        }
      } else {
        userKeyStatusEl.innerHTML =
          '<span style="color:#9ca3af;">●</span> No user API key configured';
      }
    }

    const hasWorkingApi =
      (status.backendAvailable && !status.backendThrottled) ||
      (status.config?.useFallback && status.userKeyValid);

    if (!hasWorkingApi && status.hypixelApiDown) {
      showNotification("Hypixel API appears to be down");
    }
  } catch (err) {
    console.error("[ClientPanel] api:getStatus failed:", err);
  }
}

// ---- PUBLIC INIT -------------------------------------------------

export function initClientPanel() {
  // Make sure we start from hydrated basic settings (including username).
  basicSettings = hydrateBasicSettings(loadBasicSettings());

  bindClientSelection();
  bindUsername();
  bindApiSection();

  // Sidebar username on initial load
  updateSidebarUsername();

  // Also sync legacy "username" key for compatibility
  try {
    if (basicSettings.username) {
      localStorage.setItem("username", basicSettings.username);
    }
  } catch {
    // ignore
  }
}
