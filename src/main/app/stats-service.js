/**
 * @file Persists typing statistics and migrates totals from version 1 settings files.
 */

import { Timing } from '../constants.js';
import { JsonStore } from '../core/json-store.js';
import { StatsTracker } from '../core/stats-tracker.js';

/** Typing statistics with persistence: wraps StatsTracker and saves it to stats.json. */
export class StatsService {
  /**
   * @param {string} file - Path of stats.json.
   * @param {{ total?: number, today?: number, day?: string } | null} legacyStats - Totals from an old settings file.
   */
  constructor(file, legacyStats) {
    this.store = new JsonStore(file, {
      getData: () => {
        this.tracker.prune();
        return this.tracker.data;
      },
      debounceMs: Timing.STATS_SAVE_DEBOUNCE_MS,
    });
    let data = this.store.read();
    if (!data && legacyStats) {
      const { total = 0, today = 0, day } = legacyStats;
      data = { total, days: day ? { [day]: today } : {} };
    }
    this.tracker = new StatsTracker(data ?? {});
  }

  /**
   * Runs a tracker operation and schedules a save.
   * @template T
   * @param {(tracker: StatsTracker) => T} operation - Mutation to perform.
   * @returns {T} The operation's result.
   */
  update(operation) {
    const result = operation(this.tracker);
    this.store.scheduleSave();
    return result;
  }

  /** @returns {import('../core/stats-tracker.js').StatsSnapshot} Snapshot for the Stats page. */
  snapshot() {
    return this.tracker.snapshot();
  }

  /**
   * Clears every statistic and achievement, and saves the empty state right away.
   * @returns {void}
   */
  reset() {
    this.tracker = new StatsTracker();
    this.store.flush();
  }

  /**
   * Writes pending changes immediately.
   * @returns {void}
   */
  flush() {
    this.store.flush();
  }
}
