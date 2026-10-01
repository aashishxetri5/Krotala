/**
 * @file Hidden window hosting the Web Audio engine for the whole session.
 */

import { Paths } from '../constants.js';
import { createWindow, sendTo } from './window-factory.js';

export class AudioWindow {
  constructor() {
    /** @type {Electron.BrowserWindow | null} */
    this.win = null;
    this.closing = false;
  }

  /**
   * Creates the window and recreates it if its renderer crashes.
   * @returns {void}
   */
  create() {
    this.win = createWindow({
      show: false,
      // Audio must keep playing while every other window is hidden.
      webPreferences: { backgroundThrottling: false },
    }, 'audio');
    this.win.loadFile(Paths.AUDIO_HTML);
    this.win.webContents.on('render-process-gone', () => {
      if (this.closing) return;
      this.win.destroy();
      this.create();
    });
  }

  /**
   * @param {string} channel - Push channel.
   * @param {unknown} payload - Message body.
   * @returns {void}
   */
  send(channel, payload) {
    sendTo(this.win, channel, payload);
  }

  /**
   * Marks the window as closing so a crash during shutdown is not recovered.
   * @returns {void}
   */
  close() {
    this.closing = true;
  }
}
