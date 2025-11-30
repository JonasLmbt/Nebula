// --- Enhanced API System with 3-tier Backend Support ---
const HYPIXEL_KEY = process.env.HYPIXEL_KEY || '';
import { normalizeHypixelBedwarsStats, normalizeHypixelBedwarsStatsNick } from "./hypixelNormalizer"; 

interface ApiRouterConfig {
  backendUrl?: string
  userApiKey?: string;
  useFallbackKey: boolean;
  cacheTimeout: number;
}

export class HypixelApiRouter {
  private config: ApiRouterConfig;

  // Caches
  private playerCache = new Map<string, { data: any; timestamp: number }>();
  private uuidCache = new Map<string, { uuid: string | null; timestamp: number }>();
  private guildCache = new Map<string, { data: any | null; timestamp: number }>();

  // Rate limiting
  private readonly TTL = 10 * 60 * 1000; // 10 min cache TTL

  // Backend status
  private backendDown = false;
  private userKeyValid = true;


  constructor(config: ApiRouterConfig) {
    this.config = {
      backendUrl: 'https://nebula-overlay.online',
      userApiKey: HYPIXEL_KEY,
      useFallbackKey: true,
      cacheTimeout: this.TTL,
    };
    Object.assign(this.config, config);

    if (this.config.backendUrl) {
      this.pingBackend();
    }
  }

  /* ------------------------------------------------------------
   * UUID LOOKUP (Mojang)
   * ------------------------------------------------------------ */
  private async getUUID(name: string): Promise<string | null> {
    const key = name.toLowerCase();

    // 1. Cached forever
    const cached = this.uuidCache.get(key);
    if (cached) {
      return cached.uuid; // no TTL required — UUIDs never change
    }

    // 2. Fetch from Mojang
    try {
      const res = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`
      );

      if (!res.ok) {
        this.uuidCache.set(key, { uuid: null, timestamp: Date.now() }); // negative cache
        return null;
      }

      const data = await res.json();
      const uuid = data?.id ?? null;

      // 3. Store permanently
      this.uuidCache.set(key, {
        uuid,
        timestamp: Date.now(),
      });

      return uuid;
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------
   * HYPIXEL PLAYER REQUEST
   * ------------------------------------------------------------ */
  private async fetchHypixelPlayerDirect(uuid: string, apiKey: string) {
      const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
          headers: { "API-Key": apiKey }
      });

      if (!res.ok) return null;
      const json = await res.json();
      return json.player ?? null;
  }

  private async fetchPlayerData(name: string, uuid: string, bypassCache = false): Promise<any | null> {
    const cached = this.playerCache.get(name);
    if (!bypassCache && cached && Date.now() - cached.timestamp < this.TTL) {
        console.log(`[API Router] Fetched player data for ${name} (${uuid}) using CACHE`);
        return cached.data;
    }

    let player = null;

    // 2. ENV key
    if (HYPIXEL_KEY) {
        try {
            player = await this.fetchHypixelPlayerDirect(uuid, HYPIXEL_KEY);
            console.log(`[API Router] Fetched player data for ${name} (${uuid}) using ENV key`);
        } catch {}
    }

    // 3. USER key
    if (!player && this.config.userApiKey && this.config.userApiKey !== HYPIXEL_KEY) {
        try {
            player = await this.fetchHypixelPlayerDirect(uuid, this.config.userApiKey);
            console.log(`[API Router] Fetched player data for ${name} (${uuid}) using USER key`);
        } catch {
            this.userKeyValid = false;
        }
    }

    // 4. BACKEND
    if (!player && this.config.backendUrl) {
        try {
            const res = await fetch(`${this.config.backendUrl}/api/player?name=${name}`);
            if (res.ok) {
                const data = await res.json();
                player = data.player ?? data;
                console.log(`[API Router] Fetched player data for ${name} (${uuid}) using BACKEND`);
            }
        } catch {
            this.backendDown = true;
        }
    }

    if (bypassCache && !player) {
        if (cached && Date.now() - cached.timestamp < this.TTL) {
          console.log(`[API Router] Fetched player data for ${name} (${uuid}) using CACHE`);
          return cached.data;
      }
    }

    if (player) {
        this.playerCache.set(name, { data: player, timestamp: Date.now() });
    }

    return player;
  }


  /* ------------------------------------------------------------
   * HYPIXEL GUILD REQUEST
   * ------------------------------------------------------------ */
  private async fetchHypixelGuildDirect(uuid: string, apiKey: string) {
      const res = await fetch(`https://api.hypixel.net/v2/guild?player=${uuid}`, {
          headers: { "API-Key": apiKey }
      });

      if (!res.ok) return null;
      const json = await res.json();
      return json.guild ?? null;
  }

  private async fetchGuildData(name: string, uuid: string, bypassCache = false): Promise<any | null> {
    const cached = this.guildCache.get(name);

    if (!bypassCache &&cached && Date.now() - cached.timestamp < this.TTL) {
        console.log(`[API Router] Fetched guild data for ${name} (${uuid}) using CACHE`);
        return cached.data;
    }

    let guild = null;

    // 2. ENV key
    if (HYPIXEL_KEY) {
        try {
            guild = await this.fetchHypixelGuildDirect(uuid, HYPIXEL_KEY);
            console.log(`[API Router] Fetched guild data for ${name} (${uuid}) using ENV key`);
        } catch {}
    }

    // 3. USER key
    if (!guild && this.config.userApiKey && this.config.userApiKey !== HYPIXEL_KEY) {
        try {
            guild = await this.fetchHypixelGuildDirect(uuid, this.config.userApiKey);
            console.log(`[API Router] Fetched guild data for ${name} (${uuid}) using USER key`);
        } catch {}
    }

    // 4. BACKEND
    if (!guild) {
        try {
            const res = await fetch(
                `https://nebula-overlay.online/api/guild?name=${encodeURIComponent(name)}`
            );
            if (res.ok) {
                console.log(`[API Router] Fetched guild data for ${name} (${uuid}) using BACKEND`);
                const data = await res.json();
                guild = data.guild ?? data;
            }
        } catch {
            this.backendDown = true;
        }
    }

    if (bypassCache && !guild) {
            if (cached && Date.now() - cached.timestamp < this.TTL) {
          console.log(`[API Router] Fetched guild data for ${name} (${uuid}) using CACHE`);
          return cached.data;
      }
    }

    this.guildCache.set(name, { data: guild, timestamp: Date.now() });
    return guild;
  }


  /* ------------------------------------------------------------
   * MAIN: getStats()
   * ------------------------------------------------------------ */

  async getStats(name: string, bypassCache = false): Promise<any> {
      const uuid = await this.getUUID(name);
      if (!uuid || uuid.length === 0 || uuid === null) {
          // nick
          return normalizeHypixelBedwarsStatsNick(name);
      }

      // Step 1: player data
      const player = await this.fetchPlayerData(name, uuid, bypassCache);

      if (!player) {
          return { error: "Player not found" };
      }

      // Step 2: guild data
      const guild = await this.fetchGuildData(name, uuid, bypassCache);

      // Step 3: normalize
      const result = normalizeHypixelBedwarsStats(player, name, uuid, guild);

      return result;
  }

  /* ------------------------------------------------------------
   * Backend Health Check
   * ------------------------------------------------------------ */
  private async pingBackend() {
    if (!this.config.backendUrl) return;

    try {
      const res = await fetch(`${this.config.backendUrl}/ping`);
      this.backendDown = !res.ok;
    } catch {
      this.backendDown = true;
    }
  }

  /* ------------------------------------------------------------
   * UTIL
   * ------------------------------------------------------------ */
  clearCache() {
    this.playerCache.clear();
    this.uuidCache.clear();
    this.guildCache.clear();
  }

    // Public methods for status and configuration
  getStatus() {
    return {
      backendAvailable: !this.backendDown,
      userKeyValid: this.userKeyValid,
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

export default HypixelApiRouter;
