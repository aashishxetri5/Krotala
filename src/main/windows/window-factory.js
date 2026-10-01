/**
 * @file Creates app windows with secure defaults and provides safe messaging helpers.
 */

import { app, BrowserWindow } from 'electron';
import { Invoke, Push, Send } from '../../shared/constants.js';
import { Paths } from '../constants.js';

/** Argument prefix the preload script reads its channel allow-list from. */
export const IPC_ARGUMENT = '--ipc-channels=';

const ipcArgument = IPC_ARGUMENT + Buffer.from(JSON.stringify({
  invoke: Object.values(Invoke),
  send: Object.values(Send),
  listen: Object.values(Push),
})).toString('base64');

/**
 * Creates a sandboxed window that loads the shared preload bridge.
 * @param {Electron.BrowserWindowConstructorOptions} options - Window options.
 * @param {string} label - Name used in development console output.
 * @returns {BrowserWindow} The new window.
 */
export function createWindow(options, label) {
  const win = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: Paths.PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [ipcArgument],
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
