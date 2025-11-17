// renderer/core/resize.js

import { loadAppearanceSettings } from "./settings.js";

/**
 * Handles automatic resizing of the overlay window based on the
 * current table height and active panel.
 */

export const TOPBAR_HEIGHT = 50;
export const MIN_HEIGHT = 120;
export const DEFAULT_HEIGHT = 560;

let resizeTimeout = null;

/**
 * Recalculate the overlay window size based on the current DOM content.
 * Requires Electron's preload to expose `window.electronAPI.setWindowBounds`.
 *
 * @param {Object} statSettings - current statSettings object
 */
export function updateOverlaySize(statSettings) {
  if (resizeTimeout) clearTimeout(resizeTimeout);

  resizeTimeout = setTimeout(() => {
    const activePanel = document.querySelector(".panel.active");
    const panelOverlay = document.getElementById("panel-overlay");
    const sidebar = document.getElementById("sidebar");

    const appearanceSettings = loadAppearanceSettings();
    const allowAuto = appearanceSettings.autoResize !== false;

    if (sidebar?.classList.contains("open")) {
      window.electronAPI?.setWindowBounds({ height: DEFAULT_HEIGHT });
      return;
    }

    if (!allowAuto || !activePanel || activePanel !== panelOverlay) {
      return;
    }

    const table = document.getElementById("table");
    const rowCount = table?.querySelectorAll("tbody tr").length || 0;

    if (rowCount === 0) {
      window.electronAPI?.setWindowBounds({ height: MIN_HEIGHT });
      return;
    }

    const theadHeight =
      table?.querySelector("thead")?.offsetHeight || 40;

    let rowHeight = 24;
    const firstRow = table?.querySelector("tbody tr");
    if (firstRow) {
      rowHeight = firstRow.offsetHeight;
    } else {
      const fontSize = appearanceSettings.fontSize || 14;
      rowHeight = Math.ceil(fontSize * 1.4) + 8;
    }

    const padding = 8;

    const topbarEl = document.querySelector(".topbar");
    const topbarHeight =
      topbarEl?.offsetHeight || TOPBAR_HEIGHT;
    const contentEl = document.querySelector(".content");
    const wrapEl = document.querySelector(".table-wrap");
    const contentPadTop = contentEl
      ? parseInt(getComputedStyle(contentEl).paddingTop) || 0
      : 0;
    const wrapPadTop = wrapEl
      ? parseInt(getComputedStyle(wrapEl).paddingTop) || 0
      : 0;

    const extra = 12;
    const neededHeight =
      topbarHeight +
      contentPadTop +
      wrapPadTop +
      theadHeight +
      rowCount * rowHeight +
      padding +
      extra;

    const screenHeight = window.screen.availHeight;
    const maxHeight = Math.max(800, Math.floor(screenHeight * 0.8));
    const finalHeight = Math.min(neededHeight, maxHeight);

    window.electronAPI?.setWindowBounds({ height: finalHeight });

    const dynamicStats =
      statSettings?.layout?.filter(
        (k) => k && statSettings.visible.includes(k)
      ) || [];

    const baseWidth = 280;
    const colWidth = 80;
    const calculatedWidth =
      baseWidth + dynamicStats.length * colWidth;
    const finalWidth = Math.max(calculatedWidth, 400);

    window.electronAPI?.setWindowBounds({ width: finalWidth });
  }, 100);
}
