const fs = require('fs');
const path = require('path');

const PITCH_MODES = ['off', 'wobble', 'melody'];
const OVERRIDE_KEYS = ['Enter', 'Space', 'Backspace'];

const DEFAULTS = {
  enabled: true,
  volume: 0.7,
  soundId: 'dialpad',
  pitchMode: 'off',        // off | wobble (random detune) | melody (each key is a note)
  playOnRepeat: false,     // keep firing while a key is held down
  mouseClicks: false,
  // Per-key override: '' = pack default, 'mute' = silent, otherwise a sound id.
  overrides: { Enter: '', Space: '', Backspace: '' },
  launchAtLogin: false,
  customSounds: [],        // [{ id, name, file }]
  hasShownTrayHint: false,
  stats: { total: 0, today: 0, day: '' },
};

// Only these fields may be changed from the renderer, with these validators.
const SETTABLE = {
  enabled: (v) => typeof v === 'boolean',
  volume: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  soundId: (v) => typeof v === 'string' && v.length < 100,
  pitchMode: (v) => PITCH_MODES.includes(v),
  playOnRepeat: (v) => typeof v === 'boolean',
  mouseClicks: (v) => typeof v === 'boolean',
  launchAtLogin: (v) => typeof v === 'boolean',
  overrides: (v) => v && typeof v === 'object'
    && Object.entries(v).every(([k, id]) => OVERRIDE_KEYS.includes(k) && typeof id === 'string' && id.length < 100),
};

class SettingsStore {
  constructor(file) {
    this.file = file;
    this.data = structuredClone(DEFAULTS);
    this.saveTimer = null;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = {
        ...this.data,
        ...saved,
        overrides: { ...DEFAULTS.overrides, ...saved.overrides },
        stats: { ...DEFAULTS.stats, ...saved.stats },
      };
    } catch {
      // First run or unreadable file: keep defaults.
    }
  }

  get() {
    return this.data;
  }

  // Applies a renderer-supplied patch, ignoring unknown or invalid fields.
  // Returns the list of keys that actually changed.
  applyUserPatch(patch) {
    const changed = [];
    for (const [key, value] of Object.entries(patch || {})) {
      if (!SETTABLE[key] || !SETTABLE[key](value)) continue;
      this.data[key] = key === 'overrides' ? { ...this.data.overrides, ...value } : value;
      changed.push(key);
    }
    if (changed.length) this.save();
    return changed;
  }

  // Internal updates from the main process (no validation).
  set(patch) {
    Object.assign(this.data, patch);
    this.save();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }

  flush() {
    clearTimeout(this.saveTimer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
}

module.exports = { SettingsStore, DEFAULTS, OVERRIDE_KEYS };
