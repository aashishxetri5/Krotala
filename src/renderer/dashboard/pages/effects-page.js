/**
 * @file Effects page: overlay style, size and position, and the combo meter.
 */

import { Limits } from '../../../shared/constants.js';
import { $ } from '../../shared/dom.js';
import { formatPercent } from '../../shared/format.js';
import { FX_POSITIONS, FX_STYLES } from '../copy.js';
import { bindChoiceGroup, bindRange } from '../components/controls.js';

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @returns {void}
 */
export function mountEffectsPage(store) {
  bindChoiceGroup(store, $('#fx-style'), 'fxStyle', FX_STYLES, { className: 'option' });
  bindChoiceGroup(store, $('#fx-position'), 'fxPosition', FX_POSITIONS);
  const size = /** @type {HTMLInputElement} */ ($('#fx-size'));
  size.min = String(Limits.FX_SIZE_MIN * 100);
  size.max = String(Limits.FX_SIZE_MAX * 100);
  bindRange(store, size, /** @type {HTMLOutputElement} */ ($('#fx-size-value')), 'fxSize', {
    toSetting: (v) => v / 100,
    toSlider: (v) => Math.round(v * 100),
    format: formatPercent,
  });
  const options = $('#fx-options');
  store.subscribe(['settings'], ({ settings }) => {
    if (settings) options.classList.toggle('disabled', !settings.fxEnabled);
  });
}
