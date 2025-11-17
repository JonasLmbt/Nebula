// renderer/ui/sidebar.js

/**
 * Sidebar open/close logic.
 */

export function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");

  if (!sidebar || !toggle) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}
