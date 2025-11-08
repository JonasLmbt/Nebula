import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import 'dotenv/config';
import { MinecraftChatLogger } from './chat-logger';

let nicksWin: BrowserWindow | null = null;
let win: BrowserWindow | null = null;

async function createWindow() {
  app.setName('Nebula');
  // On Windows, set an explicit AppUserModelID for proper taskbar grouping/notifications
  try { if (process.platform === 'win32') app.setAppUserModelId('Nebula'); } catch {}

  // Try to resolve an application icon (preferring .ico on Windows, then .png, then .svg)
  const resolveAsset = (file: string) => path.resolve(__dirname, '..', 'assets', file);
  const iconCandidates = process.platform === 'win32'
    ? ['nebula-logo.ico', 'nebula-logo.png', 'nebula-logo.svg']
    : ['nebula-logo.png', 'nebula-logo.svg', 'nebula-logo.ico'];
  let iconPath: string | undefined;
  for (const f of iconCandidates) {
    const p = resolveAsset(f);
    if (fs.existsSync(p)) { iconPath = p; break; }
  }

  win = new BrowserWindow({
    width: 860,
    height: 560,
    transparent: true,
    frame: false,            // we use a custom title bar
    resizable: true,         // allow resizing (with custom grips)
    minimizable: true,
    maximizable: false,
    alwaysOnTop: true,
    title: 'Nebula',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.setTitle('Nebula');
  
  // Clear cache before loading to ensure fresh content
  await win.webContents.session.clearCache();
  
  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Optional: open DevTools for debugging
  const shouldOpenDevTools = process.env.NEBULA_DEVTOOLS === '1' || process.env.NODE_ENV === 'development';
  if (shouldOpenDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Start chat logger to detect local Minecraft chat and forward player lists to renderer
  try {
  let chat = new MinecraftChatLogger();
    chat.on('playersUpdated', (players: string[]) => {
      if (win) win.webContents.send('chat:players', players);
    });
    chat.on('partyUpdated', (members: string[]) => {
      if (win) win.webContents.send('chat:party', members);
    });
    chat.on('partyInvite', (inviter: string) => {
      if (win) win.webContents.send('chat:partyInvite', inviter);
    });
    chat.on('partyCleared', () => {
      if (win) win.webContents.send('chat:partyCleared');
    });
    chat.on('finalKill', (name: string) => {
      if (win) win.webContents.send('chat:finalKill', name);
    });
    chat.on('message', (payload: { name: string; text: string }) => {
      if (win) win.webContents.send('chat:message', payload);
    });
    chat.on('serverChange', () => {
      if (win) win.webContents.send('chat:serverChange');
    });
    chat.on('lobbyJoined', () => {
      if (win) win.webContents.send('chat:lobbyJoined');
    });
    chat.on('usernameMention', (name: string) => {
      if (win) win.webContents.send('chat:usernameMention', name);
    });
    chat.on('logPathChanged', (payload: { path: string; client?: string }) => {
      if (win) win.webContents.send('chat:logPathChanged', payload);
    });
    chat.on('error', (err) => console.error('ChatLogger error:', err));

    // Allow renderer to update username
    ipcMain.on('set:username', (_e, username: string) => {
      if (chat) {
        chat.username = username;
        console.log('Updated ChatLogger username:', username);
      }
    });
    ipcMain.on('set:logPath', (_e, newPath: string) => {
      try {
        if (chat && typeof newPath === 'string' && newPath.trim().length) {
          chat.switchLogPath(newPath.trim());
          console.log('Switched ChatLogger log path:', newPath);
        }
      } catch (err) { console.error('Failed to switch log path', err); }
    });
    ipcMain.on('set:client', (_e, client: string) => {
      try {
        if (chat && typeof client === 'string' && client.trim()) {
          chat.setClient(client.trim());
          console.log('Selected ChatLogger client:', client);
        }
      } catch (err) { console.error('Failed to set client', err); }
    });
    ipcMain.handle('chat:autoDetect', () => {
      try { return chat.autoDetect(); } catch { return undefined; }
    });
  } catch (e) {
    console.error('Failed to start ChatLogger', e);
  }
});

// Quit the app on all windows closed (Mac exception handled)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (win === null) createWindow();
});

// Handle minimize and close from renderer
ipcMain.on('window:minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('window:close', () => {
  app.quit();
});

// --- Global Shortcuts
let clickThrough = false;
let registered: Array<{ action: string; accelerator: string }> = [];

function unregisterShortcuts() {
  try { globalShortcut.unregisterAll(); } catch {}
  registered = [];
}

function registerShortcuts(map: Record<string, string>) {
  unregisterShortcuts();
  const safeRegister = (accelerator: string | undefined, action: () => void, id: string) => {
    if (!accelerator) return;
    try {
      if (globalShortcut.register(accelerator, action)) {
        registered.push({ action: id, accelerator });
      }
    } catch (e) {
      console.warn('Failed to register shortcut', accelerator, e);
    }
  };

  safeRegister(map.toggleOverlay, () => {
    if (!win) return;
    if (win.isVisible()) win.hide(); else win.show();
  }, 'toggleOverlay');

  safeRegister(map.refreshAll, () => {
    if (win) win.webContents.send('shortcut:refresh');
  }, 'refreshAll');

  safeRegister(map.clearAll, () => {
    if (win) win.webContents.send('shortcut:clear');
  }, 'clearAll');

  safeRegister(map.toggleClickThrough, () => {
    if (!win) return;
    clickThrough = !clickThrough;
    try { win.setIgnoreMouseEvents(clickThrough, { forward: true }); } catch {}
  }, 'toggleClickThrough');
}

ipcMain.handle('shortcuts:register', (_e, map: Record<string, string>) => {
  registerShortcuts(map || {} as any);
});

// Custom resize logic for frameless window
type ResizeEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

ipcMain.handle('window:resize', (_e, payload: { edge: ResizeEdge; dx: number; dy: number }) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  const { x, y, width, height } = win.getBounds();
  const { edge, dx, dy } = payload;

  let nx = x, ny = y, nw = width, nh = height;

  switch (edge) {
    case 'right':
      nw = Math.max(320, width + dx);
      break;
    case 'bottom':
      nh = Math.max(220, height + dy);
      break;
    case 'left':
      nx = x + dx;
      nw = Math.max(320, width - dx);
      break;
    case 'top':
      ny = y + dy;
      nh = Math.max(220, height - dy);
      break;
    case 'top-left':
      nx = x + dx;
      ny = y + dy;
      nw = Math.max(320, width - dx);
      nh = Math.max(220, height - dy);
      break;
    case 'top-right':
      ny = y + dy;
      nw = Math.max(320, width + dx);
      nh = Math.max(220, height - dy);
      break;
    case 'bottom-left':
      nx = x + dx;
      nw = Math.max(320, width - dx);
      nh = Math.max(220, height + dy);
      break;
    case 'bottom-right':
      nw = Math.max(320, width + dx);
      nh = Math.max(220, height + dy);
      break;
  }

  win.setBounds({ x: nx, y: ny, width: nw, height: nh }, false);
});

function createNicksWindow() {
  nicksWin = new BrowserWindow({
    width: 400,
    height: 500,
    transparent: true,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    alwaysOnTop: true,
    title: 'Nebula - Nicks',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  nicksWin.loadFile(path.join(__dirname, '../src/renderer/nicks.html'));

  nicksWin.on('closed', () => {
    nicksWin = null;
  });
}

// Hypixel Cache & Rate Limiter
class HypixelCache {
  private cache = new Map<string, {
    data: any;
    timestamp: number;
  }>();
  private uuidCache = new Map<string, string>();
  private guildCache = new Map<string, { data: any; timestamp: number }>();
  private queue = new Set<string>();
  private readonly TTL = 10 * 60 * 1000; // 10 Minuten Cache-Zeit
  private readonly MAX_CONCURRENT = 3; // Max. parallele Requests

  constructor(private apiKey: string) {}

  private async getUUID(name: string): Promise<string> {
    const cached = this.uuidCache.get(name.toLowerCase());
    if (cached) return cached;

    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('UUID nicht gefunden');
    
    const data = await res.json() as { id?: string };
    const uuid = data?.id;
    if (!uuid) throw new Error('Ungültige UUID-Response');

    this.uuidCache.set(name.toLowerCase(), uuid);
    return uuid;
  }

  private async fetchHypixelStats(uuid: string) {
    const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
      headers: { 'API-Key': this.apiKey },
    });
    
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('Hypixel Rate-Limit erreicht - bitte warte kurz');
      }
      throw new Error(`Hypixel API: ${res.status}`);
    }

    const data = await res.json() as { player?: any };
    return data.player;
  }

  private async fetchGuild(uuid: string) {
    const cached = this.guildCache.get(uuid);
    if (cached && Date.now() - cached.timestamp < this.TTL) return cached.data;
    try {
      const res = await fetch(`https://api.hypixel.net/v2/guild?player=${uuid}`, {
        headers: { 'API-Key': this.apiKey },
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('Hypixel Rate-Limit (Guild)');
        return null; // kein Guild gefunden oder anderer Fehler
      }
      const data = await res.json() as { guild?: any };
      const guild = data.guild || null;
      this.guildCache.set(uuid, { data: guild, timestamp: Date.now() });
      return guild;
    } catch {
      return null;
    }
  }

  private async processBedwarsStats(player: any, requestedName: string, guild: any | null) {
    const bw = player?.stats?.Bedwars || {};
    const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
    const fk = bw.final_kills_bedwars ?? 0;
    const fd = bw.final_deaths_bedwars ?? 0;
    const wins = bw.wins_bedwars ?? 0;
    const losses = bw.losses_bedwars ?? 0;
    const ws = bw.winstreak ?? 0;
    const bblr = (bw.beds_broken_bedwars ?? 0) / Math.max(1, bw.beds_lost_bedwars ?? 1);

    // Determine rank/prefix and a display color
    const getRankInfo = (p: any) => {
      // Precedence (Hypixel specifics): custom prefix > special rank field (rank) > monthlyPackageRank (SUPERSTAR) > newPackageRank > packageRank
      // The previous implementation chose newPackageRank first, causing MVP++ (SUPERSTAR) and YOUTUBER to degrade to MVP+.
      const prefix = p?.prefix; // may contain § color codes + brackets
      const rank = p?.rank; // staff / youtube ranks live here (e.g. YOUTUBER, ADMIN)
      const monthly = p?.monthlyPackageRank; // SUPERSTAR for MVP++
      const newPkg = p?.newPackageRank; // MVP_PLUS etc.
      const pkg = p?.packageRank; // legacy
      const displayname = p?.displayname;

      const stripColor = (s: string) => s ? s.replace(/§[0-9a-fk-or]/gi, '').trim() : s;

      // If prefix exists, prefer it entirely (extract bracketed portion if present)
      if (prefix) {
        const raw = stripColor(prefix);
        const m = raw.match(/\[(.+?)\]/);
        return { tag: m ? `[${m[1]}]` : raw, color: '#FFFFFF' };
      }

      // Displayname may itself have leading bracket tag (rare custom formatting)
      if (displayname) {
        const dn = stripColor(displayname);
        const match = dn.match(/^\s*\[(.+?)\]/);
        if (match) return { tag: `[${match[1]}]`, color: '#FFFFFF' };
      }

      // Helper mapping
      const map: Record<string, { tag: string; color: string }> = {
        VIP: { tag: '[VIP]', color: '#55FF55' },
        VIP_PLUS: { tag: '[VIP+]', color: '#55FF55' },
        MVP: { tag: '[MVP]', color: '#55FFFF' },
        MVP_PLUS: { tag: '[MVP+]', color: '#55FFFF' },
        SUPERSTAR: { tag: '[MVP++]', color: '#FFAA00' }, // MVP++ monthly
        MVP_PLUS_PLUS: { tag: '[MVP++]', color: '#FFAA00' }, // sometimes appears explicitly
        YOUTUBER: { tag: '[YOUTUBE]', color: '#FF5555' },
        YT: { tag: '[YOUTUBE]', color: '#FF5555' },
        ADMIN: { tag: '[ADMIN]', color: '#FF5555' },
        OWNER: { tag: '[OWNER]', color: '#FF5555' },
        MOD: { tag: '[MOD]', color: '#55AAFF' },
        HELPER: { tag: '[HELPER]', color: '#55AAFF' }
      };

      // Evaluate rank fields by precedence
      const candidates = [rank, monthly, newPkg, pkg].filter(Boolean).map((r: string) => String(r).toUpperCase());
      for (const c of candidates) {
        if (map[c]) return map[c];
        // Pattern handling inside loop to allow early precedence
        if (c.includes('SUPERSTAR') || c.includes('MVP_PLUS_PLUS') || c.includes('PLUS_PLUS')) return map['SUPERSTAR'];
        if (c.includes('VIP')) return map['VIP'];
        if (c.includes('MVP') && c.includes('PLUS')) return map['MVP_PLUS'];
        if (c === 'MVP') return map['MVP'];
        if (c === 'YOUTUBER' || c === 'YT') return map['YOUTUBER'];
      }

      // No rank detected (NORMAL)
      return { tag: null, color: null };
    };

    const rankInfo = getRankInfo(player ?? {});

    return {
      name: player.displayname ?? requestedName,
      level: stars,
      experience: bw.Experience ?? 0,
      ws,
      fkdr: +(fk / Math.max(1, fd)).toFixed(2),
      wlr: +(wins / Math.max(1, losses)).toFixed(2),
      bblr: +bblr.toFixed(2),
      fk,
      fd,
      wins,
      losses,
      bedsBroken: bw.beds_broken_bedwars ?? 0,
      bedsLost: bw.beds_lost_bedwars ?? 0,
      kills: bw.kills_bedwars ?? 0,
      deaths: bw.deaths_bedwars ?? 0,
      // Derived efficiencies
      winsPerLevel: +(wins / Math.max(1, stars)).toFixed(2),
      fkPerLevel: +(fk / Math.max(1, stars)).toFixed(2),
      bedwarsScore: +((fk / Math.max(1, fd)) * (wins / Math.max(1, losses)) * (stars / 100)).toFixed(2),
      // Network Level (approximate formula from Hypixel experience curve)
      networkLevel: (() => {
        const exp = player?.networkExp ?? player?.networkExperience ?? 0;
        // Hypixel formula: level = (Math.sqrt(2*exp + 30625) / 50) - 2.5
        const lvl = (Math.sqrt(2 * exp + 30625) / 50) - 2.5;
        return Math.max(0, Math.floor(lvl));
      })(),
      // Guild Daten aus separatem Endpoint (falls vorhanden)
      guildName: guild?.name ?? null,
      guildTag: guild?.tag ?? null,
      mfkdr: null, // Monthly Final K/D Ratio
      mwlr: null,  // Monthly Win/Loss Ratio
      mbblr: null, // Monthly Bed Break/Loss Ratio
      rankTag: rankInfo.tag,
      rankColor: rankInfo.color,
    };
  }

  async getStats(name: string) {
    const normalizedName = name.toLowerCase();
    
    // 1. Cache prüfen
    const cached = this.cache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

    // 2. Queue Management (max. 3 parallele Requests)
    while (this.queue.size >= this.MAX_CONCURRENT) {
      await new Promise(r => setTimeout(r, 100));
    }
    
    // 3. Request durchführen
    try {
      this.queue.add(normalizedName);

      // Kleine Verzögerung zwischen Requests
      if (this.queue.size > 1) {
        await new Promise(r => setTimeout(r, 150));
      }

      let uuid: string | null = null;
      try {
        uuid = await this.getUUID(name);
      } catch (e) {
        // Name nicht auf Mojang gefunden -> als Nick behandeln
        return { name, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
      }
  const player = await this.fetchHypixelStats(uuid);
      if (!player) throw new Error('Spieler nicht auf Hypixel gefunden');
  const guild = await this.fetchGuild(uuid);
  const stats = await this.processBedwarsStats(player, name, guild);
      
      // Erfolgreichen Request cachen
      this.cache.set(normalizedName, {
        data: stats,
        timestamp: Date.now()
      });

      return stats;

    } catch (err: any) {
      // Rate-Limit oder andere API-Fehler
      return { error: String(err.message || err) };
    } finally {
      this.queue.delete(normalizedName);
    }
  }

  clearCache() {
    this.cache.clear();
    this.uuidCache.clear();
  }
}

// Zentraler Cache-Manager
const hypixel = new HypixelCache(process.env.HYPIXEL_KEY || '');

// --- IPC: Bedwars Stats Fetch (jetzt mit Cache)
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  if (!process.env.HYPIXEL_KEY) {
    return { error: 'HYPIXEL_KEY fehlt in der Umgebung. Bitte .env Datei prüfen.' };
  }
  return hypixel.getStats(name);
});

// --- IPC: Always-on-top toggle from renderer appearance settings
ipcMain.handle('window:setAlwaysOnTop', (_e, flag: boolean) => {
  if (!win) return false;
  try {
    win.setAlwaysOnTop(!!flag);
    return win.isAlwaysOnTop();
  } catch {
    return false;
  }
});

// --- IPC: Set window bounds (for auto-resize)
ipcMain.handle('window:setBounds', (_e, bounds: { width?: number; height?: number; x?: number; y?: number }) => {
  if (!win) return false;
  try {
    const current = win.getBounds();
    win.setBounds({
      x: bounds.x ?? current.x,
      y: bounds.y ?? current.y,
      width: bounds.width ?? current.width,
      height: bounds.height ?? current.height
    }, false);
    return true;
  } catch {
    return false;
  }
});
