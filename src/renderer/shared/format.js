/**
 * @file Number and date formatting for the UI.
 */

const numberFormat = new Intl.NumberFormat();

/**
 * @param {number} value - Number to format.
 * @returns {string} Locale-formatted number with grouping.
 */
export const formatNumber = (value) => numberFormat.format(value);

/**
 * @param {number} fraction - Value between 0 and 1.
 * @returns {string} Whole percentage, e.g. `70%`.
 */
export const formatPercent = (fraction) => `${Math.round(fraction * 100)}%`;

/**
 * @param {string} day - `YYYY-MM-DD`.
 * @returns {Date} Noon on that local day (avoids DST edge cases).
 */
const parseDay = (day) => new Date(`${day}T12:00:00`);

/**
 * @param {string} day - `YYYY-MM-DD`.
 * @returns {string} Short date, e.g. `Oct 2`.
 */
export const formatShortDay = (day) => parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * @param {string} day - `YYYY-MM-DD`.
 * @returns {string} Date with weekday, e.g. `Thu, Oct 2`.
 */
export const formatLongDay = (day) => parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * @param {number} ms - Timestamp.
 * @returns {string} Localized date and time.
 */
export const formatDateTime = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * @param {string} exe - Executable name.
 * @returns {string} Name without `.exe`.
 */
export const formatAppName = (exe) => exe.replace(/\.exe$/i, '');
