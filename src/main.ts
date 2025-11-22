import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path'; 
import * as fs from 'fs';
import fetch from 'node-fetch';
import 'dotenv/config';
import { MinecraftChatLogger } from './logs/chat-logger';
import { HypixelApiRouter } from './logs/hypixelApiRouter';

// Bootstrap logging and error handling
console.log("[Nebula:boot] main.ts top reached");
process.on("uncaughtException", (err) => { console.error("[Nebula:uncaughtException]", err); });
process.on("unhandledRejection", (reason) => { console.error("[Nebula:unhandledRejection]", reason); });

// Backend URL configuration
const backendBaseUrl = process.env.NEBULA_BACKEND_URL || "https://nebula-overlay.online";

// Hypixel API Key
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';


// App version
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version;

// Main window reference
let win: BrowserWindow | null = null;


// ==========================================
// Auto Update Setup
// ==========================================

function initAutoUpdate() {
  if (!app.isPackaged) {
    console.log('[AutoUpdate] Skipping – app is not packaged.');
    return;
  }

  try {
    autoUpdater.logger = console as any;
    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdate] Checking for update...');
      win?.webContents.send('update:status', 'checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdate] Update available:', info);
      win?.webContents.send('update:available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdate] No update available:', info);
      win?.webContents.send('update:none', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdate] Error:', err);
      win?.webContents.send('update:error', err ? (err.message || String(err)) : 'unknown');
    });

    autoUpdater.on('download-progress', (prog) => {
      console.log('[AutoUpdate] Download progress:', prog);
      win?.webContents.send('update:progress', prog);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdate] Update downloaded:', info);
      win?.webContents.send('update:ready', info);
    });

    console.log('[AutoUpdate] Calling checkForUpdates()...');
    autoUpdater.checkForUpdates().catch(e => console.warn('AutoUpdate check failed:', e));

    autoUpdater.on("update-downloaded", async () => {
    if (win) { win.webContents.session.clearCache().then(() => { autoUpdater.quitAndInstall(); });
    } else { autoUpdater.quitAndInstall(); }
    });

  } catch (e) {
    console.warn('AutoUpdate init failed:', e);
  }
}


// ==========================================
// Create Main Window
// ==========================================

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


// ==========================================
// Initialize enhanced API Router
// ==========================================

const apiRouter = new HypixelApiRouter({
  backendUrl: backendBaseUrl,
  userApiKey: HYPIXEL_KEY,
  useFallbackKey: true,
  cacheTimeout: 5 * 60 * 1000
});

// --- IPC: Bedwars Stats Fetch (Enhanced with safe fallback)
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  return await apiRouter.getStats(name);
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


// ==========================================
// Discord OAuth2 Authentication
// ==========================================

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


// ==========================================
// Initialize Firebase in main process
// ==========================================

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

// Firebase Cloud Sync Handlers
ipcMain.handle('firebase:upload', async (_e, userId: string, settings: any) => {
  if (!await initFirebaseMain()) {
    return { error: 'Firebase not initialized' };
  }

  try {
    const { doc, setDoc, getDoc, serverTimestamp, Timestamp } = require('firebase/firestore');

    const userDocRef = doc(firestore, 'users', userId);
    const snap = await getDoc(userDocRef);
    
    console.log(appVersion);
    await setDoc(
      userDocRef,
      {
        settings,
        updatedAt: serverTimestamp(),
        version: appVersion
      },
      { merge: true }
    );

    if (!snap.exists() || !snap.data().plus) {
      const defaultPlus = {
        plan: "none",
        status: "inactive",
        expiresAt: Timestamp.now(), 
        stripeCustomerId: null
      };

      await setDoc(
        userDocRef,
        { plus: defaultPlus },
        { merge: true }
      );
      console.log(`[Firebase] Added missing plus field with timestamp for user ${userId}`);
    }

    return { success: true };
  } catch (error) {
    console.error('[Firebase Main] Upload failed:', error);
    return { error: String(error) };
  }
});

// Download user settings from Firebase
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
