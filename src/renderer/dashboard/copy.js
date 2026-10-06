/**
 * @file User-facing labels and descriptions for the dashboard.
 */

import {
  EchoMode, FxPosition, FxStyle, PitchMode, StatsRules, UpdateStatus,
} from '../../shared/constants.js';
import { PITCH_MODE_LABELS } from '../../shared/names.js';

/**
 * @param {number} ms - Duration.
 * @returns {string} Duration in seconds, e.g. `0.7 seconds`.
 */
const seconds = (ms) => `${ms / 1000} second${ms === 1000 ? '' : 's'}`;

/** Definitions shown when hovering a Stats tile (first line is the title). */
export const STAT_DEFINITIONS = Object.freeze({
  today: 'Keys today\nEvery key press counts, including Shift, Ctrl, Alt, Tab and Enter.\nHolding a key down counts once.',
  total: 'All time\nEvery key press since you installed the app.',
  streak: 'Day streak\nDays in a row with at least one key press.',
  averageWpm: `Average speed today\nWords per minute while typing (a word is ${StatsRules.CHARS_PER_WORD} characters).\n`
    + `Pauses longer than ${seconds(StatsRules.ACTIVE_GAP_MS)} and key mashing faster than ${StatsRules.MAX_TYPING_WPM} WPM are left out.`,
  bestWpm: `Best speed\nFastest words per minute held for ${seconds(StatsRules.SPEED_WINDOW_MS)}.\n`
    + `Key mashing faster than ${StatsRules.MAX_TYPING_WPM} WPM is left out.`,
  bestCombo: `Best combo\nMost keys in a row without a pause longer than ${seconds(StatsRules.COMBO_WINDOW_MS)}.`,
});

export const PAGES = Object.freeze([
  { id: 'sounds', label: 'Sounds', icon: 'audio-lines' },
  { id: 'keys', label: 'Keys', icon: 'keyboard' },
  { id: 'effects', label: 'Effects', icon: 'wand-sparkles' },
  { id: 'apps', label: 'Apps', icon: 'app-window' },
  { id: 'stats', label: 'Stats', icon: 'chart-column' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]);
export const DEFAULT_PAGE = 'sounds';

export const PITCH_MODES = Object.freeze([
  { value: PitchMode.OFF, label: PITCH_MODE_LABELS[PitchMode.OFF], hint: 'Every key plays the sound at its natural pitch.' },
  { value: PitchMode.WOBBLE, label: PITCH_MODE_LABELS[PitchMode.WOBBLE], hint: 'A slight random detune on each press, so repeated keys sound less mechanical.' },
  { value: PitchMode.MELODY, label: PITCH_MODE_LABELS[PitchMode.MELODY], hint: 'Each key is a note on a pentatonic scale. Works best with Piano, Harmonium or Marimba.' },
  { value: PitchMode.SONG, label: PITCH_MODE_LABELS[PitchMode.SONG], hint: 'Every key press plays the next note of the chosen song.' },
]);

export const ECHO_MODES = Object.freeze([
  { value: EchoMode.OFF, label: 'Off' },
  { value: EchoMode.SHORT, label: 'Short' },
  { value: EchoMode.LONG, label: 'Long' },
]);

export const FX_STYLES = Object.freeze([
  { value: FxStyle.AUTO, label: 'Match the pack', icon: 'sparkles' },
  { value: FxStyle.ICON, label: 'Pack icon', icon: 'star' },
  { value: FxStyle.NOTES, label: 'Notes', icon: 'music' },
  { value: FxStyle.RIPPLE, label: 'Ripples', icon: 'audio-waveform' },
  { value: FxStyle.CONFETTI, label: 'Confetti', icon: 'sparkles' },
  { value: FxStyle.BUBBLES, label: 'Bubbles', icon: 'droplets' },
  { value: FxStyle.BULLET, label: 'Bullet holes', icon: 'crosshair' },
  { value: FxStyle.LASER, label: 'Lasers', icon: 'zap' },
  { value: FxStyle.SLASH, label: 'Slashes', icon: 'swords' },
]);

export const FX_POSITIONS = Object.freeze([
  { value: FxPosition.CARET, label: 'Text cursor' },
  { value: FxPosition.MOUSE, label: 'Mouse' },
  { value: FxPosition.RANDOM, label: 'Anywhere' },
]);

export const OVERRIDE_LABELS = Object.freeze({
  Enter: 'Enter',
  Space: 'Space',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Letters: 'Letters A–Z',
  Numbers: 'Numbers 0–9',
  Modifiers: 'Shift, Ctrl, Alt',
  Arrows: 'Arrow keys',
  Mouse: 'Mouse clicks',
});

/**
 * @param {{ status: string, version: string | null, progress: number, error: string | null }} u - Update state.
 * @returns {string} Status line for the Settings page.
 */
export function describeUpdate(u) {
  switch (u.status) {
    case UpdateStatus.DEV: return 'Updates are delivered to installed copies of the app.';
    case UpdateStatus.UNAVAILABLE: return "This build doesn't receive updates. Install a release from GitHub to get them.";
    case UpdateStatus.STORE: return 'The Microsoft Store keeps this app up to date.';
    case UpdateStatus.IDLE: return 'Not checked yet.';
    case UpdateStatus.CHECKING: return 'Checking for updates…';
    case UpdateStatus.LATEST: return "You're on the latest version.";
    case UpdateStatus.AVAILABLE: return `Version ${u.version} is available.`;
    case UpdateStatus.DOWNLOADING: return `Downloading version ${u.version}…`;
    case UpdateStatus.READY: return `Version ${u.version} is ready to install.`;
    case UpdateStatus.ERROR: return `Couldn't check for updates. ${u.error ?? ''}`.trim();
    default: return '';
  }
}
