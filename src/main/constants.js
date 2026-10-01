/**
 * @file Main-process constants: paths, timings, window sizes and tuning values.
 * Must not import Electron so that pure modules (and their tests) can use it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(MAIN_DIR, '..');

export const IS_MAC = process.platform === 'darwin';
export const IS_WINDOWS = process.platform === 'win32';

export const Paths = Object.freeze({
  PRELOAD: path.join(SRC_DIR, 'preload.cjs'),
  AUDIO_HTML: path.join(SRC_DIR, 'renderer', 'audio', 'audio.html'),
  DASHBOARD_HTML: path.join(SRC_DIR, 'renderer', 'dashboard', 'index.html'),
  OVERLAY_HTML: path.join(SRC_DIR, 'renderer', 'overlay', 'overlay.html'),
  SETTINGS_FILE: 'settings.json',
  STATS_FILE: 'stats.json',
  CUSTOM_SOUNDS_DIR: 'custom-sounds',
  BUILT_IN_SOUNDS_DIR: path.join('assets', 'sounds'),
});

export const Hotkey = Object.freeze({
  TOGGLE_MUTE: 'CommandOrControl+Alt+M',
  TOGGLE_MUTE_LABEL: IS_MAC ? '⌘ ⌥ M' : 'Ctrl + Alt + M',
});

export const Timing = Object.freeze({
  SETTINGS_SAVE_DEBOUNCE_MS: 1000,
  STATS_SAVE_DEBOUNCE_MS: 5000,
  STATS_PUSH_INTERVAL_MS: 1000,
  FOREGROUND_POLL_MS: 600,
  MIC_POLL_MS: 3000,
  MIC_QUERY_TIMEOUT_MS: 5000,
  UPDATE_FIRST_CHECK_DELAY_MS: 10_000,
  UPDATE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000,
});

export const DashboardWindowSize = Object.freeze({
  WIDTH: 1120,
  HEIGHT: 820,
  MIN_WIDTH: 780,
  MIN_HEIGHT: 580,
  BACKGROUND: '#101018',
});

export const Combo = Object.freeze({
  /** Longest pause between two keys that keeps a combo going. */
  WINDOW_MS: 700,
  MILESTONES: Object.freeze([25, 50, 100, 200, 300, 500, 1000]),
  PHRASES: Object.freeze({
    25: 'Nice', 50: 'On fire', 100: 'Unstoppable', 200: 'Rampage', 300: 'Godlike', 500: 'Legendary', 1000: 'Inhuman',
  }),
  /** Combos below this are not shown on the overlay counter. */
  COUNTER_MIN: 10,
});

export const Wpm = Object.freeze({
  WINDOW_MS: 10_000,
  /** Minimum keys in the window before a best score is recorded. */
  MIN_KEYS_FOR_BEST: 25,
  /** Higher readings come from macros or pasted input and are ignored. */
  MAX_PLAUSIBLE: 250,
  /** Typing idle for this long reads as 0 WPM. */
  IDLE_MS: 3000,
  CHARS_PER_WORD: 5,
});

export const Stats = Object.freeze({
  HISTORY_DAYS: 365,
  CHART_DAYS: 30,
});

export const Playback = Object.freeze({
  MIN_RATE: 0.25,
  MAX_RATE: 4,
  WOBBLE_SEMITONES: 1.5,
  RELEASE_GAIN: 0.8,
  FOREIGN_RELEASE_GAIN: 0.45,
  FOREIGN_RELEASE_RATE: 1.25,
  /** Max stereo spread so no sound is fully in one ear. */
  STEREO_WIDTH: 0.8,
});

export const MAX_RECENT_APPS = 12;
