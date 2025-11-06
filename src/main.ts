import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';


function createWindow() {
  const win = new BrowserWindow({
    width: 420, height: 340,
    transparent: true, frame: false, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Optional: F8 toggelt Click-Through (Overlay lässt Maus durch)
  let passThrough = false;
  globalShortcut.register('F8', () => {
    passThrough = !passThrough;
    win.setIgnoreMouseEvents(passThrough, { forward: true });
  });
}

app.whenReady().then(createWindow);

// --- API: Name -> UUID
async function uuidFor(name: string) {
  const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.id ?? null; // undashed
}

// --- API: Hypixel-Player
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';
async function hypixelPlayer(uuid: string) {
  const r = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
    headers: { 'API-Key': HYPIXEL_KEY }
  });
  if (!r.ok) throw new Error(`Hypixel: ${r.status}`);
  const j = await r.json();
  return j.player;
}

// IPC: Stats abrufen
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  if (!HYPIXEL_KEY) return { error: 'Kein HYPIXEL_KEY in .env gesetzt.' };
  const uuid = await uuidFor(name);
  if (!uuid) return { error: 'UUID nicht gefunden.' };
  const p = await hypixelPlayer(uuid);
  const bw = p?.stats?.Bedwars || {};
  const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
  const fk = bw.final_kills_bedwars ?? 0;
  const fd = bw.final_deaths_bedwars ?? 0;
  const w  = bw.wins_bedwars ?? 0;
  const l  = bw.losses_bedwars ?? 0;
  return {
    name: p?.displayname ?? name,
    stars,
    fkdr: +(fk / Math.max(1, fd)).toFixed(2),
    wlr: +(w / Math.max(1, l)).toFixed(2)
  };
});
