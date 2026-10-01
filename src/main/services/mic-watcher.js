/**
 * @file Polls whether another app is using the microphone (Windows only).
 */

import { execFile } from 'node:child_process';
import { IS_WINDOWS, Timing } from '../constants.js';
import { MIC_USAGE_KEY, parseActiveMicUsers } from '../core/mic-usage.js';

export class MicWatcher {
  /**
   * @param {object} options
   * @param {string[]} options.ignore - Registry key substrings to ignore (this app's own recordings).
   * @param {(active: boolean) => void} options.onChange - Called when microphone use starts or stops.
   */
  constructor({ ignore, onChange }) {
    this.ignore = ignore;
    this.onChange = onChange;
    this.active = false;
    this.timer = null;
    this.querying = false;
  }

  /** @returns {boolean} True on platforms where microphone use can be detected. */
  static isSupported() {
    return IS_WINDOWS;
  }

  /**
   * Starts polling; does nothing if already running or unsupported.
   * @returns {void}
   */
  start() {
    if (!MicWatcher.isSupported() || this.timer) return;
    this.timer = setInterval(() => this.poll(), Timing.MIC_POLL_MS);
    this.poll();
  }

  /**
   * Stops polling and reports the microphone as idle.
   * @returns {void}
   */
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.setActive(false);
  }

  /**
   * Queries the registry once.
   * @returns {void}
   */
  poll() {
    if (this.querying) return;
    this.querying = true;
    execFile('reg', ['query', MIC_USAGE_KEY, '/s'], { windowsHide: true, timeout: Timing.MIC_QUERY_TIMEOUT_MS }, (err, stdout) => {
      this.querying = false;
      if (err || !this.timer) return;
      this.setActive(parseActiveMicUsers(stdout, this.ignore).length > 0);
    });
  }

  /**
   * @param {boolean} active - New microphone state.
   * @returns {void}
   */
  setActive(active) {
    if (active === this.active) return;
    this.active = active;
    this.onChange(active);
  }
}
