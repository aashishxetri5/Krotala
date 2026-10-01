/**
 * @file Bindings between form controls and settings, so pages only declare which
 * control maps to which setting.
 */

import { CHAOS_PACK } from '../../../shared/catalog.js';
import { CHAOS_SOUND_ID } from '../../../shared/constants.js';
import { $$, h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

/** @typedef {import('../store.js').Store} Store */

/**
 * Connects every `input.switch[data-setting]` under a root to its boolean setting.
 * @param {Store} store - Dashboard store.
 * @param {ParentNode} root - Where to look for switches.
 * @returns {void}
 */
export function bindSwitches(store, root) {
  const inputs = /** @type {HTMLInputElement[]} */ ($$('input.switch[data-setting]', root));
  for (const input of inputs) {
    input.addEventListener('change', () => store.saveSettings({ [input.dataset.setting]: input.checked }));
  }
  store.subscribe(['settings'], ({ settings }) => {
    if (!settings) return;
    for (const input of inputs) input.checked = Boolean(settings[input.dataset.setting]);
  });
}

/**
 * Renders a single-choice button group bound to a setting.
 * @param {Store} store - Dashboard store.
 * @param {HTMLElement} container - Element with role="radiogroup".
 * @param {string} key - Setting name.
 * @param {{ value: string, label: string, icon?: string }[]} options - Choices.
 * @param {object} [config]
 * @param {string} [config.className] - Class for each button (default: plain segmented button).
 * @returns {void}
 */
export function bindChoiceGroup(store, container, key, options, { className = '' } = {}) {
  const buttons = options.map((option) => h('button', {
    className,
    attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
    dataset: { value: option.value },
    on: { click: () => store.saveSettings({ [key]: option.value }) },
  }, [option.icon ? icon(option.icon, { size: 16 }) : null, option.label]));
  container.replaceChildren(...buttons);
  store.subscribe(['settings'], ({ settings }) => {
    if (!settings) return;
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.value === settings[key]));
  });
}

/**
 * Binds a range input to a numeric setting, saving at most once per animation frame.
 * @param {Store} store - Dashboard store.
 * @param {HTMLInputElement} input - Range input.
 * @param {HTMLOutputElement} output - Value readout.
 * @param {string} key - Setting name.
 * @param {object} scale
 * @param {(slider: number) => number} scale.toSetting - Slider value → setting value.
 * @param {(setting: number) => number} scale.toSlider - Setting value → slider value.
 * @param {(setting: number) => string} scale.format - Readout text.
 * @returns {void}
 */
export function bindRange(store, input, output, key, { toSetting, toSlider, format }) {
  const min = Number(input.min);
  const max = Number(input.max);
  const paint = (sliderValue) => {
    input.style.setProperty('--fill', `${((sliderValue - min) / (max - min)) * 100}%`);
    output.textContent = format(toSetting(sliderValue));
  };
  let frame = 0;
  input.addEventListener('input', () => {
    paint(Number(input.value));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => store.saveSettings({ [key]: toSetting(Number(input.value)) }));
  });
  store.subscribe(['settings'], ({ settings }) => {
    if (!settings || document.activeElement === input) return;
    input.value = String(toSlider(settings[key]));
    paint(Number(input.value));
  });
}

/**
 * Options for a sound picker.
 * @param {import('../../../shared/types.js').SoundPack[]} sounds - Available packs.
 * @param {object} [config]
 * @param {{ value: string, label: string }[]} [config.leading] - Options shown before the packs.
 * @param {boolean} [config.chaos=false] - Include Chaos mode.
 * @returns {{ value: string, label: string }[]} Options.
 */
export function soundOptions(sounds, { leading = [], chaos = false } = {}) {
  return [
    ...leading,
    ...sounds.map((s) => ({ value: s.id, label: s.name })),
    ...(chaos ? [{ value: CHAOS_SOUND_ID, label: CHAOS_PACK.name }] : []),
  ];
}
