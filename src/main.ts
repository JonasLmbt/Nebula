import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';

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

app.whenReady().then(createWindow);

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


// --- API: Name → UUID
async function uuidFor(name: string): Promise<string | null> {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data?.id ?? null; // undashed UUID
}

// --- API: Hypixel Player
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';

async function hypixelPlayer(uuid: string): Promise<any> {
  const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
    headers: { 'API-Key': HYPIXEL_KEY },
  });
  if (!res.ok) throw new Error(`Hypixel API: ${res.status}`);
  const data = (await res.json()) as { player?: any };
  return data.player;
}

// --- IPC: Bedwars Stats Fetch
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  if (!HYPIXEL_KEY) return { error: 'Missing HYPIXEL_KEY in environment.' };

  try {
    const uuid = await uuidFor(name);
    if (!uuid) return { error: 'UUID not found.' };

    const player = await hypixelPlayer(uuid);
    if (!player) return { error: 'Player not found on Hypixel.' };

    const bw = player.stats?.Bedwars || {};
    const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
    const fk = bw.final_kills_bedwars ?? 0;
    const fd = bw.final_deaths_bedwars ?? 0;
    const wins = bw.wins_bedwars ?? 0;
    const losses = bw.losses_bedwars ?? 0;
    const ws = bw.winstreak ?? 0;
    const bblr = (bw.beds_broken_bedwars ?? 0) / Math.max(1, bw.beds_lost_bedwars ?? 1);

    return {
      name: player.displayname ?? name,
      level: stars,
      ws,
      fkdr: +(fk / Math.max(1, fd)).toFixed(2),
      wlr: +(wins / Math.max(1, losses)).toFixed(2),
      bblr: +bblr.toFixed(2),
      fk,
      wins,
    };
  } catch (err: any) {
    return { error: String(err.message || err) };
  }
});
