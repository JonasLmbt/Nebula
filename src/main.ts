import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';
import { MinecraftChatLogger } from './chat-logger';

let nicksWin: BrowserWindow | null = null;
let win: BrowserWindow | null = null;

function createWindow() {
  app.setName('Nebula');

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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.setTitle('Nebula');
  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Optional: open DevTools for debugging
  // win.webContents.openDevTools({ mode: 'detach' });

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

    return {
      name: player.displayname ?? requestedName,
      level: stars,
      ws,
      fkdr: +(fk / Math.max(1, fd)).toFixed(2),
      wlr: +(wins / Math.max(1, losses)).toFixed(2),
      bblr: +bblr.toFixed(2),
      fk,
      wins,
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
