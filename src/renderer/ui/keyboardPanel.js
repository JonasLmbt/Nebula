// renderer/ui/keyboardPanel.js

/**
 * Keyboard shortcuts settings panel.
 *
 * Expects DOM:
 *   <div id="kbGrid">...</div>
 *
 * And main process handler:
 *   electronAPI.invoke('shortcuts:register', shortcuts)
 */

const ACTIONS = [
  { id: "toggleOverlay", label: "Hide or show" },
  { id: "refreshAll", label: "Refresh all players" },
  { id: "clearAll", label: "Remove all players" },
  { id: "toggleClickThrough", label: "Toggle click-through" },
];

const DEFAULT_SHORTCUTS = {
  toggleOverlay: "F9",
  refreshAll: "",
  clearAll: "F8",
  toggleClickThrough: "",
};

let shortcuts = loadShortcuts();

/**
 * Read shortcuts from localStorage and merge with defaults.
 */
function loadShortcuts() {
  try {
    const raw =
      localStorage.getItem("shortcuts") ||
      JSON.stringify(DEFAULT_SHORTCUTS);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SHORTCUTS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

/**
 * Persist shortcuts and notify main process to (re)register.
 */
function saveShortcuts() {
  localStorage.setItem("shortcuts", JSON.stringify(shortcuts));
  const api = window.electronAPI;
  if (api && typeof api.invoke === "function") {
    try {
      api.invoke("shortcuts:register", shortcuts);
    } catch (err) {
      console.warn("[Shortcuts] Failed to register in main:", err);
    }
  }
}

/**
 * Convert a KeyboardEvent to an Electron accelerator string.
 */
function toAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  const k = e.key;
  let key = "";

  if (/^F\d{1,2}$/i.test(k)) key = k.toUpperCase();
  else if (k.length === 1) key = k.toUpperCase();
  else if (k === "Escape") key = "Esc";
  else if (k === " ") key = "Space";
  else return "";

  return [...parts, key].join("+");
}

/**
 * Render the shortcuts grid inside #kbGrid.
 */
function renderShortcuts() {
  const grid = document.getElementById("kbGrid");
  if (!grid) return;

  grid.innerHTML = ACTIONS.map(
    (a) => `
      <div class="kb-row" data-action="${a.id}">
        <div class="kb-action">${a.label}</div>
        <div class="kb-input" tabindex="0">${shortcuts[a.id] || "—"}</div>
      </div>
    `
  ).join("");

  grid.querySelectorAll(".kb-input").forEach((inputEl) => {
    inputEl.addEventListener("click", () => startListen(inputEl));
    inputEl.addEventListener("keydown", (e) => startListen(inputEl, e));
  });
}

/**
 * Start listening for a key combo to assign to one action.
 */
function startListen(inputEl, _evt) {
  const row = inputEl.closest(".kb-row");
  if (!row) return;

  const action = row.getAttribute("data-action");
  if (!action) return;

  inputEl.classList.add("listening");
  inputEl.textContent = "Press key…";

  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // ESC clears the shortcut
    if (e.key === "Escape") {
      shortcuts[action] = "";
      inputEl.textContent = "—";
      inputEl.classList.remove("listening");
      window.removeEventListener("keydown", onKey, true);
      saveShortcuts();
      return;
    }

    const acc = toAccelerator(e);
    shortcuts[action] = acc;
    inputEl.textContent = acc || "—";
    inputEl.classList.remove("listening");
    window.removeEventListener("keydown", onKey, true);
    saveShortcuts();
  };

  window.addEventListener("keydown", onKey, true);
}

/**
 * Initialize keyboard shortcuts panel.
 */
export function initKeyboardPanel() {
  renderShortcuts();
  // Register current shortcuts in main once on load
  const api = window.electronAPI;
  if (api && typeof api.invoke === "function") {
    try {
      api.invoke("shortcuts:register", shortcuts);
    } catch (err) {
      console.warn("[Shortcuts] Initial register failed:", err);
    }
  }
}
