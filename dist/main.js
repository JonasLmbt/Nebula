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
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 420, height: 340,
        transparent: true, frame: false, alwaysOnTop: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    // Optional: F8 toggelt Click-Through (Overlay lässt Maus durch)
    let passThrough = false;
    electron_1.globalShortcut.register('F8', () => {
        passThrough = !passThrough;
        win.setIgnoreMouseEvents(passThrough, { forward: true });
    });
}
electron_1.app.whenReady().then(createWindow);
// --- API: Name -> UUID
async function uuidFor(name) {
    const r = await (0, node_fetch_1.default)(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (!r.ok)
        return null;
    const j = (await r.json()); // <-- typisieren
    return j?.id ?? null; // undashed uuid
}
// --- API: Hypixel-Player
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';
async function hypixelPlayer(uuid) {
    const r = await (0, node_fetch_1.default)(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
        headers: { 'API-Key': HYPIXEL_KEY }
    });
    if (!r.ok)
        throw new Error(`Hypixel: ${r.status}`);
    const j = (await r.json()); // <-- typisieren
    return j.player;
}
// IPC: Stats abrufen
electron_1.ipcMain.handle('bedwars:stats', async (_e, name) => {
    if (!HYPIXEL_KEY)
        return { error: 'Kein HYPIXEL_KEY in .env gesetzt.' };
    const uuid = await uuidFor(name);
    if (!uuid)
        return { error: 'UUID nicht gefunden.' };
    const p = await hypixelPlayer(uuid);
    const bw = p?.stats?.Bedwars || {};
    const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
    const fk = bw.final_kills_bedwars ?? 0;
    const fd = bw.final_deaths_bedwars ?? 0;
    const w = bw.wins_bedwars ?? 0;
    const l = bw.losses_bedwars ?? 0;
    return {
        name: p?.displayname ?? name,
        stars,
        fkdr: +(fk / Math.max(1, fd)).toFixed(2),
        wlr: +(w / Math.max(1, l)).toFixed(2)
    };
});
