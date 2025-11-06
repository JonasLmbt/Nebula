import fs from 'fs';
import os from 'os';
import path from 'path';
import EventEmitter from 'events';
import { Tail } from 'tail';

const CLIENT_PATHS: Record<string, string> = {
  vanilla: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
  badlion: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'blclient', 'minecraft', 'latest.log'),
  lunar: path.join(process.env.APPDATA || '', '.lunarclient', 'offline', '1.8.9', 'logs', 'latest.log'),
  pvplounge: path.join(process.env.APPDATA || '', '.pvplounge', 'logs', 'latest.log'),
  labymod: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'fml-client-latest.log'),
  feather: path.join(process.env.APPDATA || '', '.minecraft', 'logs', 'latest.log'),
};

function detectClientLogPath(manual?: string): string | undefined {
  if (manual) return fs.existsSync(manual) ? manual : undefined;

  let newest: { path: string | undefined; mtime: number } = { path: undefined, mtime: 0 };
  for (const p of Object.values(CLIENT_PATHS)) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.statSync(p);
        const m = s.mtimeMs || s.mtime.getTime();
        if (m > newest.mtime) {
          newest = { path: p, mtime: m };
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return newest.path;
}

export class MinecraftChatLogger extends EventEmitter {
  private tail?: Tail;
  private logPath?: string;
  public players = new Set<string>();
  public inLobby = false;

  constructor(opts?: { manualPath?: string }) {
    super();
    this.logPath = detectClientLogPath(opts?.manualPath);
    if (!this.logPath) {
      setImmediate(() => this.emit('error', new Error('No Minecraft log file found')));
      return;
    }

    try {
      this.tail = new Tail(this.logPath, { useWatchFile: true, nLines: 1, fsWatchOptions: { interval: 200 } });
      this.tail.on('line', this.handleLine.bind(this));
      this.tail.on('error', (err: any) => this.emit('error', err));
    } catch (e) {
      setImmediate(() => this.emit('error', e));
    }
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

    // /who output: ONLINE: player1, player2, player3
    if (msg.indexOf('ONLINE:') !== -1 && msg.indexOf(',') !== -1) {
      if (this.inLobby) this.players.clear();
      this.inLobby = false;

      const who = msg.substring(8)
        .split(', ')
        .map(cleanName)
        .filter(Boolean);

      this.players.clear();
      who.forEach(p => this.players.add(p));
      this.emit('playersUpdated', Array.from(this.players));
      return;
    }

    // Player left/quit/disconnected
    if ((msg.indexOf('has quit') !== -1 || msg.indexOf('disconnected') !== -1) && msg.indexOf(':') === -1) {
      const leftPlayer = cleanName(msg.split(' ')[0]);
      if (this.players.has(leftPlayer)) {
        this.players.delete(leftPlayer);
        this.emit('playersUpdated', Array.from(this.players));
      }
      return;
    }

    // Final kill (remove player from active list)
    if (msg.indexOf('FINAL KILL') !== -1 && msg.indexOf(':') === -1) {
      const killedPlayer = cleanName(msg.split(' ')[0]);
      if (this.players.has(killedPlayer)) {
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
        .map(cleanName);

      this.emit('partyUpdated', members);
      return;
    }

    // Party join/leave events
    if (msg.indexOf('joined the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      let pjoin = msg.split(' ')[0];
      if (pjoin.indexOf('[') !== -1) pjoin = msg.split(' ')[1];
      this.emit('partyUpdated', [cleanName(pjoin)]);
      return;
    }

    if (msg.indexOf('left the party') !== -1 && msg.indexOf(':') === -1 && this.inLobby) {
      let pleft = msg.split(' ')[0];
      if (pleft.indexOf('[') !== -1) pleft = msg.split(' ')[1];
      const leftPlayer = cleanName(pleft);
      if (this.players.has(leftPlayer)) {
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
  }

  stop() {
    try { this.tail?.unwatch(); } catch (e) { /* noop */ }
  }
}

export default MinecraftChatLogger;
