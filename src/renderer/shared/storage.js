/**
 * @file Local storage for per-device UI preferences (last page, filters). Storage can
 * be unavailable, so every access is guarded and failures are ignored.
 */

const PREFIX = 'keyboard-sounds:';

/**
 * @param {string} key - Preference name.
 * @returns {string | null} Stored value, or null.
 */
export function readPreference(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key - Preference name.
 * @param {string} value - Value to store.
 * @returns {void}
 */
export function writePreference(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage unavailable; the preference is simply not remembered.
  }
}
