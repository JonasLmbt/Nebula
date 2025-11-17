// renderer/core/settings.js (Erweiterung für Sources)

/** Key for sources settings in localStorage */
const SOURCES_SETTINGS_KEY = "sourcesSettings";

const DEFAULT_SOURCES_SETTINGS = {
  game: {
    enabled: true,
    addFromWho: true,
    addFromChat: true,
    removeOnDeath: true,
    removeOnReconnect: true,
    removeOnServerChange: true,
  },
  party: {
    enabled: true,
    removeOnMemberLeave: true,
    removeAllOnLeaveOrDisband: true,
    showInviteTemp: true,
    autoRefreshServerChange: false, // plus placeholder
    autoRefreshGameEnd: false,      // plus placeholder
  },
  partyInvites: {
    enabled: true,
  },
  chat: {
    enabled: true,
    removeOnServerChange: true,
    addOnMention: true,
    strings: [],
  },
  guild: {
    enabled: true,
    removeOnServerChange: true,
    onlineOnly: true,
  },
  manual: {
    enabled: true,
    clearOnGameStart: false,
  },
};

function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}


export function loadSourcesSettings() {
  const saved = safeParse(SOURCES_SETTINGS_KEY, DEFAULT_SOURCES_SETTINGS);

  const merged = {
    game: { ...DEFAULT_SOURCES_SETTINGS.game, ...(saved.game || {}) },
    party: { ...DEFAULT_SOURCES_SETTINGS.party, ...(saved.party || {}) },
    partyInvites: {
      ...DEFAULT_SOURCES_SETTINGS.partyInvites,
      ...(saved.partyInvites || {}),
    },
    chat: { ...DEFAULT_SOURCES_SETTINGS.chat, ...(saved.chat || {}) },
    guild: { ...DEFAULT_SOURCES_SETTINGS.guild, ...(saved.guild || {}) },
    manual: { ...DEFAULT_SOURCES_SETTINGS.manual, ...(saved.manual || {}) },
  };

  // Normalize arrays
  merged.chat.strings = Array.isArray(merged.chat.strings)
    ? merged.chat.strings
    : [];

  return merged;
}

export function saveSourcesSettings(v) {
  const value = {
    ...DEFAULT_SOURCES_SETTINGS,
    ...(v || {}),
    game: { ...DEFAULT_SOURCES_SETTINGS.game, ...(v?.game || {}) },
    party: { ...DEFAULT_SOURCES_SETTINGS.party, ...(v?.party || {}) },
    partyInvites: {
      ...DEFAULT_SOURCES_SETTINGS.partyInvites,
      ...(v?.partyInvites || {}),
    },
    chat: { ...DEFAULT_SOURCES_SETTINGS.chat, ...(v?.chat || {}) },
    guild: { ...DEFAULT_SOURCES_SETTINGS.guild, ...(v?.guild || {}) },
    manual: { ...DEFAULT_SOURCES_SETTINGS.manual, ...(v?.manual || {}) },
  };

  localStorage.setItem(SOURCES_SETTINGS_KEY, JSON.stringify(value));
  console.log("Sources settings saved:", value);
}
