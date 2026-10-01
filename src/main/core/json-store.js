/**
 * @file Debounced, atomic JSON persistence for a single file.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Persists one JSON file, coalescing bursts of changes and writing atomically. */
export class JsonStore {
  /**
   * @param {string} file - Absolute path of the JSON file.
   * @param {object} options
   * @param {() => unknown} options.getData - Returns the data to persist.
   * @param {number} options.debounceMs - Delay that coalesces bursts of changes into one write.
   */
  constructor(file, { getData, debounceMs }) {
    this.file = file;
    this.getData = getData;
    this.debounceMs = debounceMs;
    this.timer = null;
  }

  /**
   * Reads and parses the file.
   * @returns {any | null} Parsed contents, or null when missing or unreadable.
   */
  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Schedules a write, replacing any write already pending.
   * @returns {void}
   */
  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /**
   * Writes immediately through a temporary file so a crash never leaves half-written JSON.
   * @returns {void}
   */
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.getData(), null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`Could not save ${path.basename(this.file)}:`, err);
    }
  }
}
