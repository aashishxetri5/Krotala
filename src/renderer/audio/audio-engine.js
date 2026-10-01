/**
 * @file Audio engine for the hidden audio window. The main process decides what to
 * play; this module decodes samples and plays them through Web Audio, which gives
 * low latency and lets any number of sounds overlap.
 */

import {
  CHAOS_SOUND_ID, Invoke, MUTE, PACK_DEFAULT, Push, Send, UiSound,
} from '../../shared/constants.js';
import { api } from '../shared/bridge.js';

/** @typedef {import('../../shared/types.js').PlayCommand} PlayCommand */

/**
 * @typedef {object} DecodedPack
 * @property {AudioBuffer[]} variants
 * @property {Record<string, AudioBuffer>} special
 * @property {AudioBuffer[]} release
 */

/** Oldest voices are cut beyond this many simultaneous sounds. */
const MAX_VOICES = 32;
const VOLUME_SMOOTHING_SECONDS = 0.02;
const ANNOUNCER = { rate: 1.15, pitch: 0.8, gainBoost: 1.2 };
const NON_PACK_IDS = new Set([MUTE, PACK_DEFAULT, CHAOS_SOUND_ID, '']);

class AudioEngine {
  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    // Limiter so fast typing with many overlapping sounds never clips.
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(this.context.destination);

    /** @type {import('../../shared/types.js').Settings | null} */
    this.settings = null;
    /** @type {Map<string, Promise<void>>} */
    this.loading = new Map();
    /** @type {Map<string, DecodedPack>} */
    this.ready = new Map();
    /** @type {AudioBufferSourceNode[]} */
    this.voices = [];
  }

  /**
   * Loads and decodes a pack once; later calls reuse the same promise. Failures are
   * reported once rather than on every key press.
   * @param {string} id - Pack or UI sound id.
   * @returns {Promise<void>}
   */
  load(id) {
    if (!this.loading.has(id)) this.loading.set(id, this.decodePack(id));
    return this.loading.get(id);
  }

  /**
   * @param {string} id - Pack or UI sound id.
   * @returns {Promise<void>}
   */
  async decodePack(id) {
    try {
      const data = await api.invoke(Invoke.SOUND_DATA, id);
      const special = {};
      for (const [key, bytes] of Object.entries(data.special)) special[key] = await this.decode(bytes);
      this.ready.set(id, {
        variants: await Promise.all(data.variants.map((b) => this.decode(b))),
        special,
        release: await Promise.all(data.release.map((b) => this.decode(b))),
      });
    } catch (err) {
      api.send(Send.AUDIO_ERROR, { id, message: String(err?.message ?? err) });
    }
  }

  /**
   * @param {Uint8Array} bytes - Encoded audio file.
   * @returns {Promise<AudioBuffer>} Decoded audio.
   */
  decode(bytes) {
    return this.context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  /**
   * Drops cached samples so they are reloaded on next use.
   * @param {string[]} ids - Pack ids.
   * @returns {void}
   */
  forget(ids) {
    for (const id of ids) {
      this.loading.delete(id);
      this.ready.delete(id);
    }
  }

  /**
   * Plays one sample. A pack used for the first time is loaded and plays from the next key.
   * @param {PlayCommand} command - What to play.
   * @returns {void}
   */
  play({ soundId, slot, rate, pan, gain }) {
    const pack = this.ready.get(soundId);
    if (!pack) {
      this.load(soundId);
      return;
    }
    const buffer = slot.type === 'special' ? pack.special[slot.key]
      : slot.type === 'release' ? pack.release[slot.index]
        : pack.variants[slot.index] ?? pack.variants[0];
    if (!buffer) return;
    if (this.context.state === 'suspended') this.context.resume();

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = this.context.createGain();
    amp.gain.value = gain;
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(amp).connect(panner).connect(this.master);
    source.start();

    this.voices.push(source);
    source.addEventListener('ended', () => {
      const i = this.voices.indexOf(source);
      if (i >= 0) this.voices.splice(i, 1);
      panner.disconnect();
    });
    if (this.voices.length > MAX_VOICES) {
      try {
        this.voices.shift().stop();
      } catch {
        // Already finished.
      }
    }
  }

  /**
   * Speaks a short phrase with the system's text-to-speech voice.
   * @param {{ text: string }} message - Phrase to speak.
   * @returns {void}
   */
  announce({ text }) {
    if (!('speechSynthesis' in window) || !this.settings?.announcer) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = ANNOUNCER.rate;
    utterance.pitch = ANNOUNCER.pitch;
    utterance.volume = Math.min(1, this.settings.volume * ANNOUNCER.gainBoost);
    utterance.voice = speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang)) ?? null;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  /**
   * Applies new settings and preloads every pack they reference.
   * @param {import('../../shared/types.js').Settings} settings - Current settings.
   * @returns {void}
   */
  applySettings(settings) {
    this.settings = settings;
    // A squared curve matches perceived loudness better than a linear one.
    this.master.gain.setTargetAtTime(settings.volume ** 2, this.context.currentTime, VOLUME_SMOOTHING_SECONDS);
    const referenced = [settings.soundId, settings.keyUpSound, ...Object.values(settings.overrides), ...settings.profiles.map((p) => p.soundId)];
    for (const id of referenced) if (!NON_PACK_IDS.has(id)) this.load(id);
  }
}

const engine = new AudioEngine();
api.on(Push.PLAY, (command) => engine.play(command));
api.on(Push.ANNOUNCE, (message) => engine.announce(message));
api.on(Push.SETTINGS, (settings) => engine.applySettings(settings));
api.on(Push.SOUNDS_CHANGED, ({ ids }) => {
  engine.forget(ids);
  if (engine.settings) engine.applySettings(engine.settings);
});

engine.applySettings(await api.invoke(Invoke.SETTINGS_GET));
// Preload everything so switching packs (and Chaos mode) is instant.
for (const sound of await api.invoke(Invoke.SOUNDS_LIST)) engine.load(sound.id);
engine.load(UiSound.COMBO);
engine.load(UiSound.ACHIEVEMENT);
