/**
 * @file Automatic updates from GitHub Releases. Updates download in the background
 * and install when the app quits, or immediately through "Restart to update".
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { UpdateStatus } from '../../shared/constants.js';
import { Timing } from '../constants.js';

/** Written by electron-builder when the build is published to a release feed. */
const UPDATE_FEED_FILE = 'app-update.yml';

/**
 * @returns {string} Initial status: development builds and builds made without a
 *   release feed (for example `npm run dist`) cannot update themselves.
 */
function initialStatus() {
  if (!app.isPackaged) return UpdateStatus.DEV;
  return fs.existsSync(path.join(process.resourcesPath, UPDATE_FEED_FILE)) ? UpdateStatus.IDLE : UpdateStatus.UNAVAILABLE;
}

/**
 * @typedef {object} UpdateState
 * @property {string} status - One of UpdateStatus.
 * @property {string | null} version - Version being downloaded or ready.
 * @property {number} progress - Download progress, 0–100.
 * @property {string | null} error - Short error message.
 */

/** Checks for, downloads and installs updates, reporting progress as UpdateState. */
export class Updater {
  /**
   * @param {(state: UpdateState) => void} onChange - Called whenever the state changes.
   */
  constructor(onChange) {
    this.onChange = onChange;
    /** @type {UpdateState} */
    this.state = { status: initialStatus(), version: null, progress: 0, error: null };
    this.autoUpdater = null;
    this.interval = null;
    this.firstCheck = null;
  }

  /**
   * Enables or disables scheduled checks. Builds that cannot update never check.
   * @param {boolean} automatic - Whether to check and download on a schedule.
   * @returns {Promise<void>}
   */
  async configure(automatic) {
    if (!this.canUpdate()) return;
    await this.ensureLoaded();
    clearTimeout(this.firstCheck);
    clearInterval(this.interval);
    this.autoUpdater.autoDownload = automatic;
    if (!automatic) return;
    this.firstCheck = setTimeout(() => this.check(), Timing.UPDATE_FIRST_CHECK_DELAY_MS);
    this.interval = setInterval(() => this.check(), Timing.UPDATE_CHECK_INTERVAL_MS);
  }

  /**
   * Checks for an update now.
   * @param {object} [options]
   * @param {boolean} [options.manual=false] - A user-initiated check always downloads.
   * @returns {UpdateState} State at the moment the check starts.
   */
  check({ manual = false } = {}) {
    if (!this.autoUpdater) return this.state;
    if (manual) this.autoUpdater.autoDownload = true;
    this.autoUpdater.checkForUpdates().catch(() => {
      // Reported through the 'error' event.
    });
    return this.state;
  }

  /** @returns {boolean} True when this build has an update feed. */
  canUpdate() {
    return this.state.status !== UpdateStatus.DEV && this.state.status !== UpdateStatus.UNAVAILABLE;
  }

  /**
   * Quits and installs a downloaded update.
   * @returns {void}
   */
  install() {
    if (this.state.status === UpdateStatus.READY) this.autoUpdater.quitAndInstall();
  }

  /**
   * Loads electron-updater and subscribes to its events.
   * @returns {Promise<void>}
   */
  async ensureLoaded() {
    if (this.autoUpdater) return;
    const { default: updater } = await import('electron-updater');
    const au = updater.autoUpdater;
    au.autoInstallOnAppQuit = true;
    au.on('checking-for-update', () => this.set({ status: UpdateStatus.CHECKING, error: null }));
    au.on('update-available', (info) => this.set({
      status: au.autoDownload ? UpdateStatus.DOWNLOADING : UpdateStatus.AVAILABLE,
      version: info.version,
      progress: 0,
    }));
    au.on('update-not-available', () => this.set({ status: UpdateStatus.LATEST }));
    au.on('download-progress', (p) => this.set({ status: UpdateStatus.DOWNLOADING, progress: Math.round(p.percent) }));
    au.on('update-downloaded', (info) => this.set({ status: UpdateStatus.READY, version: info.version, progress: 100 }));
    au.on('error', (err) => this.set({ status: UpdateStatus.ERROR, error: String(err?.message || err).split('\n')[0] }));
    this.autoUpdater = au;
  }

  /**
   * @param {Partial<UpdateState>} patch - Changed fields.
   * @returns {void}
   */
  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}
