/**
 * @file Tracks what the user is doing (foreground app, microphone, full-screen) and
 * derives whether sounds should play and which app profile applies.
 */

import { EventEmitter } from 'node:events';
import { MAX_RECENT_APPS, Timing } from '../constants.js';
import { appLabel } from '../../shared/names.js';
import { resolveAudioContext } from '../core/audio-context.js';
import { getForegroundApp, isForegroundSupported } from '../services/foreground.js';
import { MicWatcher } from '../services/mic-watcher.js';

/** @typedef {import('../../shared/types.js').RuntimeState} RuntimeState */

/**
 * Emits `change` with the new RuntimeState whenever anything visible changes.
 */
export class ContextMonitor extends EventEmitter {
  /**
   * @param {import('../settings/settings-service.js').SettingsService} settings - Settings source.
   */
  constructor(settings) {
    super();
    this.settings = settings;
    this.env = { app: null, micActive: false, fullscreen: false };
    this.muteReason = null;
    this.profileSoundId = '';
    /** @type {string[]} */
    this.recentApps = [];
    this.pollTimer = null;
    // Ignore this app's own microphone use (recording a sound).
    this.mic = new MicWatcher({
      ignore: [process.execPath.replace(/\\/g, '#')],
      onChange: (active) => {
        this.env.micActive = active;
        this.refresh(true);
      },
    });
  }

  /**
   * Starts foreground polling and, if enabled, microphone detection.
   * @returns {void}
   */
  start() {
    if (isForegroundSupported()) this.pollTimer = setInterval(() => this.poll(), Timing.FOREGROUND_POLL_MS);
    this.applyMicSetting();
    this.refresh(true);
  }

  /**
   * Stops all polling.
   * @returns {void}
   */
  stop() {
    clearInterval(this.pollTimer);
    this.mic.stop();
  }

  /**
   * Starts or stops microphone detection to match the setting.
   * @returns {void}
   */
  applyMicSetting() {
    if (this.settings.get().autoMuteMic) this.mic.start();
    else this.mic.stop();
  }

  /**
   * Recomputes the mute reason and profile, emitting `change` when they differ.
   * @param {boolean} [force=false] - Emit even if nothing changed.
   * @returns {void}
   */
  refresh(force = false) {
    const { muteReason, profileSoundId } = resolveAudioContext(this.settings.get(), this.env);
    const changed = muteReason !== this.muteReason || profileSoundId !== this.profileSoundId;
    this.muteReason = muteReason;
    this.profileSoundId = profileSoundId;
    if (changed || force) this.emit('change', this.state());
  }

  /** @returns {RuntimeState} Serializable view for the dashboard. */
  state() {
    return {
      app: this.env.app,
      appLabel: appLabel(this.env.app),
      muteReason: this.muteReason,
      profileSoundId: this.profileSoundId,
      recentApps: this.recentApps,
      features: { appDetection: isForegroundSupported(), micDetection: MicWatcher.isSupported() },
    };
  }

  /**
   * Reads the foreground window once.
   * @returns {void}
   */
  poll() {
    const fg = getForegroundApp();
    if (!fg) return;
    const isOwnWindow = fg.pid === process.pid;
    const app = isOwnWindow ? null : fg.exe;
    const fullscreen = !isOwnWindow && fg.fullscreen;

    let listChanged = false;
    if (app && !this.recentApps.includes(app)) {
      this.recentApps = [app, ...this.recentApps].slice(0, MAX_RECENT_APPS);
      listChanged = true;
    }
    const envChanged = app !== this.env.app || fullscreen !== this.env.fullscreen;
    this.env.app = app;
    this.env.fullscreen = fullscreen;
    if (envChanged || listChanged) this.refresh(true);
  }
}
