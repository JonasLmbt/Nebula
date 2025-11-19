// Hypixel color constants (used for level/star coloring)
const HypixelColors = {
    "AQUA": "#55FFFF",
    "BLACK": "#000000",
    "BLUE": "#5555FF",
    "DARK_AQUA": "#00AAAA",
    "DARK_BLUE": "#0000AA",
    "DARK_GRAY": "#555555",
    "DARK_GREEN": "#00AA00",
    "DARK_PURPLE": "#AA00AA",
    "DARK_RED": "#AA0000",
    "GOLD": "#FFAA00",
    "GRAY": "#AAAAAA",
    "GREEN": "#55FF55",
    "LIGHT_PURPLE": "#FF55FF",
    "RED": "#FF5555",
    "WHITE": "#FFFFFF",
    "YELLOW": "#FFFF55"
};


function formatStars(level, star, ...colors) {
  const span = (color, string) => `<span style="color: ${color}">${string}</span>`;
  let template = ``;
  const levelString = level.toString();

  if (colors.length === levelString.length + 3) {
    const digits = levelString.split('');
    template += span(colors[0], "[");
    for (let i = 0; i < digits.length; i++) {
      template += span(colors[i + 1], digits[i]);
    }
    template += span(colors[colors.length - 2], star);
    template += span(colors[colors.length - 1], "]");
  } else {
    template += span(colors.length == 1 ? colors[0] : '#AAAAAA', `[${level}${star}]`);
  }

  return template;
}


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