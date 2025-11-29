// Round number to specified decimals
export function round(num, decimals) {
  if (decimals <= 0) return Math.floor(num); 
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// Calculate BedWars level from experience
export function getBedWarsLevel(exp, decimals = 0) {
  let level = 100 * (Math.floor(exp / 487000));
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
