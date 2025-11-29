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
  fkdr: number;
  wlr: number;
  bblr: number;
  fk: number;
  fd: number;
  wins: number;
  losses: number;
  bedsBroken: number;
  bedsLost: number;
  kills: number;
  deaths: number;
  kdr: number;
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
    overall?: BedwarsModeStats;     // Overall stats
    eight_one?: BedwarsModeStats;   // Solo
    eight_two?: BedwarsModeStats;   // Doubles
    four_three?: BedwarsModeStats;  // 3s
    four_four?: BedwarsModeStats;   // 4s
    two_four?: BedwarsModeStats;    // 4v4
  }
}


export function normalizeHypixelBedwarsStats(
  player: any,
  requestedName: string,
  requestedUuid: string,
  guild: any | null
): NormalizedBedwarsStats {
  const bw = player?.stats?.Bedwars || {};
  const stars = bw.Experience ? Math.floor(bw.Experience / 5000) : 0;
  const fk = bw.final_kills_bedwars ?? 0;
  const fd = bw.final_deaths_bedwars ?? 0;
  const wins = bw.wins_bedwars ?? 0;
  const losses = bw.losses_bedwars ?? 0;
  const ws = bw.winstreak ?? 0;
  const bblr = (bw.beds_broken_bedwars ?? 0) / Math.max(1, bw.beds_lost_bedwars ?? 1);

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
  } catch {
    /* ignore mode calc errors */
  }

  const getRankInfo = (p: any) => {
    const prefix = p?.prefix;
    const rank = p?.rank;
    const monthly = p?.monthlyPackageRank;
    const newPkg = p?.newPackageRank;
    const pkg = p?.packageRank;
    const displayname = p?.displayname;

    const stripColor = (s: string) =>
      s ? s.replace(/§[0-9a-fk-or]/gi, '').trim() : s;

    if (prefix) {
      const raw = stripColor(prefix);
      const m = raw.match(/\[(.+?)\]/);
      return { tag: m ? `[${m[1]}]` : raw, color: '#FFFFFF' };
    }

    if (displayname) {
      const dn = stripColor(displayname);
      const match = dn.match(/^\s*\[(.+?)\]/);
      if (match) return { tag: `[${match[1]}]`, color: '#FFFFFF' };
    }

    const map: Record<string, { tag: string; color: string }> = {
      VIP: { tag: '[VIP]', color: '#55FF55' },
      VIP_PLUS: { tag: '[VIP+]', color: '#55FF55' },
      MVP: { tag: '[MVP]', color: '#55FFFF' },
      MVP_PLUS: { tag: '[MVP+]', color: '#55FFFF' },
      SUPERSTAR: { tag: '[MVP++]', color: '#FFAA00' },
      MVP_PLUS_PLUS: { tag: '[MVP++]', color: '#FFAA00' },
      YOUTUBER: { tag: '[YOUTUBE]', color: '#FF5555' },
      YT: { tag: '[YOUTUBE]', color: '#FF5555' },
      ADMIN: { tag: '[ADMIN]', color: '#FF5555' },
      OWNER: { tag: '[OWNER]', color: '#FF5555' },
      MOD: { tag: '[MOD]', color: '#55AAFF' },
      HELPER: { tag: '[HELPER]', color: '#55AAFF' },
    };

    const candidates = [rank, monthly, newPkg, pkg]
      .filter(Boolean)
      .map((r: string) => String(r).toUpperCase());

    for (const c of candidates) {
      if (map[c]) return map[c];
      if (c.includes('SUPERSTAR') || c.includes('MVP_PLUS_PLUS') || c.includes('PLUS_PLUS'))
        return map['SUPERSTAR'];
      if (c.includes('VIP')) return map['VIP'];
      if (c.includes('MVP') && c.includes('PLUS')) return map['MVP_PLUS'];
      if (c === 'MVP') return map['MVP'];
      if (c === 'YOUTUBER' || c === 'YT') return map['YOUTUBER'];
    }

    return { tag: null, color: null };
  };

  const rankInfo = getRankInfo(player ?? {});

  let modes = {
    overall: extractModeStats(bw, ""),
    eight_one: extractModeStats(bw, "eight_one_"),
    eight_two: extractModeStats(bw, "eight_two_"),
    four_three: extractModeStats(bw, "four_three_"),
    four_four: extractModeStats(bw, "four_four_"),
    two_four: extractModeStats(bw, "two_four_"),
  };

  return {
    name: player.displayname ?? requestedName,
    uuid: player.uuid ?? requestedUuid,
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
    kdr: +( (bw.kills_bedwars ?? 0) / Math.max(1, (bw.deaths_bedwars ?? 0)) ).toFixed(2),
    mode: mostPlayed,
    winsPerLevel: +(wins / Math.max(1, stars)).toFixed(2),
    fkPerLevel: +(fk / Math.max(1, stars)).toFixed(2),
    bedwarsScore: +(
      (fk / Math.max(1, fd)) *
      (wins / Math.max(1, losses)) *
      (stars / 100)
    ).toFixed(2),
    networkLevel: (() => {
      const exp = player?.networkExp ?? player?.networkExperience ?? 0;
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
    modes: modes ?? undefined
  };
}


function extractModeStats(bw: any, key: string): BedwarsModeStats {
  const gamesPlayed = key === "" ? bw[`${key}games_played_bedwars_1`] : bw[`${key}games_played_bedwars`];
  const fk = bw[`${key}final_kills_bedwars`] ?? 0;
  const fd = bw[`${key}final_deaths_bedwars`] ?? 0;
  const wins = bw[`${key}wins_bedwars`] ?? 0;
  const losses = bw[`${key}losses_bedwars`] ?? 0;
  const bb = bw[`${key}beds_broken_bedwars`] ?? 0;
  const bl = bw[`${key}beds_lost_bedwars`] ?? 0;
  const kills = bw[`${key}kills_bedwars`] ?? 0;
  const deaths = bw[`${key}deaths_bedwars`] ?? 0;

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
