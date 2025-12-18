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

let globalIgn: string | null = null;

// App version
let activeSession = false;

// Main window reference
let win: BrowserWindow | null = null;


// ==========================================
// Auto Update Setup
// ==========================================

function initAutoUpdate() {
  if (!app.isPackaged) {
    console.log('[AutoUpdate] Skipping - app is not packaged.');
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
    chat.on("partyInvite", (inviter: string, leader?: string) => {
      if (win) win.webContents.send("chat:partyInvite", { inviter, leader: leader ?? null });
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
      if (win) win.webContents.send('chat:userIgnMention', name);
    });
    chat.on('logPathChanged', (payload: { path: string; client?: string }) => {
      if (win) win.webContents.send('chat:logPathChanged', payload);
    });
    chat.on('error', (err) => console.error('ChatLogger error:', err));

    // Allow renderer to update username
    ipcMain.on('set:ign', (_e, username: string) => {
      globalIgn = username;
      if (chat) {
        chat.username = username;
      }
      console.log('[App] Updated username:', username);
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
ipcMain.handle('bedwars:stats', async (_e, ign: string, bypassCache: boolean = false) => {
  return await apiRouter.getStats(ign, bypassCache);
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

ipcMain.on("session:started", () => {
  console.log("[Session] Started");
  activeSession = true;
});

ipcMain.on("session:ended", () => {
  console.log("[Session] Ended");
  activeSession = false;
});

ipcMain.handle("get:ign", () => globalIgn);


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

let currentUser: any = null;
ipcMain.on("auth:setUser", (_e, user) => {
  currentUser = user;
});



// ==========================================
// Account Settings System 
// ==========================================

// GET settings
ipcMain.handle("settings:get", async (_e, uid: string) => {
  try {
    const res = await fetch(`${backendUrl}/api/cloud/getSettings/${uid}`);
    const json = await res.json();

    return {
      success: json.success,
      data: json.settings || null,
      updatedAt: json.settingsUpdated || null
    };
  } catch (err) {
    console.error("[Settings] GET failed:", err);
    return { success: true, data: null, source: "local" };
  }
});

// SAVE settings
ipcMain.handle("settings:save", async (_e, uid: string, settings: any) => {
  try {
    const res = await fetch(`${backendUrl}/api/cloud/saveSettings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, settings })
    });

    return await res.json();
  } catch (err) {
    console.error("[Settings] SAVE failed:", err);
    return { success: false, error: String(err) };
  }
});

// ==========================================
// Account Metrics System 
// ==========================================

function loadLocalMetrics() {
  return {
    memberSince: Date.now(),
    playersTracked: 0,
    sessionsCount: 0,
    totalLookups: 0
  };
}

// GET metrics
ipcMain.handle("metrics:get", async (_e, uid?: string) => {
  if (!uid) return { success: true, data: loadLocalMetrics(), source: "local" };

  try {
    const res = await fetch(`${backendUrl}/api/cloud/getMetrics/${uid}`);
    const json = await res.json();

    if (!json.success) throw new Error(json.error || "Backend error");

    return {
      success: true,
      source: "cloud",
      data: json.metrics || loadLocalMetrics(),
      updatedAt: json.updatedAt
    };
  } catch (err) {
    console.error("[Metrics] GET failed:", err);
    return { success: true, data: loadLocalMetrics(), source: "local", fallback: true };
  }
});

// SAVE metrics
ipcMain.handle("metrics:update", async (_e, uid: string, metrics: any) => {
  try {
    const res = await fetch(`${backendUrl}/api/cloud/saveMetrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, metrics })
    });

    return await res.json();
  } catch (err) {
    console.error("[Metrics] SAVE failed:", err);
    return { success: false, error: String(err) };
  }
});

/* ----------------------------------------------------
   Helper: Local Sessions
----------------------------------------------------- */

const backendUrl = process.env.NEBULA_BACKEND_URL || "https://nebula-overlay.online";

function getSessionsFilePath() {
  return path.join(app.getPath("userData"), "sessions.json");
}

function saveLocalSession(session: any) {
  const filePath = getSessionsFilePath();

  // Ensure upload flag exists
  const sessionWithFlag = {
    ...session,
    upload: false, 
  };

  let existing: any[] = [];

  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch (err) {
      console.error("[Sessions] Failed to parse existing JSON, resetting:", err);
      existing = [];
    }
  }

  existing.push(sessionWithFlag);

  try {
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf8");
    console.log("[Sessions] Saved locally:", session.ign);
  } catch (err) {
    console.error("[Sessions] Failed to write local sessions:", err);
  }
}

function loadLocalSessions() {
  const filePath = getSessionsFilePath();
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[Sessions] Failed to load local sessions:", err);
    return [];
  }
}


/* ----------------------------------------------------
   Session History System 
----------------------------------------------------- */

// SAVE SESSION (local only)
ipcMain.handle("sessions:save", async (_e, session: any) => {

  try {
    saveLocalSession(session);
  } catch (err) {
    console.error("[Sessions] Local save failed:", err);
    return { success: false, location: "local", error: String(err) };
  }

  // Cloud upload intentionally disabled for now
  // return { success: true, location: "cloud" };

  return { success: true, location: "local" };
});

  // GET SESSIONS (local only)
  ipcMain.handle("sessions:get", async () => {
    const local = loadLocalSessions();
    return { success: true, source: "local", data: local };
  });


// ==========================================
// Plus System
// ==========================================

// Plus subscription check via Firebase
ipcMain.handle("plus:checkStatus", async (_e, uid: string) => {
  if (!uid) return { isPlus: false, error: "Missing UID" };

  try {
    const backendUrl = process.env.NEBULA_BACKEND_URL || "https://nebula-overlay.online";

    const res = await fetch(`${backendUrl}/api/plus/check-status/${uid}`);
    const data = await res.json();

    if (!data.success) {
      return { isPlus: false, error: data.error || "Unknown backend error" };
    }

    // Backend liefert:
    // {
    //   success: true,
    //   plus: true,
    //   plusData: { plan, status, expiresAt, stripeCustomerId }
    // }

    if (!data.plus) {
      return { isPlus: false };
    }

    const expires = data.plusData?.expiresAt?._seconds
      ? data.plusData.expiresAt._seconds * 1000
      : null;

    return {
      isPlus: true,
      type: "paid",
      plan: data.plusData?.plan || "unknown",
      status: data.plusData?.status || "active",
      expiresAt: expires
    };
  } catch (err) {
    console.error("[Plus] Status check failed:", err);
    return { isPlus: false, error: String(err) };
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
