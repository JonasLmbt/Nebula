// renderer/ui/nicksPanel.js

import { state } from "../core/state.js";
import {
  getNicks,
  setNicks,
  saveNicks,
  setNickDisplayMode,
} from "../core/nicks.js";
import { esc, escAttr } from "../util/format.js";
import { renderTable } from "./table.js";
import { showNotification } from "./notifications.js";

export function renderNicks() {
  const list = document.getElementById("nicksList");
  if (!list) return;

  const nicks = getNicks();

  list.innerHTML = nicks
    .map(
      ({ nick, real }) => `
      <div class="nick-row" data-nick="${escAttr(nick)}">
        <span class="nick-name">${esc(nick)}</span>
        <span class="nick-real">${esc(real)}</span>
        <button class="delete-btn" title="Remove nick">✕</button>
      </div>
    `
    )
    .join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row = e.currentTarget.closest(".nick-row");
      if (!row) return;
      const nick = row.getAttribute("data-nick");
      if (!nick) return;

      const current = getNicks();
      const updated = current.filter((n) => n.nick !== nick);
      setNicks(updated);
      saveNicks();
      renderNicks();
      renderTable();
    });
  });
}

/**
 * Wire up all controls in the Nicks panel:
 * - display mode select
 * - add nick form
 * - enter/escape handling
 */
export function initNicksPanel() {
  const addNickBtn = document.getElementById("addNickBtn");
  const addNickForm = document.getElementById("addNickForm");
  const nickInput = document.getElementById("nickInput");
  const realNameInput = document.getElementById("realNameInput");
  const saveNickBtn = document.getElementById("saveNickBtn");
  const nickDisplayModeSelect = document.getElementById("nickDisplayMode");

  // Display-mode select (nick / real)
  if (nickDisplayModeSelect) {
    nickDisplayModeSelect.value = state.nickDisplayMode;
    nickDisplayModeSelect.addEventListener("change", () => {
      setNickDisplayMode(nickDisplayModeSelect.value);
      renderTable();
    });
  }

  // Show/hide add-nick form
  addNickBtn?.addEventListener("click", () => {
    if (!addNickForm) return;
    addNickForm.style.display = "block";
    nickInput?.focus();
  });

  // Save nick when form is submitted
  saveNickBtn?.addEventListener("click", () => {
    if (!nickInput || !realNameInput || !addNickForm) return;

    const nick = nickInput.value.trim();
    const real = realNameInput.value.trim();
    const currentNicks = getNicks();

    const isPlus =
      localStorage.getItem("demoPlus") === "true" ||
      (state.userProfile && state.userProfile.isPlus);

    if (!isPlus && currentNicks.length >= 5) {
      showNotification(
        "Maximum of 5 nicknames without Plus allowed. Upgrade to Plus for unlimited entries!"
      );
      return;
    }

    if (nick && real) {
      if (
        !currentNicks.some(
          (n) => n.nick.toLowerCase() === nick.toLowerCase()
        )
      ) {
        const updated = [...currentNicks, { nick, real }];
        setNicks(updated);
        saveNicks();
        renderNicks();
        renderTable();

        // Reset form
        nickInput.value = "";
        realNameInput.value = "";
        addNickForm.style.display = "none";
      }
    }
  });

  // Enter in second input also submits
  realNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveNickBtn?.click();
    }
  });

  // Escape closes form
  document.addEventListener("keydown", (e) => {
    if (!addNickForm || !nickInput || !realNameInput) return;
    if (e.key === "Escape" && addNickForm.style.display === "block") {
      addNickForm.style.display = "none";
      nickInput.value = "";
      realNameInput.value = "";
    }
  });
}
