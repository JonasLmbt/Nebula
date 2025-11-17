// renderer/ipc/mcLogListener.js

/**
 * Start listening to Minecraft-related events from the main process.
 *
 * preload should expose:
 *   electronAPI.onMinecraftEvent((event) => { ... })
 *
 * Where event has at least:
 *   { type: string, payload: any }
 *
 * Supported examples:
 *   type: 'chat'
 *   type: 'who'
 *   type: 'party'
 *   type: 'guildListStart'
 *   type: 'guildListChunk'
 *   type: 'guildListEnd'
 *
 * @param {Object} handlers
 * @param {(e:any)=>void} [handlers.onChat]
 * @param {(e:any)=>void} [handlers.onWho]
 * @param {(e:any)=>void} [handlers.onParty]
 * @param {(e:any)=>void} [handlers.onGuildListStart]
 * @param {(e:any)=>void} [handlers.onGuildListChunk]
 * @param {(e:any)=>void} [handlers.onGuildListEnd]
 *
 * @returns {() => void} unsubscribe function
 */

export function startMinecraftLogListener(handlers = {}) {
  const api = window.electronAPI;
  if (!api || typeof api.onMinecraftEvent !== "function") {
    console.warn(
      "electronAPI.onMinecraftEvent is not defined in preload – Minecraft log listener disabled."
    );
    return () => {};
  }

  const unsubscribe = api.onMinecraftEvent((event) => {
    if (!event || typeof event.type !== "string") return;

    switch (event.type) {
      case "chat":
        handlers.onChat?.(event);
        break;
      case "who":
        handlers.onWho?.(event);
        break;
      case "party":
        handlers.onParty?.(event);
        break;
      case "guildListStart":
        handlers.onGuildListStart?.(event);
        break;
      case "guildListChunk":
        handlers.onGuildListChunk?.(event);
        break;
      case "guildListEnd":
        handlers.onGuildListEnd?.(event);
        break;
      default:
        console.debug("[MC] Unknown event type:", event.type, event);
    }
  });

  return typeof unsubscribe === "function" ? unsubscribe : () => {};
}
