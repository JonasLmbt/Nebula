import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { Tail } from 'tail';

// Base client log path templates (Windows; macOS variants would be added similarly if needed)
const BASE_CLIENT_PATHS: Record<string, string> = {
  badlion: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'blclient', 'minecraft', 'latest.log'),
  vanilla: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
  pvplounge: path.join(process.env.APPDATA || '', '.pvplounge', 'logs', 'latest.log'),
  labymod: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'fml-client-latest.log'),
  feather: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
};

// Lunar has multiple possible folders depending on version
function detectLunarPath(): string | undefined {
  const candidates = [
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', '1.8', 'logs', 'latest.log'),
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', '1.8.9', 'logs', 'latest.log'),
    path.join(process.env.APPDATA || '', '.lunarclient', 'offline', 'multiver', 'logs', 'latest.log'),
  ];
  let newest: { p?: string; m: number } = { p: undefined, m: 0 };
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.statSync(p);
        const m = s.mtimeMs || s.mtime.getTime();
        if (m > newest.m) newest = { p, m };
      }
    } catch {/* ignore */}
  }
  return newest.p;
}

function buildClientPaths(): Record<string, string> {
  const lunar = detectLunarPath();
  return { ...BASE_CLIENT_PATHS, ...(lunar ? { lunar } : {}) };
}

function autoDetectLatest(paths: Record<string,string>): [string, string] | undefined {
  let best: { client?: string; path?: string; m: number } = { m: 0 };
  for (const [client, p] of Object.entries(paths)) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.statSync(p);
        const m = s.mtimeMs || s.mtime.getTime();
        if (m > best.m) best = { client, path: p, m };
      }
    } catch {/* ignore */}
  }
  return best.client && best.path ? [best.client, best.path] : undefined;
}

export class MinecraftChatLogger extends EventEmitter {
  private tail?: Tail;
  private logPath?: string;
  private clientPaths: Record<string,string> = buildClientPaths();
  public players = new Set<string>();
  public partyMembers = new Set<string>();
  public inLobby = false;
  public username?: string;
  public chosenClient?: string; // explicit chosen client key
  public detectedClient?: string; // latest modified client key

  constructor(opts?: { client?: string; manualPath?: string; username?: string }) {
    super();
    this.username = opts?.username;
    this.chosenClient = opts?.client;
    // Manual path wins; else chosen client; else auto-detect latest
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

  private handleLine(line: string) {
    const chatIndex = line.indexOf('[CHAT]');
    if (chatIndex === -1) return;

    const raw = line.substring(chatIndex + 6).trim();
    const msg = this.stripColorCodes(raw);
    if (!msg) return;

    // Clean rank tags from names like [VIP] Player -> Player
    const cleanName = (name: string) => {
      if (name.includes('[')) {
        return name.substring(name.indexOf(']') + 1).trim();
      }
      return name.trim();
    };

    // Server change detection
    if (msg.includes('Sending you to') && !msg.includes(':')) {
      this.players.clear();
      this.inLobby = false;
      this.emit('serverChange');
      return;
    }

    // Lobby join detection
    if ((msg.includes('joined the lobby!') || msg.includes('rewards!')) && !msg.includes(':')) {
      this.inLobby = true;
      this.emit('lobbyJoined');
      return;
    }

    // /who output: ONLINE: player1, player2, player3
    if (msg.indexOf('ONLINE:') !== -1 && msg.indexOf(',') !== -1) {
      if (this.inLobby) this.players.clear();
      this.inLobby = false;

      const who = msg.substring(8)
        .split(', ')
        .map(s => cleanName(s))
        .filter((s): s is string => !!s);

  this.players.clear();
  who.forEach(p => { if (p) this.players.add(p); });
      this.emit('playersUpdated', Array.from(this.players));
      return;
    }

    // Player left/quit/disconnected
    if ((msg.indexOf('has quit') !== -1 || msg.indexOf('disconnected') !== -1) && msg.indexOf(':') === -1) {
      const [firstToken] = msg.split(' ');
      const leftPlayer = cleanName(firstToken || '');
      if (leftPlayer && this.players.has(leftPlayer)) {
        this.players.delete(leftPlayer);
        this.emit('playersUpdated', Array.from(this.players));
      }
      return;
    }

    // Final kill (remove player from active list)
    if (msg.indexOf('FINAL KILL') !== -1 && msg.indexOf(':') === -1) {
      const [killToken] = msg.split(' ');
      const killedPlayer = cleanName(killToken || '');
      // Emit specific event for final kill
      this.emit('finalKill', killedPlayer);
      if (killedPlayer && this.players.has(killedPlayer)) {
        this.players.delete(killedPlayer);
        this.emit('playersUpdated', Array.from(this.players));
      }
      return;
    }

    // Party handling: members list
    if (this.inLobby && (msg.startsWith('Party Leader:') || msg.startsWith('Party Moderators:') || msg.startsWith('Party Members:'))) {
      const tmsg = msg.substring(msg.indexOf(':') + 2);
      const members = tmsg.split(' ')
        .map(s => s.trim())
        .filter(m => /^[a-zA-Z0-9_]+$/.test(m))  // Valid Minecraft usernames only
        .map(s => cleanName(s))
        .filter((s): s is string => !!s);

      // Update party members set
  members.forEach(m => { if (m) this.partyMembers.add(m); });
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }

    // Party invite: "[RANK] Name has invited you to join their party!" (robust regex)
    if (msg.includes('has invited you to join their party!') && msg.indexOf(':') === -1) {
      const inviteMatch = msg.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has invited you to join their party!$/);
      if (inviteMatch) {
        const inviter = cleanName(inviteMatch[1]);
        if (inviter) this.emit('partyInvite', inviter);
        return;
      }
      // Fallback: try cutting before "has invited"
      const cutIdx = msg.indexOf('has invited');
      if (cutIdx > 0) {
        const inviterRaw = msg.substring(0, cutIdx).trim();
        const inviter = cleanName(inviterRaw.includes(']') ? inviterRaw.substring(inviterRaw.lastIndexOf(']') + 1).trim() : inviterRaw);
        if (inviter) this.emit('partyInvite', inviter);
        return;
      }
    }

    // Self join: "You have joined [RANK] LeaderName's party!"
    if (msg.startsWith('You have joined ') && msg.includes("'s party!") && msg.indexOf(':') === -1) {
      // Clear previous party roster
      this.partyMembers.clear();
      // Extract segment between 'joined ' and "'s party!"
      const afterJoined = msg.substring('You have joined '.length, msg.indexOf("'s party!"));
      // Remove rank tag
      const leader = cleanName(afterJoined.includes(']') ? afterJoined.substring(afterJoined.lastIndexOf(']') + 1).trim() : afterJoined.trim());
      if (leader) this.partyMembers.add(leader);
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }

    // Roster line after join: "You'll be partying with: [RANK] Member1, [RANK] Member2" (adds other members)
    if (msg.startsWith("You'll be partying with:") && msg.indexOf(':') === "You'll be partying with:".length - 1) {
      const listPart = msg.substring(msg.indexOf(':') + 1).trim();
      const rawMembers = listPart.split(',').map(s => s.trim()).filter(Boolean);
      rawMembers.forEach(r => {
        const m = cleanName(r.includes(']') ? r.substring(r.lastIndexOf(']') + 1).trim() : r);
        if (m) this.partyMembers.add(m);
      });
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }

    // Other player joins: "[RANK] Name joined the party!" or "Name joined the party!"
    if ((msg.endsWith(' joined the party!') || msg.endsWith(' joined the party.') || msg.includes(' joined the party!')) && msg.indexOf(':') === -1 && !msg.startsWith('You ')) {
      // token before ' joined'
      const beforeJoined = msg.substring(0, msg.indexOf(' joined')).trim();
      const joinedName = cleanName(beforeJoined.includes(']') ? beforeJoined.substring(beforeJoined.lastIndexOf(']') + 1).trim() : beforeJoined);
      if (joinedName) {
        this.partyMembers.add(joinedName);
        this.emit('partyUpdated', Array.from(this.partyMembers));
      }
      return;
    }

    // Party invite (to join their party!)
    if (this.inLobby && msg.indexOf('to join their party!') !== -1 && msg.indexOf(':') === -1) {
      const beforeHas = msg.substring(0, msg.indexOf('has')-1);
      const parts = beforeHas.split(' ');
      const inviter = parts[0].indexOf('[') !== -1 ? cleanName(parts[1]) : cleanName(parts[0]);
      this.emit('partyInvite', inviter);
      return;
    }

    // Party join/leave events
    if (msg.indexOf('joined the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      let pjoin = msg.split(' ')[0];
      if (pjoin.indexOf('[') !== -1) pjoin = msg.split(' ')[1];
      const joined = cleanName(pjoin || '');
      if (joined) this.partyMembers.add(joined);
      this.emit('partyUpdated', Array.from(this.partyMembers));
      return;
    }

    // "You left the party" -> clear entire party
    if (msg.indexOf('You left the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      this.partyMembers.clear();
      this.emit('partyCleared');
      return;
    }

    if (msg.indexOf('left the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      let pleft = msg.split(' ')[0];
      if (pleft.indexOf('[') !== -1) pleft = msg.split(' ')[1];
      const leftPlayer = cleanName(pleft || '');
      if (leftPlayer) this.partyMembers.delete(leftPlayer);
      this.emit('partyUpdated', Array.from(this.partyMembers));
      if (leftPlayer && this.players.has(leftPlayer)) {
        this.players.delete(leftPlayer);
        this.emit('playersUpdated', Array.from(this.players));
      }
      return;
    }

    // Game start detection (clear list)
    if (msg.indexOf('The game starts in 1 second!') !== -1 && msg.indexOf(':') === -1) {
      this.players.clear();
      this.emit('playersUpdated', Array.from(this.players));
      return;
    }

    // General chat message: "[RANK] Name: message" or "Name: message"
    if (msg.includes(':')) {
      const idx = msg.indexOf(':');
      const prefix = msg.substring(0, idx).trim();
      const text = msg.substring(idx + 1).trim();
      if (!text) return;

      // Extract probable player name from prefix
      let extracted = prefix;
      if (prefix.includes(']')) {
        extracted = prefix.substring(prefix.lastIndexOf(']') + 1).trim();
      }
      const playerName = cleanName(extracted || '');
      if (playerName && /^[A-Za-z0-9_]{3,16}$/.test(playerName)) {
        this.emit('message', { name: playerName, text });
        // Check if message mentions the user's username
        if (this.username && text.toLowerCase().includes(this.username.toLowerCase())) {
          this.emit('usernameMention', playerName);
        }
      }
      return;
    }
  }

  stop() {
    try { this.tail?.unwatch(); } catch {/* noop */ }
  }
}

export default MinecraftChatLogger;
