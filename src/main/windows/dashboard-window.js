/**
 * @file The dashboard window. Closing it hides it to the tray; messages sent while
 * it is loading are queued and delivered once it is ready.
 */

import { app } from 'electron';
import { APP_NAME } from '../../shared/constants.js';
import { DashboardWindowSize, Paths } from '../constants.js';
import { appIcon } from './app-icons.js';
import { createWindow, sendTo } from './window-factory.js';

export class DashboardWindow {
  /**
   * @param {object} options
   * @param {() => void} options.onHide - Called when the user closes the window to the tray.
   */
  constructor({ onHide }) {
    this.onHide = onHide;
    /** @type {Electron.BrowserWindow | null} */
    this.win = null;
    this.quitting = false;
    /** @type {{ channel: string, payload: unknown }[]} */
    this.queue = [];
  }

  /**
   * Shows the dashboard, creating it on first use.
   * @returns {void}
   */
  show() {
    if (!this.win || this.win.isDestroyed()) this.create();
    else {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
      this.win.focus();
    }
    app.dock?.show();
  }

  /** @returns {boolean} True when the window is on screen. */
  isVisible() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  /** @returns {Electron.WebContents | null} The dashboard's web contents, if created. */
  get webContents() {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : null;
  }

  /** @returns {Electron.BrowserWindow | undefined} Parent for dialogs. */
  get parent() {
    return this.win && !this.win.isDestroyed() ? this.win : undefined;
  }

  /**
   * Sends a message now, or once the window has loaded.
   * @param {string} channel - Push channel.
   * @param {unknown} payload - Message body.
   * @param {object} [options]
   * @param {boolean} [options.queue=false] - Keep the message if the window is not ready.
   * @returns {void}
   */
  send(channel, payload, { queue = false } = {}) {
    if (!sendTo(this.win, channel, payload) && queue) this.queue.push({ channel, payload });
  }

  /**
   * Lets the window close for real (used when the app quits).
   * @returns {void}
   */
  allowClose() {
    this.quitting = true;
  }

  /**
   * @returns {void}
   */
  create() {
    this.win = createWindow({
      width: DashboardWindowSize.WIDTH,
      height: DashboardWindowSize.HEIGHT,
      minWidth: DashboardWindowSize.MIN_WIDTH,
      minHeight: DashboardWindowSize.MIN_HEIGHT,
      title: APP_NAME,
      icon: appIcon(),
      backgroundColor: DashboardWindowSize.BACKGROUND,
      autoHideMenuBar: true,
      show: false,
    }, 'dashboard');
    this.win.removeMenu();
    this.win.loadFile(Paths.DASHBOARD_HTML);
    this.win.once('ready-to-show', () => this.win.show());
    this.win.webContents.on('did-finish-load', () => {
      for (const { channel, payload } of this.queue.splice(0)) sendTo(this.win, channel, payload);
    });
    this.win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      this.win.hide();
      app.dock?.hide();
      this.onHide();
    });
  }
}
