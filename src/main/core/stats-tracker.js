/**
 * @file Typing statistics, combos and achievements. Only counts are kept, never
 * the text or the order of keys.
 *
 * Definitions used throughout:
 * - A *key* is any key press (letters, Shift, Ctrl, Tab, arrows…). Auto-repeat from
 *   holding a key down is not counted.
 * - A *character* is a key that types something: letters, digits, space, punctuation.
 * - A *word* is five characters, the standard used by typing tests.
 */

import { Combo, Stats, Wpm } from '../constants.js';
import { ACHIEVEMENTS } from './achievements.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Per-day counters, all keyed by `YYYY-MM-DD`. */
const DAILY_FIELDS = ['days', 'characters', 'otherKeys', 'activeMs', 'activeChars'];

/**
 * @typedef {object} StatsData
 * @property {number} total - Keys since install, including history from before per-day tracking.
 * @property {Record<string, number>} days - Keys per day.
 * @property {Record<string, number>} characters - Characters per day.
 * @property {Record<string, number>} otherKeys - Non-character keys per day (Shift, Ctrl, Enter…).
 * @property {Record<string, number>} activeMs - Time spent typing per day: gaps between characters of at most ACTIVE_GAP_MS.
 * @property {Record<string, number>} activeChars - Characters that ended one of those gaps.
 * @property {Record<string, number>} keys - Key name → presses, all time (heatmap).
 * @property {number} bestWpm - Fastest speed sustained over a WINDOW_MS window, excluding key mashing.
 * @property {number} bestCombo
 * @property {number} songNotes
 * @property {string[]} packsTried
 * @property {number} packsCreated
 * @property {Record<string, number>} achievements - Achievement id → unlock timestamp.
 */

/**
 * @typedef {object} UnlockedAchievement
 * @property {string} id
 * @property {string} icon
 * @property {string} name
 * @property {string} description
 * @property {number | null} unlockedAt
 */

/**
 * @typedef {object} KeystrokeResult
 * @property {number} combo - Current combo length.
 * @property {number | null} milestone - Combo milestone reached by this key, if any.
 * @property {UnlockedAchievement[]} achievements - Achievements unlocked by this key.
 */

/**
 * @typedef {object} StatsSnapshot
 * @property {number} total
 * @property {number} today - Keys today.
 * @property {number | null} charactersToday - Null when part of today predates the breakdown.
 * @property {number | null} otherKeysToday - Null when part of today predates the breakdown.
 * @property {number | null} averageWpm - Today's speed while typing, or null with too little data.
 * @property {number} bestWpm
 * @property {number} bestCombo
 * @property {number} streak
 * @property {{ day: string, count: number }[]} days
 * @property {Record<string, number>} keys
 * @property {UnlockedAchievement[]} achievements
 */

/** @returns {StatsData} Empty statistics. */
const emptyStats = () => ({
  total: 0,
  days: {},
  characters: {},
  otherKeys: {},
  activeMs: {},
  activeChars: {},
  keys: {},
  bestWpm: 0,
  bestCombo: 0,
  songNotes: 0,
  packsTried: [],
  packsCreated: 0,
  achievements: {},
});

/**
 * @param {number} ms - Timestamp.
 * @returns {string} Local calendar day as `YYYY-MM-DD`.
 */
export const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA');

/**
 * Converts characters typed over a duration to words per minute.
 * @param {number} chars - Characters.
 * @param {number} ms - Duration in milliseconds.
 * @returns {number} Rounded WPM.
 */
const toWpm = (chars, ms) => Math.round(chars / Wpm.CHARS_PER_WORD / (ms / MINUTE_MS));

/**
 * @param {Record<string, number>} map - Counter map.
 * @param {string} key - Counter name.
 * @param {number} [amount=1] - Increment.
 * @returns {void}
 */
const increment = (map, key, amount = 1) => {
  map[key] = (map[key] || 0) + amount;
};

/**
 * @param {import('./achievements.js').Achievement} a - Definition.
 * @param {number | null} unlockedAt - Unlock time.
 * @returns {UnlockedAchievement} Serializable view of the achievement.
 */
const toPublic = (a, unlockedAt) => ({ id: a.id, icon: a.icon, name: a.name, description: a.description, unlockedAt });

/** Counts keys, characters, speed, combos and streaks, and unlocks achievements. */
export class StatsTracker {
  /**
   * @param {Partial<StatsData>} [data] - Previously saved statistics.
   * @param {object} [options]
   * @param {() => number} [options.now=Date.now] - Clock, injectable for tests.
   */
  constructor(data = {}, { now = Date.now } = {}) {
    this.now = now;
    /** @type {StatsData} */
    this.data = { ...emptyStats(), ...data };
    this.combo = 0;
    this.lastKeyAt = 0;
    this.lastCharacterAt = -Infinity;
    /** @type {number[]} Times of the last few characters, for mash detection. */
    this.lastCharacters = [];
    /** @type {number[]} Times of typed (not mashed) characters inside the speed window. */
    this.recentCharacters = [];
    // Best speeds recorded before mash detection existed may be mashing.
    if (this.data.bestWpm > Wpm.MAX_TYPING_WPM) this.data.bestWpm = 0;
  }

  /**
   * Records one key press.
   * @param {string} key - Key name.
   * @param {object} [options]
   * @param {boolean} [options.printable=false] - Whether the key types a character.
   * @returns {KeystrokeResult} Combo state and newly unlocked achievements.
   */
  record(key, { printable = false } = {}) {
    const t = this.now();
    const d = this.data;
    const day = dayKey(t);
    d.total += 1;
    increment(d.days, day);
    increment(d.keys, key);
    if (printable) {
      increment(d.characters, day);
      this.trackSpeed(t, day);
    } else {
      increment(d.otherKeys, day);
    }

    this.combo = t - this.lastKeyAt <= Combo.WINDOW_MS ? this.combo + 1 : 1;
    this.lastKeyAt = t;
    d.bestCombo = Math.max(d.bestCombo, this.combo);
    const milestone = Combo.MILESTONES.includes(this.combo) ? this.combo : null;

    return { combo: this.combo, milestone, achievements: this.checkAchievements() };
  }

  /** @returns {number} Keys typed today. */
  today() {
    return this.data.days[dayKey(this.now())] || 0;
  }

  /**
   * Today's typing speed, counting only time spent typing (pauses longer than
   * ACTIVE_GAP_MS are left out).
   * @returns {number | null} WPM, or null until there is enough typing to measure.
   */
  averageWpmToday() {
    const day = dayKey(this.now());
    const ms = this.data.activeMs[day] || 0;
    const chars = this.data.activeChars[day] || 0;
    if (ms < Wpm.MIN_ACTIVE_MS_FOR_AVERAGE || chars < Wpm.MIN_CHARS_FOR_AVERAGE) return null;
    return toWpm(chars, ms);
  }

  /**
   * Consecutive days with typing, ending today, or yesterday if nothing has been typed yet today.
   * @returns {number} Streak length in days.
   */
  streak() {
    let t = this.now();
    if (!this.data.days[dayKey(t)]) t -= DAY_MS;
    let streak = 0;
    while (this.data.days[dayKey(t)]) {
      streak += 1;
      t -= DAY_MS;
    }
    return streak;
  }

  /**
   * Notes that a pack was selected.
   * @param {string} id - Pack id.
   * @returns {UnlockedAchievement[]} Newly unlocked achievements.
   */
  notePackTried(id) {
    if (!id || this.data.packsTried.includes(id)) return [];
    this.data.packsTried.push(id);
    return this.checkAchievements();
  }

  /**
   * Notes that a song note was played.
   * @returns {void}
   */
  noteSongNote() {
    this.data.songNotes += 1;
  }

  /**
   * Notes that the user created a pack.
   * @returns {UnlockedAchievement[]} Newly unlocked achievements.
   */
  notePackCreated() {
    this.data.packsCreated += 1;
    return this.checkAchievements();
  }

  /**
   * Removes daily history beyond the retention window.
   * @returns {void}
   */
  prune() {
    const cutoff = dayKey(this.now() - Stats.HISTORY_DAYS * DAY_MS);
    for (const field of DAILY_FIELDS) {
      for (const day of Object.keys(this.data[field])) if (day < cutoff) delete this.data[field][day];
    }
  }

  /**
   * Everything the Stats page shows.
   * @returns {StatsSnapshot} Serializable snapshot.
   */
  snapshot() {
    const day = dayKey(this.now());
    const today = this.today();
    const characters = this.data.characters[day] || 0;
    const otherKeys = this.data.otherKeys[day] || 0;
    // Days that began before the breakdown existed can't be split accurately.
    const complete = characters + otherKeys === today;
    return {
      total: this.data.total,
      today,
      charactersToday: complete ? characters : null,
      otherKeysToday: complete ? otherKeys : null,
      averageWpm: this.averageWpmToday(),
      bestWpm: this.data.bestWpm,
      bestCombo: this.data.bestCombo,
      streak: this.streak(),
      days: this.lastDays(Stats.CHART_DAYS),
      keys: this.data.keys,
      achievements: ACHIEVEMENTS.map((a) => toPublic(a, this.data.achievements[a.id] || null)),
    };
  }

  /**
   * @param {number} count - Number of days.
   * @returns {{ day: string, count: number }[]} Daily key counts, oldest first, ending today.
   */
  lastDays(count) {
    return Array.from({ length: count }, (_, i) => {
      const day = dayKey(this.now() - (count - 1 - i) * DAY_MS);
      return { day, count: this.data.days[day] || 0 };
    });
  }

  /**
   * Speed over the characters typed in the last WINDOW_MS. Uses the number of
   * intervals between characters, so the first character of a burst adds no time.
   * @returns {number} WPM, or 0 with fewer than two characters in the window.
   */
  windowWpm() {
    const chars = this.recentCharacters;
    if (chars.length < 2) return 0;
    return toWpm(chars.length - 1, Math.max(chars.at(-1) - chars[0], 1));
  }

  /**
   * Updates today's typing time and the best speed for one character. Characters
   * typed while mashing keys are left out of both.
   * @param {number} t - Current time.
   * @param {string} day - Current day key.
   * @returns {void}
   */
  trackSpeed(t, day) {
    const gap = t - this.lastCharacterAt;
    this.lastCharacterAt = t;
    this.lastCharacters.push(t);
    if (this.lastCharacters.length > Wpm.MASH_SAMPLE_CHARS) this.lastCharacters.shift();
    if (this.isMashing()) return;

    if (gap <= Wpm.ACTIVE_GAP_MS) {
      increment(this.data.activeMs, day, gap);
      increment(this.data.activeChars, day);
    }
    this.recentCharacters.push(t);
    while (t - this.recentCharacters[0] > Wpm.WINDOW_MS) this.recentCharacters.shift();
    if (this.recentCharacters.length >= Wpm.MIN_CHARS_FOR_BEST) {
      this.data.bestWpm = Math.max(this.data.bestWpm, Math.min(this.windowWpm(), Wpm.MAX_TYPING_WPM));
    }
  }

  /**
   * @returns {boolean} True when the last few characters came faster than anyone types.
   */
  isMashing() {
    const chars = this.lastCharacters;
    if (chars.length < Wpm.MASH_SAMPLE_CHARS) return false;
    return toWpm(chars.length - 1, Math.max(chars.at(-1) - chars[0], 1)) > Wpm.MAX_TYPING_WPM;
  }

  /**
   * Unlocks every achievement whose condition is now met.
   * @returns {UnlockedAchievement[]} Achievements unlocked by this call.
   */
  checkAchievements() {
    const context = { today: this.today(), streak: this.streak(), hour: new Date(this.now()).getHours() };
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id] || !a.test(this.data, context)) continue;
      this.data.achievements[a.id] = this.now();
      unlocked.push(toPublic(a, this.now()));
    }
    return unlocked;
  }
}
