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
  [EchoMode.SHORT]: { send: 0.42, delay: 0.14, feedback: 0.32 },
  [EchoMode.LONG]: { send: 0.45, delay: 0.3, feedback: 0.5 },
});
const MAX_DELAY_SECONDS = 1;
/** Each repeat loses some treble, like a real echo. */
const REPEAT_TONE_HZ = 3500;
const CHANGE_SMOOTHING_SECONDS = 0.05;

export class Echo {
  /**
   * Inserts the echo between `input` and `output`; the dry path is left to the caller.
   * @param {AudioContext} context - Audio context.
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
    this.setMode(EchoMode.OFF);
  }

  /**
   * Switches preset smoothly. Turning the echo off lets repeats already ringing die out.
   * @param {string} mode - One of EchoMode.
   * @returns {void}
   */
  setMode(mode) {
    const preset = PRESETS[mode] ?? PRESETS[EchoMode.OFF];
    const now = this.context.currentTime;
    this.send.gain.setTargetAtTime(preset.send, now, CHANGE_SMOOTHING_SECONDS);
    this.delay.delayTime.setTargetAtTime(preset.delay, now, CHANGE_SMOOTHING_SECONDS);
    this.feedback.gain.setTargetAtTime(preset.feedback, now, CHANGE_SMOOTHING_SECONDS);
  }
}
