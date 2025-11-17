// renderer/ui/topbar.js

/**
 * Handles the topbar buttons (help, settings, etc)
 */
export function initTopbar() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-open");
      document.getElementById(id)?.classList.add("open");
    });
  });
}
