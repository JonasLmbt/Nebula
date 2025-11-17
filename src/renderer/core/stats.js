// renderer/core/stats.js

/**
 * Utility to convert raw Hypixel / backend responses into a uniform
 * Bedwars stats object used throughout the UI.
 */

export function normalizeBedwarsStats(player) {
  if (!player || typeof player !== "object") {
    return {
      name: "",
      level: 0,
      ws: 0,
      fk: 0,
      fd: 0,
      fkdr: 0,
      wins: 0,
      losses: 0,
      wlr: 0,
      bb: 0,
      bl: 0,
      bblr: 0,
      uuid: null,
    };
  }

  // Level / Stars
  const level =
    typeof player.level === "number"
      ? player.level
      : player.stats?.Bedwars?.Experience != null
      ? getBedWarsLevel(Number(player.stats.Bedwars.Experience))
      : 0;

  const fk = Number(
    player.fk ??
      player.finalKills ??
      player.stats?.Bedwars?.final_kills_bedwars ??
      0
  );
  const fd = Number(
    player.fd ??
      player.finalDeaths ??
      player.stats?.Bedwars?.final_deaths_bedwars ??
      0
  );
  const wins = Number(
    player.wins ?? player.stats?.Bedwars?.wins_bedwars ?? 0
  );
  const losses = Number(
    player.losses ?? player.stats?.Bedwars?.losses_bedwars ?? 0
  );
  const bb = Number(
    player.bb ??
      player.bedsBroken ??
      player.stats?.Bedwars?.beds_broken_bedwars ??
      0
  );
  const bl = Number(
    player.bl ??
      player.bedsLost ??
      player.stats?.Bedwars?.beds_lost_bedwars ??
      0
  );
  const ws = Number(
    player.ws ??
      player.winstreak ??
      player.stats?.Bedwars?.winstreak ??
      0
  );

  const fkdr = fd > 0 ? fk / fd : fk > 0 ? fk : 0;
  const wlr = losses > 0 ? wins / losses : wins > 0 ? wins : 0;
  const bblr = bl > 0 ? bb / bl : bb > 0 ? bb : 0;

  const uuid = player.uuid || player.id || null;

  return {
    name:
      player.name || player.username || player.displayName || "",
    level,
    ws,
    fk,
    fd,
    fkdr,
    wins,
    losses,
    wlr,
    bb,
    bl,
    bblr,
    uuid,
  };
}


export function getBedWarsLevel(experience) {
  let exp = Number(experience) || 0;

  let level = 100 * Math.floor(exp / 487000);
  exp = exp % 487000;

  if (exp < 500) return level + exp / 500;
  level++;
  if (exp < 1500) return level + (exp - 500) / 1000;
  level++;
  if (exp < 3500) return level + (exp - 1500) / 2000;
  level++;
  if (exp < 7000) return level + (exp - 3500) / 3500;
  level++;
  exp -= 7000;
  return level + exp / 5000;
}


// Hypixel color constants (used for star / rank coloring)
export const HypixelColors = {
  AQUA: "#55FFFF",
  BLACK: "#000000",
  BLUE: "#5555FF",
  DARK_AQUA: "#00AAAA",
  DARK_BLUE: "#0000AA",
  DARK_GRAY: "#555555",
  DARK_GREEN: "#00AA00",
  DARK_PURPLE: "#AA00AA",
  DARK_RED: "#AA0000",
  GOLD: "#FFAA00",
  GRAY: "#AAAAAA",
  GREEN: "#55FF55",
  LIGHT_PURPLE: "#FF55FF",
  RED: "#FF5555",
  WHITE: "#FFFFFF",
  YELLOW: "#FFFF55",
};

/**
 * Format a Bedwars star string with color segments.
 */
export function formatStars(level, star, ...colors) {
  const span = (color, string) =>
    `<span style="color: ${color}">${string}</span>`;
  let template = "";
  const levelString = String(level);

  if (colors.length === levelString.length + 3) {
    const digits = levelString.split("");
    template += span(colors[0], "[");
    for (let i = 0; i < digits.length; i++) {
      template += span(colors[i + 1], digits[i]);
    }
    template += span(colors[colors.length - 2], star);
    template += span(colors[colors.length - 1], "]");
  } else {
    template += span(
      colors.length === 1 ? colors[0] : "#AAAAAA",
      `[${level}${star}]`
    );
  }

  return template;
}

/**
 * Color the Bedwars star display based on star count.
 */
export function starColor(stars) {
  const { AQUA, BLACK, BLUE, DARK_AQUA, DARK_BLUE, DARK_GRAY, DARK_GREEN, DARK_PURPLE, DARK_RED, GOLD, GRAY, GREEN, LIGHT_PURPLE, RED, WHITE, YELLOW } = HypixelColors;

  if (stars < 100) return formatStars(stars, '✫', GRAY);
  else if (stars < 200) return formatStars(stars, '✫', WHITE);
  else if (stars < 300) return formatStars(stars, '✫', GOLD);
  else if (stars < 400) return formatStars(stars, '✫', AQUA);
  else if (stars < 500) return formatStars(stars, '✫', DARK_GREEN);
  else if (stars < 600) return formatStars(stars, '✫', DARK_AQUA);
  else if (stars < 700) return formatStars(stars, '✫', DARK_RED);
  else if (stars < 800) return formatStars(stars, '✫', LIGHT_PURPLE);
  else if (stars < 900) return formatStars(stars, '✫', BLUE);
  else if (stars < 1000) return formatStars(stars, '✫', DARK_PURPLE);
  else if (stars < 1100) return formatStars(stars, '✫', RED, GOLD, YELLOW, GREEN, AQUA, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 1200) return formatStars(stars, '✪', GRAY, WHITE, WHITE, WHITE, WHITE, GRAY, GRAY);
  else if (stars < 1300) return formatStars(stars, '✪', GRAY, YELLOW, YELLOW, YELLOW, YELLOW, GOLD, GRAY);
  else if (stars < 1400) return formatStars(stars, '✪', GRAY, AQUA, AQUA, AQUA, AQUA, DARK_AQUA, GRAY);
  else if (stars < 1500) return formatStars(stars, '✪', GRAY, GREEN, GREEN, GREEN, GREEN, DARK_GREEN, GRAY);
  else if (stars < 1600) return formatStars(stars, '✪', GRAY, DARK_AQUA, DARK_AQUA, DARK_AQUA, DARK_AQUA, BLUE, GRAY);
  else if (stars < 1700) return formatStars(stars, '✪', GRAY, RED, RED, RED, RED, DARK_RED, GRAY);
  else if (stars < 1800) return formatStars(stars, '✪', GRAY, LIGHT_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE, GRAY);
  else if (stars < 1900) return formatStars(stars, '✪', GRAY, BLUE, BLUE, BLUE, BLUE, DARK_BLUE, GRAY);
  else if (stars < 2000) return formatStars(stars, '✪', GRAY, DARK_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_GRAY, GRAY);
  else if (stars < 2100) return formatStars(stars, '✪', DARK_GRAY, GRAY, WHITE, WHITE, GRAY, GRAY, DARK_GRAY);
  else if (stars < 2200) return formatStars(stars, '⚝', WHITE, WHITE, YELLOW, YELLOW, GOLD, GOLD, GOLD);
  else if (stars < 2300) return formatStars(stars, '⚝', GOLD, GOLD, WHITE, WHITE, AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 2400) return formatStars(stars, '⚝', DARK_PURPLE, DARK_PURPLE, LIGHT_PURPLE, LIGHT_PURPLE, GOLD, YELLOW, YELLOW);
  else if (stars < 2500) return formatStars(stars, '⚝', AQUA, AQUA, WHITE, WHITE, GRAY, GRAY, DARK_GRAY);
  else if (stars < 2600) return formatStars(stars, '⚝', WHITE, WHITE, GREEN, GREEN, DARK_GRAY, DARK_GRAY, DARK_GRAY);
  else if (stars < 2700) return formatStars(stars, '⚝', DARK_RED, DARK_RED, RED, RED, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 2800) return formatStars(stars, '⚝', YELLOW, YELLOW, WHITE, WHITE, DARK_GRAY, DARK_GRAY, DARK_GRAY);
  else if (stars < 2900) return formatStars(stars, '⚝', GREEN, GREEN, DARK_GREEN, DARK_GREEN, GOLD, GOLD, YELLOW);
  else if (stars < 3000) return formatStars(stars, '⚝', AQUA, AQUA, DARK_AQUA, DARK_AQUA, BLUE, BLUE, DARK_BLUE);
  else if (stars < 3100) return formatStars(stars, '⚝', YELLOW, YELLOW, GOLD, GOLD, RED, RED, DARK_RED);
  else if (stars < 3200) return formatStars(stars, '✥', BLUE, BLUE, AQUA, AQUA, GOLD, GOLD, YELLOW);
  else if (stars < 3300) return formatStars(stars, '✥', RED, DARK_RED, GRAY, GRAY, DARK_RED, RED, RED);
  else if (stars < 3400) return formatStars(stars, '✥', BLUE, BLUE, BLUE, LIGHT_PURPLE, RED, RED, DARK_RED);
  else if (stars < 3500) return formatStars(stars, '✥', DARK_GREEN, GREEN, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE, DARK_PURPLE, DARK_GREEN);
  else if (stars < 3600) return formatStars(stars, '✥', RED, RED, DARK_RED, DARK_RED, DARK_GREEN, GREEN, GREEN);
  else if (stars < 3700) return formatStars(stars, '✥', GREEN, GREEN, GREEN, AQUA, BLUE, BLUE, DARK_BLUE);
  else if (stars < 3800) return formatStars(stars, '✥', DARK_RED, DARK_RED, RED, RED, AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 3900) return formatStars(stars, '✥', DARK_BLUE, DARK_BLUE, BLUE, DARK_PURPLE, DARK_PURPLE, LIGHT_PURPLE, DARK_BLUE);
  else if (stars < 4000) return formatStars(stars, '✥', RED, RED, GREEN, GREEN, AQUA, BLUE, BLUE);
  else if (stars < 4100) return formatStars(stars, '✥', DARK_PURPLE, DARK_PURPLE, RED, RED, GOLD, GOLD, YELLOW);
  else if (stars < 4200) return formatStars(stars, '✥', YELLOW, YELLOW, GOLD, RED, LIGHT_PURPLE, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 4300) return formatStars(stars, '✥', DARK_BLUE, BLUE, DARK_AQUA, AQUA, WHITE, GRAY, GRAY);
  else if (stars < 4400) return formatStars(stars, '✥', BLACK, DARK_PURPLE, DARK_GRAY, DARK_GRAY, DARK_PURPLE, DARK_PURPLE, BLACK);
  else if (stars < 4500) return formatStars(stars, '✥', DARK_GREEN, DARK_GREEN, GREEN, YELLOW, GOLD, DARK_PURPLE, LIGHT_PURPLE);
  else if (stars < 4600) return formatStars(stars, '✥', WHITE, WHITE, AQUA, AQUA, DARK_AQUA, DARK_AQUA, DARK_AQUA);
  else if (stars < 4700) return formatStars(stars, '✥', DARK_AQUA, AQUA, YELLOW, YELLOW, GOLD, LIGHT_PURPLE, DARK_PURPLE);
  else if (stars < 4800) return formatStars(stars, '✥', WHITE, DARK_RED, RED, RED, BLUE, DARK_BLUE, BLUE);
  else if (stars < 4900) return formatStars(stars, '✥', DARK_PURPLE, DARK_PURPLE, RED, GOLD, YELLOW, AQUA, DARK_AQUA);
  else if (stars < 5000) return formatStars(stars, '✥', DARK_GREEN, GREEN, WHITE, WHITE, GREEN, GREEN, DARK_GREEN);
  else return formatStars(stars, '✥', DARK_RED, DARK_RED, DARK_PURPLE, BLUE, BLUE, DARK_BLUE, BLACK);
}


/**
 * Build the HTML for the player level / star display.
 * Accepts either a full player object or a stats-like object.
 */
export function updatePlayerLevel(player) {
  const exp =
    player?.stats?.Bedwars?.Experience ?? player?.experience;
  if (exp != null && !Number.isNaN(Number(exp))) {
    const level = Math.floor(getBedWarsLevel(Number(exp)));
    return starColor(level);
  }

  const levelNum = player?.level ?? 0;
  // Fallback: simple gray star
  return formatStars(levelNum, "✫", HypixelColors.GRAY);
}


/**
 * Core STATS metadata used for the column config.
 * The concrete values (layout, visible, colorRules) are stored in statSettings,
 * but this object describes each possible stat.
 */
export const STATS = {
  level: { name: "Level", short: "Lvl", type: "number" },
  ws: { name: "Win Streak", short: "WS", type: "number", colorRules: true },
  mode: { name: "Most Played Mode", short: "Mode", type: "text" },
  fkdr: { name: "Final K/D Ratio", short: "FKDR", type: "number", colorRules: true },
  wlr: { name: "Win/Loss Ratio", short: "WLR", type: "number", colorRules: true },
  bblr: { name: "Bed Break/Loss Ratio", short: "BBLR", type: "number", colorRules: true },
  fk: { name: "Final Kills", short: "F. Kills", type: "number", colorRules: true },
  fd: { name: "Final Deaths", short: "F. Deaths", type: "number", colorRules: true },
  wins: { name: "Wins", short: "Wins", type: "number", colorRules: true },
  losses: { name: "Losses", short: "Losses", type: "number", colorRules: true },
  bedsBroken: { name: "Beds Broken", short: "Beds", type: "number", colorRules: true },
  bedsLost: { name: "Beds Lost", short: "Beds L.", type: "number", colorRules: true },
  kills: { name: "Kills", short: "Kills", type: "number", colorRules: true },
  deaths: { name: "Deaths", short: "Deaths", type: "number", colorRules: true },

  winsPerLevel: {
    name: "Wins per Level",
    short: "Wins/Level",
    type: "number",
    colorRules: true,
    calc: (p) => {
      const lvl =
        (p &&
          (typeof p.level === "number"
            ? p.level
            : p.stats?.Bedwars?.Experience != null
            ? Math.floor(getBedWarsLevel(Number(p.stats.Bedwars.Experience)))
            : 0)) ||
        0;
      const wins = Number(p?.wins ?? 0);
      return lvl > 0 ? wins / lvl : 0;
    },
  },

  fkPerLevel: {
    name: "Final Kills per Level",
    short: "FK/Level",
    type: "number",
    colorRules: true,
    calc: (p) => {
      const lvl =
        (p &&
          (typeof p.level === "number"
            ? p.level
            : p.stats?.Bedwars?.Experience != null
            ? Math.floor(getBedWarsLevel(Number(p.stats.Bedwars.Experience)))
            : 0)) ||
        0;
      const fk = Number(p?.fk ?? 0);
      return lvl > 0 ? fk / lvl : 0;
    },
  },

  bedwarsScore: {
    name: "Bedwars Score",
    short: "Score",
    type: "number",
    colorRules: true,
    calc: (p) => {
      let level = Number(p?.level ?? 0);
      if ((!level || !Number.isFinite(level)) && p?.experience != null) {
        try {
          level = Math.floor(getBedWarsLevel(Number(p.experience)));
        } catch {
          // ignore
        }
      }
      const fkdr = Number(p?.fkdr ?? 0);
      const wlr = Number(p?.wlr ?? 0);
      if (
        !Number.isFinite(fkdr) ||
        !Number.isFinite(wlr) ||
        !Number.isFinite(level)
      ) {
        return 0;
      }
      const score = fkdr * wlr * (level / 100);
      return Number.isFinite(score) ? +score.toFixed(2) : 0;
    },
  },

  mfkdr: {
    name: "Monthly Final K/D Ratio",
    short: "Monthly FKDR",
    type: "number",
    colorRules: true,
    disabled: true,
  },
  mwlr: {
    name: "Monthly Win/Loss Ratio",
    short: "Monthly WLR",
    type: "number",
    colorRules: true,
    disabled: true,
  },
  mbblr: {
    name: "Monthly Bed Break/Loss Ratio",
    short: "Monthly BBLR",
    type: "number",
    colorRules: true,
    disabled: true,
  },

  guildName: { name: "Guild Name", short: "Guild", type: "text" },
  guildTag: { name: "Guild Tag", short: "Tag", type: "text" },
};

export function getNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Apply color rules from statSettings.colorRules[column] to a value.
 * statSettings is injected so this module stays independent.
 */
export function getColorForValue(column, value, statSettings) {
  const rules = statSettings?.colorRules?.[column];
  if (!rules || !Array.isArray(rules)) return "";

  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";

  for (const rule of rules) {
    if (rule.op === ">=" && num >= rule.value) {
      return `style="color:${rule.color}"`;
    }
    if (rule.op === "<" && num < rule.value) {
      return `style="color:${rule.color}"`;
    }
  }
  return "";
}

/**
 * Returns a numeric value that can be used for sorting by the
 * given stat key.
 */
export function getSortValue(player, key) {
  switch (key) {
    case "level": {
      if (player?.level != null) return getNumeric(player.level);
      const exp = player?.stats?.Bedwars?.Experience ?? player?.experience;
      return exp != null ? Math.floor(getBedWarsLevel(Number(exp))) : 0;
    }
    case "networkLevel":
      return getNumeric(player?.networkLevel ?? 0);
    case "ws":
      return getNumeric(player?.ws ?? 0);
    case "fkdr":
      return getNumeric(player?.fkdr ?? 0);
    case "wlr":
      return getNumeric(player?.wlr ?? 0);
    case "bblr":
      return getNumeric(player?.bblr ?? 0);
    case "fk":
      return getNumeric(player?.fk ?? 0);
    case "fd":
      return getNumeric(player?.fd ?? 0);
    case "wins":
      return getNumeric(player?.wins ?? 0);
    case "losses":
      return getNumeric(player?.losses ?? 0);
    case "bedsBroken":
      return getNumeric(player?.bedsBroken ?? 0);
    case "bedsLost":
      return getNumeric(player?.bedsLost ?? 0);
    case "kills":
      return getNumeric(player?.kills ?? 0);
    case "deaths":
      return getNumeric(player?.deaths ?? 0);
    case "winsPerLevel":
      return getNumeric(STATS.winsPerLevel.calc(player));
    case "fkPerLevel":
      return getNumeric(STATS.fkPerLevel.calc(player));
    case "score":
    case "bedwarsScore": {
      const v =
        player && typeof player.bedwarsScore === "number"
          ? player.bedwarsScore
          : STATS.bedwarsScore.calc(player);
      return getNumeric(v);
    }
    case "mfkdr":
      return getNumeric(player?.mfkdr ?? NaN);
    case "mwlr":
      return getNumeric(player?.mwlr ?? NaN);
    case "mbblr":
      return getNumeric(player?.mbblr ?? NaN);
    default:
      return 0;
  }
}
