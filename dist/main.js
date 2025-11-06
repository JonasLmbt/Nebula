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
const node_fetch_1 = __importDefault(require("node-fetch"));
require("dotenv/config");
const chat_logger_1 = require("./chat-logger");
let nicksWin = null;
let win = null;
function createWindow() {
    electron_1.app.setName('Nebula');
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
electron_1.app.whenReady().then(() => {
    createWindow();
    // Start chat logger to detect local Minecraft chat and forward player lists to renderer
    try {
        const chat = new chat_logger_1.MinecraftChatLogger();
        chat.on('playersUpdated', (players) => {
            if (win)
                win.webContents.send('chat:players', players);
        });
        chat.on('partyUpdated', (members) => {
            if (win)
                win.webContents.send('chat:party', members);
        });
        chat.on('lobbyJoined', () => {
            if (win)
                win.webContents.send('chat:lobbyJoined');
        });
        chat.on('error', (err) => console.error('ChatLogger error:', err));
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
// --- API: Name → UUID
async function uuidFor(name) {
    const res = await (0, node_fetch_1.default)(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (!res.ok)
        return null;
    const data = (await res.json());
    return data?.id ?? null; // undashed UUID
}
// --- API: Hypixel Player
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';
async function hypixelPlayer(uuid) {
    const res = await (0, node_fetch_1.default)(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
        headers: { 'API-Key': HYPIXEL_KEY },
    });
    if (!res.ok)
        throw new Error(`Hypixel API: ${res.status}`);
    const data = (await res.json());
    return data.player;
}
// --- IPC: Bedwars Stats Fetch
electron_1.ipcMain.handle('bedwars:stats', async (_e, name) => {
    if (!HYPIXEL_KEY)
        return { error: 'Missing HYPIXEL_KEY in environment.' };
    try {
        const uuid = await uuidFor(name);
        if (!uuid)
            return { error: 'UUID not found.' };
        const player = await hypixelPlayer(uuid);
        if (!player)
            return { error: 'Player not found on Hypixel.' };
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
    }
    catch (err) {
        return { error: String(err.message || err) };
    }
});
