/**
 * @file Dashboard state container. Pages subscribe to the slices they render, and
 * settings changes go through `saveSettings` so every page stays in sync.
 */

import { Invoke } from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { showError } from './ui/toast.js';

/**
 * @typedef {object} DashboardState
 * @property {import('../../shared/types.js').Settings | null} settings
 * @property {import('../../shared/types.js').SoundPack[]} sounds
 * @property {import('../../shared/types.js').RuntimeState | null} runtime
 * @property {object | null} stats
 * @property {object | null} updates
 * @property {{ version: string, platform: string, hotkey: string, hotkeyRegistered: boolean, icon: string } | null} info
 */

/** @typedef {keyof DashboardState} StateKey */

/** Holds dashboard state and notifies the pages that render each part of it. */
export class Store {
  constructor() {
    /** @type {DashboardState} */
    this.state = { settings: null, sounds: [], runtime: null, stats: null, updates: null, info: null };
    /** @type {{ keys: StateKey[], listener: (state: DashboardState) => void }[]} */
    this.subscribers = [];
  }

  /**
   * Merges new values and notifies subscribers of the changed keys.
   * @param {Partial<DashboardState>} patch - New values.
   * @returns {void}
   */
  set(patch) {
    this.state = { ...this.state, ...patch };
    const changed = Object.keys(patch);
    for (const { keys, listener } of this.subscribers) {
      if (keys.some((k) => changed.includes(k))) listener(this.state);
    }
  }

  /**
   * Calls `listener` now and whenever any of `keys` changes.
   * @param {StateKey[]} keys - State slices the listener depends on.
   * @param {(state: DashboardState) => void} listener - Render function.
   * @returns {void}
   */
  subscribe(keys, listener) {
    this.subscribers.push({ keys, listener });
    listener(this.state);
  }

  /**
   * Saves a settings change. The UI updates immediately; on failure it rolls back
   * and explains what went wrong.
   * @param {Partial<import('../../shared/types.js').Settings>} patch - Values to change.
   * @returns {Promise<void>}
   */
  async saveSettings(patch) {
    const previous = this.state.settings;
    // Overrides merge key by key, as they do in the main process.
    const overrides = patch.overrides ? { ...previous.overrides, ...patch.overrides } : previous.overrides;
    this.set({ settings: { ...previous, ...patch, overrides } });
    try {
      this.set({ settings: await api.invoke(Invoke.SETTINGS_SET, patch) });
    } catch (err) {
      this.set({ settings: previous });
      showError("Couldn't save that change", err);
    }
  }
}
