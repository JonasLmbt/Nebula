import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { Tail } from 'tail';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Helpful shortcuts
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const APPDATA = process.env.APPDATA || '';  // Windows only
const MC_MAC = path.join(HOME, 'Library', 'Application Support', 'minecraft');
const LC_MAC = path.join(HOME, 'Library', 'Application Support', 'lunarclient');
const BL_MAC = MC_MAC; // Badlion uses normal mc folder


// Base paths for Windows + macOS
const BASE_CLIENT_PATHS: Record<string, string> = {
  badlion: isWindows
    ? path.join(APPDATA, '.minecraft', 'logs', 'blclient', 'minecraft', 'latest.log')
    : path.join(BL_MAC, 'logs', 'blclient', 'minecraft', 'latest.log'),

  vanilla: isWindows
    ? path.join(APPDATA, '.minecraft', 'logs', 'latest.log')
    : path.join(MC_MAC, 'logs', 'latest.log'),

  pvplounge: isWindows
    ? path.join(APPDATA, '.pvplounge', 'logs', 'latest.log')
    : path.join(HOME, 'Library', 'Application Support', 'pvplounge', 'logs', 'latest.log'),

  labymod: isWindows
    ? path.join(APPDATA, '.minecraft', 'logs', 'fml-client-latest.log')
    : path.join(MC_MAC, 'logs', 'latest.log'),

  feather: isWindows
    ? path.join(APPDATA, '.minecraft', 'logs', 'latest.log')
    : path.join(HOME, 'Library', 'Application Support', 'feather', 'logs', 'latest.log'),
};


// Lunar has multiple possible folders depending on version
function detectLunarPath(): string | undefined {
  const paths: string[] = [];

  if (isWindows) {
    const homeDir = process.env.USERPROFILE || '';
    paths.push(
      path.join(homeDir, '.lunarclient', 'profiles', 'lunar', '1.8', 'logs', 'latest.log'),
      path.join(homeDir, '.lunarclient', 'profiles', 'lunar', '1.21', 'logs', 'latest.log')
    );
  }

  if (isMac) {
    paths.push(
      path.join(LC_MAC, 'offline', '1.8', 'logs', 'latest.log'),
      path.join(LC_MAC, 'offline', '1.21', 'logs', 'latest.log')
    );
  }

  // choose newest
  let newest: { path?: string; m: number } = { m: 0 };

  for (const p of paths) {
    try {
      if (!fs.existsSync(p)) continue;
      const m = fs.statSync(p).mtimeMs;
      if (m > newest.m) newest = { path: p, m };
    } catch {}
  }

  return newest.path;
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
  public guildMembers = new Set<string>();
  public guildSource = new Set<string>(); // Track which players came from guild
  public inLobby = false;
  public inGuildList = false;
  private guildListTimeout?: NodeJS.Timeout; // Timeout to end guild parsing
  public username?: string;
  public chosenClient?: string; // explicit chosen client key
  public detectedClient?: string; // latest modified client key
  // Track if we're waiting for continuation lines of an incoming party invite
  private awaitingInviteContinuation: boolean = false;

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

  // Finish guild list parsing and emit events
  private finishGuildList(): void {
    this.inGuildList = false;
    
    // Clear timeout
    if (this.guildListTimeout) {
      clearTimeout(this.guildListTimeout);
      this.guildListTimeout = undefined;
    }
    
    // Emit the guild members as a separate event
    if (this.guildMembers.size > 0) {
      // Emit guild-specific update
      this.emit('guildMembersUpdated', Array.from(this.guildMembers));
      
      // Also update main players list
      this.players.clear();
      this.guildSource.clear();
      this.guildMembers.forEach(member => {
        this.players.add(member);
        this.guildSource.add(member);
      });
      this.emit('playersUpdated', Array.from(this.players));
    }
  }

  private handleLine(line: string) {
    const chatIndex = line.indexOf('[CHAT]');
    // If line lacks [CHAT], we still might want to capture continuation of multi-line party invites
    if (chatIndex === -1) {
        const cleaned = this.stripColorCodes(line.trim());
        // Recognize non-[CHAT] party invites (Lunar, old clients, mod clients, etc.)
        if (/has invited you to join their party!?/i.test(cleaned)) {
            const m = cleaned.match(/([A-Za-z0-9_]{3,16}) has invited you/);
            if (m) {
                const inviter = m[1];
                this.emit('partyInvite', inviter);
                this.awaitingInviteContinuation = true;
            }
            return;
        }
        // Continuation lines (e.g., "You have 60 seconds...")
        if (this.awaitingInviteContinuation) {
            if (/You have \d+ seconds/i.test(cleaned) || /Click here to join/i.test(cleaned)) {
                this.awaitingInviteContinuation = false;
            }
            return;
        }
        return;
    }


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
    if ((msg.includes('joined the lobby!') || msg.includes('rewards!')) && !msg.includes(':') || msg.includes('slid into the lobby!')) {
      this.inLobby = true;
      this.emit('lobbyJoined');
      return;
    }

    // /who output: ONLINE: player1, player2, player3
    if (msg.indexOf('ONLINE:') !== -1 && msg.indexOf(',') !== -1) {
      // Don't clear players in lobby if they came from guild
      if (this.inLobby) {
        // Only clear non-guild players
        const toRemove: string[] = [];
        this.players.forEach(player => {
          if (!this.guildSource.has(player)) {
            toRemove.push(player);
          }
        });
        toRemove.forEach(player => this.players.delete(player));
      } else {
        this.players.clear();
      }
      this.inLobby = false;

      const who = msg.substring(8)
        .split(', ')
        .map(s => cleanName(s))
        .filter((s): s is string => !!s);

      // Add /who players (but preserve guild members)
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

    // Party invite (incoming): 
    // [MVP+] Zorbas05 has invited you to join their party!You have 60 seconds to accept. Click here to join!
    if (msg.indexOf('has invited you to join their party!') !== -1 && msg.indexOf(':') === -1) {
      console.log('[DBG:PARTY_INVITE_IN_RAW_MATCH_CANDIDATE]', msg);
      const inviteMatch = msg.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has invited you to join their party!/);
      if (inviteMatch) {
        const inviter = cleanName(inviteMatch[1]);
        console.log('[DBG:PARTY_INVITE_IN_MATCH]', inviteMatch, 'inviter=', inviter);
        if (inviter) {
          this.emit('partyInvite', inviter);
          // Expect multi-line continuation lines following (without [CHAT])
          this.awaitingInviteContinuation = true;
        }
        return;
      } else {
        console.log('[DBG:PARTY_INVITE_IN_NO_REGEX_MATCH]');
      }
      // Fallback: vor "has invited" abschneiden
      const cutIdx = msg.indexOf('has invited');
      if (cutIdx > 0) {
        const inviterRaw = msg.substring(0, cutIdx).trim();
        const inviter = cleanName(inviterRaw.includes(']') ? inviterRaw.substring(inviterRaw.lastIndexOf(']') + 1).trim() : inviterRaw);
        console.log('[DBG:PARTY_INVITE_IN_FALLBACK]', inviterRaw, '=>', inviter);
        if (inviter) {
          this.emit('partyInvite', inviter);
        }
        return;
      } else {
        console.log('[DBG:PARTY_INVITE_IN_FALLBACK_NOT_APPLIED]');
      }
    }

    // Party invite (incoming to someone else's party):
    if (msg.indexOf("has invited you to join") !== -1 && msg.indexOf("party!") !== -1 && msg.indexOf(":") === -1) {
      console.log("[DBG:PARTY_INVITE_OTHER_RAW_MATCH_CANDIDATE]", msg);

      // Capture inviter + party leader (both ranks optional)
      const inviteOtherMatch = msg.match(
        /^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has invited you to join (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16})'s party!/
      );

      if (inviteOtherMatch) {
        const inviter = cleanName(inviteOtherMatch[1]);
        const leader = cleanName(inviteOtherMatch[2]);

        console.log(
          "[DBG:PARTY_INVITE_OTHER_MATCH]",
          inviteOtherMatch,
          "inviter=",
          inviter,
          "leader=",
          leader
        );

        if (inviter) {
          // You can keep same event name, or use a dedicated one
          this.emit("partyInvite", inviter, leader);
          this.awaitingInviteContinuation = true;
        }
        return;
      } else {
        console.log("[DBG:PARTY_INVITE_OTHER_NO_REGEX_MATCH]");
      }

      // Fallback parsing (no regex)
      // Pattern: "<inviter> has invited you to join <leader>'s party!"
      const cutIdx = msg.indexOf(" has invited you to join ");
      const partyIdx = msg.indexOf("'s party!");
      if (cutIdx > 0 && partyIdx > cutIdx) {
        const inviterRaw = msg.substring(0, cutIdx).trim();
        const leaderRaw = msg.substring(cutIdx + " has invited you to join ".length, partyIdx).trim();

        const inviter = cleanName(inviterRaw.includes("]") ? inviterRaw.substring(inviterRaw.lastIndexOf("]") + 1).trim() : inviterRaw);
        const leader = cleanName(leaderRaw.includes("]") ? leaderRaw.substring(leaderRaw.lastIndexOf("]") + 1).trim() : leaderRaw);

        console.log("[DBG:PARTY_INVITE_OTHER_FALLBACK]", { inviterRaw, leaderRaw, inviter, leader });

        if (inviter) {
          this.emit("partyInvite", inviter, leader);
          this.awaitingInviteContinuation = true;
        }
        return;
      } else {
        console.log("[DBG:PARTY_INVITE_OTHER_FALLBACK_NOT_APPLIED]");
      }
    }

    // Party invite (outgoing): 
    // [VIP] wisdomVII invited [MVP+] Zorbas05 to the party! They have 60 seconds to accept.
    if (msg.indexOf(' invited ') !== -1 && msg.indexOf(' to the party!') !== -1 && msg.indexOf(':') === -1) {
      console.log('[DBG:PARTY_INVITE_OUT_RAW_MATCH_CANDIDATE]', msg);
      const outgoingMatch = msg.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) invited (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) to the party!/);
      if (outgoingMatch) {
        const inviter = cleanName(outgoingMatch[1]);
        const invitee = cleanName(outgoingMatch[2]);
        console.log('[DBG:PARTY_INVITE_OUT_MATCH]', outgoingMatch, 'inviter=', inviter, 'invitee=', invitee, 'selfUsername=', this.username);
        if (this.username && inviter && inviter.toLowerCase() === this.username.toLowerCase()) {
          this.emit('partyInvite', invitee);
        } else {
          console.log('[DBG:PARTY_INVITE_OUT_IGNORED_NOT_SELF]');
        }
        return;
      } else {
        console.log('[DBG:PARTY_INVITE_OUT_NO_REGEX_MATCH]');
      }
    }

    // Party invite expiration:
    // The party invite from [MVP+] Zorbas05 has expired.
    // The party invite to [MVP+] Zorbas05 has expired.
    if (msg.indexOf('party invite') !== -1 && msg.indexOf('has expired') !== -1 && msg.indexOf(':') === -1) {
      console.log('[DBG:PARTY_INVITE_EXPIRE_RAW_MATCH_CANDIDATE]', msg);
      const fromMatch = msg.match(/^The party invite from (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has expired/);
      if (fromMatch) {
        const expiredPlayer = cleanName(fromMatch[1]);
        console.log('[DBG:PARTY_INVITE_EXPIRE_FROM_MATCH]', fromMatch, 'expiredPlayer=', expiredPlayer);
        if (expiredPlayer) {
          this.emit('partyInviteExpired', expiredPlayer);
        }
        return;
      }
      const toMatch = msg.match(/^The party invite to (?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) has expired/);
      if (toMatch) {
        const expiredPlayer = cleanName(toMatch[1]);
        console.log('[DBG:PARTY_INVITE_EXPIRE_TO_MATCH]', toMatch, 'expiredPlayer=', expiredPlayer);
        if (expiredPlayer) {
          this.emit('partyInviteExpired', expiredPlayer);
        }
        return;
      }
      console.log('[DBG:PARTY_INVITE_EXPIRE_NO_REGEX_MATCH]');
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

    // Party disbanded detection
    if (msg.includes('disbanded') && msg.indexOf(':') === -1) {
      // "The party was disbanded because all invites expired and the party was empty."
      // "[VIP] wisdomVII has disbanded the party!"
      console.log('Party was disbanded:', msg);
      this.partyMembers.clear();
      this.emit('partyCleared');
      return;
    }

    // "You left the party" -> clear entire party
    if (msg.indexOf('You left the party') !== -1 && msg.indexOf(':') === -1) {
      this.partyMembers.clear();
      this.emit('partyCleared');
      return;
    }

    if (msg.indexOf('left the party') !== -1 && msg.indexOf(':') === -1) {
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

    // Detect: "<RANK> Name has been removed from the party."
    if (msg.indexOf("has been removed from the party") !== -1 && msg.indexOf(":") === -1) {
      let pkick = msg.split(" ")[0]; 
      if (pkick.startsWith("[")) {
        pkick = msg.split(" ")[1];
      }
      const kickedPlayer = cleanName(pkick || "");
      if (kickedPlayer) {
        this.partyMembers.delete(kickedPlayer);
        this.emit("partyUpdated", Array.from(this.partyMembers));
        if (this.players.has(kickedPlayer)) {
          this.players.delete(kickedPlayer);
          this.emit("playersUpdated", Array.from(this.players));
        }
      }
      return;
    }

    // Detect: "Kicked <RANK?> Name because they were offline."
    if (msg.indexOf("because they were offline") !== -1 && msg.indexOf("Kicked ") === 0 && msg.indexOf(":") === -1) {
      const parts = msg.split(" ");
      let kicked = parts[1];
      if (kicked.startsWith("[")) {
        kicked = parts[2];
      }
      const kickedPlayer = cleanName(kicked || "");
      if (kickedPlayer) {
        this.partyMembers.delete(kickedPlayer);
        this.emit("partyUpdated", Array.from(this.partyMembers));
        if (this.players.has(kickedPlayer)) {
          this.players.delete(kickedPlayer);
          this.emit("playersUpdated", Array.from(this.players));
        }
      }
      return;
    }

    // Game start detection (clear list)
    if (msg.indexOf('The game starts in 1 second!') !== -1 && msg.indexOf(':') === -1) {
      // Fire a gameStart event shortly after countdown finishes
      setTimeout(() => this.emit('gameStart'), 1100);
      return;
    }

    // Guild list parsing
    if (msg.indexOf('Guild Name: ') === 0 || msg.trim().match(/^-{2,}\s+\w+\s+-{2,}$/)) {
      if (!this.inGuildList) {
        console.log('Starting guild list parsing with trigger:', msg.trim());
        this.inGuildList = true;
        this.guildMembers.clear();
        
        // Clear any existing timeout
        if (this.guildListTimeout) {
          clearTimeout(this.guildListTimeout);
        }
        
        // Set a timeout to automatically end guild parsing after 15 seconds
        this.guildListTimeout = setTimeout(() => {
          if (this.inGuildList) {
            console.log('Guild list parsing timeout - ending guild list with', this.guildMembers.size, 'members');
            this.finishGuildList();
          }
        }, 15000);
      }
      
      this.emit('message', { name: '', text: msg });
      return;
    }

    // Unified guild member parsing (handles both /guild list and /guild online formats)
    if (this.inGuildList) {
      const cleanLine = msg.trim();

      // Skip category headers / separators / summary lines
      if (cleanLine === '' ||
          /^-{2,}\s+.+\s+-{2,}$/.test(cleanLine) || // -- Wardens -- or --- Wardens ---
          /^Guild Name:/i.test(cleanLine)) {
        this.emit('message', { name: '', text: msg });
        return;
      }

      // Summary lines: end of guild list => finish
      if (/^Total Members:/i.test(cleanLine) || /^Online Members:/i.test(cleanLine) || /^Offline Members:/i.test(cleanLine)) {
        console.log('Guild summary line encountered (finish list):', cleanLine);
        this.emit('message', { name: '', text: msg });
        this.finishGuildList();
        return;
      }

      // Status icons lines (● or ?) treated similarly; we'll strip them during name extraction
      const working = cleanLine.replace(/[●]/g, '').trim();

      // Try to extract multiple ranked players from one line
      const multiMatches = Array.from(working.matchAll(/\[[^\]]+\]\s+([A-Za-z0-9_]{3,16})\s*\?*/g));
      if (multiMatches.length > 0) {
        console.log('Guild multi-member line:', cleanLine, 'matches:', multiMatches.map(m => m[1]));
        multiMatches.forEach(m => {
          const nm = m[1];
          if (nm) {
            this.guildMembers.add(nm);
            console.log('Added guild member:', nm, '| Total:', this.guildMembers.size);
          }
        });
        // Emit incremental update for faster UI
        this.emit('guildMembersUpdated', Array.from(this.guildMembers));
        this.emit('message', { name: '', text: msg });
        return;
      }

      // Single ranked player line e.g. "[VIP] TwitterSpace ?" or "[MVP+] hitlast67 ?"
      const singleRank = working.match(/^\[[^\]]+\]\s+([A-Za-z0-9_]{3,16})\s*\?*$/);
      if (singleRank) {
        const nm = singleRank[1];
        console.log('Guild single ranked member line:', cleanLine, 'name:', nm);
        this.guildMembers.add(nm);
        console.log('Added guild member:', nm, '| Total:', this.guildMembers.size);
        // Emit incremental update for faster UI
        this.emit('guildMembersUpdated', Array.from(this.guildMembers));
        this.emit('message', { name: '', text: msg });
        return;
      }

      // Plain username line (fallback) e.g. "wisdomVII" or "everlive" (strip trailing '?')
      const plainMatch = working.match(/^([A-Za-z0-9_]{3,16})\s*\?*$/);
      if (plainMatch) {
        const nm = plainMatch[1];
        console.log('Guild plain member line:', cleanLine, 'name:', nm);
        this.guildMembers.add(nm);
        console.log('Added guild member:', nm, '| Total:', this.guildMembers.size);
        // Emit incremental update for faster UI
        this.emit('guildMembersUpdated', Array.from(this.guildMembers));
        this.emit('message', { name: '', text: msg });
        return;
      }

      // Non-member content inside guild list (e.g. MOTD lines) -> just pass through
      if (this.inGuildList) {
        console.log('Ignoring non-member guild line:', cleanLine);
        this.emit('message', { name: '', text: msg });
        return;
      }
    }

    // Guild live leave/join notifications
    // Example: "Guild > awemoon left." or "Guild > Name joined."
    if (msg.indexOf('Guild > ') === 0 && msg.indexOf(':') === -1) {
      const clean = msg.substring('Guild > '.length).trim();
      // Left
      let m = clean.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) left\.$/);
      if (m) {
        const nm = m[1];
        console.log('Guild member left detected:', nm);
        // Update internal set if present
        if (this.guildMembers.has(nm)) this.guildMembers.delete(nm);
        // Emit specific event and incremental members update
        this.emit('guildMemberLeft', nm);
        this.emit('guildMembersUpdated', Array.from(this.guildMembers));
        return;
      }
      // Joined (optional future use)
      m = clean.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z0-9_]{3,16}) joined\.$/);
      if (m) {
        const nm = m[1];
        console.log('Guild member joined detected:', nm);
        // Don't auto-add here to avoid noise unless desired; keep as message only
        // this.guildMembers.add(nm);
        // this.emit('guildMembersUpdated', Array.from(this.guildMembers));
        return;
      }
    }

    // Guild list end: "Total Members:", "Online Members:", "Offline Members:"
    if (msg.indexOf('Total Members:') === 0 || msg.indexOf('Online Members:') === 0 || msg.indexOf('Offline Members:') === 0) {
      console.log('Guild list end detected:', msg.trim(), 'Found', this.guildMembers.size, 'members');
      this.finishGuildList();
      this.emit('message', { name: '', text: msg });
      return;
    }

    // General chat message: "[RANK] Name: message" or "Name: message"
    if (msg.includes(':')) {
      // If we're still parsing guild list and get a chat message, end the guild list
      if (this.inGuildList) {
        console.log('Chat message detected while in guild list - ending guild list parsing');
        this.finishGuildList();
      }
      
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
