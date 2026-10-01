/**
 * @file On-screen effects: one transparent, click-through, always-on-top window per
 * display. Effects are routed to the window of the display containing the point.
 */

import { screen } from 'electron';
import { Push } from '../../shared/constants.js';
import { Paths } from '../constants.js';
import { createWindow, sendTo } from './window-factory.js';

const DISPLAY_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed'];

/**
 * @param {Electron.Rectangle} a - First rectangle.
 * @param {Electron.Rectangle} b - Second rectangle.
 * @returns {boolean} True when both rectangles are identical.
 */
const sameBounds = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export class OverlayManager {
  constructor() {
    /** @type {Map<number, { win: Electron.BrowserWindow, bounds: Electron.Rectangle }>} */
    this.windows = new Map();
    this.enabled = false;
    this.onDisplaysChanged = () => this.sync();
  }

  /**
   * Shows or removes the overlay windows.
   * @param {boolean} enabled - Whether effects are on.
   * @returns {void}
   */
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    for (const event of DISPLAY_EVENTS) {
      if (enabled) screen.on(event, this.onDisplaysChanged);
      else screen.off(event, this.onDisplaysChanged);
    }
    if (enabled) this.sync();
    else this.destroyAll();
  }

  /**
   * Draws an effect at a screen point.
   * @param {Electron.Point} point - Position in DIPs.
   * @param {object} effect - Effect description for the overlay renderer.
   * @returns {void}
   */
  effect(point, effect) {
    this.sendAt(point, Push.FX, effect);
  }

  /**
   * Shows a banner on the display under the mouse.
   * @param {import('../../shared/types.js').Banner} banner - Banner content.
   * @returns {void}
   */
  banner(banner) {
    this.sendAt(screen.getCursorScreenPoint(), Push.BANNER, banner);
  }

  /**
   * Updates the combo counter on the display under the mouse.
   * @param {number} count - Current combo.
   * @returns {void}
   */
  combo(count) {
    this.sendAt(screen.getCursorScreenPoint(), Push.COMBO, { count });
  }

  /**
   * Removes all overlay windows.
   * @returns {void}
   */
  destroyAll() {
    for (const { win } of this.windows.values()) if (!win.isDestroyed()) win.destroy();
    this.windows.clear();
  }

  /**
   * Matches overlay windows to the current set of displays.
   * @returns {void}
   */
  sync() {
    if (!this.enabled) return;
    const displays = screen.getAllDisplays();
    for (const [id, entry] of this.windows) {
      const display = displays.find((d) => d.id === id);
      if (display && sameBounds(display.bounds, entry.bounds) && !entry.win.isDestroyed()) continue;
      if (!entry.win.isDestroyed()) entry.win.destroy();
      this.windows.delete(id);
    }
    for (const display of displays) if (!this.windows.has(display.id)) this.create(display);
  }

  /**
   * @param {Electron.Display} display - Display to cover.
   * @returns {void}
   */
  create(display) {
    const { bounds } = display;
    const win = createWindow({
      ...bounds,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: { backgroundThrottling: false },
    }, 'overlay');
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.setBounds(bounds);
      win.showInactive();
    });
    win.loadFile(Paths.OVERLAY_HTML);
    this.windows.set(display.id, { win, bounds });
  }

  /**
   * Sends a message to the overlay covering a point, in that display's coordinates.
   * @param {Electron.Point} point - Position in DIPs.
   * @param {string} channel - Push channel.
   * @param {object} payload - Message body.
   * @returns {void}
   */
  sendAt(point, channel, payload) {
    if (!this.enabled) return;
    const display = screen.getDisplayNearestPoint(point);
    const entry = this.windows.get(display.id);
    if (!entry) return;
    sendTo(entry.win, channel, { ...payload, x: point.x - display.bounds.x, y: point.y - display.bounds.y });
  }
}
