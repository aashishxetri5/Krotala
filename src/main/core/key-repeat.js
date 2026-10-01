/**
 * @file Tells real key presses apart from the OS auto-repeat that fires while a key
 * is held down.
 */

import { Input } from '../constants.js';

export class KeyRepeatFilter {
  constructor() {
    /** @type {Map<number, number>} Key code → time of its latest keydown while held. */
    this.held = new Map();
  }

  /**
   * Registers a keydown.
   * @param {number} code - Key code.
   * @param {number} now - Event time in milliseconds.
   * @returns {boolean} True when the event is an auto-repeat of a held key.
   */
  press(code, now) {
    const last = this.held.get(code);
    this.held.set(code, now);
    // Auto-repeat keeps firing every few hundred milliseconds at most; a long silence
    // means the key-up was lost and this is a fresh press.
    return last !== undefined && now - last <= Input.REPEAT_MAX_GAP_MS;
  }

  /**
   * Registers a keyup.
   * @param {number} code - Key code.
   * @returns {void}
   */
  release(code) {
    this.held.delete(code);
  }
}
