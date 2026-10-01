/**
 * @file Echo effect: a feedback delay whose repeats get quieter and darker.
 */

import { EchoMode } from '../../shared/constants.js';

/**
 * @typedef {object} EchoPreset
 * @property {number} send - How much of the dry signal enters the echo.
 * @property {number} delay - Seconds between repeats.
 * @property {number} feedback - Level of each repeat relative to the previous one.
 */

/** @type {Readonly<Record<string, EchoPreset>>} */
const PRESETS = Object.freeze({
  [EchoMode.OFF]: { send: 0, delay: 0.14, feedback: 0.32 },
  [EchoMode.SHORT]: { send: 0.35, delay: 0.14, feedback: 0.32 },
  [EchoMode.LONG]: { send: 0.38, delay: 0.3, feedback: 0.5 },
});
const MAX_DELAY_SECONDS = 1;
/** Each repeat loses some treble, like a real echo. */
const REPEAT_TONE_HZ = 3500;
const CHANGE_SMOOTHING_SECONDS = 0.05;

/** A feedback delay whose repeats get quieter and darker. */
export class Echo {
  /**
   * Inserts the echo between `input` and `output`; the dry path is left to the caller.
   * @param {BaseAudioContext} context - Audio context (live or offline).
   * @param {AudioNode} input - Signal to echo.
   * @param {AudioNode} output - Where the repeats go.
   */
  constructor(context, input, output) {
    this.context = context;
    this.send = context.createGain();
    this.delay = context.createDelay(MAX_DELAY_SECONDS);
    this.tone = context.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = REPEAT_TONE_HZ;
    this.feedback = context.createGain();

    input.connect(this.send).connect(this.delay);
    this.delay.connect(this.tone).connect(this.feedback).connect(this.delay);
    this.delay.connect(output);
    this.setMode(EchoMode.OFF, { immediate: true });
  }

  /**
   * Switches preset. Changes glide so nothing clicks, and turning the echo off lets
   * repeats already ringing die out.
   * @param {string} mode - One of EchoMode.
   * @param {object} [options]
   * @param {boolean} [options.immediate=false] - Jump straight to the preset (initial setup).
   * @returns {void}
   */
  setMode(mode, { immediate = false } = {}) {
    if (mode === this.mode) return;
    this.mode = mode;
    const preset = PRESETS[mode] ?? PRESETS[EchoMode.OFF];
    const now = this.context.currentTime;
    const apply = (param, value) => (immediate ? param.setValueAtTime(value, now) : param.setTargetAtTime(value, now, CHANGE_SMOOTHING_SECONDS));
    apply(this.send.gain, preset.send);
    apply(this.delay.delayTime, preset.delay);
    apply(this.feedback.gain, preset.feedback);
  }
}
