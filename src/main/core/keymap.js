/**
 * @file Decides what to play for a key press: pack, sample, pitch, stereo position and gain.
 */

import { CHAOS_SOUND_ID, FxStyle, MUTE, PACK_DEFAULT, PitchMode } from '../../shared/constants.js';
import { songById } from '../../shared/songs.js';
import { Playback } from '../constants.js';
import { hashKey, isModifier, keyGroup, keyPan, melodySemitones, normalizeKey } from './keyboard-layout.js';

/** @typedef {import('../../shared/types.js').SoundPack} SoundPack */
/** @typedef {import('../../shared/types.js').Settings} Settings */
/** @typedef {import('../../shared/types.js').SampleSlot} SampleSlot */
/** @typedef {import('../../shared/types.js').PlayCommand} PlayCommand */
/** @typedef {import('../../shared/types.js').KeyPlayback} KeyPlayback */

/** MIDI note assumed for packs that don't declare one. */
const DEFAULT_BASE_NOTE = 60;

/**
 * @param {number} rate - Requested playback rate.
 * @returns {number} Rate clamped to the range the audio engine handles cleanly.
 */
const clampRate = (rate) => Math.min(Playback.MAX_RATE, Math.max(Playback.MIN_RATE, rate));

/**
 * @param {number} semitones - Pitch offset.
 * @returns {number} Equivalent playback rate.
 */
const semitonesToRate = (semitones) => 2 ** (semitones / 12);

/** Maps key presses to play commands for the current settings, pitch mode and song. */
export class KeyMapper {
  /**
   * @param {() => SoundPack[]} getSounds - Returns the current sound library.
   * @param {() => number} [random=Math.random] - Random source, injectable for tests.
   */
  constructor(getSounds, random = Math.random) {
    this.getSounds = getSounds;
    this.random = random;
    this.song = { id: null, index: 0 };
  }

  /**
   * Resolves the sound to play for a key press.
   * @param {Settings} settings - Current settings.
   * @param {string} rawKey - Key name from the input hook.
   * @param {object} [context]
   * @param {string} [context.profileSoundId] - Pack chosen by the active app profile.
   * @param {number | null} [context.pan] - Explicit stereo position (mouse clicks).
   * @returns {KeyPlayback | null} What to play, or null when the key is silent.
   */
  resolve(settings, rawKey, { profileSoundId = '', pan = null } = {}) {
    const key = normalizeKey(rawKey);
    const override = this.overrideFor(settings, key);
    if (override === MUTE) return null;
    // Modifiers pressed for capital letters would add out-of-tune notes to the song.
    if (settings.pitchMode === PitchMode.SONG && isModifier(key)) return null;

    const sound = this.findSound(override || profileSoundId || settings.soundId);
    if (!sound) return null;

    const { rate, gain, songNote } = this.pitchFor(settings, sound, key);
    return {
      soundId: sound.id,
      slot: this.slotFor(sound, key),
      rate: clampRate(rate),
      pan: settings.stereo ? (pan ?? keyPan(key)) : 0,
      gain,
      // Mouse clicks have no matching release event, so they never sustain.
      sustain: Boolean(settings.sustain && sound.sustain) && keyGroup(key) !== 'Mouse',
      songNote,
      fx: sound.fx || FxStyle.ICON,
      icon: sound.icon,
    };
  }

  /**
   * Resolves the key-up sound for a key.
   * @param {Settings} settings - Current settings.
   * @param {string} rawKey - Key name from the input hook.
   * @param {object} [context]
   * @param {string} [context.profileSoundId] - Pack chosen by the active app profile.
   * @returns {PlayCommand | null} What to play, or null when no release sound applies.
   */
  resolveRelease(settings, rawKey, { profileSoundId = '' } = {}) {
    if (!settings.keyUpSound) return null;
    const key = normalizeKey(rawKey);
    const override = this.overrideFor(settings, key);
    if (override === MUTE) return null;
    const pan = settings.stereo ? keyPan(key) : 0;

    if (settings.keyUpSound === PACK_DEFAULT) {
      const sound = this.findSound(override || profileSoundId || settings.soundId);
      if (!sound?.release?.length) return null;
      return {
        soundId: sound.id,
        slot: { type: 'release', index: hashKey(key) % sound.release.length },
        rate: 1,
        pan,
        gain: Playback.RELEASE_GAIN,
      };
    }

    const sound = this.findSound(settings.keyUpSound);
    if (!sound) return null;
    // A pack's normal sample used as a release sound is played quieter and higher.
    return {
      soundId: sound.id,
      slot: this.slotFor(sound, key),
      rate: Playback.FOREIGN_RELEASE_RATE,
      pan,
      gain: Playback.FOREIGN_RELEASE_GAIN,
    };
  }

  /**
   * Builds a preview of a pack at its natural pitch.
   * @param {string} soundId - Pack id or CHAOS_SOUND_ID.
   * @param {number | null} [index=null] - Specific variant, or null for a random one.
   * @returns {PlayCommand | null} What to play, or null for an unknown pack.
   */
  preview(soundId, index = null) {
    const sound = this.findSound(soundId);
    if (!sound) return null;
    const valid = Number.isInteger(index) && index >= 0 && index < sound.variants.length;
    return {
      soundId: sound.id,
      slot: { type: 'variant', index: valid ? index : Math.floor(this.random() * sound.variants.length) },
      rate: 1,
      pan: 0,
      gain: 1,
    };
  }

  /**
   * Reports the position within the selected song.
   * @param {Settings} settings - Current settings.
   * @returns {{ songId: string, index: number, length: number }} Next note index and song length.
   */
  songProgress(settings) {
    const song = songById(settings.songId);
    const index = this.song.id === song.id ? this.song.index : 0;
    return { songId: song.id, index, length: song.notes.length };
  }

  /**
   * Starts the song over from its first note.
   * @returns {void}
   */
  restartSong() {
    this.song.index = 0;
  }

  /**
   * @param {string} id - Pack id or CHAOS_SOUND_ID.
   * @returns {SoundPack | undefined} The pack, or a random built-in pack for Chaos mode.
   */
  findSound(id) {
    const sounds = this.getSounds();
    if (id === CHAOS_SOUND_ID) {
      const builtIns = sounds.filter((s) => s.builtIn);
      return builtIns[Math.floor(this.random() * builtIns.length)];
    }
    return sounds.find((s) => s.id === id);
  }

  /**
   * @param {Settings} settings - Current settings.
   * @param {string} key - Normalized key name.
   * @returns {string} Override for the key, else for its group, else ''.
   */
  overrideFor(settings, key) {
    const overrides = settings.overrides || {};
    return overrides[key] || overrides[keyGroup(key)] || '';
  }

  /**
   * Picks the sample for a key. The same key always gets the same variant.
   * @param {SoundPack} sound - Pack being played.
   * @param {string} key - Normalized key name.
   * @returns {SampleSlot} Sample to play.
   */
  slotFor(sound, key) {
    if (sound.special?.[key]) return { type: 'special', key };
    if (sound.digitKeys) {
      const digit = /^(?:Numpad)?(\d)$/.exec(key);
      if (digit) return { type: 'variant', index: Number(digit[1]) };
      if (key === 'NumpadMultiply') return { type: 'variant', index: 10 };
    }
    return { type: 'variant', index: hashKey(key) % sound.variants.length };
  }

  /**
   * Computes pitch and gain for the current pitch mode.
   * @param {Settings} settings - Current settings.
   * @param {SoundPack} sound - Pack being played.
   * @param {string} key - Normalized key name.
   * @returns {{ rate: number, gain: number, songNote: boolean }} Playback rate, gain and whether a song note was used.
   */
  pitchFor(settings, sound, key) {
    switch (settings.pitchMode) {
      case PitchMode.WOBBLE:
        return {
          rate: semitonesToRate((this.random() * 2 - 1) * Playback.WOBBLE_SEMITONES),
          gain: 0.85 + this.random() * 0.15,
          songNote: false,
        };
      case PitchMode.MELODY:
        return { rate: semitonesToRate(melodySemitones(key)), gain: 1, songNote: false };
      case PitchMode.SONG:
        return {
          rate: semitonesToRate(this.nextSongNote(settings) - (sound.baseNote ?? DEFAULT_BASE_NOTE)),
          gain: 1,
          songNote: true,
        };
      default:
        return { rate: 1, gain: 1, songNote: false };
    }
  }

  /**
   * Returns the next note of the selected song and advances, looping at the end.
   * @param {Settings} settings - Current settings.
   * @returns {number} MIDI note.
   */
  nextSongNote(settings) {
    const song = songById(settings.songId);
    if (this.song.id !== song.id) this.song = { id: song.id, index: 0 };
    const note = song.notes[this.song.index];
    this.song.index = (this.song.index + 1) % song.notes.length;
    return note;
  }
}
