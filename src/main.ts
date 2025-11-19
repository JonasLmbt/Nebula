import { app, BrowserWindow, ipcMain, globalShortcut, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path'; 
import * as fs from 'fs';
import fetch from 'node-fetch';
import 'dotenv/config';
import { MinecraftChatLogger } from './logs/chat-logger';
import { normalizeHypixelBedwarsStats } from "./logs/hypixelNormalizer"; 

console.log("[Nebula:boot] main.ts top reached");
process.on("uncaughtException", (err) => {
  console.error("[Nebula:uncaughtException]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Nebula:unhandledRejection]", reason);
});

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version;

let win: BrowserWindow | null = null;
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';

function initAutoUpdate() {
  if (!app.isPackaged) {
    return;
  }
  try {
    autoUpdater.logger = console as any;
    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
      if (win) win.webContents.send('update:status', 'checking');
    });
    autoUpdater.on('update-available', (info) => {
      if (win) win.webContents.send('update:available', info);
    });
    autoUpdater.on('update-not-available', (info) => {
      if (win) win.webContents.send('update:none', info);
    });
    autoUpdater.on('error', (err) => {
      if (win) win.webContents.send('update:error', err ? (err.message || String(err)) : 'unknown');
    });
    autoUpdater.on('download-progress', (prog) => {
      if (win) win.webContents.send('update:progress', prog);
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (win) win.webContents.send('update:ready', info);
    });

    // Initial check
    autoUpdater.checkForUpdates().catch(e => console.warn('AutoUpdate check failed:', e));
  } catch (e) {
    console.warn('AutoUpdate init failed:', e);
  }
}

async function createWindow() {
  app.setName('Nebula');
  // On Windows, set an explicit AppUserModelID for proper taskbar grouping/notifications
  try { if (process.platform === 'win32') app.setAppUserModelId('Nebula'); } catch {}

  // Try to resolve an application icon (preferring .ico on Windows, then .png, then .svg)
  const resolveAsset = (file: string) => path.resolve(__dirname, '..', 'assets', file);
  const iconCandidates = process.platform === 'win32'
    ? ['nebula-logo.ico', 'nebula-logo.png', 'nebula-lettering.svg']
    : ['nebula-logo.png', 'nebula-lettering.svg', 'nebula-logo.ico'];
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
      preload: path.join(__dirname, 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setTitle('Nebula');
  
  // Clear cache before loading to ensure fresh content
  await win.webContents.session.clearCache();
  
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Optional: open DevTools for debugging
  //const shouldOpenDevTools = process.env.NEBULA_DEVTOOLS === '1' || process.env.NODE_ENV === 'development';
  //if (shouldOpenDevTools) {
  //  win.webContents.openDevTools({ mode: 'detach' });
  //}

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  initAutoUpdate();

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
    chat.on('partyInviteExpired', (player: string) => {
      if (win) win.webContents.send('chat:partyInviteExpired', player);
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
    chat.on('gameStart', () => {
      if (win) win.webContents.send('chat:gameStart');
    });
    chat.on('guildMembersUpdated', (players: string[]) => {
      if (win) win.webContents.send('chat:guildMembers', players);
    });
    chat.on('guildMemberLeft', (name: string) => {
      if (win) win.webContents.send('chat:guildMemberLeft', name);
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

    // Allow renderer to trigger install
    ipcMain.on('update:install', () => {
      try { autoUpdater.quitAndInstall(); } catch (e) { console.warn('Failed to quitAndInstall:', e); }
    });
    ipcMain.on('update:check', () => {
      try { autoUpdater.checkForUpdates().catch(e => console.warn('Manual update check failed:', e)); } catch {}
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

// Hypixel Cache & Rate Limiter
class HypixelCache {
  private cache = new Map<string, {
    data: any;
    timestamp: number;
  }>();
  private uuidCache = new Map<string, string>();
  private guildCache = new Map<string, { data: any; timestamp: number }>();
  private queue = new Set<string>();
  private readonly TTL = 10 * 60 * 1000; // 10 minutes cache TTL
  private readonly MAX_CONCURRENT = 3; // Max. parallele Requests

  constructor(private apiKey: string) {}

  private async getUUID(name: string): Promise<string> {
    const cached = this.uuidCache.get(name.toLowerCase());
    if (cached) return cached;

    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('UUID not found');
    
    const data = await res.json() as { id?: string };
    const uuid = data?.id;
  if (!uuid) throw new Error('Invalid UUID response');

    this.uuidCache.set(name.toLowerCase(), uuid);
    return uuid;
  }

  private async fetchHypixelStats(uuid: string) {
    const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
      headers: { 'API-Key': this.apiKey },
    });
    
    if (!res.ok) {
      if (res.status === 429) {
  throw new Error('Hypixel rate limit reached - please wait');
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
  if (res.status === 429) throw new Error('Hypixel rate limit (guild)');
  return null; // no guild found or other error
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
    return normalizeHypixelBedwarsStats(player, requestedName, guild);
  }

  async getStats(name: string) {
    const normalizedName = name.toLowerCase();
    
  // 1. Check cache first
    const cached = this.cache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

  // 2. Queue management (max. 3 concurrent requests)
    while (this.queue.size >= this.MAX_CONCURRENT) {
      await new Promise(r => setTimeout(r, 100));
    }
    
  // 3. Perform request
    try {
      this.queue.add(normalizedName);

  // Small delay between requests to avoid burst hitting the API
      if (this.queue.size > 1) {
        await new Promise(r => setTimeout(r, 150));
      }

      let uuid: string | null = null;
      try {
        uuid = await this.getUUID(name);
      } catch (e) {
  // Name not found on Mojang -> treat as possible nick
        return { name, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
      }
  const player = await this.fetchHypixelStats(uuid);
  if (!player) throw new Error('Player not found on Hypixel');
  const guild = await this.fetchGuild(uuid);
  const stats = await this.processBedwarsStats(player, name, guild);
  // Add UUID for renderer / avatar (Crafatar requires plain UUID without dashes)
  if (uuid) {
    try { (stats as any).uuid = uuid.replace(/-/g, ''); } catch { /* ignore */ }
  }
      
  // Cache successful request
      this.cache.set(normalizedName, {
        data: stats,
        timestamp: Date.now()
      });

      return stats;

    } catch (err: any) {
  // Rate limit or other API errors
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
const hypixel = new HypixelCache(HYPIXEL_KEY);

// --- IPC: Bedwars Stats Fetch (Enhanced with safe fallback)
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  // Try enhanced API system first
  try {
    return await apiRouter.getStats(name);
  } catch (error) {
    console.log('[API] Enhanced system failed, using original:', error);
    
    // Fallback to original system
    if (!HYPIXEL_KEY) {
      return { error: 'HYPIXEL_KEY missing in environment. Please check .env.' };
    }
    return hypixel.getStats(name);
  }
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

// --- Discord OAuth2 Authentication ---
// Open Discord OAuth2 URL in browser

ipcMain.handle("auth:discord:login", async () => {
  return new Promise((resolve) => {
    if (!win) return resolve({ error: "Main window missing" });

    const authWindow = new BrowserWindow({
      width: 550,
      height: 750,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Login with Discord",
      modal: true,
      parent: win,
      backgroundColor: "#1a1a1a",  // dark mode
      show: true,
      autoHideMenuBar: true,        // removes File/Edit/View menu
      webPreferences: {
        session: win.webContents.session,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const loginUrl = "https://nebula-overlay.online/api/auth/discord/login";
    authWindow.loadURL(loginUrl);

    // Redirect handler
    const finish = () => {
      if (!authWindow.isDestroyed()) authWindow.close();
      resolve({ success: true });
    };

    const checkUrl = (url: string) => {
      if (url.includes("login=success")) finish();
    };

    authWindow.webContents.on("will-redirect", (_e, url) => checkUrl(url));
    authWindow.webContents.on("did-navigate", (_e, url) => checkUrl(url));
  });
});


ipcMain.handle("auth:discord:getUser", async () => {
  try {
    const res = await fetch("https://nebula-overlay.online/api/auth/me", {
      credentials: "include"
    });

    const data = await res.json();
    return data;

  } catch (err) {
    console.error("[Electron] getUser failed:", err);
    return { error: String(err) };
  }
});

ipcMain.handle("auth:logout", async () => {
  try {
    const res = await fetch("https://nebula-overlay.online/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });

    return res.json();
  } catch (err) {
    console.error("[Electron] logout failed:", err);
    return { error: String(err) };
  }
});



// Get Firebase configuration for renderer process
ipcMain.handle('firebase:getConfig', async () => {
  return {
    apiKey: 'AIzaSyCh8Ah529cfSTd56xoM2YASY6UvTGMEi-I',
    authDomain: 'nebula-502f4.firebaseapp.com',
    projectId: 'nebula-502f4',
    storageBucket: 'nebula-502f4.firebasestorage.app',
    messagingSenderId: '228435926597',
    appId: '1:228435926597:web:6a36ab3dc7040494ec0d2c'
  };
});

// Initialize Firebase in main process
let firebaseApp: any = null;
let firestore: any = null;

async function initFirebaseMain() {
  if (firebaseApp) return true; // Already initialized
  
  try {
    const { initializeApp } = require('firebase/app');
    const { getFirestore, doc, setDoc, getDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
    
    const firebaseConfig = {
      apiKey: 'AIzaSyCh8Ah529cfSTd56xoM2YASY6UvTGMEi-I',
      authDomain: 'nebula-502f4.firebaseapp.com',
      projectId: 'nebula-502f4',
      storageBucket: 'nebula-502f4.firebasestorage.app',
      messagingSenderId: '228435926597',
      appId: '1:228435926597:web:6a36ab3dc7040494ec0d2c'
    };
    
    if (!firebaseConfig.apiKey) {
      console.error('[Firebase Main] No API key found');
      return false;
    }
    
    firebaseApp = initializeApp(firebaseConfig);
    firestore = getFirestore(firebaseApp);
    
    console.log('[Firebase Main] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[Firebase Main] Initialization failed:', error);
    return false;
  }
}

// Firebase Cloud Sync Handlers
ipcMain.handle('firebase:upload', async (_e, userId: string, settings: any) => {
  if (!await initFirebaseMain()) {
    return { error: 'Firebase not initialized' };
  }
  
  try {
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    
    const userDocRef = doc(firestore, 'users', userId);
    await setDoc(
      userDocRef,
      {
        settings,
        updatedAt: serverTimestamp(),
        version: appVersion
      },
      { merge: true }
    );
        
    console.log('[Firebase Main] Settings uploaded for user:', userId);
    return { success: true };
  } catch (error) {
    console.error('[Firebase Main] Upload failed:', error);
    return { error: String(error) };
  }
});

ipcMain.handle('firebase:download', async (_e, userId: string) => {
  if (!await initFirebaseMain()) {
    return { error: 'Firebase not initialized' };
  }
  
  try {
    const { doc, getDoc } = require('firebase/firestore');
    
    const userDocRef = doc(firestore, 'users', userId);
    const docSnap = await getDoc(userDocRef);
    
    if (!docSnap.exists()) {
      return { success: true, data: null };
    }
    
    const data = docSnap.data();
    let timestamp = 0;
    if (data.updatedAt) {
      if (typeof data.updatedAt.toMillis === "function") {
        timestamp = data.updatedAt.toMillis();
      } else if (typeof data.updatedAt === "number") {
        timestamp = data.updatedAt;
      }
    }
    
    console.log('[Firebase Main] Settings downloaded for user:', userId);
    return { 
      success: true, 
      data: data.settings,
      timestamp: timestamp
    };
  } catch (error) {
    console.error('[Firebase Main] Download failed:', error);
    return { error: String(error) };
  }
});

// ==========================================
// Account Metrics System
// ==========================================

// Get account metrics (cloud + local merge)
ipcMain.handle('metrics:get', async (_e, userId?: string) => {
  const localMetrics = {
    memberSince: Date.now(), // fallback
    playersTracked: 0,
    sessionsCount: 0,
    totalLookups: 0
  };

  if (!userId || !await initFirebaseMain()) {
    return { success: true, data: localMetrics, source: 'local' };
  }

  try {
    const { doc, getDoc } = require('firebase/firestore');
    
    const metricsDocRef = doc(firestore, 'metrics', userId);
    const docSnap = await getDoc(metricsDocRef);
    
    if (!docSnap.exists()) {
      return { success: true, data: localMetrics, source: 'local' };
    }

    const cloudData = docSnap.data();
    const mergedData = {
      memberSince: cloudData.memberSince || localMetrics.memberSince,
      playersTracked: Math.max(cloudData.playersTracked || 0, localMetrics.playersTracked),
      sessionsCount: Math.max(cloudData.sessionsCount || 0, localMetrics.sessionsCount),
      totalLookups: Math.max(cloudData.totalLookups || 0, localMetrics.totalLookups)
    };

    return { success: true, data: mergedData, source: 'cloud', timestamp: cloudData.updatedAt?.toMillis() || 0 };
  } catch (error) {
    console.error('[Metrics] Get failed:', error);
    return { success: true, data: localMetrics, source: 'local', error: String(error) };
  }
});

// Update account metrics in cloud
ipcMain.handle('metrics:update', async (_e, userId: string, metrics: any) => {
  if (!userId || !await initFirebaseMain()) {
    return { error: 'Firebase not available or no user ID' };
  }

  try {
    const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
    
    const metricsDocRef = doc(firestore, 'metrics', userId);
    await setDoc(metricsDocRef, {
      memberSince: metrics.memberSince,
      playersTracked: metrics.playersTracked,
      sessionsCount: metrics.sessionsCount,
      totalLookups: metrics.totalLookups,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('[Metrics] Updated in cloud for user:', userId);
    return { success: true };
  } catch (error) {
    console.error('[Metrics] Update failed:', error);
    return { error: String(error) };
  }
});

// Get current Discord user ID (for metrics)
ipcMain.handle('metrics:getUserId', async () => {
  // We don't store user state globally, return null for now
  // The renderer will manage user ID via Discord login flow
  return null;
});

// ==========================================
// Plus System
// ==========================================

// Plus subscription check via Firebase
ipcMain.handle('plus:checkStatus', async (_e, userId: string) => {
  if (!await initFirebaseMain()) {
    return { isPlus: false, error: 'Firebase not initialized' };
  }
  
  try {
    const { doc, getDoc } = require('firebase/firestore');
    
    const userDocRef = doc(firestore, 'users', userId);
    const docSnap = await getDoc(userDocRef);
    
    if (!docSnap.exists()) {
      // kein User-Dokument -> kein Plus
      return { isPlus: false };
    }

    const data = docSnap.data();
    const plus = data.plus;

    // kein plus-Feld oder keine expiresAt -> kein Plus
    if (!plus || !plus.expiresAt) {
      return { isPlus: false };
    }

    const expiresAtMs = plus.expiresAt.toMillis();
    const now = Date.now();

    if (expiresAtMs > now && (plus.status || 'active') === 'active') {
      // aktives Plus
      return {
        isPlus: true,
        type: 'paid',
        expiresAt: expiresAtMs,
        plan: plus.plan || 'plus',
        status: plus.status || 'active',
      };
    }

    // abgelaufen oder nicht active
    return { isPlus: false };
  } catch (error) {
    console.error('[Plus] Status check failed:', error);
    return { isPlus: false, error: String(error) };
  }
});

const backendBaseUrl = process.env.NEBULA_BACKEND_URL || "https://nebula-overlay.online";

// Create Stripe checkout session via backend API
ipcMain.handle("plus:createCheckout", async (_e, options) => {
  if (!win) return { error: "Main window missing" };

  const plan = options?.plan ?? "monthly";

  const postUrl = `${backendBaseUrl}/api/plus/create-checkout-session`;

  const checkoutWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    title: "Nebula Plus Checkout",
    autoHideMenuBar: true,
    webPreferences: {
      session: win.webContents.session,
    },
  });

  const html = `
    <html>
      <body>
        <form id="f" method="POST" action="${postUrl}?plan=${plan}">
        </form>
        <script>
          document.getElementById("f").submit();
        </script>
      </body>
    </html>
  `;

  checkoutWindow.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);

  return { success: true };
});

// Open Stripe Customer Portal for subscription management
ipcMain.handle("plus:manageSubscription", async (_e, userId: string) => {
  if (!win) return { error: "Main window missing" };
  if (!userId) return { error: "UserId missing" };

  const postUrl = `${backendBaseUrl}/api/plus/create-portal-session"`;

  // Create popup window for the portal
  const portalWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    title: "Manage Subscription",
    autoHideMenuBar: true,
    webPreferences: {
      session: win.webContents.session, 
    },
  });

  // Auto-submit POST form to backend (identical to createCheckout)
  const html = `
    <html>
      <body>
        <form id="f" method="POST" action="${postUrl}">
          <input type="hidden" name="userId" value="${userId}" />
        </form>
        <script>
          document.getElementById("f").submit();
        </script>
      </body>
    </html>
  `;

  portalWindow.loadURL(
    `data:text/html;base64,${Buffer.from(html).toString("base64")}`
  );

  return { success: true };
});



// --- Enhanced API System with 3-tier Backend Support ---
interface ApiResponse {
  success: boolean;
  player?: any;
  guild?: any;
  cache_player?: number;
  error?: string;
}

interface ApiRouterConfig {
  backendUrl?: string;
  userApiKey?: string;
  useFallbackKey: boolean;
  cacheTimeout: number;
}

class HypixelApiRouter {
  private config: ApiRouterConfig;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private uuidCache = new Map<string, { uuid: string | null; timestamp: number }>();
  private queue = new Set<string>();
  
  // Status tracking
  private backendDown = false;
  private backendThrottled = false;
  private userKeyValid = true;
  private hypixelApiDown = false;
  
  // Rate limiting
  private lastBackendRequest = 0;
  private lastHypixelRequest = 0;
  private readonly MIN_REQUEST_INTERVAL = 150; // 150ms between requests
  private readonly MAX_CONCURRENT = 3;

  constructor(config: ApiRouterConfig) {
    this.config = {
      userApiKey: HYPIXEL_KEY,
      useFallbackKey: true,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
    };
    
    // Merge with provided config
    Object.assign(this.config, config);
    
    this.validateConfig();
    if (this.config.backendUrl) {
      this.pingBackend(); // Initial backend health check
    }
  }

  private validateConfig() {
    if (!this.config.backendUrl && !this.config.userApiKey) {
      console.warn('[API] No backend URL or user API key configured - stats will be unavailable');
    }
  }

  private async pingBackend(): Promise<boolean> {
    if (!this.config.backendUrl) return false;
    
    try {
      const response = await fetch(`${this.config.backendUrl}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Nebula-Overlay/1.0' }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.backendDown = false;
        
  // Backend can override cache timeout
        if (data.cache_player) {
          this.config.cacheTimeout = data.cache_player;
        }
        
        console.log('[API] Backend connection successful');
        return true;
      }
      
      if (response.status === 403) {
        console.log('[API] Backend access denied - using developer mode');
        this.backendDown = true;
        return false;
      }
      
    } catch (error) {
      this.backendDown = true;
      console.log('[API] Backend unavailable, using fallback:', error);
    }
    
    return false;
  }

  // Use the existing HypixelCache system for now
  async getStats(name: string): Promise<any> {
    const normalizedName = name.toLowerCase();
    // 0. Cache
    const cached = this.cache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < (this.config.cacheTimeout || 5 * 60 * 1000)) {
      console.log('[API] Returning cached stats for', cached.data);
      return cached.data;
    }

    // 1. .env-Key (HYPIXEL_KEY)
    if (HYPIXEL_KEY && HYPIXEL_KEY.trim().length > 0) {
      try {
        const result = await hypixel.getStats(name);
        if (!result?.error) {
          this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
          console.log('[API] Returning stats using .env HYPIXEL_KEY for', result);
          return result;
        }
      } catch (e) { /* ignore, try next */ }
    }

    // 2. User-Key (falls in config.userApiKey, nicht .env)
    if (this.config.userApiKey && this.config.userApiKey.trim().length > 0 && this.config.userApiKey !== HYPIXEL_KEY) {
      try {
        const userHypixel = new HypixelCache(this.config.userApiKey);
        const result = await userHypixel.getStats(name);
        if (!result?.error) {
          this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
          console.log('[API] Returning stats using user API key for', result);
          return result;
        }
      } catch (e) { /* ignore, try next */ }
    }

    // 3. Backend
    try {
      const backendUrl = `https://nebula-overlay.online/api/player?name=${encodeURIComponent(name)}`;
      const res = await fetch(backendUrl);
      if (!res.ok) throw new Error('Backend not available');
      const data = await res.json();

      // Backend returns raw Hypixel response: { success, player, ... }
      const player = data && data.player ? data.player : data;

      // No guild info from backend (yet), so we pass null
      const result = normalizeHypixelBedwarsStats(player, name, null);

      this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
      console.log('[API] Returning stats using backend for', result);
      return result;
    } catch (e: any) {
      return { error: 'All API sources failed: ' + (e && e.message ? e.message : String(e)) };
    }
  }

  // Public methods for status and configuration
  getStatus() {
    return {
      backendAvailable: !this.backendDown,
      backendThrottled: this.backendThrottled,
      userKeyValid: this.userKeyValid,
      hypixelApiDown: this.hypixelApiDown,
      cacheSize: this.cache.size,
      uuidCacheSize: this.uuidCache.size,
      config: {
        hasBackend: !!this.config.backendUrl,
        hasUserKey: !!this.config.userApiKey,
        useFallback: this.config.useFallbackKey
      }
    };
  }

  updateConfig(newConfig: Partial<ApiRouterConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.backendUrl || newConfig.userApiKey) {
      this.validateConfig();
      if (this.config.backendUrl) {
        this.pingBackend();
      }
    }
  }

  clearCache() {
    this.cache.clear();
    this.uuidCache.clear();
    try { (hypixel as any)?.clearCache?.(); } catch {}
  }

  async verifyUserApiKey(apiKey: string): Promise<{ valid: boolean, error?: string }> {
    if (!apiKey) return { valid: false, error: 'No API key provided' };
    
    try {
      const response = await fetch('https://api.hypixel.net/punishmentStats', {
        headers: { 'API-Key': apiKey },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const isValid = data.success === true;
        this.userKeyValid = isValid;
        return { valid: isValid, error: isValid ? undefined : 'API returned invalid response' };
      } else if (response.status === 403) {
        this.userKeyValid = false;
        return { valid: false, error: 'Invalid API key (403 Forbidden)' };
      } else if (response.status === 429) {
        this.userKeyValid = false;
        return { valid: false, error: 'Rate limited (too many requests)' };
      } else {
        this.userKeyValid = false;
        return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      this.userKeyValid = false;
      if (error.name === 'TimeoutError') {
        return { valid: false, error: 'Request timed out (check your internet connection)' };
      } else if (error.message?.includes('fetch')) {
        return { valid: false, error: 'Network error (check your internet connection)' };
      }
      return { valid: false, error: error.message || 'Unknown error occurred' };
    }
  }
}

// Initialize enhanced API Router
const apiRouter = new HypixelApiRouter({
  userApiKey: HYPIXEL_KEY,
  useFallbackKey: true,
  cacheTimeout: 5 * 60 * 1000
});

// --- IPC: Enhanced API Management ---
ipcMain.handle('api:getStatus', async () => {
  return apiRouter.getStatus();
});

ipcMain.handle('api:setUserKey', async (_e, apiKey: string) => {
  const result = await apiRouter.verifyUserApiKey(apiKey);
  if (result.valid) {
    apiRouter.updateConfig({ userApiKey: apiKey });
    return { success: true };
  }
  return { success: false, error: result.error || 'Invalid API key' };
});

ipcMain.handle('api:clearCache', async () => {
  apiRouter.clearCache();
  return { success: true };
});

ipcMain.handle('api:toggleFallback', async (_e, enabled: boolean) => {
  apiRouter.updateConfig({ useFallbackKey: enabled });
  return { success: true, enabled };
});

// --- IPC: External URL opener
ipcMain.handle('external:open', async (_e, url: string) => {
  try {
    const { shell } = await import('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('[External] Failed to open URL:', error);
    return { error: String(error) };
  }
});
