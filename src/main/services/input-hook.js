/**
 * @file System-wide keyboard and mouse hook. Translates uiohook key codes to names
 * and flags auto-repeat so listeners don't have to.
 */

import { EventEmitter } from 'node:events';
import uiohook from 'uiohook-napi';
import { KeyRepeatFilter } from '../core/key-repeat.js';

const { uIOhook, UiohookKey } = uiohook;

/** Key code → name (`A`, `Enter`, `Numpad5`…). The first name wins for shared codes. */
const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  if (!(code in KEY_NAMES)) KEY_NAMES[code] = name;
}

/**
 * @param {number} code - uiohook key code.
 * @returns {string} Key name.
 */
const keyName = (code) => KEY_NAMES[code] ?? `Key${code}`;

/**
 * Emits:
 * - `keydown` `{ key, isRepeat }`
 * - `keyup` `{ key }`
 * - `mousedown` `{ button, x, y }` with x/y in physical screen pixels
 */
export class InputHook extends EventEmitter {
  constructor() {
    super();
    this.repeats = new KeyRepeatFilter();
    this.started = false;
  }

  /**
   * Installs the OS hook.
   * @returns {void}
   */
  start() {
    if (this.started) return;
    uIOhook.on('keydown', (e) => {
      const isRepeat = this.repeats.press(e.keycode, Date.now());
      this.emit('keydown', { key: keyName(e.keycode), isRepeat });
    });
    uIOhook.on('keyup', (e) => {
      this.repeats.release(e.keycode);
      this.emit('keyup', { key: keyName(e.keycode) });
    });
    uIOhook.on('mousedown', (e) => this.emit('mousedown', { button: e.button, x: e.x, y: e.y }));
    uIOhook.start();
    this.started = true;
  }

  /**
   * Removes the OS hook. Must run before the app exits or the process may hang.
   * @returns {void}
   */
  stop() {
    if (!this.started) return;
    try {
      uIOhook.stop();
    } catch {
      // Already stopped.
    }
    this.started = false;
  }
}
