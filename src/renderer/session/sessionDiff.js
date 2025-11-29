export function calculateDiff(start, end) {
  const diff = {};
  for (const key of Object.keys(start)) {
    if (typeof start[key] === "number" && typeof end[key] === "number") {
      diff[key] = end[key] - start[key];
    }
  }
  return diff;
}
