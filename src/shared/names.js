/**
 * @file Display names and labels shared by the main process and the dashboard.
 */

import { CHAOS_PACK } from './catalog.js';
import { CHAOS_SOUND_ID, PitchMode } from './constants.js';

/** Short labels for pitch modes, used by the tray menu and the dashboard. */
export const PITCH_MODE_LABELS = Object.freeze({
  [PitchMode.OFF]: 'Normal',
  [PitchMode.WOBBLE]: 'Wobble',
  [PitchMode.MELODY]: 'Melody',
  [PitchMode.SONG]: 'Song',
});

/**
 * @param {string} id - Pack id or CHAOS_SOUND_ID.
 * @param {{ id: string, name: string }[]} sounds - Available packs.
 * @returns {string} The pack's name, or '' when it no longer exists.
 */
export function soundName(id, sounds) {
  if (id === CHAOS_SOUND_ID) return CHAOS_PACK.name;
  return sounds.find((s) => s.id === id)?.name ?? '';
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * @param {number} bytes - Size in bytes.
 * @returns {string} Size in whole megabytes, e.g. `10 MB`.
 */
export function formatMegabytes(bytes) {
  return `${Math.round(bytes / BYTES_PER_MEGABYTE)} MB`;
}

/**
 * @param {string | null} exe - Executable name, e.g. `Code.exe`.
 * @returns {string} Name without the `.exe` extension.
 */
export function appLabel(exe) {
  return exe ? exe.replace(/\.exe$/i, '') : '';
}
