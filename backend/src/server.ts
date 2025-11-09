import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));

const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';
if (!HYPIXEL_KEY) {
  console.warn('[Backend] HYPIXEL_KEY missing – /api/player will return error until set.');
}

// Configurable TTL (default 5m)
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000);

interface Cached<T> { data: T; timestamp: number; }
const playerCache = new Map<string, Cached<any>>(); // key: lowercase name
const uuidCache = new Map<string, Cached<string | null>>(); // key: lowercase name

// Simple IP rate limiting (60 requests / 60s per IP)
const RATE_LIMIT_WINDOW = 60_000; // 1min
const RATE_LIMIT_MAX = 60;
const ipHits: Record<string, { count: number; windowStart: number }> = {};

function rateLimit(ip: string): boolean {
  const now = Date.now();
  let rec = ipHits[ip];
  if (!rec) { rec = { count: 0, windowStart: now }; ipHits[ip] = rec; }
  if (now - rec.windowStart > RATE_LIMIT_WINDOW) { rec.count = 0; rec.windowStart = now; }
  rec.count++;
  return rec.count <= RATE_LIMIT_MAX;
}

async function getUUID(name: string): Promise<string | null> {
  const normalized = name.toLowerCase();
  const cached = uuidCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
  const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(6000) });
  if (res.status === 404) { uuidCache.set(normalized, { data: null, timestamp: Date.now() }); return null; }
  if (!res.ok) throw new Error('Mojang API error ' + res.status);
  const data: any = await res.json();
  const uuid = data.id || null;
  uuidCache.set(normalized, { data: uuid, timestamp: Date.now() });
  return uuid;
}

async function fetchHypixelPlayer(uuid: string) {
  const url = `https://api.hypixel.net/player?uuid=${uuid}`;
  const res = await fetch(url, { headers: { 'API-Key': HYPIXEL_KEY }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Hypixel player API error ' + res.status);
  const json: any = await res.json();
  if (!json.success) throw new Error('Hypixel response not successful');
  return json.player;
}

async function fetchHypixelGuild(uuid: string) {
  const url = `https://api.hypixel.net/guild?player=${uuid}`;
  const res = await fetch(url, { headers: { 'API-Key': HYPIXEL_KEY }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null; // guild is optional
  const json: any = await res.json();
  if (!json.success) return null;
  return json.guild || null;
}

function processBedwarsStats(player: any, inputName: string, guild: any) {
  // Defensive: Hypixel sometimes returns null player
  if (!player) {
    return { name: inputName, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
  }
  const stats = player.stats?.Bedwars || {};
  const killsFinal = stats.final_kills_bedwars || 0;
  const deathsFinal = stats.final_deaths_bedwars || 0;
  const wins = stats.wins_bedwars || 0;
  const losses = stats.losses_bedwars || 0;
  const bedsBroken = stats.beds_broken_bedwars || 0;
  const bedsLost = stats.beds_lost_bedwars || 0;
  const winstreak = player?.achievements?.bedwars_winstreak || 0;
  const fkdr = deathsFinal === 0 ? killsFinal : killsFinal / Math.max(1, deathsFinal);
  const wlr = losses === 0 ? wins : wins / Math.max(1, losses);
  const bblr = bedsLost === 0 ? bedsBroken : bedsBroken / Math.max(1, bedsLost);

  // Level ("Star") formula from Hypixel (approx). If player.achievements.bedwars_level exists use it.
  const level = player?.achievements?.bedwars_level || 0;

  // Rank information (simplified)
  const rankTag = player?.rank || player?.packageRank || player?.newPackageRank || null;
  const rankColor = null; // Could be derived from rankTag table if needed

  const cleanName = player.displayname || inputName;

  return {
    name: cleanName,
    level,
    ws: winstreak,
    fkdr: Number(fkdr.toFixed(2)),
    wlr: Number(wlr.toFixed(2)),
    bblr: Number(bblr.toFixed(2)),
    fk: killsFinal,
    wins,
    rankTag,
    rankColor,
    guild: guild ? { name: guild.name, tag: guild.tag || null } : null,
    uuid: (player.uuid || '').replace(/-/g, ''),
  };
}

// Health check & client cache hint
app.get('/ping', (_req: Request, res: Response) => {
  res.json({ success: true, cache_player: CACHE_TTL_MS });
});

// Player stats endpoint
app.get('/api/player/:name', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded (max 60/min)' });
  }

  const rawName = (req.params.name || '').trim();
  if (!rawName) return res.status(400).json({ error: 'Missing player name' });
  const key = rawName.toLowerCase();
  const cached = playerCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  if (!HYPIXEL_KEY) {
    return res.status(503).json({ error: 'Backend missing HYPIXEL_KEY' });
  }

  try {
    const uuid = await getUUID(rawName);
    if (!uuid) {
      const unresolved = { name: rawName, level: 0, ws: 0, fkdr: 0, wlr: 0, bblr: 0, fk: 0, wins: 0, rankTag: null, rankColor: null, unresolved: true };
      playerCache.set(key, { data: unresolved, timestamp: Date.now() });
      return res.json(unresolved);
    }

    const player = await fetchHypixelPlayer(uuid);
    const guild = await fetchHypixelGuild(uuid);
    const stats = processBedwarsStats(player, rawName, guild);
    playerCache.set(key, { data: stats, timestamp: Date.now() });
    res.json(stats);
  } catch (err: any) {
    console.error('[Backend] Failed to fetch stats for', rawName, err);
    res.status(500).json({ error: 'Failed to fetch player stats', detail: err.message || String(err) });
  }
});

// Plus verification placeholder
app.post('/api/plus/verify', (_req: Request, res: Response) => {
  // Implement: verify Stripe session server-side, update Firestore, return { success, expiresAt }
  res.status(501).json({ error: 'Not implemented' });
});

// Basic security headers (helmet already sets many)
app.disable('x-powered-by');

// When behind a proxy (e.g., Caddy/nginx), trust X-Forwarded-For for rate limiting
app.set('trust proxy', true);

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`[Backend] Listening on port ${PORT} (cache TTL: ${CACHE_TTL_MS}ms)`);
});
