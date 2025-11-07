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
    const chat = new MinecraftChatLogger();
    chat.on('playersUpdated', (players: string[]) => {
      if (win) win.webContents.send('chat:players', players);
    });
    chat.on('partyUpdated', (members: string[]) => {
      if (win) win.webContents.send('chat:party', members);
    });
    chat.on('finalKill', (name: string) => {
      if (win) win.webContents.send('chat:finalKill', name);
    });
    chat.on('message', (payload: { name: string; text: string }) => {
      if (win) win.webContents.send('chat:message', payload);
    });
    chat.on('lobbyJoined', () => {
      if (win) win.webContents.send('chat:lobbyJoined');
    });
    chat.on('error', (err) => console.error('ChatLogger error:', err));
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

  private async processBedwarsStats(player: any, requestedName: string) {
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
      // Priority: prefix (custom), then package/rank fields
      const prefix = p?.prefix; // sometimes contains formatted prefix with § codes
      const displayname = p?.displayname;

      const stripColor = (s: string) => s ? s.replace(/§[0-9a-fk-or]/gi, '').trim() : s;

      // If displayname itself contains a bracketed tag, prefer that (after stripping color codes)
      if (displayname) {
        const dn = stripColor(displayname);
        const match = dn.match(/^\s*\[(.+?)\]/);
        if (match) return { tag: `[${match[1]}]`, color: '#FFFFFF' };
      }
      const rankField = p?.newPackageRank || p?.monthlyPackageRank || p?.packageRank || p?.rank || null;

      // stripColor already defined above
      if (prefix) {
        const raw = stripColor(prefix);
        // If prefix contains a bracketed tag like [MVP++], extract that
        const m = raw.match(/\[(.+?)\]/);
        if (m) return { tag: `[${m[1]}]`, color: '#FFFFFF' };
        return { tag: raw, color: '#FFFFFF' };
      }

      if (!rankField) return { tag: null, color: null };

      const r = String(rankField).toUpperCase();
      const map: Record<string, { tag: string; color: string }> = {
        VIP: { tag: '[VIP]', color: '#55FF55' },
        VIP_PLUS: { tag: '[VIP+]', color: '#55FF55' },
        MVP: { tag: '[MVP]', color: '#55FFFF' },
        MVP_PLUS: { tag: '[MVP+]', color: '#55FFFF' },
        MVP_PLUS_PLUS: { tag: '[MVP++]', color: '#FFAA00' },
        SUPERSTAR: { tag: '[MVP++]', color: '#FFAA00' },
        YT: { tag: '[YOUTUBE]', color: '#FF5555' },
        YOUTUBER: { tag: '[YOUTUBE]', color: '#FF5555' },
        ADMIN: { tag: '[ADMIN]', color: '#FF5555' },
        OWNER: { tag: '[OWNER]', color: '#FF5555' },
        MOD: { tag: '[MOD]', color: '#55AAFF' },
        HELPER: { tag: '[HELPER]', color: '#55AAFF' }
      };

      if (map[r]) return map[r];

      // Handle common patterns
      if (r.includes('VIP')) return map['VIP'];
      if (r.includes('SUPERSTAR') || r.includes('MVP_PLUS_PLUS') || r.includes('PLUS_PLUS')) return map['MVP_PLUS_PLUS'];
      if (r.includes('MVP') && r.includes('PLUS')) return map['MVP_PLUS'];
      if (r.includes('MVP')) return map['MVP'];

      // Fallback: present the raw rank
      return { tag: `[${r}]`, color: '#FFFFFF' };
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
      wins,
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

      const uuid = await this.getUUID(name);
      const player = await this.fetchHypixelStats(uuid);
      if (!player) throw new Error('Spieler nicht auf Hypixel gefunden');

      const stats = await this.processBedwarsStats(player, name);
      
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
