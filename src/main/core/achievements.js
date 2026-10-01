/**
 * @file Achievement definitions. Each `test` receives the persisted stats and a
 * context with values computed at check time.
 */

/**
 * @typedef {object} AchievementContext
 * @property {number} today - Keys typed today.
 * @property {number} streak - Consecutive days with typing.
 * @property {number} hour - Local hour, 0–23.
 */

/**
 * @typedef {object} Achievement
 * @property {string} id
 * @property {string} icon - Icon name from src/shared/icons.js.
 * @property {string} name
 * @property {string} description
 * @property {(stats: import('./stats-tracker.js').StatsData, context: AchievementContext) => boolean} test
 */

/** @type {readonly Achievement[]} */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'keys-100', icon: 'keyboard', name: 'First Steps', description: 'Type 100 keys', test: (s) => s.total >= 100 },
  { id: 'keys-1k', icon: 'flame', name: 'Warming Up', description: 'Type 1,000 keys', test: (s) => s.total >= 1_000 },
  { id: 'keys-10k', icon: 'swords', name: 'Keyboard Warrior', description: 'Type 10,000 keys', test: (s) => s.total >= 10_000 },
  { id: 'keys-100k', icon: 'hammer', name: 'Keysmith', description: 'Type 100,000 keys', test: (s) => s.total >= 100_000 },
  { id: 'keys-1m', icon: 'crown', name: 'Legendary Typist', description: 'Type 1,000,000 keys', test: (s) => s.total >= 1_000_000 },
  { id: 'day-5k', icon: 'footprints', name: 'Marathon', description: 'Type 5,000 keys in one day', test: (s, c) => c.today >= 5_000 },
  { id: 'combo-50', icon: 'sparkles', name: 'On Fire', description: 'Reach a 50× combo', test: (s) => s.bestCombo >= 50 },
  { id: 'combo-250', icon: 'wind', name: 'Rampage', description: 'Reach a 250× combo', test: (s) => s.bestCombo >= 250 },
  { id: 'combo-500', icon: 'zap', name: 'Godlike', description: 'Reach a 500× combo', test: (s) => s.bestCombo >= 500 },
  { id: 'wpm-60', icon: 'rabbit', name: 'Quick Fingers', description: 'Type at 60 words per minute', test: (s) => s.bestWpm >= 60 },
  { id: 'wpm-100', icon: 'gauge', name: 'Speed Demon', description: 'Type at 100 words per minute', test: (s) => s.bestWpm >= 100 },
  { id: 'packs-5', icon: 'compass', name: 'Sound Explorer', description: 'Try 5 different sound packs', test: (s) => s.packsTried.length >= 5 },
  { id: 'packs-12', icon: 'headphones', name: 'Connoisseur', description: 'Try 12 different sound packs', test: (s) => s.packsTried.length >= 12 },
  { id: 'song-500', icon: 'music', name: 'Maestro', description: 'Play 500 notes in Song mode', test: (s) => s.songNotes >= 500 },
  { id: 'streak-3', icon: 'calendar-check', name: 'Habit Forming', description: 'Type on 3 days in a row', test: (s, c) => c.streak >= 3 },
  { id: 'streak-7', icon: 'calendar-days', name: 'Week Streak', description: 'Type on 7 days in a row', test: (s, c) => c.streak >= 7 },
  { id: 'night-owl', icon: 'moon', name: 'Night Owl', description: 'Type between midnight and 4 AM', test: (s, c) => c.hour < 4 },
  { id: 'creator', icon: 'mic', name: 'Sound Designer', description: 'Create your own sound pack', test: (s) => s.packsCreated >= 1 },
]);
