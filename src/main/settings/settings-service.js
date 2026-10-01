/**
 * @file Owns the user's settings: loading, validation, persistence and change events.
 */

import { EventEmitter } from 'node:events';
import { Timing } from '../constants.js';
import { JsonStore } from '../core/json-store.js';
import { migrateSettings, sanitizePatch } from './schema.js';

/**
 * Emits `change` with the list of keys that changed.
 */
export class SettingsService extends EventEmitter {
  /**
   * @param {string} file - Path of settings.json.
   */
  constructor(file) {
    super();
    this.store = new JsonStore(file, { getData: () => this.data, debounceMs: Timing.SETTINGS_SAVE_DEBOUNCE_MS });
    const { settings, legacyStats } = migrateSettings(this.store.read());
    /** @type {import('../../shared/types.js').Settings} */
    this.data = settings;
    /** Stats found in a version 1 settings file, for one-time migration. */
    this.legacyStats = legacyStats;
  }

  /** @returns {import('../../shared/types.js').Settings} Current settings (do not mutate). */
  get() {
    return this.data;
  }

  /**
   * Applies a change requested by the user; invalid fields are ignored.
   * @param {Record<string, unknown>} patch - Untrusted partial settings.
   * @returns {string[]} Keys that changed.
   */
  update(patch) {
    const accepted = sanitizePatch(patch);
    if ('overrides' in accepted) accepted.overrides = { ...this.data.overrides, ...accepted.overrides };
    return this.set(accepted);
  }

  /**
   * Applies a trusted change from the main process.
   * @param {Partial<import('../../shared/types.js').Settings>} patch - Values to set.
   * @returns {string[]} Keys that changed.
   */
  set(patch) {
    const changed = Object.keys(patch).filter((key) => JSON.stringify(this.data[key]) !== JSON.stringify(patch[key]));
    if (!changed.length) return changed;
    this.data = { ...this.data, ...patch };
    this.store.scheduleSave();
    this.emit('change', changed);
    return changed;
  }

  /**
   * Writes pending changes to disk immediately.
   * @returns {void}
   */
  flush() {
    this.store.flush();
  }
}
