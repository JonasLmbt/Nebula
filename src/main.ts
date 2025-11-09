import { app, BrowserWindow, ipcMain, globalShortcut, shell } from 'electron';
// Auto-Update (only active when packaged)
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import 'dotenv/config';
import EventEmitter from 'events';
import { Tail } from 'tail';
// Lazy-load chat logger with a robust path resolution for packaged builds
// Some packagers keep main.js inside dist/, others flatten it to the app root. We probe
// several candidates and only require a file that actually exists, to avoid crashes.
// --- Embedded Chat Logger (to avoid runtime module resolution issues in packaged build) ---
class MinecraftChatLogger extends EventEmitter {
  private tail?: Tail;
  private logPath?: string;
  private clientPaths: Record<string,string> = buildClientPaths();
  public players = new Set<string>();
  public partyMembers = new Set<string>();
  public guildMembers = new Set<string>();
  public guildSource = new Set<string>();
  public inLobby = false;
  public inGuildList = false;
  private guildListTimeout?: NodeJS.Timeout;
  public username?: string;
  public chosenClient?: string;
  public detectedClient?: string;
  private awaitingInviteContinuation: boolean = false;

  constructor(opts?: { client?: string; manualPath?: string; username?: string }) {
    super();
    this.username = opts?.username;
    this.chosenClient = opts?.client;
    if (opts?.manualPath) {
      this.logPath = fs.existsSync(opts.manualPath) ? opts.manualPath : undefined;
    } else if (this.chosenClient && this.clientPaths[this.chosenClient]) {
      this.logPath = this.clientPaths[this.chosenClient];
    } else {
      const auto = autoDetectLatest(this.clientPaths);
      if (auto) {
        this.detectedClient = auto[0];
        this.logPath = auto[1];
      }
    }
    if (!this.logPath) {
      setImmediate(() => this.emit('error', new Error('No Minecraft log file found')));
      return;
    }
    this.startTail(this.logPath);
  }

  private refreshClientPaths() {
    this.clientPaths = buildClientPaths();
  }

  public setClient(client: string) {
    this.refreshClientPaths();
    if (!client || !this.clientPaths[client]) return;
    this.chosenClient = client;
    const newPath = this.clientPaths[client];
    if (newPath !== this.logPath) {
      this.switchLogPath(newPath);
    }
  }

  public autoDetect() {
    this.refreshClientPaths();
    const auto = autoDetectLatest(this.clientPaths);
    if (auto) {
      this.detectedClient = auto[0];
      if (!this.chosenClient) this.switchLogPath(auto[1]);
      return auto;
    }
    return undefined;
  }

  private startTail(p: string) {
    try {
      this.tail = new Tail(p, { useWatchFile: true, nLines: 1, fsWatchOptions: { interval: 200 } });
      this.tail.on('line', this.handleLine.bind(this));
      this.tail.on('error', (err: any) => this.emit('error', err));
    } catch (e) {
      setImmediate(() => this.emit('error', e));
    }
  }

  public switchLogPath(newPath: string) {
    if (!newPath || newPath === this.logPath) return;
    this.stop();
    this.logPath = newPath;
    this.players.clear();
    this.partyMembers.clear();
    this.inLobby = false;
    this.startTail(newPath);
    this.emit('logPathChanged', { path: newPath, client: this.chosenClient || this.detectedClient });
  }

  private stripColorCodes(s: string) {
    return s.replace(/(§|�)[0-9a-fk-or]/gi, '').trim();
  }

  private finishGuildList(): void {
    this.inGuildList = false;
    if (this.guildListTimeout) { clearTimeout(this.guildListTimeout); this.guildListTimeout = undefined; }
    if (this.guildMembers.size > 0) {
      this.emit('guildMembersUpdated', Array.from(this.guildMembers));
      this.players.clear();
      this.guildSource.clear();
      this.guildMembers.forEach(member => { this.players.add(member); this.guildSource.add(member); });
      this.emit('playersUpdated', Array.from(this.players));
    }
  }

  private handleLine(line: string) {
    const chatIndex = line.indexOf('[CHAT]');
    if (chatIndex === -1) {
      if (this.awaitingInviteContinuation) {
        const trimmed = this.stripColorCodes(line.trim());
        if (trimmed) {
          if (/^You have 60 seconds to accept\.?/i.test(trimmed) || /Click here to join!?/i.test(trimmed)) {
            this.awaitingInviteContinuation = false;
          }
        }
      }
      return;
    }
    const raw = line.substring(chatIndex + 6).trim();
    const msg = this.stripColorCodes(raw);
    if (!msg) return;
    const cleanName = (name: string) => name.includes('[') ? name.substring(name.indexOf(']') + 1).trim() : name.trim();
    if (msg.includes('Sending you to') && !msg.includes(':')) { this.players.clear(); this.inLobby = false; this.emit('serverChange'); return; }
    if ((msg.includes('joined the lobby!') || msg.includes('rewards!')) && !msg.includes(':')) { this.inLobby = true; this.emit('lobbyJoined'); return; }
    if (msg.indexOf('ONLINE:') !== -1 && msg.indexOf(',') !== -1) {
      if (this.inLobby) {
        const toRemove: string[] = []; this.players.forEach(p => { if (!this.guildSource.has(p)) toRemove.push(p); });
        toRemove.forEach(p => this.players.delete(p));
      } else { this.players.clear(); }
      this.inLobby = false;
      const who = msg.substring(8).split(', ').map(s => cleanName(s)).filter((s): s is string => !!s);
      who.forEach(p => { if (p) this.players.add(p); });
      this.emit('playersUpdated', Array.from(this.players));
      return;
    }
    if ((msg.indexOf('has quit') !== -1 || msg.indexOf('disconnected') !== -1) && msg.indexOf(':') === -1) {
      const [firstToken] = msg.split(' '); const leftPlayer = cleanName(firstToken || '');
      if (leftPlayer && this.players.has(leftPlayer)) { this.players.delete(leftPlayer); this.emit('playersUpdated', Array.from(this.players)); }
      return;
    }
    if (msg.indexOf('FINAL KILL') !== -1 && msg.indexOf(':') === -1) {
      const [killToken] = msg.split(' '); const killedPlayer = cleanName(killToken || '');
      this.emit('finalKill', killedPlayer);
      if (killedPlayer && this.players.has(killedPlayer)) { this.players.delete(killedPlayer); this.emit('playersUpdated', Array.from(this.players)); }
      return;
    }
    if (this.inLobby && (msg.startsWith('Party Leader:') || msg.startsWith('Party Moderators:') || msg.startsWith('Party Members:'))) {
      const tmsg = msg.substring(msg.indexOf(':') + 2);
      const members = tmsg.split(' ').map(s => s.trim()).filter(m => /^[a-zA-Z0-9_]+$/.test(m)).map(s => cleanName(s)).filter((s): s is string => !!s);
      members.forEach(m => { if (m) this.partyMembers.add(m); });
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }
    if (msg.indexOf('has invited you to join their party!') !== -1 && msg.indexOf(':') === -1) {
      const inviteMatch = msg.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has invited you to join their party!/);
      if (inviteMatch) { const inviter = cleanName(inviteMatch[1]); if (inviter) { this.emit('partyInvite', inviter); this.awaitingInviteContinuation = true; } return; }
      const cutIdx = msg.indexOf('has invited'); if (cutIdx > 0) { const inviterRaw = msg.substring(0, cutIdx).trim(); const inviter = cleanName(inviterRaw.includes(']') ? inviterRaw.substring(inviterRaw.lastIndexOf(']') + 1).trim() : inviterRaw); if (inviter) this.emit('partyInvite', inviter); return; }
    }
    if (msg.indexOf(' invited ') !== -1 && msg.indexOf(' to the party!') !== -1 && msg.indexOf(':') === -1) {
      const outgoingMatch = msg.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) invited (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) to the party!/);
      if (outgoingMatch) { const inviter = cleanName(outgoingMatch[1]); const invitee = cleanName(outgoingMatch[2]); if (this.username && inviter && inviter.toLowerCase() === this.username.toLowerCase()) { this.emit('partyInvite', invitee); } return; }
    }
    if (msg.indexOf('party invite') !== -1 && msg.indexOf('has expired') !== -1 && msg.indexOf(':') === -1) {
      const fromMatch = msg.match(/^The party invite from (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has expired/);
      if (fromMatch) { const expiredPlayer = cleanName(fromMatch[1]); if (expiredPlayer) this.emit('partyInviteExpired', expiredPlayer); return; }
      const toMatch = msg.match(/^The party invite to (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has expired/);
      if (toMatch) { const expiredPlayer = cleanName(toMatch[1]); if (expiredPlayer) this.emit('partyInviteExpired', expiredPlayer); return; }
    }
    if (msg.startsWith('You have joined ') && msg.includes("'s party!") && msg.indexOf(':') === -1) {
      this.partyMembers.clear();
      const afterJoined = msg.substring('You have joined '.length, msg.indexOf("'s party!"));
      const leader = cleanName(afterJoined.includes(']') ? afterJoined.substring(afterJoined.lastIndexOf(']') + 1).trim() : afterJoined.trim());
      if (leader) this.partyMembers.add(leader);
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }
    if (msg.startsWith("You'll be partying with:") && msg.indexOf(':') === "You'll be partying with:".length - 1) {
      const listPart = msg.substring(msg.indexOf(':') + 1).trim();
      const rawMembers = listPart.split(',').map(s => s.trim()).filter(Boolean);
      rawMembers.forEach(r => { const m = cleanName(r.includes(']') ? r.substring(r.lastIndexOf(']') + 1).trim() : r); if (m) this.partyMembers.add(m); });
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }
    if ((msg.endsWith(' joined the party!') || msg.endsWith(' joined the party.') || msg.includes(' joined the party!')) && msg.indexOf(':') === -1 && !msg.startsWith('You ')) {
      const beforeJoined = msg.substring(0, msg.indexOf(' joined')).trim();
      const joinedName = cleanName(beforeJoined.includes(']') ? beforeJoined.substring(beforeJoined.lastIndexOf(']') + 1).trim() : beforeJoined);
      if (joinedName) { this.partyMembers.add(joinedName); this.emit('partyUpdated', Array.from(this.partyMembers)); }
      return;
    }
    if (this.inLobby && msg.indexOf('to join their party!') !== -1 && msg.indexOf(':') === -1) {
      const beforeHas = msg.substring(0, msg.indexOf('has')-1); const parts = beforeHas.split(' ');
      const inviter = parts[0].indexOf('[') !== -1 ? cleanName(parts[1]) : cleanName(parts[0]); this.emit('partyInvite', inviter); return;
    }
    if (msg.indexOf('joined the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      let pjoin = msg.split(' ')[0]; if (pjoin.indexOf('[') !== -1) pjoin = msg.split(' ')[1];
      const joined = cleanName(pjoin || ''); if (joined) this.partyMembers.add(joined); this.emit('partyUpdated', Array.from(this.partyMembers)); return;
    }
    if (msg.includes('disbanded') && msg.indexOf(':') === -1) { this.partyMembers.clear(); this.emit('partyCleared'); return; }
    if (msg.indexOf('You left the party') !== -1 && msg.indexOf(':') === -1) { this.partyMembers.clear(); this.emit('partyCleared'); return; }
    if (msg.indexOf('left the party') !== -1 && msg.indexOf(':') === -1) { let pleft = msg.split(' ')[0]; if (pleft.indexOf('[') !== -1) pleft = msg.split(' ')[1]; const leftPlayer = cleanName(pleft || ''); if (leftPlayer) this.partyMembers.delete(leftPlayer); this.emit('partyUpdated', Array.from(this.partyMembers)); if (leftPlayer && this.players.has(leftPlayer)) { this.players.delete(leftPlayer); this.emit('playersUpdated', Array.from(this.players)); } return; }
    if (msg.indexOf('The game starts in 1 second!') !== -1 && msg.indexOf(':') === -1) { setTimeout(() => this.emit('gameStart'), 1100); return; }
    if (msg.indexOf('Guild Name: ') === 0 || msg.trim().match(/^-{2,}\s+\w+\s+-{2,}$/)) {
      if (!this.inGuildList) { this.inGuildList = true; this.guildMembers.clear(); if (this.guildListTimeout) clearTimeout(this.guildListTimeout); this.guildListTimeout = setTimeout(() => { if (this.inGuildList) this.finishGuildList(); }, 15000); }
      this.emit('message', { name: '', text: msg }); return;
    }
    if (this.inGuildList) {
      const cleanLine = msg.trim();
      if (cleanLine === '' || /^-{2,}\s+.+\s+-{2,}$/.test(cleanLine) || /^Guild Name:/i.test(cleanLine)) { this.emit('message', { name: '', text: msg }); return; }
      if (/^Total Members:/i.test(cleanLine) || /^Online Members:/i.test(cleanLine) || /^Offline Members:/i.test(cleanLine)) { this.emit('message', { name: '', text: msg }); this.finishGuildList(); return; }
      const working = cleanLine.replace(/[●]/g, '').trim();
      const multiMatches = Array.from(working.matchAll(/\[[^\]]+\]\s+([A-Za-z0-9_]{3,16})\s*\?*/g));
      if (multiMatches.length > 0) { multiMatches.forEach(m => { const nm = m[1]; if (nm) this.guildMembers.add(nm); }); this.emit('guildMembersUpdated', Array.from(this.guildMembers)); this.emit('message', { name: '', text: msg }); return; }
      const singleRank = working.match(/^\[[^\]]+\]\s+([A-Za-z0-9_]{3,16})\s*\?*$/);
      if (singleRank) { const nm = singleRank[1]; this.guildMembers.add(nm); this.emit('guildMembersUpdated', Array.from(this.guildMembers)); this.emit('message', { name: '', text: msg }); return; }
      const plainMatch = working.match(/^([A-Za-z0-9_]{3,16})\s*\?*$/);
      if (plainMatch) { const nm = plainMatch[1]; this.guildMembers.add(nm); this.emit('guildMembersUpdated', Array.from(this.guildMembers)); this.emit('message', { name: '', text: msg }); return; }
      if (this.inGuildList) { this.emit('message', { name: '', text: msg }); return; }
    }
    if (msg.indexOf('Guild > ') === 0 && msg.indexOf(':') === -1) {
      const clean = msg.substring('Guild > '.length).trim();
      let m = clean.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) left\.$/);
      if (m) { const nm = m[1]; if (this.guildMembers.has(nm)) this.guildMembers.delete(nm); this.emit('guildMemberLeft', nm); this.emit('guildMembersUpdated', Array.from(this.guildMembers)); return; }
      m = clean.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) joined\.$/);
      if (m) { return; }
    }
    if (msg.indexOf('Total Members:') === 0 || msg.indexOf('Online Members:') === 0 || msg.indexOf('Offline Members:') === 0) {
      this.finishGuildList(); this.emit('message', { name: '', text: msg }); return;
    }
    if (msg.includes(':')) {
      if (this.inGuildList) { this.finishGuildList(); }
      const idx = msg.indexOf(':'); const prefix = msg.substring(0, idx).trim(); const text = msg.substring(idx + 1).trim(); if (!text) return;
      let extracted = prefix; if (prefix.includes(']')) extracted = prefix.substring(prefix.lastIndexOf(']') + 1).trim();
      const playerName = (extracted || '').includes('[') ? extracted.substring(extracted.indexOf(']') + 1).trim() : extracted.trim();
      if (playerName && /^[A-Za-z0-9_]{3,16}$/.test(playerName)) { this.emit('message', { name: playerName, text }); if (this.username && text.toLowerCase().includes(this.username.toLowerCase())) { this.emit('usernameMention', playerName); } }
      return;
    }
  }

  stop() { try { this.tail?.unwatch(); } catch {/* noop */} }
}

// Helper functions for client log path detection
const BASE_CLIENT_PATHS: Record<string, string> = {
  badlion: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'blclient', 'minecraft', 'latest.log'),
  vanilla: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
  pvplounge: path.join(process.env.APPDATA || '', '.pvplounge', 'logs', 'latest.log'),
  labymod: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'fml-client-latest.log'),
  feather: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
};
function detectLunarPath(): string | undefined {
  const candidates = [
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', '1.8', 'logs', 'latest.log'),
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', '1.8.9', 'logs', 'latest.log'),
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', 'multiver', 'logs', 'latest.log'),
  ];
  let newest: { p?: string; m: number } = { p: undefined, m: 0 };
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { const s = fs.statSync(p); const m = s.mtimeMs || s.mtime.getTime(); if (m > newest.m) newest = { p, m }; } } catch {}
  }
  return newest.p;
}
function buildClientPaths(): Record<string, string> {
  const lunar = detectLunarPath();
  return { ...BASE_CLIENT_PATHS, ...(lunar ? { lunar } : {}) };
}
function autoDetectLatest(pathsMap: Record<string,string>): [string, string] | undefined {
  let best: { client?: string; path?: string; m: number } = { m: 0 };
  for (const [client, p] of Object.entries(pathsMap)) {
    try { if (fs.existsSync(p)) { const s = fs.statSync(p); const m = s.mtimeMs || s.mtime.getTime(); if (m > best.m) best = { client, path: p, m }; } } catch {}
  }
  return best.client && best.path ? [best.client, best.path] : undefined;
}

let nicksWin: BrowserWindow | null = null;
let win: BrowserWindow | null = null;

function initAutoUpdate() {
  // Skip in dev/unpackaged mode
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
  chat.on('error', (err: unknown) => console.error('ChatLogger error:', err));

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
    const bw = player?.stats?.Bedwars || {};
    const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
    const fk = bw.final_kills_bedwars ?? 0;
    const fd = bw.final_deaths_bedwars ?? 0;
    const wins = bw.wins_bedwars ?? 0;
    const losses = bw.losses_bedwars ?? 0;
    const ws = bw.winstreak ?? 0;
    const bblr = (bw.beds_broken_bedwars ?? 0) / Math.max(1, bw.beds_lost_bedwars ?? 1);

  // --- Most Played Mode Heuristic ---------------------------------------
  // Determine likely most played mode using (wins + losses)
  // Prefixes per Hypixel naming convention:
  // eight_one_*  -> Solo
  // eight_two_*  -> Doubles
  // four_three_* -> 3s
  // four_four_*  -> 4s
  // two_four_*   -> 4v4
    const MODE_PREFIX: Array<{ key: string; label: string }> = [
      { key: 'eight_one', label: 'Solo' },
      { key: 'eight_two', label: 'Doubles' },
      { key: 'four_three', label: '3s' },
      { key: 'four_four', label: '4s' },
      { key: 'two_four', label: '4v4' },
    ];
    let mostPlayed: string | null = null;
    let mostGames = -1;
    try {
      for (const m of MODE_PREFIX) {
        const w = bw[`${m.key}_wins_bedwars`] ?? 0;
        const l = bw[`${m.key}_losses_bedwars`] ?? 0;
        const games = (Number(w) || 0) + (Number(l) || 0);
        if (games > mostGames) {
          mostGames = games;
          mostPlayed = games > 0 ? m.label : null;
        }
      }
    } catch { /* ignore mode calc errors */ }

    // Determine rank/prefix and a display color
    const getRankInfo = (p: any) => {
      // Precedence (Hypixel specifics): custom prefix > special rank field (rank) > monthlyPackageRank (SUPERSTAR) > newPackageRank > packageRank
      // The previous implementation chose newPackageRank first, causing MVP++ (SUPERSTAR) and YOUTUBER to degrade to MVP+.
      const prefix = p?.prefix; // may contain § color codes + brackets
      const rank = p?.rank; // staff / youtube ranks live here (e.g. YOUTUBER, ADMIN)
      const monthly = p?.monthlyPackageRank; // SUPERSTAR for MVP++
      const newPkg = p?.newPackageRank; // MVP_PLUS etc.
      const pkg = p?.packageRank; // legacy
      const displayname = p?.displayname;

      const stripColor = (s: string) => s ? s.replace(/§[0-9a-fk-or]/gi, '').trim() : s;

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
        if (match) return { tag: `[${match[1]}]`, color: '#FFFFFF' };
      }

      // Helper mapping
      const map: Record<string, { tag: string; color: string }> = {
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
      const candidates = [rank, monthly, newPkg, pkg].filter(Boolean).map((r: string) => String(r).toUpperCase());
      for (const c of candidates) {
        if (map[c]) return map[c];
        // Pattern handling inside loop to allow early precedence
        if (c.includes('SUPERSTAR') || c.includes('MVP_PLUS_PLUS') || c.includes('PLUS_PLUS')) return map['SUPERSTAR'];
        if (c.includes('VIP')) return map['VIP'];
        if (c.includes('MVP') && c.includes('PLUS')) return map['MVP_PLUS'];
        if (c === 'MVP') return map['MVP'];
        if (c === 'YOUTUBER' || c === 'YT') return map['YOUTUBER'];
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
      mode: mostPlayed, // Neuer "Most Played Mode" (heuristisch wins+losses)
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
      mwlr: null,  // Monthly Win/Loss Ratio
      mbblr: null, // Monthly Bed Break/Loss Ratio
      rankTag: rankInfo.tag,
      rankColor: rankInfo.color,
    };
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
const hypixel = new HypixelCache(process.env.HYPIXEL_KEY || '');

// --- IPC: Bedwars Stats Fetch (Enhanced with safe fallback)
ipcMain.handle('bedwars:stats', async (_e, name: string) => {
  // Try enhanced API system first
  try {
    return await apiRouter.getStats(name);
  } catch (error) {
    console.log('[API] Enhanced system failed, using original:', error);
    
    // Fallback to original system
    if (!process.env.HYPIXEL_KEY) {
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
// Note: Set DISCORD_CLIENT_ID in .env (Client Secret optional for desktop apps)
// Create your Discord app at: https://discord.com/developers/applications
// Important: Enable "Public Client" toggle in OAuth2 settings for desktop apps!

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''; // Optional for public clients
const DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/discord/callback'; // Your backend callback URL

// PKCE (Proof Key for Code Exchange) - required for Public Client apps
let currentCodeVerifier: string | null = null;

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
ipcMain.handle('auth:discord:login', async () => {
  if (!DISCORD_CLIENT_ID) {
    return { error: 'Discord Client ID not configured. Please add DISCORD_CLIENT_ID to .env file.' };
  }

  // Generate PKCE parameters for this auth session
  const { code_verifier, code_challenge } = generatePKCE();
  currentCodeVerifier = code_verifier;
  
  console.log('[Discord] Generated PKCE challenge for auth session');

  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify&code_challenge=${code_challenge}&code_challenge_method=S256`;
  
  try {
    await shell.openExternal(authUrl);
    return { success: true, message: 'Discord login opened in browser. Complete the login and return here.' };
  } catch (err) {
    console.error('Failed to open Discord auth URL:', err);
    return { error: 'Failed to open browser for Discord login.' };
  }
});

// Exchange Discord auth code for tokens (called by renderer after redirect)
ipcMain.handle('auth:discord:exchange', async (_e, code: string) => {
  if (!DISCORD_CLIENT_ID) {
    return { error: 'Discord Client ID not configured in .env' };
  }

  if (!currentCodeVerifier) {
    return { error: 'No PKCE code_verifier found. Please restart the login flow.' };
  }

  try {
    // Build token request body with PKCE code_verifier
    const tokenParams: any = {
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
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
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

    const tokenData = await tokenResponse.json() as { 
      access_token: string; 
      refresh_token: string; 
      expires_in: number;
      token_type: string;
    };

    // Fetch user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      return { error: 'Failed to fetch Discord user info' };
    }

    const userData = await userResponse.json() as {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      email?: string;
    };

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
  } catch (err) {
    console.error('Discord auth exchange error:', err);
    // Clear code_verifier on error too
    currentCodeVerifier = null;
    return { error: String(err) };
  }
});

// Refresh Discord access token
ipcMain.handle('auth:discord:refresh', async (_e, refreshToken: string) => {
  if (!DISCORD_CLIENT_ID) {
    return { error: 'Discord Client ID not configured' };
  }

  try {
    const refreshParams: any = {
      client_id: DISCORD_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    // Add client_secret only if provided
    if (DISCORD_CLIENT_SECRET) {
      refreshParams.client_secret = DISCORD_CLIENT_SECRET;
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(refreshParams).toString(),
    });

    if (!response.ok) {
      return { error: 'Failed to refresh Discord token' };
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
    };
  } catch (err) {
    console.error('Discord token refresh error:', err);
    return { error: String(err) };
  }
});

// Get Firebase configuration for renderer process
ipcMain.handle('firebase:getConfig', async () => {
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
let firebaseApp: any = null;
let firestore: any = null;

async function initFirebaseMain() {
  if (firebaseApp) return true; // Already initialized
  
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
    await setDoc(userDocRef, {
      settings,
      updatedAt: serverTimestamp(),
      version: '1.0.0'
    });
    
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
    const timestamp = data.updatedAt ? data.updatedAt.toMillis() : 0;
    
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
  } catch (error) {
    console.error('[Plus] Status check failed:', error);
    return { isPlus: false, error: String(error) };
  }
});

// Create Stripe checkout session (simplified - Stripe handles trials)
ipcMain.handle('plus:createCheckout', async (_e, userId: string, options: { plan: 'monthly' | 'yearly' } = { plan: 'monthly' }) => {
  try {
    // Use real Stripe payment links with built-in 7-day trials
    const checkoutUrl = options.plan === 'yearly' 
      ? 'https://buy.stripe.com/9B65kCfLT3Iv7Gn5JO5wI02'  // Yearly: €19.99/year (save €4)
      : 'https://buy.stripe.com/9B65kC43b92P4ubc8c5wI01'; // Monthly: €1.99/month
    
    console.log('[Plus] Opening Stripe checkout:', checkoutUrl, 'Plan:', options.plan);
    await shell.openExternal(checkoutUrl);
    
    return { 
      success: true, 
      message: options.plan === 'yearly' 
        ? '� Yearly plan selected! €19.99/year (save 16%)'
        : '� Monthly plan selected! €1.99/month'
    };
  } catch (error) {
    console.error('[Plus] Checkout failed:', error);
    return { error: String(error) };
  }
});

// Verify plus purchase via backend (secure: Stripe secret stays server-side)
// Backend endpoint should: validate Stripe session, update Firestore, return { success, expiresAt, message }.
ipcMain.handle('plus:verify', async (_e, userId: string, sessionId?: string) => {
  // Basic parameter checks
  if (!sessionId) {
    return { error: 'No payment session ID provided' };
  }
  if (!userId) {
    return { error: 'Missing userId' };
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    return { error: 'Backend not configured (BACKEND_API_URL missing)' };
  }

  // Compose request – prefer POST for sensitive IDs
  const verifyEndpoint = backendUrl.replace(/\/$/, '') + '/api/plus/verify';
  let response: any;
  try {
    response = await fetch(verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ userId, sessionId })
    });
  } catch (networkErr) {
    console.error('[Plus] Backend verify network error:', networkErr);
    return { error: 'Network error contacting backend' };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[Plus] Backend verify failed status:', response.status, text);
    return { error: 'Backend verification failed' };
  }

  let data: any;
  try {
    data = await response.json();
  } catch (parseErr) {
    console.error('[Plus] Backend JSON parse error:', parseErr);
    return { error: 'Invalid backend response' };
  }

  if (data.error) {
    return { error: data.error };
  }
  if (!data.success) {
    return { error: 'Verification unsuccessful' };
  }

  // Expect expiresAt (ms) from server
  return {
    success: true,
    expiresAt: data.expiresAt || null,
    message: data.message || 'Plus activated successfully!'
  };
});

// Get monthly test day info
ipcMain.handle('plus:getTestDayInfo', async (_e, userId: string) => {
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
  } catch (error) {
    console.error('[Plus] Test day info failed:', error);
    return { error: String(error) };
  }
});

// Activate monthly test day
ipcMain.handle('plus:activateTestDay', async (_e, userId: string) => {
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
  } catch (error) {
    console.error('[Plus] Test day activation failed:', error);
    return { error: String(error) };
  }
});

// Open Stripe Customer Portal for subscription management
ipcMain.handle('premium:manageSubscription', async (_e, userId: string) => {
  try {
    // For now, open Stripe customer portal link
    // In production: You'd create a customer portal session via API
    const customerPortalUrl = 'https://billing.stripe.com/p/login/test_your_portal_link';
    
    console.log('[Plus] Opening customer portal for user:', userId);
    await shell.openExternal(customerPortalUrl);
    
    return { 
      success: true, 
      message: 'Customer portal opened - manage your subscription there' 
    };
  } catch (error) {
    console.error('[Plus] Customer portal failed:', error);
    return { error: String(error) };
  }
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
    // For now, delegate to the original system
    return hypixel.getStats(name);
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
    // Also clear original cache
    hypixel.clearCache();
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
