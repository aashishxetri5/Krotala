/**
 * @file Visual themes for overlay banners. Combo banners escalate with each
 * milestone tier; achievements use a fixed gold theme.
 */

/**
 * @typedef {object} BannerTheme
 * @property {string} light - Highlight colour of the title gradient.
 * @property {string} dark - Shadow colour of the title gradient.
 * @property {string} glow - Glow, edge flash and shockwave colour.
 * @property {string[]} sparks - Spark colours.
 * @property {number} intensity - 0–1; scales size, burst, shake and flash.
 * @property {number} durationMs - How long the banner stays on screen.
 */

/** @type {readonly BannerTheme[]} One theme per combo milestone, mildest first. */
export const COMBO_THEMES = Object.freeze([
  { light: '#e4dcff', dark: '#6a48f0', glow: '#7c5cff', sparks: ['#c9b8ff', '#7c5cff', '#ffffff'], intensity: 0.2, durationMs: 2600 },
  { light: '#cffafe', dark: '#0e7490', glow: '#22d3ee', sparks: ['#a5f3fc', '#22d3ee', '#ffffff'], intensity: 0.4, durationMs: 2800 },
  { light: '#fff1b8', dark: '#e8430c', glow: '#ff7a18', sparks: ['#ffd36e', '#ff7a18', '#ff4d00', '#ffffff'], intensity: 0.65, durationMs: 3100 },
  { light: '#ffd1dc', dark: '#be123c', glow: '#ff2e63', sparks: ['#ff9ac1', '#ff2e63', '#ffd36e', '#ffffff'], intensity: 0.85, durationMs: 3300 },
  { light: '#fffbe6', dark: '#d97706', glow: '#ffc300', sparks: ['#fff3b0', '#ffc300', '#ff7a18', '#ff2e63', '#22d3ee', '#7c5cff'], intensity: 1, durationMs: 3600 },
]);

/** @type {BannerTheme} */
export const ACHIEVEMENT_THEME = Object.freeze({
  light: '#fff6d6', dark: '#b45309', glow: '#ffb020', sparks: ['#ffe28a', '#ffb020', '#ffffff'], intensity: 0.35, durationMs: 3200,
});

/**
 * @param {import('../../shared/types.js').Banner} banner - Banner request.
 * @param {string} achievementKind - BannerKind value for achievements.
 * @returns {BannerTheme} Theme to render the banner with.
 */
export function themeFor(banner, achievementKind) {
  if (banner.kind === achievementKind) return ACHIEVEMENT_THEME;
  return COMBO_THEMES[Math.min(Math.max(banner.tier, 0), COMBO_THEMES.length - 1)];
}
