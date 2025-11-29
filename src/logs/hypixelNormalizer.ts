// ---------------------------------------------
// Utility: Rounding
// ---------------------------------------------
export function round(num: number, decimals: number): number {
  if (decimals <= 0) return Math.floor(num);
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// ---------------------------------------------
// Utility: BedWars Level from Experience
// ---------------------------------------------
export function getBedWarsLevel(exp: number, decimals = 0): number {
  let level = 100 * Math.floor(exp / 487000);
  exp = exp % 487000;

  if (exp < 500)
    return round(level + exp / 500, decimals);

  level++;
  if (exp < 1500)
    return round(level + (exp - 500) / 1000, decimals);

  level++;
  if (exp < 3500)
    return round(level + (exp - 1500) / 2000, decimals);

  level++;
  if (exp < 7000)
    return round(level + (exp - 3500) / 3500, decimals);

  level++;
  exp -= 7000;

  return round(level + exp / 5000, decimals);
}

// ---------------------------------------------
// Interfaces
// ---------------------------------------------
export interface BedwarsModeStats {
  gamesPlayed: number;
  fk: number;
  fd: number;
  fkdr: number;
  wins: number;
  losses: number;
  wlr: number;
  bb: number;
  bl: number;
  bblr: number;
  kills: number;
  deaths: number;
  kdr: number;
}

export interface NormalizedBedwarsStats {
  name: string;
  level: number;
  experience: number;
  ws: number;
  mode: string | null;
  winsPerLevel: number;
  fkPerLevel: number;
  bedwarsScore: number;
  networkLevel: number;
  guildName: string | null;
  guildTag: string | null;
  mfkdr: number | null;
  mwlr: number | null;
  mbblr: number | null;
  rankTag: string | null;
  rankColor: string | null;
  uuid?: string;

  modes?: {
    overall?: BedwarsModeStats;
    eight_one?: BedwarsModeStats;
    eight_two?: BedwarsModeStats;
    four_three?: BedwarsModeStats;
    four_four?: BedwarsModeStats;
    two_four?: BedwarsModeStats;
  };
}

// ---------------------------------------------
// Helper: Extract Stats for a Single Mode
// ---------------------------------------------
function extractModeStats(bw: any, prefix: string): BedwarsModeStats {
  // Some Hypixel fields are inconsistent for "overall"
  const gamesPlayedKey =
    prefix === ""
      ? "games_played_bedwars_1"
      : `${prefix}games_played_bedwars`;

  const gamesPlayed = Number(bw[gamesPlayedKey] ?? 0);

  const fk     = Number(bw[`${prefix}final_kills_bedwars`] ?? 0);
  const fd     = Number(bw[`${prefix}final_deaths_bedwars`] ?? 0);
  const wins   = Number(bw[`${prefix}wins_bedwars`] ?? 0);
  const losses = Number(bw[`${prefix}losses_bedwars`] ?? 0);
  const bb     = Number(bw[`${prefix}beds_broken_bedwars`] ?? 0);
  const bl     = Number(bw[`${prefix}beds_lost_bedwars`] ?? 0);
  const kills  = Number(bw[`${prefix}kills_bedwars`] ?? 0);
  const deaths = Number(bw[`${prefix}deaths_bedwars`] ?? 0);

  return {
    gamesPlayed,
    fk,
    fd,
    fkdr: +(fk / Math.max(1, fd)).toFixed(2),

    wins,
    losses,
    wlr: +(wins / Math.max(1, losses)).toFixed(2),

    bb,
    bl,
    bblr: +(bb / Math.max(1, bl)).toFixed(2),

    kills,
    deaths,
    kdr: +(kills / Math.max(1, deaths)).toFixed(2),
  };
}

// ---------------------------------------------
// Helper: Detect Rank Information
// ---------------------------------------------
function getRankInfo(player: any) {
  const stripColor = (s: string) =>
    s ? s.replace(/§[0-9a-fk-or]/gi, "").trim() : s;

  const prefix = player?.prefix;
  const displayname = player?.displayname;

  if (prefix) {
    const raw = stripColor(prefix);
    const m = raw.match(/\[(.+?)\]/);
    return { tag: m ? `[${m[1]}]` : raw, color: "#FFFFFF" };
  }

  if (displayname) {
    const dn = stripColor(displayname);
    const m = dn.match(/^\[(.+?)\]/);
    if (m) return { tag: `[${m[1]}]`, color: "#FFFFFF" };
  }

  const map: Record<string, { tag: string; color: string }> = {
    VIP: { tag: "[VIP]", color: "#55FF55" },
    VIP_PLUS: { tag: "[VIP+]", color: "#55FF55" },
    MVP: { tag: "[MVP]", color: "#55FFFF" },
    MVP_PLUS: { tag: "[MVP+]", color: "#55FFFF" },
    SUPERSTAR: { tag: "[MVP++]", color: "#FFAA00" },
    MVP_PLUS_PLUS: { tag: "[MVP++]", color: "#FFAA00" },
    YOUTUBER: { tag: "[YOUTUBE]", color: "#FF5555" },
    YT: { tag: "[YOUTUBE]", color: "#FF5555" },
    ADMIN: { tag: "[ADMIN]", color: "#FF5555" },
    OWNER: { tag: "[OWNER]", color: "#FF5555" },
    MOD: { tag: "[MOD]", color: "#55AAFF" },
    HELPER: { tag: "[HELPER]", color: "#55AAFF" },
  };

  const candidates = [
    player?.rank,
    player?.monthlyPackageRank,
    player?.newPackageRank,
    player?.packageRank,
  ]
    .filter(Boolean)
    .map((x: string) => x.toUpperCase());

  for (const c of candidates) {
    if (map[c]) return map[c];
    if (c.includes("SUPERSTAR")) return map.SUPERSTAR;
    if (c.includes("VIP")) return map.VIP;
    if (c.includes("MVP") && c.includes("PLUS")) return map.MVP_PLUS;
  }

  return { tag: null, color: null };
}

// ---------------------------------------------
// Main Normalizer
// ---------------------------------------------
export function normalizeHypixelBedwarsStats(
  player: any,
  requestedName: string,
  requestedUuid: string,
  guild: any | null
): NormalizedBedwarsStats {

  const bw = player?.stats?.Bedwars || {};

  const experience = Number(bw.Experience ?? 0);
  const level = getBedWarsLevel(experience, 0);

  const fk = Number(bw.final_kills_bedwars ?? 0);
  const fd = Number(bw.final_deaths_bedwars ?? 0);
  const wins = Number(bw.wins_bedwars ?? 0);
  const losses = Number(bw.losses_bedwars ?? 0);
  const ws = Number(bw.winstreak ?? 0);

  // Detect which mode is played most
  const MODES = [
    { key: "eight_one", label: "Solo" },
    { key: "eight_two", label: "Doubles" },
    { key: "four_three", label: "3s" },
    { key: "four_four", label: "4s" },
    { key: "two_four", label: "4v4" },
  ];

  let mostPlayed: string | null = null;
  let mostGames = -1;

  for (const m of MODES) {
    const w = Number(bw[`${m.key}_wins_bedwars`] ?? 0);
    const l = Number(bw[`${m.key}_losses_bedwars`] ?? 0);
    const games = w + l;

    if (games > mostGames) {
      mostGames = games;
      mostPlayed = games > 0 ? m.label : null;
    }
  }

  const rankInfo = getRankInfo(player);

  const modes = {
    overall:    extractModeStats(bw, ""),
    eight_one:  extractModeStats(bw, "eight_one_"),
    eight_two:  extractModeStats(bw, "eight_two_"),
    four_three: extractModeStats(bw, "four_three_"),
    four_four:  extractModeStats(bw, "four_four_"),
    two_four:   extractModeStats(bw, "two_four_"),
  };

  return {
    name: player.displayname ?? requestedName,
    uuid: player.uuid ?? requestedUuid,

    level,
    experience,
    ws,
    mode: mostPlayed,

    winsPerLevel: +(wins / Math.max(1, level)).toFixed(2),
    fkPerLevel: +(fk / Math.max(1, level)).toFixed(2),

    bedwarsScore: +(
      (fk / Math.max(1, fd)) *
      (wins / Math.max(1, losses)) *
      (level / 100)
    ).toFixed(2),

    networkLevel: (() => {
      const exp = Number(player?.networkExp ?? player?.networkExperience ?? 0);
      const lvl = (Math.sqrt(2 * exp + 30625) / 50) - 2.5;
      return Math.max(0, Math.floor(lvl));
    })(),

    guildName: guild?.name ?? null,
    guildTag: guild?.tag ?? null,

    mfkdr: null,
    mwlr: null,
    mbblr: null,

    rankTag: rankInfo.tag,
    rankColor: rankInfo.color,

    modes,
  };
}
