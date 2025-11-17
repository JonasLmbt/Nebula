import fetch from 'node-fetch';
import { normalizeHypixelBedwarsStats } from '../logs/hypixelNormalizer';

const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';

export class HypixelCache {
  private cache = new Map<
    string,
    {
      data: any;
      timestamp: number;
    }
  >();
  private uuidCache = new Map<string, string>();
  private guildCache = new Map<string, { data: any; timestamp: number }>();
  private queue = new Set<string>();
  private readonly TTL = 10 * 60 * 1000;
  private readonly MAX_CONCURRENT = 3;

  constructor(private apiKey: string) {}

  private async getUUID(name: string): Promise<string> {
    const key = name.toLowerCase();
    const cached = this.uuidCache.get(key);
    if (cached) return cached;

    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
    );
    if (!res.ok) throw new Error('UUID not found');

    const data = (await res.json()) as { id?: string };
    const uuid = data?.id;
    if (!uuid) throw new Error('Invalid UUID response');

    this.uuidCache.set(key, uuid);
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

    const data = (await res.json()) as { player?: any };
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
        return null;
      }
      const data = (await res.json()) as { guild?: any };
      const guild = data.guild || null;
      this.guildCache.set(uuid, { data: guild, timestamp: Date.now() });
      return guild;
    } catch {
      return null;
    }
  }

  private async processBedwarsStats(player: any, requestedName: string, guild: any | null) {
    return normalizeHypixelBedwarsStats(player, requestedName, guild);
  }

  async getStats(name: string) {
    const normalizedName = name.toLowerCase();
    const cached = this.cache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

    while (this.queue.size >= this.MAX_CONCURRENT) {
      await new Promise((r) => setTimeout(r, 100));
    }

    try {
      this.queue.add(normalizedName);

      if (this.queue.size > 1) {
        await new Promise((r) => setTimeout(r, 150));
      }

      let uuid: string | null = null;
      try {
        uuid = await this.getUUID(name);
      } catch {
        return {
          name,
          level: 0,
          ws: 0,
          fkdr: 0,
          wlr: 0,
          bblr: 0,
          fk: 0,
          wins: 0,
          rankTag: null,
          rankColor: null,
          unresolved: true,
        };
      }

      const player = await this.fetchHypixelStats(uuid);
      if (!player) throw new Error('Player not found on Hypixel');
      const guild = await this.fetchGuild(uuid);
      const stats = await this.processBedwarsStats(player, name, guild);

      if (uuid) {
        try {
          (stats as any).uuid = uuid.replace(/-/g, '');
        } catch {}
      }

      this.cache.set(normalizedName, {
        data: stats,
        timestamp: Date.now(),
      });

      return stats;
    } catch (err: any) {
      return { error: String(err?.message || err) };
    } finally {
      this.queue.delete(normalizedName);
    }
  }

  clearCache() {
    this.cache.clear();
    this.uuidCache.clear();
  }
}

export interface ApiRouterConfig {
  backendUrl?: string;
  userApiKey?: string;
  useFallbackKey: boolean;
  cacheTimeout: number;
}

export class HypixelApiRouter {
  private config: ApiRouterConfig;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private uuidCache = new Map<string, { uuid: string | null; timestamp: number }>();
  private queue = new Set<string>();

  private backendDown = false;
  private backendThrottled = false;
  private userKeyValid = true;
  private hypixelApiDown = false;

  private lastBackendRequest = 0;
  private lastHypixelRequest = 0;
  private readonly MIN_REQUEST_INTERVAL = 150;
  private readonly MAX_CONCURRENT = 3;

  constructor(config: ApiRouterConfig, private hypixelFallback: HypixelCache) {
    this.config = {
      userApiKey: HYPIXEL_KEY,
      useFallbackKey: true,
      cacheTimeout: 5 * 60 * 1000,
    };

    Object.assign(this.config, config);

    this.validateConfig();
    if (this.config.backendUrl) {
      this.pingBackend();
    }
  }

  private validateConfig() {
    if (!this.config.backendUrl && !this.config.userApiKey) {
      console.warn(
        '[API] No backend URL or user API key configured - stats will be unavailable',
      );
    }
  }

  private async pingBackend(): Promise<boolean> {
    if (!this.config.backendUrl) return false;

    try {
      const response = await fetch(`${this.config.backendUrl}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Nebula-Overlay/1.0' },
      });

      if (response.ok) {
        const data = await response.json();
        this.backendDown = false;

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

  async getStats(name: string): Promise<any> {
    const normalizedName = name.toLowerCase();
    const cached = this.cache.get(normalizedName);
    if (
      cached &&
      Date.now() - cached.timestamp < (this.config.cacheTimeout || 5 * 60 * 1000)
    ) {
      console.log('[API] Returning cached stats for', cached.data);
      return cached.data;
    }

    // 1: .env HYPIXEL_KEY via HypixelCache
    if (HYPIXEL_KEY && HYPIXEL_KEY.trim().length > 0) {
      try {
        const result = await this.hypixelFallback.getStats(name);
        if (!result?.error) {
          this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
          console.log('[API] Returning stats using .env HYPIXEL_KEY for', result);
          return result;
        }
      } catch {
        // ignore, next tier
      }
    }

    // 2: User API Key
    if (
      this.config.userApiKey &&
      this.config.userApiKey.trim().length > 0 &&
      this.config.userApiKey !== HYPIXEL_KEY
    ) {
      try {
        const userHypixel = new HypixelCache(this.config.userApiKey);
        const result = await userHypixel.getStats(name);
        if (!result?.error) {
          this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
          console.log('[API] Returning stats using user API key for', result);
          return result;
        }
      } catch {
        // ignore, next tier
      }
    }
    
    // 3: Backend
    try {
      const backendUrl = `https://nebula-overlay.online/api/player?name=${encodeURIComponent(
        name,
      )}`;
      const res = await fetch(backendUrl);
      if (!res.ok) throw new Error('Backend not available');
      const data = await res.json();

      const player = data && data.player ? data.player : data;
      const result = normalizeHypixelBedwarsStats(player, name, null);

      this.cache.set(normalizedName, { data: result, timestamp: Date.now() });
      console.log('[API] Returning stats using backend for', result);
      return result;
    } catch (e: any) {
      return {
        error:
          'All API sources failed: ' +
          (e && e.message ? e.message : String(e)),
      };
    }
  }

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
        useFallbackKey: this.config.useFallbackKey,
      },
    };
  }

  updateConfig(partial: Partial<ApiRouterConfig>) {
    Object.assign(this.config, partial);
  }

  clearCache() {
    this.cache.clear();
    this.uuidCache.clear();
  }

  async verifyUserApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    if (!apiKey) return { valid: false, error: 'No API key provided' };

    try {
      const response = await fetch('https://api.hypixel.net/punishmentStats', {
        headers: { 'API-Key': apiKey },
        signal: AbortSignal.timeout(5000),
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

const hypixel = new HypixelCache(HYPIXEL_KEY);
export const apiRouter = new HypixelApiRouter(
  {
    userApiKey: HYPIXEL_KEY,
    useFallbackKey: true,
    cacheTimeout: 5 * 60 * 1000,
  },
  hypixel,
);

export function getHypixelFallback() {
  return hypixel;
}