/**
 * @file Operating-system integration: start at login, permissions and macOS Accessibility.
 */

import { app, dialog, session, systemPreferences } from 'electron';
import { APP_NAME } from '../../shared/constants.js';
import { IS_MAC } from '../constants.js';

/** Command-line flag that starts the app straight into the tray. */
const HIDDEN_FLAG = '--hidden';

/**
 * Registers or removes the app as a login item.
 * @param {boolean} enabled - Whether to start with the OS.
 * @returns {void}
 */
export function applyLoginItem(enabled) {
  // In development Electron needs the app folder as its first argument.
  const args = app.isPackaged ? [HIDDEN_FLAG] : [app.getAppPath(), HIDDEN_FLAG];
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, path: process.execPath, args });
}

/** @returns {boolean} True when the app was launched to run in the background. */
export function wasStartedHidden() {
  return process.argv.includes(HIDDEN_FLAG) || Boolean(app.getLoginItemSettings().wasOpenedAsHidden);
}

/**
 * Grants microphone access to the dashboard only and denies every other permission.
 * @param {() => Electron.WebContents | null} getDashboardContents - Returns the dashboard's web contents.
 * @returns {void}
 */
export function restrictPermissions(getDashboardContents) {
  const allowed = (contents, permission) => permission === 'media' && contents != null && contents === getDashboardContents();
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(allowed(contents, permission)));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => allowed(contents, permission));
}

/**
 * Asks macOS for microphone access; other platforms grant it through the permission handler.
 * @returns {Promise<boolean>} True when recording is allowed.
 */
export async function requestMicrophoneAccess() {
  return IS_MAC ? systemPreferences.askForMediaAccess('microphone') : true;
}

/**
 * macOS only delivers global key events to apps with Accessibility permission.
 * Prompts for it when missing.
 * @returns {void}
 */
export function ensureAccessibilityPermission() {
  if (!IS_MAC || systemPreferences.isTrustedAccessibilityClient(false)) return;
  systemPreferences.isTrustedAccessibilityClient(true);
  dialog.showMessageBox({
    type: 'info',
    message: `Allow ${APP_NAME} to hear your keyboard`,
    detail: `Open System Settings → Privacy & Security → Accessibility, turn on ${APP_NAME}, then restart the app.`,
  });
}
