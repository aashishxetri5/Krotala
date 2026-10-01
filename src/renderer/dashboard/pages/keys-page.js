/**
 * @file Keys page: per-key and per-group sound overrides and key release sounds.
 */

import { MUTE, OVERRIDE_KEYS, PACK_DEFAULT, Send } from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $, h, setOptions } from '../../shared/dom.js';
import { OVERRIDE_LABELS } from '../copy.js';
import { soundOptions } from '../components/controls.js';

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @returns {void}
 */
export function mountKeysPage(store) {
  const selects = OVERRIDE_KEYS.map((key) => {
    const select = /** @type {HTMLSelectElement} */ (h('select', { attrs: { id: `override-${key}` }, dataset: { key } }));
    select.addEventListener('change', () => {
      store.saveSettings({ overrides: { [key]: select.value } });
      if (select.value && select.value !== MUTE) api.send(Send.PREVIEW, { id: select.value });
    });
    return select;
  });
  $('#overrides').replaceChildren(...selects.map((select) => h('div', { className: 'form-row' }, [
    h('label', { text: OVERRIDE_LABELS[select.dataset.key], attrs: { for: select.id } }),
    select,
  ])));

  const keyUp = /** @type {HTMLSelectElement} */ ($('#key-up-sound'));
  keyUp.addEventListener('change', () => store.saveSettings({ keyUpSound: keyUp.value }));

  store.subscribe(['settings', 'sounds'], ({ settings, sounds }) => {
    if (!settings) return;
    const overrideOptions = soundOptions(sounds, {
      leading: [{ value: '', label: 'Default' }, { value: MUTE, label: 'Silent' }],
      chaos: true,
    });
    for (const select of selects) setOptions(select, overrideOptions, settings.overrides[select.dataset.key] ?? '');
    setOptions(keyUp, soundOptions(sounds, {
      leading: [{ value: '', label: 'Off' }, { value: PACK_DEFAULT, label: 'Pack default' }],
    }), settings.keyUpSound);
  });
}
