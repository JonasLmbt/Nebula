// renderer/ui/notifications.js

/**
 * Very simple notification box.
 */
export function showNotification(text, type = "info") {
  let box = document.getElementById("notificationBox");

  if (!box) {
    box = document.createElement("div");
    box.id = "notificationBox";
    box.style.position = "fixed";
    box.style.bottom = "20px";
    box.style.right = "20px";
    box.style.background = "var(--bg2)";
    box.style.padding = "12px 16px";
    box.style.borderRadius = "6px";
    document.body.appendChild(box);
  }

  box.style.color = type === "error" ? "var(--error)" : "var(--text)";
  box.textContent = text;

  box.style.opacity = "1";
  setTimeout(() => (box.style.opacity = "0"), 3000);
}
