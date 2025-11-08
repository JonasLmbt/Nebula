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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
require("dotenv/config");
const chat_logger_1 = require("./chat-logger");
let nicksWin = null;
let win = null;
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
        ? ['nebula-logo.ico', 'nebula-logo.png', 'nebula-logo.svg']
        : ['nebula-logo.png', 'nebula-logo.svg', 'nebula-logo.ico'];
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
        const bw = player?.stats?.Bedwars || {};
        const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
        const fk = bw.final_kills_bedwars ?? 0;
        const fd = bw.final_deaths_bedwars ?? 0;
        const wins = bw.wins_bedwars ?? 0;
        const losses = bw.losses_bedwars ?? 0;
        const ws = bw.winstreak ?? 0;
        const bblr = (bw.beds_broken_bedwars ?? 0) / Math.max(1, bw.beds_lost_bedwars ?? 1);
        // Determine rank/prefix and a display color
        const getRankInfo = (p) => {
            // Precedence (Hypixel specifics): custom prefix > special rank field (rank) > monthlyPackageRank (SUPERSTAR) > newPackageRank > packageRank
            // The previous implementation chose newPackageRank first, causing MVP++ (SUPERSTAR) and YOUTUBER to degrade to MVP+.
            const prefix = p?.prefix; // may contain § color codes + brackets
            const rank = p?.rank; // staff / youtube ranks live here (e.g. YOUTUBER, ADMIN)
            const monthly = p?.monthlyPackageRank; // SUPERSTAR for MVP++
            const newPkg = p?.newPackageRank; // MVP_PLUS etc.
            const pkg = p?.packageRank; // legacy
            const displayname = p?.displayname;
            const stripColor = (s) => s ? s.replace(/§[0-9a-fk-or]/gi, '').trim() : s;
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
                if (match)
                    return { tag: `[${match[1]}]`, color: '#FFFFFF' };
            }
            // Helper mapping
            const map = {
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
            const candidates = [rank, monthly, newPkg, pkg].filter(Boolean).map((r) => String(r).toUpperCase());
            for (const c of candidates) {
                if (map[c])
                    return map[c];
                // Pattern handling inside loop to allow early precedence
                if (c.includes('SUPERSTAR') || c.includes('MVP_PLUS_PLUS') || c.includes('PLUS_PLUS'))
                    return map['SUPERSTAR'];
                if (c.includes('VIP'))
                    return map['VIP'];
                if (c.includes('MVP') && c.includes('PLUS'))
                    return map['MVP_PLUS'];
                if (c === 'MVP')
                    return map['MVP'];
                if (c === 'YOUTUBER' || c === 'YT')
                    return map['YOUTUBER'];
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
            // Guild data from separate endpoint (if available)
            guildName: guild?.name ?? null,
            guildTag: guild?.tag ?? null,
            mfkdr: null, // Monthly Final K/D Ratio
            mwlr: null, // Monthly Win/Loss Ratio
            mbblr: null, // Monthly Bed Break/Loss Ratio
            rankTag: rankInfo.tag,
            rankColor: rankInfo.color,
        };
    }
    async getStats(name) {
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
            let uuid = null;
            try {
                uuid = await this.getUUID(name);
            }
            catch (e) {
                // Name nicht auf Mojang gefunden -> als Nick behandeln
                return { name, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
            }
            const player = await this.fetchHypixelStats(uuid);
            if (!player)
                throw new Error('Player not found on Hypixel');
            const guild = await this.fetchGuild(uuid);
            const stats = await this.processBedwarsStats(player, name, guild);
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
// --- IPC: Bedwars Stats Fetch (jetzt mit Cache)
electron_1.ipcMain.handle('bedwars:stats', async (_e, name) => {
    if (!process.env.HYPIXEL_KEY) {
        return { error: 'HYPIXEL_KEY missing in environment. Please check .env.' };
    }
    return hypixel.getStats(name);
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
