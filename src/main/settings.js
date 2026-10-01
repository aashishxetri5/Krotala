const fs = require('fs');
const path = require('path');
const { OVERRIDE_KEYS } = require('./keymap');

const PITCH_MODES = ['off', 'wobble', 'melody', 'song'];
const FX_STYLES = ['auto', 'emoji', 'notes', 'ripple', 'confetti', 'bubbles', 'bullet', 'laser', 'slash'];
const FX_POSITIONS = ['caret', 'mouse', 'random'];

const DEFAULTS = {
  enabled: true,
  volume: 0.7,
  soundId: 'dialpad',
  pitchMode: 'off',        // off | wobble (random detune) | melody (each key is a note) | song
  songId: 'fur-elise',
  stereo: true,            // pan sounds by key position
  playOnRepeat: false,     // keep firing while a key is held down
  mouseClicks: false,
  keyUpSound: '',          // '' off | 'pack' (pack's own release sound) | sound id
  // Per-key / per-group override: '' = pack default, 'mute' = silent, otherwise a sound id.
  overrides: Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, ''])),

  fxEnabled: false,        // on-screen effects overlay
  fxStyle: 'auto',
  fxSize: 1,
  fxPosition: 'caret',
  comboEnabled: true,      // combo milestones (sound + banner)
  announcer: true,         // spoken "Combo 50!"

  profiles: [],            // [{ app: 'Code.exe', soundId: 'mechanical' | 'mute' }]
  autoMuteMic: true,       // mute while the microphone is in use (calls)
  autoMuteFullscreen: false,

  launchAtLogin: false,
  autoUpdate: true,
  customSounds: [],        // see src/main/sounds.js
  hasShownTrayHint: false,
};

const isBool = (v) => typeof v === 'boolean';
const isId = (v) => typeof v === 'string' && v.length < 100;
const oneOf = (list) => (v) => list.includes(v);

// Only these fields may be changed from the renderer, with these validators.
const SETTABLE = {
  enabled: isBool,
  volume: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  soundId: isId,
  pitchMode: oneOf(PITCH_MODES),
  songId: isId,
  stereo: isBool,
  playOnRepeat: isBool,
  mouseClicks: isBool,
  keyUpSound: isId,
  overrides: (v) => v && typeof v === 'object'
    && Object.entries(v).every(([k, id]) => OVERRIDE_KEYS.includes(k) && isId(id)),
  fxEnabled: isBool,
  fxStyle: oneOf(FX_STYLES),
  fxSize: (v) => typeof v === 'number' && v >= 0.5 && v <= 2,
  fxPosition: oneOf(FX_POSITIONS),
  comboEnabled: isBool,
  announcer: isBool,
  profiles: (v) => Array.isArray(v) && v.length <= 50
    && v.every((p) => p && typeof p.app === 'string' && p.app.length > 0 && p.app.length < 100 && isId(p.soundId)),
  autoMuteMic: isBool,
  autoMuteFullscreen: isBool,
  launchAtLogin: isBool,
  autoUpdate: isBool,
};

class SettingsStore {
  constructor(file) {
    this.file = file;
    this.data = structuredClone(DEFAULTS);
    this.legacyStats = null;
    this.saveTimer = null;
    try {
      const { stats, ...saved } = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.legacyStats = stats || null; // v1 kept stats here; main migrates them to stats.json
      this.data = {
        ...this.data,
        ...saved,
        overrides: { ...DEFAULTS.overrides, ...saved.overrides },
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
    writeJsonAtomic(this.file, this.data);
  }
}

function writeJsonAtomic(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`Failed to save ${path.basename(file)}:`, err);
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { SettingsStore, DEFAULTS, FX_STYLES, writeJsonAtomic, readJson };
