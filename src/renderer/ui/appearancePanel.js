// renderer/ui/appearancePanel.js

/**
 * Appearance settings panel.
 *
 * Expects DOM:
 *   #opacityRange, #fontSizeRange, #alwaysOnTopToggle,
 *   #autoResizeToggle, #bgColorInput,
 *   #opacityValue, #fontSizeValue
 */

import {
  loadAppearanceSettings,
  saveAppearanceSettings,
} from "../core/settings.js";
import { updateOverlaySize } from "../core/resize.js";

const FALLBACK_APPEARANCE = {
  opacity: 0.78,
  fontSize: 14,
  alwaysOnTop: true,
  autoResize: false,
  bgColor: "#14141c", // rgba(20,20,28,alpha)
};

let appearance = hydrateAppearance(loadAppearanceSettings());

function hydrateAppearance(raw) {
  const base =
    raw && typeof raw === "object"
      ? raw
      : {};

  return {
    ...FALLBACK_APPEARANCE,
    ...base,
  };
}

function persist() {
  saveAppearanceSettings(appearance);
}

/**
 * Convert #RRGGBB to RGB object.
 */
function hexToRgb(hex) {
  if (typeof hex !== "string") return { r: 20, g: 20, b: 28 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 20, g: 20, b: 28 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/**
 * Apply current appearance settings to the document and main window.
 */
export function applyAppearance() {
  const { r, g, b } = hexToRgb(appearance.bgColor);
  const alpha =
    typeof appearance.opacity === "number"
      ? Math.min(Math.max(appearance.opacity, 0), 1)
      : 0.78;
  const rgba = `rgba(${r},${g},${b},${alpha})`;

  document.documentElement.style.setProperty("--bg", rgba);
  document.documentElement.style.setProperty(
    "--table-font-size",
    `${appearance.fontSize}px`
  );

  if (document.body) {
    document.body.style.background = rgba;
  }

  // Always-on-top flag to main process
  const api = window.electronAPI;
  if (api && typeof api.invoke === "function") {
    try {
      api.invoke("window:setAlwaysOnTop", !!appearance.alwaysOnTop);
    } catch (err) {
      console.warn("[Appearance] Failed to set alwaysOnTop:", err);
    }
  }

  // Update labels
  const ov = document.getElementById("opacityValue");
  if (ov) ov.textContent = `${Math.round(alpha * 100)}%`;

  const fv = document.getElementById("fontSizeValue");
  if (fv) fv.textContent = `${appearance.fontSize}px`;
}

/**
 * Initialize all appearance controls and apply settings.
 */
export function initAppearancePanel() {
  const opacityRange = document.getElementById("opacityRange");
  const fontSizeRange = document.getElementById("fontSizeRange");
  const alwaysOnTopToggle = document.getElementById("alwaysOnTopToggle");
  const autoResizeToggle = document.getElementById("autoResizeToggle");
  const bgColorInput = document.getElementById("bgColorInput");

  // Opacity: stored 0–1, slider usually 0–1 (step 0.01)
  if (opacityRange) {
    opacityRange.value = String(appearance.opacity);
    opacityRange.addEventListener("input", () => {
      appearance.opacity = Number(opacityRange.value);
      persist();
      applyAppearance();
    });
  }

  // Font size: integer px
  if (fontSizeRange) {
    fontSizeRange.value = String(appearance.fontSize);
    fontSizeRange.addEventListener("input", () => {
      appearance.fontSize = parseInt(fontSizeRange.value, 10) || 14;
      persist();
      applyAppearance();
    });
  }

  // Always-on-top toggle
  if (alwaysOnTopToggle) {
    alwaysOnTopToggle.checked = !!appearance.alwaysOnTop;
    alwaysOnTopToggle.addEventListener("change", () => {
      appearance.alwaysOnTop = !!alwaysOnTopToggle.checked;
      persist();
      applyAppearance();
    });
  }

  // Auto-resize toggle
  if (autoResizeToggle) {
    autoResizeToggle.checked = !!appearance.autoResize;
    autoResizeToggle.addEventListener("change", () => {
      appearance.autoResize = !!autoResizeToggle.checked;
      persist();
      // Only recalc overlay size when this setting changes
      updateOverlaySize();
    });
  }

  // Background color
  if (bgColorInput) {
    bgColorInput.value = appearance.bgColor;
    bgColorInput.addEventListener("input", () => {
      appearance.bgColor = bgColorInput.value || FALLBACK_APPEARANCE.bgColor;
      persist();
      applyAppearance();
    });
  }

  // Apply current settings on load
  applyAppearance();
}
