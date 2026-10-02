/**
 * @file Audio engine used by the hidden audio window. The main process decides what to
 * play; this module decodes samples and plays them through Web Audio, which gives
 * low latency and lets any number of sounds overlap.
 *
 * Sustained sounds: a held key first plays its sample normally. If the key is still
 * down when the sample reaches its body, playback hands over to a seamless loop of
 * that body (see sustain-loop.js) until the key is released, then fades out.
 * Quick taps keep the sample's natural ending, so typing sounds the same as ever.
 */

import {
  CHAOS_SOUND_ID, Invoke, Limits, MUTE, PACK_DEFAULT, Send,
} from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { Echo } from './echo.js';
import { buildSustainLoop } from './sustain-loop.js';

/** @typedef {import('../../shared/types.js').PlayCommand} PlayCommand */

/**
 * @typedef {object} DecodedPack
 * @property {AudioBuffer[]} variants
 * @property {Record<string, AudioBuffer>} special
 * @property {AudioBuffer[]} release
 */

/**
 * @typedef {object} Voice
 * @property {AudioBufferSourceNode} source
 * @property {GainNode} amp
 * @property {StereoPannerNode} panner
 */

/**
 * @typedef {object} HeldVoice
 * @property {Voice} sample - The original sample, playing until the hand-over.
 * @property {AudioBufferSourceNode} loop - The sustain loop, scheduled to start at `handOverAt`.
 * @property {GainNode} loopAmp
 * @property {number} gain - Voice gain.
 * @property {number} startedAt - Context time at which the key was pressed.
 * @property {number} handOverAt - Context time at which the loop takes over.
 * @property {number} timer - Safety timeout that releases a voice whose key-up never came.
 */

/** Oldest voices are cut beyond this many simultaneous sounds. */
const MAX_VOICES = 32;
const VOLUME_SMOOTHING_SECONDS = 0.02;
const NON_PACK_IDS = new Set([MUTE, PACK_DEFAULT, CHAOS_SOUND_ID, '']);
const Sustain = Object.freeze({
  /** Crossfade from the sample into the loop; both carry identical audio here. */
  HAND_OVER_SECONDS: 0.015,
  /** Holds shorter than this count as taps and keep the sample's natural ending. */
  TAP_SECONDS: 0.2,
  /** Fade-out when a held key is released. */
  RELEASE_SECONDS: 0.25,
  /** A held sound stops on its own after this long, in case a key-up is lost. */
  MAX_HOLD_MS: 10_000,
  STOP_MARGIN_SECONDS: 0.02,
  /** Fade-out of a sound cut off by the next one in its choke group. */
  CHOKE_SECONDS: 0.05,
});

/** Decodes packs and plays, sustains and releases their samples through Web Audio. */
export class AudioEngine {
  /**
   * @param {BaseAudioContext} context - Where to play (an OfflineAudioContext in tests).
   */
  constructor(context) {
    this.context = context;
    this.master = this.context.createGain();
    // Limiter so fast typing with many overlapping sounds never clips.
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(this.context.destination);
    this.echo = new Echo(this.context, this.master, limiter);

    /** @type {import('../../shared/types.js').Settings | null} */
    this.settings = null;
    /** @type {Map<string, Promise<void>>} */
    this.loading = new Map();
    /** @type {Map<string, DecodedPack>} */
    this.ready = new Map();
    /** @type {AudioBufferSourceNode[]} */
    this.voices = [];
    /** @type {Map<string, HeldVoice>} Voice id (key name) → held sound. */
    this.held = new Map();
    /** @type {WeakMap<AudioBuffer, { buffer: AudioBuffer, start: number, offset: number } | null>} */
    this.loops = new WeakMap();
    /** @type {Map<string, { sample: Voice, voiceId: string | null }>} Latest sound per choke group. */
    this.chokes = new Map();
    /** @type {Map<string, number>} Bumped by forget() so decodes that were in flight are discarded. */
    this.generations = new Map();
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
    const generation = this.generationOf(id);
    try {
      const data = await api.invoke(Invoke.SOUND_DATA, id);
      const special = {};
      for (const [key, bytes] of Object.entries(data.special)) special[key] = await this.decode(bytes);
      const decoded = {
        variants: await Promise.all(data.variants.map((b) => this.decode(b))),
        special,
        release: await Promise.all(data.release.map((b) => this.decode(b))),
      };
      // A pack changed or deleted while decoding is dropped; its next use reloads it.
      if (generation === this.generationOf(id)) this.ready.set(id, decoded);
    } catch (err) {
      if (generation === this.generationOf(id)) api.send(Send.AUDIO_ERROR, { id, message: String(err?.message ?? err) });
    }
  }

  /**
   * @param {string} id - Pack id.
   * @returns {number} How many times the pack has been forgotten.
   */
  generationOf(id) {
    return this.generations.get(id) ?? 0;
  }

  /**
   * Decodes an audio file, cutting very long files to MAX_SAMPLE_SECONDS.
   * @param {Uint8Array} bytes - Encoded audio file.
   * @returns {Promise<AudioBuffer>} Decoded audio.
   */
  async decode(bytes) {
    const buffer = await this.context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const maxLength = Math.round(Limits.MAX_SAMPLE_SECONDS * buffer.sampleRate);
    if (buffer.length <= maxLength) return buffer;
    const trimmed = this.context.createBuffer(buffer.numberOfChannels, maxLength, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) trimmed.copyToChannel(buffer.getChannelData(c).subarray(0, maxLength), c);
    return trimmed;
  }

  /**
   * Drops cached samples so they are reloaded on next use.
   * @param {string[]} ids - Pack ids.
   * @returns {void}
   */
  forget(ids) {
    for (const id of ids) {
      this.generations.set(id, this.generationOf(id) + 1);
      this.loading.delete(id);
      this.ready.delete(id);
    }
  }

  /**
   * Plays one sample, sustaining it while its key is held when asked to. A pack used
   * for the first time is loaded and plays from the next key.
   * @param {PlayCommand} command - What to play.
   * @returns {void}
   */
  play({ soundId, slot, rate, pan, gain, sustain, voice, choke }) {
    const pack = this.ready.get(soundId);
    if (!pack) {
      this.load(soundId);
      return;
    }
    const buffer = slot.type === 'special' ? pack.special[slot.key]
      : slot.type === 'release' ? pack.release[slot.index]
        : pack.variants[slot.index] ?? pack.variants[0];
    if (!buffer) return;
    // Browsers may start a live context suspended; offline contexts start when rendered.
    if (this.context instanceof AudioContext && this.context.state === 'suspended') this.context.resume();

    const sample = this.startSample(buffer, { rate, pan, gain });
    if (choke) this.chokePrevious(choke, { sample, voiceId: sustain ? voice : null });
    if (sustain && voice) this.hold(voice, buffer, sample, { rate, gain });
  }

  /**
   * Starts a one-shot sample.
   * @param {AudioBuffer} buffer - Sample.
   * @param {{ rate: number, pan: number, gain: number }} options - Playback options.
   * @returns {Voice} The playing voice.
   */
  startSample(buffer, { rate, pan, gain }) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = this.context.createGain();
    amp.gain.value = gain;
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(amp).connect(panner).connect(this.master);
    source.start();
    this.track(source, amp);
    return { source, amp, panner };
  }

  /**
   * Schedules the hand-over from a sample to its sustain loop.
   * @param {string} voiceId - Key name used by the matching release.
   * @param {AudioBuffer} buffer - Sample being played.
   * @param {Voice} sample - The sample's voice.
   * @param {{ rate: number, gain: number }} options - Playback options.
   * @returns {void}
   */
  hold(voiceId, buffer, sample, { rate, gain }) {
    this.release(voiceId);
    const loopInfo = this.loopFor(buffer);
    if (!loopInfo) {
      // Too short or percussive to sustain: tell the main process so auto-repeat applies.
      api.send(Send.SUSTAIN_UNAVAILABLE, { voice: voiceId });
      return;
    }

    const now = this.context.currentTime;
    const handOverAt = now + (loopInfo.start + loopInfo.offset) / rate;
    const handOverEnd = handOverAt + Sustain.HAND_OVER_SECONDS;

    const loop = this.context.createBufferSource();
    loop.buffer = loopInfo.buffer;
    loop.loop = true;
    loop.playbackRate.value = rate;
    const loopAmp = this.context.createGain();
    loopAmp.gain.setValueAtTime(0, now);
    loopAmp.gain.setValueAtTime(0, handOverAt);
    loopAmp.gain.linearRampToValueAtTime(gain, handOverEnd);
    loop.connect(loopAmp).connect(sample.panner);
    loop.start(handOverAt, loopInfo.offset);
    this.track(loop, loopAmp);

    // The sample keeps running silently under the loop, so a quick release can
    // return to its natural ending.
    sample.amp.gain.setValueAtTime(gain, handOverAt);
    sample.amp.gain.linearRampToValueAtTime(0, handOverEnd);

    const held = { sample, loop, loopAmp, gain, startedAt: now, handOverAt, timer: 0 };
    held.timer = window.setTimeout(() => this.release(voiceId, held), Sustain.MAX_HOLD_MS);
    this.held.set(voiceId, held);
  }

  /**
   * Remembers the newest sound of a choke group and quickly fades out the one before
   * it, including its sustain loop if its key is still held.
   * @param {string} group - One of ChokeGroup.
   * @param {{ sample: Voice, voiceId: string | null }} current - The sound just started.
   * @returns {void}
   */
  chokePrevious(group, current) {
    const previous = this.chokes.get(group);
    this.chokes.set(group, current);
    if (!previous) return;
    const held = previous.voiceId ? this.held.get(previous.voiceId) : undefined;
    if (held && held.sample === previous.sample) {
      this.held.delete(previous.voiceId);
      clearTimeout(held.timer);
      this.fadeOut(held.loop, held.loopAmp, Sustain.CHOKE_SECONDS);
    }
    this.fadeOut(previous.sample.source, previous.sample.amp, Sustain.CHOKE_SECONDS);
  }

  /**
   * Fades a source to silence and stops it.
   * @param {AudioBufferSourceNode} source - Playing (or scheduled) source.
   * @param {GainNode} amp - Its gain node.
   * @param {number} seconds - Fade length.
   * @returns {void}
   */
  fadeOut(source, amp, seconds) {
    const now = this.context.currentTime;
    const level = amp.gain.value;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(level, now);
    amp.gain.linearRampToValueAtTime(0, now + seconds);
    source.stop(now + seconds + Sustain.STOP_MARGIN_SECONDS);
  }

  /**
   * Ends a held sound. A tap (released within TAP_SECONDS) keeps or returns to the
   * sample's natural ending, so typing sounds exactly as without sustain. A longer
   * hold fades the loop out.
   * @param {string} voiceId - Key name.
   * @param {HeldVoice} [expected] - Only release if this is still the held voice.
   * @returns {void}
   */
  release(voiceId, expected) {
    const held = this.held.get(voiceId);
    if (!held || (expected && held !== expected)) return;
    this.held.delete(voiceId);
    clearTimeout(held.timer);

    const now = this.context.currentTime;
    const { sample, loop, loopAmp, gain } = held;
    if (now < held.handOverAt) {
      // The loop never started: cancel it and let the sample play on untouched.
      loop.stop(now);
      sample.amp.gain.cancelScheduledValues(now);
      sample.amp.gain.setValueAtTime(gain, now);
      return;
    }
    const level = loopAmp.gain.value;
    loopAmp.gain.cancelScheduledValues(now);
    loopAmp.gain.setValueAtTime(level, now);
    if (now - held.startedAt < Sustain.TAP_SECONDS) {
      // A tap that outlasted the hand-over: crossfade back to the sample's own tail.
      const back = now + Sustain.HAND_OVER_SECONDS;
      loopAmp.gain.linearRampToValueAtTime(0, back);
      sample.amp.gain.cancelScheduledValues(now);
      sample.amp.gain.setValueAtTime(sample.amp.gain.value, now);
      sample.amp.gain.linearRampToValueAtTime(gain, back);
      loop.stop(back + Sustain.STOP_MARGIN_SECONDS);
      return;
    }
    loopAmp.gain.linearRampToValueAtTime(0, now + Sustain.RELEASE_SECONDS);
    loop.stop(now + Sustain.RELEASE_SECONDS + Sustain.STOP_MARGIN_SECONDS);
    sample.source.stop(now);
  }

  /**
   * Releases every held sound.
   * @returns {void}
   */
  releaseAll() {
    for (const voiceId of [...this.held.keys()]) this.release(voiceId);
  }

  /**
   * Builds (once per sample) the loop used to sustain it.
   * @param {AudioBuffer} buffer - Sample.
   * @returns {{ buffer: AudioBuffer, start: number, offset: number } | null} Loop, or null if the sample can't sustain.
   */
  loopFor(buffer) {
    if (!this.loops.has(buffer)) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const loop = buildSustainLoop(channels, buffer.sampleRate);
      let result = null;
      if (loop) {
        const loopBuffer = this.context.createBuffer(buffer.numberOfChannels, loop.channels[0].length, buffer.sampleRate);
        loop.channels.forEach((data, c) => loopBuffer.copyToChannel(data, c));
        result = { buffer: loopBuffer, start: loop.start, offset: loop.offset };
      }
      this.loops.set(buffer, result);
    }
    return this.loops.get(buffer);
  }

  /**
   * Keeps track of a playing source, disconnects it when done and enforces MAX_VOICES.
   * @param {AudioBufferSourceNode} source - Source node.
   * @param {GainNode} amp - Its gain node.
   * @returns {void}
   */
  track(source, amp) {
    this.voices.push(source);
    source.addEventListener('ended', () => {
      const i = this.voices.indexOf(source);
      if (i >= 0) this.voices.splice(i, 1);
      amp.disconnect();
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
   * Applies new settings and preloads every pack they reference.
   * @param {import('../../shared/types.js').Settings} settings - Current settings.
   * @returns {void}
   */
  applySettings(settings) {
    const first = !this.settings;
    this.settings = settings;
    if (!settings.enabled) this.releaseAll();
    // A squared curve matches perceived loudness better than a linear one.
    this.master.gain.setTargetAtTime(settings.volume ** 2, this.context.currentTime, VOLUME_SMOOTHING_SECONDS);
    // The first settings set the echo directly; later changes glide.
    this.echo.setMode(settings.echo, { immediate: first });
    const referenced = [settings.soundId, settings.keyUpSound, ...Object.values(settings.overrides), ...settings.profiles.map((p) => p.soundId)];
    for (const id of referenced) if (!NON_PACK_IDS.has(id)) this.load(id);
  }
}
