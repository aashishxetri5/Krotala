/**
 * @file Settings defaults, validation of renderer-supplied changes, and migration of
 * files written by older versions.
 */

import {
  FxPosition, FxStyle, Limits, OVERRIDE_KEYS, PitchMode,
} from '../../shared/constants.js';

/** @type {Readonly<import('../../shared/types.js').Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  volume: 0.7,
  soundId: 'dialpad',
  pitchMode: PitchMode.OFF,
  songId: 'fur-elise',
  stereo: true,
  playOnRepeat: false,
  mouseClicks: false,
  keyUpSound: '',
  overrides: Object.freeze(Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, '']))),
  fxEnabled: false,
  fxStyle: FxStyle.AUTO,
  fxSize: 1,
  fxPosition: FxPosition.CARET,
  comboEnabled: true,
  profiles: Object.freeze([]),
  autoMuteMic: true,
  autoMuteFullscreen: false,
  launchAtLogin: false,
  autoUpdate: true,
  customSounds: Object.freeze([]),
  hasShownTrayHint: false,
});

const isBoolean = (v) => typeof v === 'boolean';
const isId = (v) => typeof v === 'string' && v.length < Limits.MAX_ID_LENGTH;
const isNumberIn = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isOneOf = (values) => (v) => Object.values(values).includes(v);

/**
 * Validators for every setting the dashboard may change. Keys not listed here are
 * owned by the main process.
 * @type {Readonly<Record<string, (value: unknown) => boolean>>}
 */
const USER_SETTABLE = Object.freeze({
  enabled: isBoolean,
  volume: isNumberIn(Limits.VOLUME_MIN, Limits.VOLUME_MAX),
  soundId: isId,
  pitchMode: isOneOf(PitchMode),
  songId: isId,
  stereo: isBoolean,
  playOnRepeat: isBoolean,
  mouseClicks: isBoolean,
  keyUpSound: isId,
  overrides: (v) => Boolean(v) && typeof v === 'object'
    && Object.entries(v).every(([key, id]) => OVERRIDE_KEYS.includes(key) && isId(id)),
  fxEnabled: isBoolean,
  fxStyle: isOneOf(FxStyle),
  fxSize: isNumberIn(Limits.FX_SIZE_MIN, Limits.FX_SIZE_MAX),
  fxPosition: isOneOf(FxPosition),
  comboEnabled: isBoolean,
  profiles: (v) => Array.isArray(v) && v.length <= Limits.MAX_PROFILES
    && v.every((p) => p && isId(p.app) && p.app.length > 0 && isId(p.soundId)),
  autoMuteMic: isBoolean,
  autoMuteFullscreen: isBoolean,
  launchAtLogin: isBoolean,
  autoUpdate: isBoolean,
});

/**
 * Filters a renderer-supplied patch down to valid, user-settable values.
 * @param {Record<string, unknown>} patch - Untrusted partial settings.
 * @returns {Partial<import('../../shared/types.js').Settings>} Accepted values only.
 */
export function sanitizePatch(patch) {
  const accepted = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (USER_SETTABLE[key]?.(value)) accepted[key] = value;
  }
  return accepted;
}

/**
 * Upgrades a settings file from any earlier version.
 * @param {Record<string, any> | null} raw - Parsed file contents.
 * @returns {{ settings: import('../../shared/types.js').Settings, legacyStats: object | null }}
 *   Complete settings plus stats that version 1 stored inside the settings file.
 */
export function migrateSettings(raw) {
  const { stats: legacyStats = null, ...saved } = raw || {};
  // Settings removed in later versions are dropped rather than carried forward.
  const known = Object.fromEntries(Object.entries(saved).filter(([key]) => key in DEFAULT_SETTINGS));
  const settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...known,
    overrides: { ...DEFAULT_SETTINGS.overrides, ...known.overrides },
  };
  return { settings, legacyStats };
}
