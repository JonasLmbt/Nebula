"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Auto-Update (only active when packaged)
const electron_updater_1 = require("electron-updater");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
require("dotenv/config");
const chat_logger_1 = require("./chat-logger");
const hypixelNormalizer_1 = require("./hypixelNormalizer");
let nicksWin = null;
let win = null;
function initAutoUpdate() {
    // Skip in dev/unpackaged mode
    if (!electron_1.app.isPackaged) {
        return;
    }
    try {
        electron_updater_1.autoUpdater.logger = console;
        electron_updater_1.autoUpdater.autoDownload = true;
        electron_updater_1.autoUpdater.on('checking-for-update', () => {
            if (win)
                win.webContents.send('update:status', 'checking');
        });
        electron_updater_1.autoUpdater.on('update-available', (info) => {
            if (win)
                win.webContents.send('update:available', info);
        });
        electron_updater_1.autoUpdater.on('update-not-available', (info) => {
            if (win)
                win.webContents.send('update:none', info);
        });
        electron_updater_1.autoUpdater.on('error', (err) => {
            if (win)
                win.webContents.send('update:error', err ? (err.message || String(err)) : 'unknown');
        });
        electron_updater_1.autoUpdater.on('download-progress', (prog) => {
            if (win)
                win.webContents.send('update:progress', prog);
        });
        electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
            if (win)
                win.webContents.send('update:ready', info);
        });
        // Initial check
        electron_updater_1.autoUpdater.checkForUpdates().catch(e => console.warn('AutoUpdate check failed:', e));
    }
    catch (e) {
        console.warn('AutoUpdate init failed:', e);
    }
}
async function createWindow() {
    electron_1.app.setName('Nebula');
    // On Windows, set an explicit AppUserModelID for proper taskbar grouping/notifications
    try {
        if (process.platform === 'win32')
            electron_1.app.setAppUserModelId('Nebula');
    }
    catch { }
    // Try to resolve an application icon (preferring .ico on Windows, then .png, then .svg)
    const resolveAsset = (file) => path.resolve(__dirname, '..', 'assets', file);
    const iconCandidates = process.platform === 'win32'
        ? ['nebula-logo.ico', 'nebula-logo.png', 'nebula-lettering.svg']
        : ['nebula-logo.png', 'nebula-lettering.svg', 'nebula-logo.ico'];
    let iconPath;
    for (const f of iconCandidates) {
        const p = resolveAsset(f);
        if (fs.existsSync(p)) {
            iconPath = p;
            break;
        }
    }
    win = new electron_1.BrowserWindow({
        width: 860,
        height: 560,
        transparent: true,
        frame: false, // we use a custom title bar
        resizable: true, // allow resizing (with custom grips)
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
electron_1.app.whenReady().then(() => {
    createWindow();
    initAutoUpdate();
    // Start chat logger to detect local Minecraft chat and forward player lists to renderer
    try {
        let chat = new chat_logger_1.MinecraftChatLogger();
        chat.on('playersUpdated', (players) => {
            if (win)
                win.webContents.send('chat:players', players);
        });
        chat.on('partyUpdated', (members) => {
            if (win)
                win.webContents.send('chat:party', members);
        });
        chat.on('partyInvite', (inviter) => {
            if (win)
                win.webContents.send('chat:partyInvite', inviter);
        });
        chat.on('partyInviteExpired', (player) => {
            if (win)
                win.webContents.send('chat:partyInviteExpired', player);
        });
        chat.on('partyCleared', () => {
            if (win)
                win.webContents.send('chat:partyCleared');
        });
        chat.on('finalKill', (name) => {
            if (win)
                win.webContents.send('chat:finalKill', name);
        });
        chat.on('message', (payload) => {
            if (win)
                win.webContents.send('chat:message', payload);
        });
        chat.on('serverChange', () => {
            if (win)
                win.webContents.send('chat:serverChange');
        });
        chat.on('lobbyJoined', () => {
            if (win)
                win.webContents.send('chat:lobbyJoined');
        });
        chat.on('gameStart', () => {
            if (win)
                win.webContents.send('chat:gameStart');
        });
        chat.on('guildMembersUpdated', (players) => {
            if (win)
                win.webContents.send('chat:guildMembers', players);
        });
        chat.on('guildMemberLeft', (name) => {
            if (win)
                win.webContents.send('chat:guildMemberLeft', name);
        });
        chat.on('usernameMention', (name) => {
            if (win)
                win.webContents.send('chat:usernameMention', name);
        });
        chat.on('logPathChanged', (payload) => {
            if (win)
                win.webContents.send('chat:logPathChanged', payload);
        });
        chat.on('error', (err) => console.error('ChatLogger error:', err));
        // Allow renderer to update username
        electron_1.ipcMain.on('set:username', (_e, username) => {
            if (chat) {
                chat.username = username;
                console.log('Updated ChatLogger username:', username);
            }
        });
        electron_1.ipcMain.on('set:logPath', (_e, newPath) => {
            try {
                if (chat && typeof newPath === 'string' && newPath.trim().length) {
                    chat.switchLogPath(newPath.trim());
                    console.log('Switched ChatLogger log path:', newPath);
                }
            }
            catch (err) {
                console.error('Failed to switch log path', err);
            }
        });
        electron_1.ipcMain.on('set:client', (_e, client) => {
            try {
                if (chat && typeof client === 'string' && client.trim()) {
                    chat.setClient(client.trim());
                    console.log('Selected ChatLogger client:', client);
                }
            }
            catch (err) {
                console.error('Failed to set client', err);
            }
        });
        electron_1.ipcMain.handle('chat:autoDetect', () => {
            try {
                return chat.autoDetect();
            }
            catch {
                return undefined;
            }
        });
        // Allow renderer to trigger install
        electron_1.ipcMain.on('update:install', () => {
            try {
                electron_updater_1.autoUpdater.quitAndInstall();
            }
            catch (e) {
                console.warn('Failed to quitAndInstall:', e);
            }
        });
        electron_1.ipcMain.on('update:check', () => {
            try {
                electron_updater_1.autoUpdater.checkForUpdates().catch(e => console.warn('Manual update check failed:', e));
            }
            catch { }
        });
    }
    catch (e) {
        console.error('Failed to start ChatLogger', e);
    }
});
// Quit the app on all windows closed (Mac exception handled)
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (win === null)
        createWindow();
});
// Handle minimize and close from renderer
electron_1.ipcMain.on('window:minimize', () => {
    if (win)
        win.minimize();
});
electron_1.ipcMain.on('window:close', () => {
    electron_1.app.quit();
});
// --- Global Shortcuts
let clickThrough = false;
let registered = [];
function unregisterShortcuts() {
    try {
        electron_1.globalShortcut.unregisterAll();
    }
    catch { }
    registered = [];
}
function registerShortcuts(map) {
    unregisterShortcuts();
    const safeRegister = (accelerator, action, id) => {
        if (!accelerator)
            return;
        try {
            if (electron_1.globalShortcut.register(accelerator, action)) {
                registered.push({ action: id, accelerator });
            }
        }
        catch (e) {
            console.warn('Failed to register shortcut', accelerator, e);
        }
    };
    safeRegister(map.toggleOverlay, () => {
        if (!win)
            return;
        if (win.isVisible())
            win.hide();
        else
            win.show();
    }, 'toggleOverlay');
    safeRegister(map.refreshAll, () => {
        if (win)
            win.webContents.send('shortcut:refresh');
    }, 'refreshAll');
    safeRegister(map.clearAll, () => {
        if (win)
            win.webContents.send('shortcut:clear');
    }, 'clearAll');
    safeRegister(map.toggleClickThrough, () => {
        if (!win)
            return;
        clickThrough = !clickThrough;
        try {
            win.setIgnoreMouseEvents(clickThrough, { forward: true });
        }
        catch { }
    }, 'toggleClickThrough');
}
electron_1.ipcMain.handle('shortcuts:register', (_e, map) => {
    registerShortcuts(map || {});
});
electron_1.ipcMain.handle('window:resize', (_e, payload) => {
    const win = electron_1.BrowserWindow.getFocusedWindow();
    if (!win)
        return;
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
    nicksWin = new electron_1.BrowserWindow({
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
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.cache = new Map();
        this.uuidCache = new Map();
        this.guildCache = new Map();
        this.queue = new Set();
        this.TTL = 10 * 60 * 1000; // 10 minutes cache TTL
        this.MAX_CONCURRENT = 3; // Max. parallele Requests
    }
    async getUUID(name) {
        const cached = this.uuidCache.get(name.toLowerCase());
        if (cached)
            return cached;
        const res = await (0, node_fetch_1.default)(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
        if (!res.ok)
            throw new Error('UUID not found');
        const data = await res.json();
        const uuid = data?.id;
        if (!uuid)
            throw new Error('Invalid UUID response');
        this.uuidCache.set(name.toLowerCase(), uuid);
        return uuid;
    }
    async fetchHypixelStats(uuid) {
        const res = await (0, node_fetch_1.default)(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
            headers: { 'API-Key': this.apiKey },
        });
        if (!res.ok) {
            if (res.status === 429) {
                throw new Error('Hypixel rate limit reached - please wait');
            }
            throw new Error(`Hypixel API: ${res.status}`);
        }
        const data = await res.json();
        return data.player;
    }
    async fetchGuild(uuid) {
        const cached = this.guildCache.get(uuid);
        if (cached && Date.now() - cached.timestamp < this.TTL)
            return cached.data;
        try {
            const res = await (0, node_fetch_1.default)(`https://api.hypixel.net/v2/guild?player=${uuid}`, {
                headers: { 'API-Key': this.apiKey },
            });
            if (!res.ok) {
                if (res.status === 429)
                    throw new Error('Hypixel rate limit (guild)');
                return null; // no guild found or other error
            }
            const data = await res.json();
            const guild = data.guild || null;
            this.guildCache.set(uuid, { data: guild, timestamp: Date.now() });
            return guild;
        }
        catch {
            return null;
        }
    }
    async processBedwarsStats(player, requestedName, guild) {
        return (0, hypixelNormalizer_1.normalizeHypixelBedwarsStats)(player, requestedName, guild);
    }
    async getStats(name) {
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
            let uuid = null;
            try {
                uuid = await this.getUUID(name);
            }
            catch (e) {
                // Name not found on Mojang -> treat as possible nick
                return { name, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
            }
            const player = await this.fetchHypixelStats(uuid);
            if (!player)
                throw new Error('Player not found on Hypixel');
            const guild = await this.fetchGuild(uuid);
            const stats = await this.processBedwarsStats(player, name, guild);
            // Add UUID for renderer / avatar (Crafatar requires plain UUID without dashes)
            if (uuid) {
                try {
                    stats.uuid = uuid.replace(/-/g, '');
                }
                catch { /* ignore */ }
            }
            // Cache successful request
            this.cache.set(normalizedName, {
                data: stats,
                timestamp: Date.now()
            });
            return stats;
        }
        catch (err) {
            // Rate limit or other API errors
            return { error: String(err.message || err) };
        }
        finally {
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
// --- IPC: Bedwars Stats Fetch (Enhanced with safe fallback)
electron_1.ipcMain.handle('bedwars:stats', async (_e, name) => {
    // Try enhanced API system first
    try {
        return await apiRouter.getStats(name);
    }
    catch (error) {
        console.log('[API] Enhanced system failed, using original:', error);
        // Fallback to original system
        if (!process.env.HYPIXEL_KEY) {
            return { error: 'HYPIXEL_KEY missing in environment. Please check .env.' };
        }
        return hypixel.getStats(name);
    }
});
// --- IPC: Always-on-top toggle from renderer appearance settings
electron_1.ipcMain.handle('window:setAlwaysOnTop', (_e, flag) => {
    if (!win)
        return false;
    try {
        win.setAlwaysOnTop(!!flag);
        return win.isAlwaysOnTop();
    }
    catch {
        return false;
    }
});
// --- IPC: Set window bounds (for auto-resize)
electron_1.ipcMain.handle('window:setBounds', (_e, bounds) => {
    if (!win)
        return false;
    try {
        const current = win.getBounds();
        win.setBounds({
            x: bounds.x ?? current.x,
            y: bounds.y ?? current.y,
            width: bounds.width ?? current.width,
            height: bounds.height ?? current.height
        }, false);
        return true;
    }
    catch {
        return false;
    }
});
// --- Discord OAuth2 Authentication ---
// Note: Set DISCORD_CLIENT_ID in .env (Client Secret optional for desktop apps)
// Create your Discord app at: https://discord.com/developers/applications
// Important: Enable "Public Client" toggle in OAuth2 settings for desktop apps!
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''; // Optional for public clients
const DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/discord/callback'; // Your backend callback URL
// PKCE (Proof Key for Code Exchange) - required for Public Client apps
let currentCodeVerifier = null;
// Generate PKCE code_verifier and code_challenge
function generatePKCE() {
    // Generate random code_verifier (43-128 chars, base64url)
    const verifier = crypto.randomBytes(32).toString('base64url');
    // Create code_challenge (SHA256 hash of verifier, base64url encoded)
    const challenge = crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { code_verifier: verifier, code_challenge: challenge };
}
// Open Discord OAuth2 URL in browser
electron_1.ipcMain.handle('auth:discord:login', async () => {
    if (!DISCORD_CLIENT_ID) {
        return { error: 'Discord Client ID not configured. Please add DISCORD_CLIENT_ID to .env file.' };
    }
    // Generate PKCE parameters for this auth session
    const { code_verifier, code_challenge } = generatePKCE();
    currentCodeVerifier = code_verifier;
    console.log('[Discord] Generated PKCE challenge for auth session');
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify&code_challenge=${code_challenge}&code_challenge_method=S256`;
    try {
        await electron_1.shell.openExternal(authUrl);
        return { success: true, message: 'Discord login opened in browser. Complete the login and return here.' };
    }
    catch (err) {
        console.error('Failed to open Discord auth URL:', err);
        return { error: 'Failed to open browser for Discord login.' };
    }
});
// Exchange Discord auth code for tokens (called by renderer after redirect)
electron_1.ipcMain.handle('auth:discord:exchange', async (_e, code) => {
    if (!DISCORD_CLIENT_ID) {
        return { error: 'Discord Client ID not configured in .env' };
    }
    if (!currentCodeVerifier) {
        return { error: 'No PKCE code_verifier found. Please restart the login flow.' };
    }
    try {
        // Build token request body with PKCE code_verifier
        const tokenParams = {
            client_id: DISCORD_CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: DISCORD_REDIRECT_URI,
            code_verifier: currentCodeVerifier, // PKCE parameter (required for Public Client)
        };
        // IMPORTANT: Only add client_secret if explicitly set and non-empty
        // Public Client apps should NOT include client_secret
        if (DISCORD_CLIENT_SECRET && DISCORD_CLIENT_SECRET.trim().length > 0) {
            tokenParams.client_secret = DISCORD_CLIENT_SECRET;
        }
        console.log('[Discord] Token exchange params:', {
            client_id: DISCORD_CLIENT_ID,
            has_secret: !!DISCORD_CLIENT_SECRET,
            redirect_uri: DISCORD_REDIRECT_URI,
            code_length: code.length
        });
        // Exchange code for access token
        const tokenResponse = await (0, node_fetch_1.default)('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(tokenParams).toString(),
        });
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[Discord] Token exchange failed:', errorText);
            console.error('[Discord] Request params:', new URLSearchParams(tokenParams).toString());
            return { error: `Failed to exchange Discord auth code: ${errorText}` };
        }
        const tokenData = await tokenResponse.json();
        // Fetch user info
        const userResponse = await (0, node_fetch_1.default)('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });
        if (!userResponse.ok) {
            return { error: 'Failed to fetch Discord user info' };
        }
        const userData = await userResponse.json();
        // Return user data and tokens
        return {
            success: true,
            user: {
                id: userData.id,
                username: userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar
                    ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                    : null,
                tag: `${userData.username}#${userData.discriminator}`,
            },
            tokens: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresIn: tokenData.expires_in,
            },
        };
        // Clear code_verifier after successful exchange
        currentCodeVerifier = null;
        return {
            success: true,
            user: {
                id: userData.id,
                username: userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar
                    ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                    : null,
                tag: `${userData.username}#${userData.discriminator}`,
            },
            tokens: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresIn: tokenData.expires_in,
            },
        };
    }
    catch (err) {
        console.error('Discord auth exchange error:', err);
        // Clear code_verifier on error too
        currentCodeVerifier = null;
        return { error: String(err) };
    }
});
// Refresh Discord access token
electron_1.ipcMain.handle('auth:discord:refresh', async (_e, refreshToken) => {
    if (!DISCORD_CLIENT_ID) {
        return { error: 'Discord Client ID not configured' };
    }
    try {
        const refreshParams = {
            client_id: DISCORD_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        };
        // Add client_secret only if provided
        if (DISCORD_CLIENT_SECRET) {
            refreshParams.client_secret = DISCORD_CLIENT_SECRET;
        }
        const response = await (0, node_fetch_1.default)('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(refreshParams).toString(),
        });
        if (!response.ok) {
            return { error: 'Failed to refresh Discord token' };
        }
        const data = await response.json();
        return {
            success: true,
            tokens: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in,
            },
        };
    }
    catch (err) {
        console.error('Discord token refresh error:', err);
        return { error: String(err) };
    }
});
// Get Firebase configuration for renderer process
electron_1.ipcMain.handle('firebase:getConfig', async () => {
    return {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };
});
// Initialize Firebase in main process
let firebaseApp = null;
let firestore = null;
async function initFirebaseMain() {
    if (firebaseApp)
        return true; // Already initialized
    try {
        const { initializeApp } = require('firebase/app');
        const { getFirestore, doc, setDoc, getDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };
        if (!firebaseConfig.apiKey) {
            console.error('[Firebase Main] No API key found');
            return false;
        }
        firebaseApp = initializeApp(firebaseConfig);
        firestore = getFirestore(firebaseApp);
        console.log('[Firebase Main] Initialized successfully');
        return true;
    }
    catch (error) {
        console.error('[Firebase Main] Initialization failed:', error);
        return false;
    }
}
// Firebase Cloud Sync Handlers
electron_1.ipcMain.handle('firebase:upload', async (_e, userId, settings) => {
    if (!await initFirebaseMain()) {
        return { error: 'Firebase not initialized' };
    }
    try {
        const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
        const userDocRef = doc(firestore, 'users', userId);
        await setDoc(userDocRef, {
            settings,
            updatedAt: serverTimestamp(),
            version: '1.0.0'
        });
        console.log('[Firebase Main] Settings uploaded for user:', userId);
        return { success: true };
    }
    catch (error) {
        console.error('[Firebase Main] Upload failed:', error);
        return { error: String(error) };
    }
});
electron_1.ipcMain.handle('firebase:download', async (_e, userId) => {
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
        const timestamp = data.updatedAt ? data.updatedAt.toMillis() : 0;
        console.log('[Firebase Main] Settings downloaded for user:', userId);
        return {
            success: true,
            data: data.settings,
            timestamp: timestamp
        };
    }
    catch (error) {
        console.error('[Firebase Main] Download failed:', error);
        return { error: String(error) };
    }
});
// ==========================================
// Account Metrics System
// ==========================================
// Get account metrics (cloud + local merge)
electron_1.ipcMain.handle('metrics:get', async (_e, userId) => {
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
    }
    catch (error) {
        console.error('[Metrics] Get failed:', error);
        return { success: true, data: localMetrics, source: 'local', error: String(error) };
    }
});
// Update account metrics in cloud
electron_1.ipcMain.handle('metrics:update', async (_e, userId, metrics) => {
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
    }
    catch (error) {
        console.error('[Metrics] Update failed:', error);
        return { error: String(error) };
    }
});
// Get current Discord user ID (for metrics)
electron_1.ipcMain.handle('metrics:getUserId', async () => {
    // We don't store user state globally, return null for now
    // The renderer will manage user ID via Discord login flow
    return null;
});
// ==========================================
// Plus System
// ==========================================
// Plus subscription check via Firebase
electron_1.ipcMain.handle('plus:checkStatus', async (_e, userId) => {
    if (!await initFirebaseMain()) {
        return { isPlus: false, error: 'Firebase not initialized' };
    }
    try {
        const { doc, getDoc } = require('firebase/firestore');
        // Check for paid plus first
        const userDocRef = doc(firestore, 'plus', userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const expiresAt = data.expiresAt ? data.expiresAt.toMillis() : 0;
            const now = Date.now();
            if (expiresAt > now) {
                return {
                    isPlus: true,
                    type: 'paid',
                    expiresAt: expiresAt,
                    plan: data.plan || 'plus',
                    status: data.status || 'active'
                };
            }
        }
        // Check for active test day
        const testDocRef = doc(firestore, 'testDays', userId);
        const testSnap = await getDoc(testDocRef);
        if (testSnap.exists()) {
            const testData = testSnap.data();
            const testExpiresAt = testData.testExpiresAt;
            if (testExpiresAt && new Date(testExpiresAt.toDate()) > new Date()) {
                return {
                    isPlus: true,
                    type: 'test',
                    expiresAt: testExpiresAt.toMillis(),
                    plan: 'test-plus',
                    status: 'active-test'
                };
            }
        }
        return { isPlus: false };
    }
    catch (error) {
        console.error('[Plus] Status check failed:', error);
        return { isPlus: false, error: String(error) };
    }
});
// Create Stripe checkout session (simplified - Stripe handles trials)
electron_1.ipcMain.handle('plus:createCheckout', async (_e, userId, options = { plan: 'monthly' }) => {
    try {
        // Use real Stripe payment links with built-in 7-day trials
        const checkoutUrl = options.plan === 'yearly'
            ? 'https://buy.stripe.com/9B65kCfLT3Iv7Gn5JO5wI02' // Yearly: €19.99/year (save €4)
            : 'https://buy.stripe.com/9B65kC43b92P4ubc8c5wI01'; // Monthly: €1.99/month
        console.log('[Plus] Opening Stripe checkout:', checkoutUrl, 'Plan:', options.plan);
        await electron_1.shell.openExternal(checkoutUrl);
        return {
            success: true,
            message: options.plan === 'yearly'
                ? '� Yearly plan selected! €19.99/year (save 16%)'
                : '� Monthly plan selected! €1.99/month'
        };
    }
    catch (error) {
        console.error('[Plus] Checkout failed:', error);
        return { error: String(error) };
    }
});
// Verify plus purchase with real Stripe API
electron_1.ipcMain.handle('plus:verify', async (_e, userId, sessionId) => {
    if (!await initFirebaseMain()) {
        return { error: 'Firebase not initialized' };
    }
    try {
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey || stripeSecretKey === 'sk_test_your_secret_key_here') {
            return { error: 'Stripe not configured. Please add your Stripe Secret Key to .env file.' };
        }
        // If no sessionId provided, return error
        if (!sessionId) {
            return { error: 'No payment session ID provided' };
        }
        // Verify session with Stripe API
        const stripeResponse = await (0, node_fetch_1.default)(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`
            }
        });
        if (!stripeResponse.ok) {
            return { error: 'Invalid payment session' };
        }
        const session = await stripeResponse.json();
        // Check if payment was successful
        if (session.payment_status !== 'paid') {
            return { error: 'Payment not completed' };
        }
        const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
        // Add 1 month of plus
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        const plusDocRef = doc(firestore, 'plus', userId);
        await setDoc(plusDocRef, {
            plan: 'plus',
            status: 'active',
            stripeSessionId: sessionId,
            purchasedAt: serverTimestamp(),
            expiresAt: expiresAt,
            features: {
                unlimitedNicks: true,
                customThemes: true,
                advancedStats: true,
                prioritySupport: true
            }
        });
        console.log('[Plus] Activated for user:', userId);
        return {
            success: true,
            expiresAt: expiresAt.getTime(),
            message: 'Plus activated successfully!'
        };
    }
    catch (error) {
        console.error('[Plus] Verification failed:', error);
        return { error: String(error) };
    }
});
// Get monthly test day info
electron_1.ipcMain.handle('plus:getTestDayInfo', async (_e, userId) => {
    if (!await initFirebaseMain()) {
        return { error: 'Firebase not initialized' };
    }
    try {
        const { doc, getDoc } = require('firebase/firestore');
        const testDocRef = doc(firestore, 'testDays', userId);
        const docSnap = await getDoc(testDocRef);
        const now = new Date();
        const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        if (!docSnap.exists()) {
            return {
                canUseTestDay: true,
                currentMonth,
                message: 'You can use your monthly 24h Plus test!'
            };
        }
        const data = docSnap.data();
        const lastUsedMonth = data.lastUsedMonth;
        const isTestActive = data.testExpiresAt && new Date(data.testExpiresAt.toDate()) > now;
        if (lastUsedMonth === currentMonth && !isTestActive) {
            return {
                canUseTestDay: false,
                currentMonth,
                message: 'Monthly test day already used. Try again next month!'
            };
        }
        if (isTestActive) {
            const expiresAt = new Date(data.testExpiresAt.toDate());
            const hoursLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000));
            return {
                canUseTestDay: false,
                currentMonth,
                isActive: true,
                expiresAt: expiresAt.toISOString(),
                message: `Test Plus active! ${hoursLeft} hours left.`
            };
        }
        return {
            canUseTestDay: true,
            currentMonth,
            message: 'You can use your monthly 24h Plus test!'
        };
    }
    catch (error) {
        console.error('[Plus] Test day info failed:', error);
        return { error: String(error) };
    }
});
// Activate monthly test day
electron_1.ipcMain.handle('plus:activateTestDay', async (_e, userId) => {
    if (!await initFirebaseMain()) {
        return { error: 'Firebase not initialized' };
    }
    try {
        const { doc, getDoc, setDoc, serverTimestamp } = require('firebase/firestore');
        // Check if test day is available first
        const testDocRef = doc(firestore, 'testDays', userId);
        const docSnap = await getDoc(testDocRef);
        const now = new Date();
        const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        // Check if already used this month
        if (docSnap.exists()) {
            const data = docSnap.data();
            const lastUsedMonth = data.lastUsedMonth;
            const isTestActive = data.testExpiresAt && new Date(data.testExpiresAt.toDate()) > now;
            if (isTestActive) {
                const expiresAt = new Date(data.testExpiresAt.toDate());
                const hoursLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000));
                return { error: `Test Plus already active! ${hoursLeft} hours left.` };
            }
            if (lastUsedMonth === currentMonth) {
                return { error: 'Monthly test day already used. Try again next month!' };
            }
        }
        // Activate 24h test
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        await setDoc(testDocRef, {
            lastUsedMonth: currentMonth,
            testStartedAt: serverTimestamp(),
            testExpiresAt: expiresAt,
            updatedAt: serverTimestamp()
        });
        console.log('[Plus] 24h test day activated for user:', userId);
        return {
            success: true,
            expiresAt: expiresAt.toISOString(),
            message: '🎉 24h Plus test activated!'
        };
    }
    catch (error) {
        console.error('[Plus] Test day activation failed:', error);
        return { error: String(error) };
    }
});
// Open Stripe Customer Portal for subscription management
electron_1.ipcMain.handle('premium:manageSubscription', async (_e, userId) => {
    try {
        // For now, open Stripe customer portal link
        // In production: You'd create a customer portal session via API
        const customerPortalUrl = 'https://billing.stripe.com/p/login/test_your_portal_link';
        console.log('[Plus] Opening customer portal for user:', userId);
        await electron_1.shell.openExternal(customerPortalUrl);
        return {
            success: true,
            message: 'Customer portal opened - manage your subscription there'
        };
    }
    catch (error) {
        console.error('[Plus] Customer portal failed:', error);
        return { error: String(error) };
    }
});
class HypixelApiRouter {
    constructor(config) {
        this.cache = new Map();
        this.uuidCache = new Map();
        this.queue = new Set();
        // Status tracking
        this.backendDown = false;
        this.backendThrottled = false;
        this.userKeyValid = true;
        this.hypixelApiDown = false;
        // Rate limiting
        this.lastBackendRequest = 0;
        this.lastHypixelRequest = 0;
        this.MIN_REQUEST_INTERVAL = 150; // 150ms between requests
        this.MAX_CONCURRENT = 3;
        this.config = {
            backendUrl: process.env.BACKEND_API_URL,
            userApiKey: process.env.HYPIXEL_KEY || '',
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
    validateConfig() {
        if (!this.config.backendUrl && !this.config.userApiKey) {
            console.warn('[API] No backend URL or user API key configured - stats will be unavailable');
        }
    }
    async pingBackend() {
        if (!this.config.backendUrl)
            return false;
        try {
            const response = await (0, node_fetch_1.default)(`${this.config.backendUrl}/ping`, {
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
        }
        catch (error) {
            this.backendDown = true;
            console.log('[API] Backend unavailable, using fallback:', error);
        }
        return false;
    }
    // Use the existing HypixelCache system for now
    async getStats(name) {
        const normalizedName = name.toLowerCase();
        // 0. Cache
        const cached = this.cache.get(normalizedName);
        if (cached && Date.now() - cached.timestamp < (this.config.cacheTimeout || 5 * 60 * 1000)) {
            console.log('[API] Returning cached stats for', cached.data);
            return cached.data;
        }
        // 1. .env-Key (process.env.HYPIXEL_KEY)
        if (process.env.HYPIXEL_KEY && process.env.HYPIXEL_KEY.trim().length > 0) {
            try {
                const result = await hypixel.getStats(name);
                if (!result?.error) {
                    this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
                    console.log('[API] Returning stats using .env HYPIXEL_KEY for', result);
                    return result;
                }
            }
            catch (e) { /* ignore, try next */ }
        }
        // 2. User-Key (falls in config.userApiKey, nicht .env)
        if (this.config.userApiKey && this.config.userApiKey.trim().length > 0 && this.config.userApiKey !== process.env.HYPIXEL_KEY) {
            try {
                const userHypixel = new HypixelCache(this.config.userApiKey);
                const result = await userHypixel.getStats(name);
                if (!result?.error) {
                    this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
                    console.log('[API] Returning stats using user API key for', result);
                    return result;
                }
            }
            catch (e) { /* ignore, try next */ }
        }
        // 3. Backend
        try {
            const backendUrl = `http://188.245.182.162:3000/api/player?name=${encodeURIComponent(name)}`;
            const res = await (0, node_fetch_1.default)(backendUrl);
            if (!res.ok)
                throw new Error('Backend not available');
            const data = await res.json();
            // Backend returns raw Hypixel response: { success, player, ... }
            const player = data && data.player ? data.player : data;
            // No guild info from backend (yet), so we pass null
            const result = (0, hypixelNormalizer_1.normalizeHypixelBedwarsStats)(player, name, null);
            this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
            console.log('[API] Returning stats using backend.');
            return result;
        }
        catch (e) {
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
    updateConfig(newConfig) {
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
        try {
            hypixel?.clearCache?.();
        }
        catch { }
    }
    async verifyUserApiKey(apiKey) {
        if (!apiKey)
            return { valid: false, error: 'No API key provided' };
        try {
            const response = await (0, node_fetch_1.default)('https://api.hypixel.net/punishmentStats', {
                headers: { 'API-Key': apiKey },
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                const data = await response.json();
                const isValid = data.success === true;
                this.userKeyValid = isValid;
                return { valid: isValid, error: isValid ? undefined : 'API returned invalid response' };
            }
            else if (response.status === 403) {
                this.userKeyValid = false;
                return { valid: false, error: 'Invalid API key (403 Forbidden)' };
            }
            else if (response.status === 429) {
                this.userKeyValid = false;
                return { valid: false, error: 'Rate limited (too many requests)' };
            }
            else {
                this.userKeyValid = false;
                return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
        }
        catch (error) {
            this.userKeyValid = false;
            if (error.name === 'TimeoutError') {
                return { valid: false, error: 'Request timed out (check your internet connection)' };
            }
            else if (error.message?.includes('fetch')) {
                return { valid: false, error: 'Network error (check your internet connection)' };
            }
            return { valid: false, error: error.message || 'Unknown error occurred' };
        }
    }
}
// Initialize enhanced API Router
const apiRouter = new HypixelApiRouter({
    userApiKey: process.env.HYPIXEL_KEY || '',
    useFallbackKey: true,
    cacheTimeout: 5 * 60 * 1000
});
// const apiRouter = new HypixelApiRouter({
//   userApiKey: process.env.HYPIXEL_KEY || '',
//   useFallbackKey: true,
//   cacheTimeout: 5 * 60 * 1000
// });
// --- IPC: Enhanced API Management ---
electron_1.ipcMain.handle('api:getStatus', async () => {
    return apiRouter.getStatus();
});
electron_1.ipcMain.handle('api:setUserKey', async (_e, apiKey) => {
    const result = await apiRouter.verifyUserApiKey(apiKey);
    if (result.valid) {
        apiRouter.updateConfig({ userApiKey: apiKey });
        return { success: true };
    }
    return { success: false, error: result.error || 'Invalid API key' };
});
electron_1.ipcMain.handle('api:clearCache', async () => {
    apiRouter.clearCache();
    return { success: true };
});
electron_1.ipcMain.handle('api:toggleFallback', async (_e, enabled) => {
    apiRouter.updateConfig({ useFallbackKey: enabled });
    return { success: true, enabled };
});
// --- IPC: External URL opener
electron_1.ipcMain.handle('external:open', async (_e, url) => {
    try {
        const { shell } = await Promise.resolve().then(() => __importStar(require('electron')));
        await shell.openExternal(url);
        return { success: true };
    }
    catch (error) {
        console.error('[External] Failed to open URL:', error);
        return { error: String(error) };
    }
});
