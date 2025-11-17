// renderer/util/storage.js
// Provides safe wrappers around localStorage with JSON handling.

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Safely get a JSON value from localStorage.
 */
export function loadJSON(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return safeParse(raw, fallback);
}

/**
 * Write a JSON value to localStorage.
 */
export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[Storage] Failed to save key: ${key}`, e);
  }
}

/**
 * Delete a key from storage.
 */
export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[Storage] Failed to remove key: ${key}`, e);
  }
}

/**
 * Namespaced storage helper.
 */
export function namespace(prefix) {
  const p = String(prefix).trim();

  return {
    get(key, fallback = null) {
      return loadJSON(p + ":" + key, fallback);
    },
    set(key, value) {
      saveJSON(p + ":" + key, value);
    },
    remove(key) {
      removeKey(p + ":" + key);
    },
  };
}

/**
 * Apply a migration once.
 */
export function runMigration(id, fn) {
  const MIGRATION_KEY = "__nebula_migrations";
  const done = loadJSON(MIGRATION_KEY, []);

  if (done.includes(id)) return;

  try {
    fn();
    done.push(id);
    saveJSON(MIGRATION_KEY, done);
  } catch (e) {
    console.error("[Migration] Failed:", id, e);
  }
}
