// Turns a key event into "what to play": which sound, which sample, pitch, stereo
// position and gain. Pure logic (no Electron), so it is unit-tested in test/keymap.test.js.

const { CHAOS_ID } = require('../shared/catalog');
const { songById } = require('./songs');

// Keys that can get their own sound in the "Key mapping" settings. Groups apply
// to every key in them; a specific key (Enter, Space…) wins over its group.
const OVERRIDE_KEYS = ['Enter', 'Space', 'Backspace', 'Tab', 'Letters', 'Numbers', 'Modifiers', 'Arrows', 'Mouse'];

const MODIFIERS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);
const PUNCTUATION = new Set([
  'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote',
  'BracketLeft', 'Backslash', 'BracketRight', 'Quote',
]);

const normalizeKey = (name) => (name === 'NumpadEnter' ? 'Enter' : name);

function keyGroup(key) {
  if (/^[A-Z]$/.test(key)) return 'Letters';
  if (/^(Numpad)?\d$/.test(key)) return 'Numbers';
  if (MODIFIERS.has(key)) return 'Modifiers';
  if (/Arrow/.test(key)) return 'Arrows';
  if (key.startsWith('Mouse')) return 'Mouse';
  return null;
}

// Keys that produce a character — used for words-per-minute.
function isPrintable(key) {
  return /^[A-Z]$/.test(key) || /^(Numpad)?\d$/.test(key) || key === 'Space' || PUNCTUATION.has(key);
}

const isModifier = (key) => MODIFIERS.has(key);

// Approximate horizontal position of each key on a US keyboard (in key widths).
const KEY_X = {};
const row = (keys, start, step = 1) => keys.forEach((k, i) => { KEY_X[k] = start + i * step; });
row(['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'], 0, 1.1);
row(['Backquote', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal'], 0);
row(['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'BracketLeft', 'BracketRight', 'Backslash'], 1.5);
row(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote'], 1.75);
row(['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash'], 2.25);
Object.assign(KEY_X, {
  Backspace: 13.5, Tab: 0.5, CapsLock: 0.75, Enter: 13.25, Shift: 1, ShiftRight: 13,
  Ctrl: 0.5, Meta: 1.5, Alt: 2.5, Space: 7, AltRight: 10, MetaRight: 11, CtrlRight: 13,
});
const KEYBOARD_WIDTH = 14;

// -1 (left) … 1 (right). Navigation, arrows and numpad sit to the right.
function keyPan(key) {
  if (key in KEY_X) return ((KEY_X[key] / KEYBOARD_WIDTH) * 2 - 1) * 0.8;
  if (/^(Numpad|Arrow|Page|Home|End|Insert|Delete)/.test(key)) return 0.9;
  return 0;
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// Melody mode: keyboard rows climb a pentatonic scale, so any typing sounds musical.
const PENTATONIC = [0, 2, 4, 7, 9];
const DEGREE = {};
['ZXCVBNM', 'ASDFGHJKL', 'QWERTYUIOP', '1234567890'].forEach((letters, r) => {
  [...letters].forEach((ch, c) => { DEGREE[ch] = r * 2 + c; });
});

function melodySemitones(key) {
  let degree = DEGREE[key.replace(/^Numpad(?=\d$)/, '')];
  if (degree === undefined) degree = hash(key) % 7;
  return Math.floor(degree / 5) * 12 + PENTATONIC[degree % 5] - 12;
}

const clampRate = (r) => Math.min(4, Math.max(0.25, r));

class KeyMapper {
  // getSounds(): current sound list (built-ins + custom), as returned by sounds.listSounds.
  constructor(getSounds, random = Math.random) {
    this.getSounds = getSounds;
    this.random = random;
    this.song = { id: null, index: 0 };
  }

  findSound(id) {
    if (id === CHAOS_ID) {
      const builtIns = this.getSounds().filter((s) => s.builtIn);
      return builtIns[Math.floor(this.random() * builtIns.length)];
    }
    return this.getSounds().find((s) => s.id === id);
  }

  overrideFor(settings, key) {
    const overrides = settings.overrides || {};
    return overrides[key] || overrides[keyGroup(key)] || '';
  }

  pickSlot(sound, key) {
    if (sound.special?.[key]) return { type: 'special', key };
    if (sound.id === 'dialpad') {
      const digit = /^(?:Numpad)?(\d)$/.exec(key);
      if (digit) return { type: 'variant', index: Number(digit[1]) };
      if (key === 'NumpadMultiply') return { type: 'variant', index: 10 };
    }
    return { type: 'variant', index: hash(key) % sound.variants.length };
  }

  // Next note of the selected song, advancing the position.
  nextSongNote(settings) {
    const song = songById(settings.songId);
    if (this.song.id !== song.id) this.song = { id: song.id, index: 0 };
    const note = song.notes[this.song.index % song.notes.length];
    this.song.index = (this.song.index + 1) % song.notes.length;
    return note;
  }

  songProgress(settings) {
    const song = songById(settings.songId);
    const index = this.song.id === song.id ? this.song.index : 0;
    return { songId: song.id, name: song.name, index, length: song.notes.length };
  }

  restartSong() {
    this.song.index = 0;
  }

  // key: uiohook key name ("A", "Enter", "Mouse1"…). profileSoundId: per-app profile sound, if any.
  // pan: explicit stereo position (used for mouse clicks). Returns null when the key should be silent.
  resolve(settings, rawKey, { profileSoundId = '', pan = null } = {}) {
    const key = normalizeKey(rawKey);
    const override = this.overrideFor(settings, key);
    if (override === 'mute') return null;
    // In Song mode, modifiers (Shift for capitals…) would play out-of-tune extra notes.
    if (settings.pitchMode === 'song' && isModifier(key)) return null;

    const sound = this.findSound(override || profileSoundId || settings.soundId);
    if (!sound) return null;

    let rate = 1;
    let gain = 1;
    let songNote = false;
    if (settings.pitchMode === 'wobble') {
      rate = 2 ** (((this.random() * 2 - 1) * 1.5) / 12);
      gain = 0.85 + this.random() * 0.15;
    } else if (settings.pitchMode === 'melody') {
      rate = 2 ** (melodySemitones(key) / 12);
    } else if (settings.pitchMode === 'song') {
      rate = 2 ** ((this.nextSongNote(settings) - (sound.baseNote ?? 60)) / 12);
      songNote = true;
    }

    return {
      soundId: sound.id,
      slot: this.pickSlot(sound, key),
      rate: clampRate(rate),
      pan: settings.stereo ? (pan ?? keyPan(key)) : 0,
      gain,
      songNote,
      fx: sound.fx || 'emoji',
      emoji: sound.emoji,
    };
  }

  // Key-up sound, or null. settings.keyUpSound: '' off, 'pack' = the pack's own release sound, or a sound id.
  resolveRelease(settings, rawKey, { profileSoundId = '' } = {}) {
    const mode = settings.keyUpSound;
    if (!mode) return null;
    const key = normalizeKey(rawKey);
    if (this.overrideFor(settings, key) === 'mute') return null;
    const pan = settings.stereo ? keyPan(key) : 0;

    if (mode === 'pack') {
      const sound = this.findSound(this.overrideFor(settings, key) || profileSoundId || settings.soundId);
      if (!sound?.release?.length) return null;
      return { soundId: sound.id, slot: { type: 'release', index: hash(key) % sound.release.length }, rate: 1, pan, gain: 0.8 };
    }
    const sound = this.findSound(mode);
    if (!sound) return null;
    // Another pack used as a release sound: quieter and a little higher, so it reads as "key up".
    return { soundId: sound.id, slot: this.pickSlot(sound, key), rate: 1.25, pan, gain: 0.45 };
  }

  // index: a specific variant (pack editor), otherwise a random one.
  preview(soundId, index = null) {
    const sound = this.findSound(soundId);
    if (!sound) return null;
    const valid = Number.isInteger(index) && index >= 0 && index < sound.variants.length;
    return {
      soundId: sound.id,
      slot: { type: 'variant', index: valid ? index : Math.floor(this.random() * sound.variants.length) },
      rate: 1, pan: 0, gain: 1,
    };
  }
}

module.exports = { KeyMapper, OVERRIDE_KEYS, keyGroup, keyPan, isPrintable, isModifier, melodySemitones, normalizeKey };
