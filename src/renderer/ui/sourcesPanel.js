// renderer/ui/sourcesPanel.js

import { loadSourcesSettings, saveSourcesSettings } from "../core/settings.js";

/**
 * Helper: enable/disable all inputs in a subsection and adjust opacity.
 */
function toggleSubsectionEnabled(containerId, enabled) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const inputs = container.querySelectorAll("input, button");
  inputs.forEach((input) => {
    input.disabled = !enabled;
  });
  container.style.opacity = enabled ? "1" : "0.5";
  container.style.pointerEvents = enabled ? "auto" : "none";
}

/**
 * Render and bind chat trigger string list.
 */
function renderChatStrings(sourcesSettings, chatStringList) {
  if (!chatStringList) return;

  chatStringList.innerHTML = "";
  (sourcesSettings.chat.strings || []).forEach((str, idx) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.innerHTML = `
      <input type="text" value="${str.replace(/"/g, "&quot;")}" data-idx="${idx}" style="flex:1;padding:6px 8px;background:var(--row);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);font-size:12px;" />
      <button type="button" data-remove="${idx}" style="background:rgba(255,255,255,0.08);border:0;color:var(--text);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">Remove</button>
    `;
    chatStringList.appendChild(row);
  });
}

function syncChatStringsFromDOM(sourcesSettings, chatStringList) {
  if (!chatStringList) return;
  const inputs = Array.from(
    chatStringList.querySelectorAll('input[type="text"]')
  );
  const values = [];
  for (let j = 0; j < inputs.length; j++) {
    const el = inputs[j];
    const val = el && el.value != null ? String(el.value).trim() : "";
    if (val.length > 0) values.push(val);
  }
  sourcesSettings.chat.strings = values;
  saveSourcesSettings(sourcesSettings);
}

/**
 * Initialize bindings for the "Sources" panel (game / party / chat / guild / manual).
 */
export function initSourcesPanel() {
  let sourcesSettings = loadSourcesSettings();

  // --- Game controls
  const sourceGameToggle = document.getElementById("sourceGameToggle");
  const gameAddFromWho = document.getElementById("gameAddFromWho");
  const gameAddFromChat = document.getElementById("gameAddFromChat");
  const gameRemoveOnDeath = document.getElementById("gameRemoveOnDeath");
  const gameRemoveOnDisconnect = document.getElementById("gameRemoveOnDisconnect");
  const gameRemoveOnServerChange = document.getElementById("gameRemoveOnServerChange");

  // --- Party controls
  const sourcePartyToggle = document.getElementById("sourcePartyToggle");
  const partyRemoveOnMemberLeave = document.getElementById("partyRemoveOnMemberLeave");
  const partyRemoveAllOnLeaveOrDisband = document.getElementById(
    "partyRemoveAllOnLeaveOrDisband"
  );
  const partyShowInviteTemp = document.getElementById("partyShowInviteTemp");
  const partyRefreshServerChange = document.getElementById("partyRefreshServerChange");
  const partyRefreshGameEnd = document.getElementById("partyRefreshGameEnd");

  const sourcePartyInvitesToggle = document.getElementById("sourcePartyInvitesToggle");

  // --- Chat controls
  const sourceChatToggle = document.getElementById("sourceChatToggle");
  const chatRemoveOnServerChange = document.getElementById("chatRemoveOnServerChange");
  const chatAddOnMention = document.getElementById("chatAddOnMention");
  const chatStringList = document.getElementById("chatStringList");
  const addChatStringBtn = document.getElementById("addChatString");

  // --- Manual source controls
  const sourceManualToggle = document.getElementById("sourceManualToggle");
  const manualClearOnGameStart = document.getElementById("manualClearOnGameStart");

  // --- Guild bindings
  const sourceGuildToggle = document.getElementById("sourceGuildToggle");
  const guildRemoveOnServerChange = document.getElementById("guildRemoveOnServerChange");
  const guildOnlineOnly = document.getElementById("guildOnlineOnly");

  // Game
  if (sourceGameToggle) {
    sourceGameToggle.checked = !!sourcesSettings.game.enabled;
    toggleSubsectionEnabled("gameSourceOptions", sourcesSettings.game.enabled);
    sourceGameToggle.addEventListener("change", () => {
      sourcesSettings.game.enabled = sourceGameToggle.checked;
      toggleSubsectionEnabled("gameSourceOptions", sourcesSettings.game.enabled);
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (gameAddFromChat) {
    gameAddFromChat.checked = !!sourcesSettings.game.addFromChat;
    gameAddFromChat.addEventListener("change", () => {
      sourcesSettings.game.addFromChat = gameAddFromChat.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (gameAddFromWho) {
    gameAddFromWho.checked = !!sourcesSettings.game.addFromWho;
    gameAddFromWho.addEventListener("change", () => {
      sourcesSettings.game.addFromWho = gameAddFromWho.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (gameRemoveOnDeath) {
    gameRemoveOnDeath.checked = !!sourcesSettings.game.removeOnDeath;
    gameRemoveOnDeath.addEventListener("change", () => {
      sourcesSettings.game.removeOnDeath = gameRemoveOnDeath.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (gameRemoveOnDisconnect) {
    gameRemoveOnDisconnect.checked = !!sourcesSettings.game.removeOnReconnect;
    gameRemoveOnDisconnect.addEventListener("change", () => {
      sourcesSettings.game.removeOnReconnect = gameRemoveOnDisconnect.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (gameRemoveOnServerChange) {
    gameRemoveOnServerChange.checked = !!sourcesSettings.game.removeOnServerChange;
    gameRemoveOnServerChange.addEventListener("change", () => {
      sourcesSettings.game.removeOnServerChange = gameRemoveOnServerChange.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  // Party
  if (sourcePartyToggle) {
    sourcePartyToggle.checked = !!sourcesSettings.party.enabled;
    toggleSubsectionEnabled("partySourceOptions", sourcesSettings.party.enabled);
    if (sourcePartyInvitesToggle) {
      sourcePartyInvitesToggle.disabled = !sourcesSettings.party.enabled;
    }
    sourcePartyToggle.addEventListener("change", () => {
      sourcesSettings.party.enabled = sourcePartyToggle.checked;
      toggleSubsectionEnabled("partySourceOptions", sourcesSettings.party.enabled);
      if (sourcePartyInvitesToggle) {
        sourcePartyInvitesToggle.disabled = !sourcesSettings.party.enabled;
      }
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (partyRemoveOnMemberLeave) {
    partyRemoveOnMemberLeave.checked = !!sourcesSettings.party.removeOnMemberLeave;
    partyRemoveOnMemberLeave.addEventListener("change", () => {
      sourcesSettings.party.removeOnMemberLeave = partyRemoveOnMemberLeave.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (partyRemoveAllOnLeaveOrDisband) {
    partyRemoveAllOnLeaveOrDisband.checked =
      !!sourcesSettings.party.removeAllOnLeaveOrDisband;
    partyRemoveAllOnLeaveOrDisband.addEventListener("change", () => {
      sourcesSettings.party.removeAllOnLeaveOrDisband =
        partyRemoveAllOnLeaveOrDisband.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (partyShowInviteTemp) {
    partyShowInviteTemp.checked = !!sourcesSettings.party.showInviteTemp;
    partyShowInviteTemp.addEventListener("change", () => {
      sourcesSettings.party.showInviteTemp = partyShowInviteTemp.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (partyRefreshServerChange) {
    partyRefreshServerChange.checked =
      !!sourcesSettings.party.autoRefreshServerChange;
    partyRefreshServerChange.addEventListener("change", () => {
      sourcesSettings.party.autoRefreshServerChange =
        partyRefreshServerChange.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (partyRefreshGameEnd) {
    partyRefreshGameEnd.checked = !!sourcesSettings.party.autoRefreshGameEnd;
    partyRefreshGameEnd.addEventListener("change", () => {
      sourcesSettings.party.autoRefreshGameEnd = partyRefreshGameEnd.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (sourcePartyInvitesToggle) {
    sourcePartyInvitesToggle.checked = !!sourcesSettings.partyInvites.enabled;
    sourcePartyInvitesToggle.addEventListener("change", () => {
      sourcesSettings.partyInvites.enabled = sourcePartyInvitesToggle.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  // Chat
  if (sourceChatToggle) {
    sourceChatToggle.checked = !!sourcesSettings.chat.enabled;
    toggleSubsectionEnabled("chatSourceOptions", sourcesSettings.chat.enabled);
    sourceChatToggle.addEventListener("change", () => {
      sourcesSettings.chat.enabled = sourceChatToggle.checked;
      toggleSubsectionEnabled("chatSourceOptions", sourcesSettings.chat.enabled);
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (chatRemoveOnServerChange) {
    chatRemoveOnServerChange.checked = !!sourcesSettings.chat.removeOnServerChange;
    chatRemoveOnServerChange.addEventListener("change", () => {
      sourcesSettings.chat.removeOnServerChange = chatRemoveOnServerChange.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (chatAddOnMention) {
    chatAddOnMention.checked = !!sourcesSettings.chat.addOnMention;
    chatAddOnMention.addEventListener("change", () => {
      sourcesSettings.chat.addOnMention = chatAddOnMention.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  // Guild
  if (sourceGuildToggle) {
    sourceGuildToggle.checked = !!sourcesSettings.guild.enabled;
    toggleSubsectionEnabled("guildSourceOptions", sourcesSettings.guild.enabled);
    sourceGuildToggle.addEventListener("change", () => {
      sourcesSettings.guild.enabled = sourceGuildToggle.checked;
      toggleSubsectionEnabled("guildSourceOptions", sourcesSettings.guild.enabled);
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (guildRemoveOnServerChange) {
    guildRemoveOnServerChange.checked =
      !!sourcesSettings.guild.removeOnServerChange;
    guildRemoveOnServerChange.addEventListener("change", () => {
      sourcesSettings.guild.removeOnServerChange =
        guildRemoveOnServerChange.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (guildOnlineOnly) {
    guildOnlineOnly.checked = !!sourcesSettings.guild.onlineOnly;
    guildOnlineOnly.addEventListener("change", () => {
      sourcesSettings.guild.onlineOnly = guildOnlineOnly.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  // Manual
  if (sourceManualToggle) {
    sourceManualToggle.checked = !!sourcesSettings.manual.enabled;
    toggleSubsectionEnabled("manualSourceOptions", sourcesSettings.manual.enabled);
    sourceManualToggle.addEventListener("change", () => {
      sourcesSettings.manual.enabled = sourceManualToggle.checked;
      toggleSubsectionEnabled("manualSourceOptions", sourcesSettings.manual.enabled);
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (manualClearOnGameStart) {
    manualClearOnGameStart.checked = !!sourcesSettings.manual.clearOnGameStart;
    manualClearOnGameStart.addEventListener("change", () => {
      sourcesSettings.manual.clearOnGameStart = manualClearOnGameStart.checked;
      saveSourcesSettings(sourcesSettings);
    });
  }

  // Chat Strings UI
  renderChatStrings(sourcesSettings, chatStringList);

  if (addChatStringBtn) {
    addChatStringBtn.addEventListener("click", () => {
      sourcesSettings.chat.strings.push("");
      renderChatStrings(sourcesSettings, chatStringList);
      saveSourcesSettings(sourcesSettings);
    });
  }

  if (chatStringList) {
    chatStringList.addEventListener("input", (e) => {
      const tgt = e.target;
      if (tgt && tgt.tagName === "INPUT") {
        syncChatStringsFromDOM(sourcesSettings, chatStringList);
      }
    });

    chatStringList.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.remove) {
        const idx = parseInt(t.dataset.remove, 10);
        sourcesSettings.chat.strings.splice(idx, 1);
        renderChatStrings(sourcesSettings, chatStringList);
        saveSourcesSettings(sourcesSettings);
      }
    });
  }
}
