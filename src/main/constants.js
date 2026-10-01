/**
 * @file Main-process constants: paths, timings, window sizes and tuning values.
 * Must not import Electron so that pure modules (and their tests) can use it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StatsRules } from '../shared/constants.js';

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

export const Input = Object.freeze({
  /**
   * A key that is still marked as held but has been silent for this long is a new
   * press, not an auto-repeat. Windows sometimes drops key-up events (lock screen,
   * Administrator windows); without this the next press would be ignored.
   */
  REPEAT_MAX_GAP_MS: 1500,
});

export const Combo = Object.freeze({
  WINDOW_MS: StatsRules.COMBO_WINDOW_MS,
  /** Combo lengths that trigger a banner, from least to most dramatic. */
  MILESTONES: Object.freeze([50, 100, 250, 500, 1000]),
  PHRASES: Object.freeze({
    50: 'On fire', 100: 'Unstoppable', 250: 'Rampage', 500: 'Godlike', 1000: 'Legendary',
  }),
  /** Combos below this are not shown on the overlay counter. */
  COUNTER_MIN: 20,
});

export const Wpm = Object.freeze({
  WINDOW_MS: StatsRules.SPEED_WINDOW_MS,
  /** Minimum keys in the window before a best score is recorded. */
  MIN_KEYS_FOR_BEST: 25,
  MAX_TYPING_WPM: StatsRules.MAX_TYPING_WPM,
  /** Number of recent characters whose rate decides whether the user is mashing keys. */
  MASH_SAMPLE_CHARS: 5,
  CHARS_PER_WORD: StatsRules.CHARS_PER_WORD,
  ACTIVE_GAP_MS: StatsRules.ACTIVE_GAP_MS,
  /** Today's average speed is shown once there is at least this much typing. */
  MIN_ACTIVE_MS_FOR_AVERAGE: 10_000,
  MIN_CHARS_FOR_AVERAGE: 25,
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
