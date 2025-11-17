// renderer/ui/columnsPanel.js

import { STATS } from "../core/stats.js";
import { loadStatSettings, saveStatSettings as persistStatSettings } from "../core/settings.js";
import { renderFullTable } from "./table.js";
import { showNotification } from "./notifications.js";

// -----------------------------
// Defaults
// -----------------------------

const DEFAULT_COLOR_RULES = {
  fkdr: [
    { op: ">=", value: 100, color: "#ff00ff" },
    { op: ">=", value: 50, color: "#ff69b4" },
    { op: ">=", value: 30, color: "#dc143c" },
    { op: ">=", value: 20, color: "#ff7f50" },
    { op: ">=", value: 10, color: "#ffa500" },
    { op: ">=", value: 7, color: "#ffff00" },
    { op: ">=", value: 5, color: "#00ff00" },
    { op: ">=", value: 3, color: "#00ff00" },
    { op: ">=", value: 1, color: "#ffffff" },
    { op: ">=", value: 0, color: "#808080" },
  ],
  wlr: [
    { op: ">=", value: 100, color: "#ff00ff" },
    { op: ">=", value: 50, color: "#ff69b4" },
    { op: ">=", value: 30, color: "#dc143c" },
    { op: ">=", value: 20, color: "#ff7f50" },
    { op: ">=", value: 10, color: "#ffa500" },
    { op: ">=", value: 7, color: "#ffff00" },
    { op: ">=", value: 5, color: "#00ff00" },
    { op: ">=", value: 3, color: "#00ff00" },
    { op: ">=", value: 1, color: "#ffffff" },
    { op: ">=", value: 0, color: "#808080" },
  ],
  ws: [
    { op: ">=", value: 100, color: "#ff0000" },
    { op: ">=", value: 50, color: "#ffff00" },
  ],
  bedwarsScore: [
    { op: ">=", value: 1000, color: "#ff00ff" },
    { op: ">=", value: 500, color: "#ff69b4" },
    { op: ">=", value: 300, color: "#dc143c" },
    { op: ">=", value: 200, color: "#ff7f50" },
    { op: ">=", value: 100, color: "#ffa500" },
    { op: ">=", value: 70, color: "#ffff00" },
    { op: ">=", value: 50, color: "#00ff00" },
    { op: ">=", value: 30, color: "#00ff00" },
    { op: ">=", value: 10, color: "#ffffff" },
    { op: ">=", value: 0, color: "#808080" },
  ],
  bblr: [
    { op: ">=", value: 50, color: "#ff00ff" },
    { op: ">=", value: 30, color: "#ff69b4" },
    { op: ">=", value: 20, color: "#dc143c" },
    { op: ">=", value: 10, color: "#ff7f50" },
    { op: ">=", value: 5, color: "#ffa500" },
    { op: ">=", value: 3, color: "#ffff00" },
    { op: ">=", value: 2, color: "#00ff00" },
    { op: ">=", value: 1, color: "#00ff00" },
    { op: ">=", value: 0.5, color: "#ffffff" },
    { op: ">=", value: 0, color: "#808080" },
  ],
  fk: [
    { op: ">=", value: 50000, color: "#ff00ff" },
    { op: ">=", value: 25000, color: "#ff0000" },
    { op: ">=", value: 10000, color: "#ffa500" },
    { op: ">=", value: 5000, color: "#ffff00" },
    { op: ">=", value: 1000, color: "#00ff00" },
    { op: ">=", value: 0, color: "#ffffff" },
  ],
  wins: [
    { op: ">=", value: 10000, color: "#ff00ff" },
    { op: ">=", value: 5000, color: "#ff0000" },
    { op: ">=", value: 2500, color: "#ffa500" },
    { op: ">=", value: 1000, color: "#ffff00" },
    { op: ">=", value: 500, color: "#00ff00" },
    { op: ">=", value: 0, color: "#ffffff" },
  ],
};

// -----------------------------
// Local state
// -----------------------------

let statSettings = hydrateStatSettings(loadStatSettings());

function hydrateStatSettings(raw) {
  const s = {
    visible: Array.isArray(raw.visible) ? [...raw.visible] : [],
    layout: Array.isArray(raw.layout) ? [...raw.layout] : [],
    colorRules: raw.colorRules && typeof raw.colorRules === "object" ? raw.colorRules : {},
    order: Array.isArray(raw.order) ? [...raw.order] : [],
  };

  // All usable stats (no disabled ones)
  const allStats = Object.keys(STATS).filter((k) => !STATS[k]?.disabled);

  // visible: ensure array and contains all non-disabled stats
  if (!s.visible.length) {
    s.visible = allStats.slice();
  } else {
    for (const stat of allStats) {
      if (!s.visible.includes(stat)) {
        s.visible.push(stat);
      }
    }
    s.visible = s.visible.filter((k) => allStats.includes(k));
  }

  // order: same logic, but separate array
  if (!s.order.length) {
    s.order = allStats.slice();
  } else {
    for (const stat of allStats) {
      if (!s.order.includes(stat)) {
        s.order.push(stat);
      }
    }
    s.order = s.order.filter((k) => allStats.includes(k));
  }

  // layout
  if (!Array.isArray(s.layout) || !s.layout.length) {
    s.layout = ["ws", "fkdr", "wlr", "bblr", "fk", "wins", "mode"];
  }
  // ensure length between 6 and 12, fill with nulls
  while (s.layout.length < 6) s.layout.push(null);
  if (s.layout.length > 12) s.layout = s.layout.slice(0, 12);

  // colorRules: ensure object and fill defaults if missing
  if (!s.colorRules || typeof s.colorRules !== "object") {
    s.colorRules = {};
  }
  for (const key of Object.keys(DEFAULT_COLOR_RULES)) {
    if (!Array.isArray(s.colorRules[key]) || !s.colorRules[key].length) {
      // deep copy
      s.colorRules[key] = JSON.parse(
        JSON.stringify(DEFAULT_COLOR_RULES[key])
      );
    }
  }

  migrateColorRules(s);

  return s;
}

/**
 * Migration: convert legacy "good"/"warn"/"bad" color names to hex.
 */
function migrateColorRules(s) {
  const map = { good: "#00ff00", warn: "#ffff00", bad: "#ff0000" };
  try {
    if (!s || !s.colorRules) return;
    let changed = false;
    for (const key of Object.keys(s.colorRules)) {
      const arr = s.colorRules[key];
      if (!Array.isArray(arr)) continue;
      for (const rule of arr) {
        if (rule && typeof rule.color === "string" && map[rule.color]) {
          rule.color = map[rule.color];
          changed = true;
        }
      }
    }
    if (changed) {
      persistStatSettings(s);
    }
  } catch {
    // ignore
  }
}

// -----------------------------
// Persistence + refresh helpers
// -----------------------------

function saveStatSettings() {
  try {
    // purge disabled stats from layout/visible/order
    const disabledKeys = Object.keys(STATS).filter((k) => STATS[k]?.disabled);
    if (disabledKeys.length) {
      statSettings.layout = (statSettings.layout || []).map((x) =>
        disabledKeys.includes(x) ? null : x
      );
      statSettings.visible = (statSettings.visible || []).filter(
        (k) => !disabledKeys.includes(k)
      );
      statSettings.order = (statSettings.order || []).filter(
        (k) => !disabledKeys.includes(k)
      );
    }
  } catch {
    // ignore
  }

  persistStatSettings(statSettings);

  // Rebuild UI of the Columns panel
  renderStatLayoutSlots();
  renderStatLayoutPalette();

  // Re-render player table with new settings
  renderFullTable(statSettings);
}

// -----------------------------
// Public init
// -----------------------------

export function initColumnsPanel() {
  // Initial render
  renderStatLayoutPalette();
  renderStatLayoutSlots();

  // Add slot button
  const addSlotBtn = document.getElementById("addSlotBtn");
  if (addSlotBtn) {
    addSlotBtn.addEventListener("click", () => {
      if (statSettings.layout.length < 12) {
        statSettings.layout.push(null);
        saveStatSettings();
      } else {
        showNotification("Maximum 12 slots reached");
      }
    });
  }
}

// -----------------------------
// Layout palette (available stats)
// -----------------------------

function renderStatLayoutPalette() {
  const palette = document.getElementById("layoutPalette");
  if (!palette) return;

  const used = new Set(statSettings.layout.filter(Boolean));
  const stats = Object.keys(STATS).filter(
    (k) => !["level", "name"].includes(k)
  );

  palette.innerHTML = stats
    .map((k) => {
      const def = STATS[k];
      const isUsed = used.has(k);
      const isDisabled = !!def.disabled;
      const draggable = !isUsed && !isDisabled ? "true" : "false";
      const cls = `stat-pill${isDisabled ? " disabled" : ""}`;
      const usedAttr = isUsed ? 'data-used="1"' : "";
      const disabledAttr = isDisabled
        ? 'data-disabled="1" title="Currently unavailable"'
        : "";
      return `<div class="${cls}" draggable="${draggable}" data-stat="${k}" ${usedAttr} ${disabledAttr}>${def.name}</div>`;
    })
    .join("");

  palette
    .querySelectorAll('.stat-pill[draggable="true"]')
    .forEach((pill) => {
      pill.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/stat", pill.dataset.stat);
      });
    });

  // Allow dropping stats back to palette (removes them from layout)
  palette.addEventListener("dragover", (e) => {
    e.preventDefault();
    palette.style.backgroundColor = "rgba(102,234,255,0.08)";
  });

  palette.addEventListener("dragleave", () => {
    palette.style.backgroundColor = "";
  });

  palette.addEventListener("drop", (e) => {
    e.preventDefault();
    palette.style.backgroundColor = "";

    const sourceSlotIdx = e.dataTransfer.getData("text/sourceSlot");
    if (sourceSlotIdx) {
      const idx = parseInt(sourceSlotIdx, 10);
      if (!Number.isNaN(idx)) {
        statSettings.layout[idx] = null;
        saveStatSettings();
      }
    }
  });
}

// -----------------------------
// Layout slots (current columns)
// -----------------------------

function renderStatLayoutSlots() {
  const slotsEl = document.getElementById("layoutSlots");
  if (!slotsEl) return;

  const layout = statSettings.layout;

  slotsEl.innerHTML = layout
    .map((stat, i) => {
      if (!stat)
        return `<div class="slot" data-slot="${i}" data-empty="1">Empty</div>`;
      const label = STATS[stat]?.name || stat;
      return `
        <div class="slot filled" data-slot="${i}" data-stat="${stat}" draggable="true">
          ${label}
          <button class="slot-remove" title="Remove">×</button>
        </div>`;
    })
    .join("");

  slotsEl.querySelectorAll(".slot").forEach((slot) => {
    // Drag & drop between slots + palette
    if (!slot.dataset.empty) {
      slot.addEventListener("dragstart", (e) => {
        const stat = slot.dataset.stat;
        e.dataTransfer.setData("text/stat", stat);
        e.dataTransfer.setData("text/sourceSlot", slot.dataset.slot);
        slot.style.opacity = "0.4";
      });

      slot.addEventListener("dragend", () => {
        slot.style.opacity = "1";
      });
    }

    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      slot.classList.add("drag-over");
    });

    slot.addEventListener("dragleave", () => {
      slot.classList.remove("drag-over");
    });

    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("drag-over");

      const stat = e.dataTransfer.getData("text/stat");
      const sourceSlotIdx = e.dataTransfer.getData("text/sourceSlot");
      if (!stat) return;

      const targetIdx = parseInt(slot.dataset.slot, 10);
      if (Number.isNaN(targetIdx)) return;

      // Case 1: from palette -> slot
      if (!sourceSlotIdx) {
        const idxExisting = statSettings.layout.indexOf(stat);
        if (idxExisting !== -1) statSettings.layout[idxExisting] = null;
        statSettings.layout[targetIdx] = stat;
        saveStatSettings();
        return;
      }

      // Case 2: slot -> slot (swap)
      const sourceIdx = parseInt(sourceSlotIdx, 10);
      if (Number.isNaN(sourceIdx) || sourceIdx === targetIdx) return;

      const tmp = statSettings.layout[targetIdx];
      statSettings.layout[targetIdx] = statSettings.layout[sourceIdx];
      statSettings.layout[sourceIdx] = tmp;
      saveStatSettings();
    });

    // Click behaviour: open color rules (for stats that support it)
    if (!slot.dataset.empty && slot.dataset.stat) {
      const statKey = slot.dataset.stat;
      let mouseDownX = 0;
      let mouseDownY = 0;

      slot.addEventListener("mousedown", (e) => {
        if (e.target.closest(".slot-remove")) return;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
      });

      if (STATS[statKey]?.colorRules) {
        slot.style.cursor = "pointer";
        slot.addEventListener("click", (e) => {
          if (e.target.closest(".slot-remove")) return;
          const dx = Math.abs(e.clientX - mouseDownX);
          const dy = Math.abs(e.clientY - mouseDownY);
          if (dx < 5 && dy < 5) {
            showColorRules(statKey);
          }
        });
      }
    }

    const removeBtn = slot.querySelector(".slot-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(slot.dataset.slot, 10);
        if (!Number.isNaN(idx)) {
          statSettings.layout[idx] = null;
          saveStatSettings();
        }
      });
    }
  });
}

// -----------------------------
// Color rules modal
// -----------------------------

function showColorRules(column) {
  const modal = document.getElementById("colorRulesModal");
  const title = document.getElementById("colorRuleTitle");
  const rulesList = document.getElementById("colorRulesList");
  const addRuleBtn = document.querySelector(".add-rule-btn");
  const resetRulesBtn = document.getElementById("resetRulesBtn");

  if (!modal || !title || !rulesList || !addRuleBtn || !resetRulesBtn) return;

  title.textContent = STATS[column].name;
  modal.classList.add("open");

  function renderRules() {
    const rules = statSettings.colorRules[column] || [];
    rulesList.innerHTML = rules
      .map((rule, i) => {
        let color = rule.color;
        if (color === "good") color = "#00ff00";
        if (color === "warn") color = "#ffff00";
        if (color === "bad") color = "#ff0000";
        return `
          <div class="color-rule" data-index="${i}">
            <select class="rule-operator">
              <option value=">=" ${rule.op === ">=" ? "selected" : ""}>≥</option>
              <option value="<" ${rule.op === "<" ? "selected" : ""}>＜</option>
            </select>
            <input type="number" class="rule-value" value="${rule.value}" step="0.1">
            <div class="color-picker">
              <div class="color-preview" style="background: ${color}"></div>
              <input type="color" class="color-input" value="${color}">
            </div>
            <button class="rule-delete">×</button>
          </div>
        `;
      })
      .join("");

    rulesList.querySelectorAll(".color-rule").forEach((row) => {
      const i = parseInt(row.dataset.index, 10);
      if (Number.isNaN(i)) return;

      const opEl = row.querySelector(".rule-operator");
      const valEl = row.querySelector(".rule-value");
      const colorInput = row.querySelector(".color-input");
      const colorPreview = row.querySelector(".color-preview");
      const delBtn = row.querySelector(".rule-delete");

      if (opEl) {
        opEl.addEventListener("change", (e) => {
          statSettings.colorRules[column][i].op = e.target.value;
          saveStatSettings();
        });
      }

      if (valEl) {
        valEl.addEventListener("change", (e) => {
          statSettings.colorRules[column][i].value = parseFloat(e.target.value);
          saveStatSettings();
        });
      }

      if (colorInput && colorPreview) {
        colorInput.addEventListener("change", (e) => {
          statSettings.colorRules[column][i].color = e.target.value;
          colorPreview.style.background = e.target.value;
          saveStatSettings();
        });
      }

      if (delBtn) {
        delBtn.addEventListener("click", () => {
          statSettings.colorRules[column].splice(i, 1);
          saveStatSettings();
          renderRules();
        });
      }
    });
  }

  renderRules();

  addRuleBtn.onclick = () => {
    if (!Array.isArray(statSettings.colorRules[column])) {
      statSettings.colorRules[column] = [];
    }
    statSettings.colorRules[column].push({
      op: ">=",
      value: 0,
      color: "#00ff00",
    });
    saveStatSettings();
    renderRules();
  };

  resetRulesBtn.onclick = () => {
    if (DEFAULT_COLOR_RULES[column]) {
      statSettings.colorRules[column] = JSON.parse(
        JSON.stringify(DEFAULT_COLOR_RULES[column])
      );
    } else {
      statSettings.colorRules[column] = [];
    }
    saveStatSettings();
    renderRules();
  };

  const closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.classList.remove("open");
    };
  }
}
