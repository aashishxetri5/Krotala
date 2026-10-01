/**
 * @file Creates app windows with secure defaults and provides safe messaging helpers.
 */

import { app, BrowserWindow } from 'electron';
import { Invoke, Push, Send } from '../../shared/constants.js';
import { Paths } from '../constants.js';

/** Argument prefix the preload script reads its channel allow-list from (must match src/preload.cjs). */
const IPC_ARGUMENT = '--ipc-channels=';

/**
 * Which IPC channels each kind of window may use. The preload bridge only exposes
 * these, so a window can never reach handlers meant for another.
 * @type {Readonly<Record<string, { invoke: string[], send: string[], listen: string[] }>>}
 */
export const WindowRole = Object.freeze({
  DASHBOARD: {
    invoke: Object.values(Invoke).filter((channel) => channel !== Invoke.SOUND_DATA),
    send: [Send.PREVIEW],
    listen: [Push.SETTINGS, Push.STATS, Push.RUNTIME, Push.UPDATES, Push.SOUNDS_CHANGED, Push.TOAST],
  },
  AUDIO: {
    invoke: [Invoke.SETTINGS_GET, Invoke.SOUNDS_LIST, Invoke.SOUND_DATA],
    send: [Send.AUDIO_ERROR, Send.SUSTAIN_UNAVAILABLE],
    listen: [Push.PLAY, Push.RELEASE, Push.SETTINGS, Push.SOUNDS_CHANGED],
  },
  OVERLAY: {
    invoke: [],
    send: [],
    listen: [Push.FX, Push.COMBO, Push.BANNER],
  },
});

/**
 * Creates a sandboxed window that loads the shared preload bridge.
 * @param {Electron.BrowserWindowConstructorOptions} options - Window options.
 * @param {object} access
 * @param {string} access.label - Name used in development console output.
 * @param {{ invoke: string[], send: string[], listen: string[] }} access.role - Channels the window may use (a WindowRole).
 * @returns {BrowserWindow} The new window.
 */
export function createWindow(options, { label, role }) {
  const channels = IPC_ARGUMENT + Buffer.from(JSON.stringify(role)).toString('base64');
  const win = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: Paths.PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [channels],
      ...options.webPreferences,
    },
  });
  // App pages never navigate or open new windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (!app.isPackaged) {
    win.webContents.on('console-message', ({ level, message }) => {
      if (level === 'warning' || level === 'error') console.log(`[${label}] ${message}`);
    });
  }
  return win;
}

/**
 * Sends a message if the window exists and has finished loading.
 * @param {BrowserWindow | null} win - Target window.
 * @param {string} channel - Push channel.
 * @param {unknown} [payload] - Message body.
 * @returns {boolean} True when the message was sent.
 */
export function sendTo(win, channel, payload) {
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return false;
  win.webContents.send(channel, payload);
  return true;
}
