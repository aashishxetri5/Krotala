/**
 * @file Typing statistics, combos and achievements. Only counts are kept, never
 * the text or the order of keys.
 */

import { Combo, Stats, Wpm } from '../constants.js';
import { ACHIEVEMENTS } from './achievements.js';

const DAY_MS = 86_400_000;

/**
 * @typedef {object} StatsData
 * @property {number} total - Keys typed since install.
 * @property {Record<string, number>} days - `YYYY-MM-DD` → key count.
 * @property {Record<string, number>} keys - Key name → press count (heatmap).
 * @property {number} bestWpm
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

/** @returns {StatsData} Empty statistics. */
const emptyStats = () => ({
  total: 0,
  days: {},
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
 * @param {import('./achievements.js').Achievement} a - Definition.
 * @param {number | null} unlockedAt - Unlock time.
 * @returns {UnlockedAchievement} Serializable view of the achievement.
 */
const toPublic = (a, unlockedAt) => ({ id: a.id, icon: a.icon, name: a.name, description: a.description, unlockedAt });

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
    /** @type {number[]} */
    this.recentPrintable = [];
  }

  /**
   * Records one key press.
   * @param {string} key - Key name.
   * @param {object} [options]
   * @param {boolean} [options.printable=false] - Whether the key produces a character.
   * @returns {KeystrokeResult} Combo state and newly unlocked achievements.
   */
  record(key, { printable = false } = {}) {
    const t = this.now();
    const d = this.data;
    const day = dayKey(t);
    d.total += 1;
    d.days[day] = (d.days[day] || 0) + 1;
    d.keys[key] = (d.keys[key] || 0) + 1;

    this.combo = t - this.lastKeyAt <= Combo.WINDOW_MS ? this.combo + 1 : 1;
    this.lastKeyAt = t;
    d.bestCombo = Math.max(d.bestCombo, this.combo);
    const milestone = Combo.MILESTONES.includes(this.combo) ? this.combo : null;

    if (printable) this.trackSpeed(t);
    return { combo: this.combo, milestone, achievements: this.checkAchievements() };
  }

  /**
   * Words per minute over the last few seconds of typing (a word is five characters).
   * @returns {number} Current WPM, or 0 when idle.
   */
  currentWpm() {
    const t = this.now();
    const recent = this.recentPrintable.filter((ts) => t - ts <= Wpm.WINDOW_MS);
    if (recent.length < Wpm.CHARS_PER_WORD || t - recent.at(-1) > Wpm.IDLE_MS) return 0;
    const spanMs = Math.max(recent.at(-1) - recent[0], 2000);
    return Math.round(recent.length / Wpm.CHARS_PER_WORD / (spanMs / 60_000));
  }

  /** @returns {number} Current combo, or 0 once it has lapsed. */
  currentCombo() {
    return this.now() - this.lastKeyAt <= Combo.WINDOW_MS ? this.combo : 0;
  }

  /** @returns {number} Keys typed today. */
  today() {
    return this.data.days[dayKey(this.now())] || 0;
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
    for (const day of Object.keys(this.data.days)) if (day < cutoff) delete this.data.days[day];
  }

  /**
   * Everything the Stats page shows.
   * @returns {object} Serializable snapshot.
   */
  snapshot() {
    return {
      total: this.data.total,
      today: this.today(),
      streak: this.streak(),
      currentWpm: this.currentWpm(),
      bestWpm: this.data.bestWpm,
      combo: this.currentCombo(),
      bestCombo: this.data.bestCombo,
      songNotes: this.data.songNotes,
      days: this.lastDays(Stats.CHART_DAYS),
      keys: this.data.keys,
      achievements: ACHIEVEMENTS.map((a) => toPublic(a, this.data.achievements[a.id] || null)),
    };
  }

  /**
   * @param {number} count - Number of days.
   * @returns {{ day: string, count: number }[]} Daily counts, oldest first, ending today.
   */
  lastDays(count) {
    return Array.from({ length: count }, (_, i) => {
      const day = dayKey(this.now() - (count - 1 - i) * DAY_MS);
      return { day, count: this.data.days[day] || 0 };
    });
  }

  /**
   * Updates the rolling speed window and the best WPM.
   * @param {number} t - Current time.
   * @returns {void}
   */
  trackSpeed(t) {
    this.recentPrintable.push(t);
    while (this.recentPrintable.length && t - this.recentPrintable[0] > Wpm.WINDOW_MS) this.recentPrintable.shift();
    if (this.recentPrintable.length < Wpm.MIN_KEYS_FOR_BEST) return;
    const wpm = this.currentWpm();
    if (wpm <= Wpm.MAX_PLAUSIBLE) this.data.bestWpm = Math.max(this.data.bestWpm, wpm);
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
