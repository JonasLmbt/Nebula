// renderer/ui/panels.js

/**
 * Central panel routing.
 * Each panel has: <div class="panel" id="panel-XYZ">
 */

export function initPanels() {
  const buttons = document.querySelectorAll("[data-panel]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      openPanel(btn.getAttribute("data-panel"));
    });
  });
}

/**
 * Switch to a panel by ID suffix.
 * Example: "overlay" → #panel-overlay
 */
export function openPanel(name) {
  const all = document.querySelectorAll(".panel");
  all.forEach((p) => p.classList.remove("active"));

  const panel = document.getElementById("panel-" + name);
  if (panel) panel.classList.add("active");
}
