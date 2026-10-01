/**
 * @file Keyboard heatmap: each key is tinted by how often it was pressed.
 */

import { h } from '../../shared/dom.js';
import { formatNumber } from '../../shared/format.js';

/** Rows of [key name, label, width in key units]. */
const ROWS = [
  [['Backquote', '`'], ...[...'1234567890'].map((k) => [k, k]), ['Minus', '-'], ['Equal', '='], ['Backspace', 'Backspace', 2]],
  [['Tab', 'Tab', 1.5], ...[...'QWERTYUIOP'].map((k) => [k, k]), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...[...'ASDFGHJKL'].map((k) => [k, k]), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]],
  [['Shift', 'Shift', 2.25], ...[...'ZXCVBNM'].map((k) => [k, k]), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]],
  [['Ctrl', 'Ctrl', 1.25], ['Meta', 'Win', 1.25], ['Alt', 'Alt', 1.25], ['Space', 'Space', 6.25], ['AltRight', 'Alt', 1.25], ['CtrlRight', 'Ctrl', 1.25]],
];
const KEY_UNIT_PX = 40;
const KEY_GAP_PX = 4;
/** Minimum tint for any key that was pressed at least once. */
const MIN_HEAT = 0.12;
/** Above this tint, labels switch to white for contrast. */
const LIGHT_TEXT_HEAT = 0.55;

/**
 * Renders the heatmap. Skips work when the counts are unchanged.
 * @param {HTMLElement} container - Heatmap container.
 * @param {Record<string, number>} counts - Key name → presses.
 * @returns {void}
 */
export function renderKeyHeatmap(container, counts) {
  const signature = JSON.stringify(counts);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;

  // Number-row digits include their numpad twins.
  const countOf = (key) => (counts[key] || 0) + (/^\d$/.test(key) ? counts[`Numpad${key}`] || 0 : 0);
  const max = Math.max(1, ...ROWS.flat().map(([key]) => countOf(key)));

  container.replaceChildren(...ROWS.map((row) => h('div', { className: 'heat-row' }, row.map(([key, label, width = 1]) => {
    const n = countOf(key);
    // Square root keeps rarely used keys visible next to very common ones.
    const heat = n ? MIN_HEAT + (1 - MIN_HEAT) * Math.sqrt(n / max) : 0;
    const cell = h('div', {
      className: `heat-key${heat > LIGHT_TEXT_HEAT ? ' hot' : ''}`,
      text: label,
      dataset: { tip: `${label}\n${formatNumber(n)} presses` },
    });
    cell.style.width = `${width * KEY_UNIT_PX + (width - 1) * KEY_GAP_PX}px`;
    cell.style.setProperty('--heat', heat.toFixed(3));
    return cell;
  }))));
}
