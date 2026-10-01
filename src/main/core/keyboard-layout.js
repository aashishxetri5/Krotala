/**
 * @file Facts about keys: groups, physical position, melody degree and printability.
 * Key names are the ones produced by uiohook-napi (`A`, `Enter`, `Numpad5`, `ShiftRight`…).
 */

import { Playback } from '../constants.js';

const MODIFIERS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);
const PUNCTUATION = new Set([
  'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote', 'BracketLeft', 'Backslash', 'BracketRight', 'Quote',
]);

/** Horizontal position of keys on a US layout, in key widths from the left edge. */
const KEY_X = {};
const KEYBOARD_WIDTH = 14;

/**
 * Places a run of keys on the layout.
 * @param {string[]} keys - Key names, left to right.
 * @param {number} start - Position of the first key.
 * @param {number} [step=1] - Distance between keys.
 * @returns {void}
 */
function placeRow(keys, start, step = 1) {
  keys.forEach((k, i) => { KEY_X[k] = start + i * step; });
}
placeRow(['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'], 0, 1.1);
placeRow(['Backquote', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal'], 0);
placeRow(['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'BracketLeft', 'BracketRight', 'Backslash'], 1.5);
placeRow(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote'], 1.75);
placeRow(['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash'], 2.25);
Object.assign(KEY_X, {
  Backspace: 13.5, Tab: 0.5, CapsLock: 0.75, Enter: 13.25, Shift: 1, ShiftRight: 13,
  Ctrl: 0.5, Meta: 1.5, Alt: 2.5, Space: 7, AltRight: 10, MetaRight: 11, CtrlRight: 13,
});

/** Melody mode: keyboard rows climb a major pentatonic scale. */
const PENTATONIC = [0, 2, 4, 7, 9];
const MELODY_ROWS = ['ZXCVBNM', 'ASDFGHJKL', 'QWERTYUIOP', '1234567890'];
const MELODY_DEGREE = {};
MELODY_ROWS.forEach((letters, row) => {
  [...letters].forEach((ch, col) => { MELODY_DEGREE[ch] = row * 2 + col; });
});
/** Degrees used for keys outside the melody rows. */
const FALLBACK_DEGREES = 7;

/**
 * Maps the numpad Enter key onto Enter so both share overrides and special samples.
 * @param {string} key - Key name.
 * @returns {string} Normalized key name.
 */
export function normalizeKey(key) {
  return key === 'NumpadEnter' ? 'Enter' : key;
}

/**
 * Returns the override group a key belongs to.
 * @param {string} key - Normalized key name.
 * @returns {string | null} Group name from OVERRIDE_KEYS, or null.
 */
export function keyGroup(key) {
  if (/^[A-Z]$/.test(key)) return 'Letters';
  if (/^(Numpad)?\d$/.test(key)) return 'Numbers';
  if (MODIFIERS.has(key)) return 'Modifiers';
  if (key.includes('Arrow')) return 'Arrows';
  if (key.startsWith('Mouse')) return 'Mouse';
  return null;
}

/**
 * @param {string} key - Key name.
 * @returns {boolean} True for Shift, Ctrl, Alt and Meta keys.
 */
export function isModifier(key) {
  return MODIFIERS.has(key);
}

/**
 * Whether a key produces a character; used for words-per-minute.
 * @param {string} key - Key name.
 * @returns {boolean} True for letters, digits, space and punctuation.
 */
export function isPrintable(key) {
  return /^[A-Z]$/.test(key) || /^(Numpad)?\d$/.test(key) || key === 'Space' || PUNCTUATION.has(key);
}

/**
 * Stereo position of a key based on where it sits on the keyboard.
 * @param {string} key - Key name.
 * @returns {number} Pan from -STEREO_WIDTH (left) to STEREO_WIDTH (right).
 */
export function keyPan(key) {
  if (key in KEY_X) return ((KEY_X[key] / KEYBOARD_WIDTH) * 2 - 1) * Playback.STEREO_WIDTH;
  if (/^(Numpad|Arrow|Page|Home|End|Insert|Delete)/.test(key)) return Playback.STEREO_WIDTH;
  return 0;
}

/**
 * Small, stable string hash (djb2) used to give every key a consistent sample.
 * @param {string} str - Input string.
 * @returns {number} Unsigned 32-bit hash.
 */
export function hashKey(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Pitch of a key in Melody mode.
 * @param {string} key - Key name.
 * @returns {number} Semitones relative to the sample's natural pitch.
 */
export function melodySemitones(key) {
  let degree = MELODY_DEGREE[key.replace(/^Numpad(?=\d$)/, '')];
  if (degree === undefined) degree = hashKey(key) % FALLBACK_DEGREES;
  return Math.floor(degree / PENTATONIC.length) * 12 + PENTATONIC[degree % PENTATONIC.length] - 12;
}
