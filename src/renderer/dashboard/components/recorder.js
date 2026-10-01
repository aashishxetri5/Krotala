/**
 * @file Microphone recorder: record up to a few seconds, trim, preview and save as a
 * new pack or as an extra sound in an existing pack.
 */

import {
  DEFAULT_RECORDING_NAME, Invoke, Limits, ToastKind,
} from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $, setOptions } from '../../shared/dom.js';
import { withBusy } from '../ui/busy.js';
import { showError, showToast } from '../ui/toast.js';
import { encodeWav, findSoundBounds, mixToMono } from '../../../shared/wav.js';

const TRIM_STEPS = 1000;
const MIN_SELECTION_SECONDS = 0.02;
const NEW_PACK = '';
const STATUS = {
  idle: `Press the button and make a short sound, up to ${Limits.MAX_RECORDING_MS / 1000} seconds.`,
  recording: 'Recording… press again to stop.',
  processing: 'Processing…',
  editing: 'Trim the sound, name it, and save.',
};

/** The dialog for recording, trimming and saving a sound. */
export class Recorder {
  /**
   * @param {import('../store.js').Store} store - Dashboard store.
   */
  constructor(store) {
    this.store = store;
    this.dialog = /** @type {HTMLDialogElement} */ ($('#recorder-dialog'));
    this.toggle = /** @type {HTMLButtonElement} */ ($('#record-toggle'));
    this.status = $('#recorder-status');
    this.meter = $('#record-meter');
    this.edit = $('#recorder-edit');
    this.canvas = /** @type {HTMLCanvasElement} */ ($('#recorder-wave'));
    this.trimStart = /** @type {HTMLInputElement} */ ($('#trim-start'));
    this.trimEnd = /** @type {HTMLInputElement} */ ($('#trim-end'));
    this.nameInput = /** @type {HTMLInputElement} */ ($('#recording-name'));
    this.target = /** @type {HTMLSelectElement} */ ($('#recording-target'));
    this.nameInput.maxLength = Limits.PACK_NAME_LENGTH;
    this.trimStart.max = String(TRIM_STEPS);
    this.trimEnd.max = String(TRIM_STEPS);

    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {MediaRecorder | null} */
    this.mediaRecorder = null;
    /** @type {Blob[]} */
    this.chunks = [];
    /** @type {Float32Array | null} */
    this.samples = null;
    this.sampleRate = 48000;
    this.stopTimer = 0;
    this.meterFrame = 0;
    /** @type {AudioContext | null} */
    this.audioContext = null;

    this.toggle.addEventListener('click', () => (this.isRecording ? this.stop() : this.start()));
    $('#recording-again').addEventListener('click', () => this.start());
    $('#recording-play').addEventListener('click', () => this.play());
    $('#recording-save').addEventListener('click', (e) => this.save(/** @type {HTMLElement} */ (e.currentTarget)));
    $('[data-close]', this.dialog).addEventListener('click', () => this.dialog.close());
    this.trimStart.addEventListener('input', () => this.drawWave());
    this.trimEnd.addEventListener('input', () => this.drawWave());
    this.dialog.addEventListener('close', () => {
      this.stop();
      this.audioContext?.close();
      this.audioContext = null;
    });
  }

  /** @returns {boolean} True while the microphone is recording. */
  get isRecording() {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Opens the recorder.
   * @param {string | null} [packId=null] - Pack to add the sound to; null creates a new pack.
   * @returns {void}
   */
  open(packId = null) {
    this.samples = null;
    this.nameInput.value = DEFAULT_RECORDING_NAME;
    this.setState('idle');
    const customPacks = this.store.state.sounds.filter((s) => s.custom);
    setOptions(this.target, [
      { value: NEW_PACK, label: 'A new pack' },
      ...customPacks.map((p) => ({ value: p.id, label: p.name })),
    ], packId ?? NEW_PACK);
    this.target.value = packId ?? NEW_PACK;
    this.dialog.showModal();
  }

  /**
   * @param {'idle' | 'recording' | 'processing' | 'editing'} state - Recorder state.
   * @returns {void}
   */
  setState(state) {
    this.status.textContent = STATUS[state];
    this.toggle.classList.toggle('recording', state === 'recording');
    this.toggle.setAttribute('aria-label', state === 'recording' ? 'Stop recording' : 'Start recording');
    this.toggle.disabled = state === 'processing';
    this.meter.hidden = state !== 'recording';
    this.edit.hidden = state !== 'editing';
  }

  /**
   * Starts recording from the default microphone.
   * @returns {Promise<void>}
   */
  async start() {
    try {
      if (!(await api.invoke(Invoke.MIC_REQUEST))) throw new Error('Allow microphone access in your system settings.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      // The dialog may have been closed while the permission prompt was open.
      if (!this.dialog.open) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
    } catch (err) {
      showError("Couldn't access the microphone", err instanceof DOMException ? 'No microphone was found, or access was blocked.' : err);
      return;
    }
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.addEventListener('dataavailable', (e) => this.chunks.push(e.data));
    this.mediaRecorder.addEventListener('stop', () => this.process());
    this.mediaRecorder.start();
    this.stopTimer = window.setTimeout(() => this.stop(), Limits.MAX_RECORDING_MS);
    this.setState('recording');

    const startedAt = performance.now();
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / Limits.MAX_RECORDING_MS);
      this.meter.style.setProperty('--value', `${progress * 100}%`);
      if (this.isRecording) this.meterFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  /**
   * Stops recording (or does nothing when idle) and releases the microphone.
   * @returns {void}
   */
  stop() {
    clearTimeout(this.stopTimer);
    cancelAnimationFrame(this.meterFrame);
    if (this.isRecording) {
      this.setState('processing');
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  /**
   * Decodes the recording and prepares the trim view.
   * @returns {Promise<void>}
   */
  async process() {
    try {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
      const audio = await this.context().decodeAudioData(await blob.arrayBuffer());
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      this.samples = mixToMono(channels);
      this.sampleRate = audio.sampleRate;
      const { start, end } = findSoundBounds(this.samples, this.sampleRate);
      this.trimStart.value = String(Math.round((start / this.samples.length) * TRIM_STEPS));
      this.trimEnd.value = String(Math.round((end / this.samples.length) * TRIM_STEPS));
      if (!this.dialog.open) return;
      this.setState('editing');
      this.drawWave();
    } catch (err) {
      this.setState('idle');
      showError("Couldn't read the recording", err);
    }
  }

  /** @returns {Float32Array} Samples between the trim handles. */
  selection() {
    const length = this.samples.length;
    let start = Math.round((Number(this.trimStart.value) / TRIM_STEPS) * length);
    let end = Math.round((Number(this.trimEnd.value) / TRIM_STEPS) * length);
    const minimum = Math.round(MIN_SELECTION_SECONDS * this.sampleRate);
    if (end - start < minimum) end = Math.min(length, start + minimum);
    if (start >= end) start = Math.max(0, end - 1);
    return this.samples.slice(start, end);
  }

  /** @returns {AudioContext} Context for decoding and previewing. */
  context() {
    this.audioContext ??= new AudioContext();
    return this.audioContext;
  }

  /**
   * Plays the trimmed selection.
   * @returns {void}
   */
  play() {
    const data = this.selection();
    const ctx = this.context();
    const buffer = ctx.createBuffer(1, data.length, this.sampleRate);
    buffer.copyToChannel(data, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }

  /**
   * Draws the waveform, dimming the parts outside the trim handles.
   * @returns {void}
   */
  drawWave() {
    if (!this.samples) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    const g = this.canvas.getContext('2d');
    const { width, height } = this.canvas;
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim();
    const muted = styles.getPropertyValue('--text-muted').trim();
    const start = (Number(this.trimStart.value) / TRIM_STEPS) * width;
    const end = (Number(this.trimEnd.value) / TRIM_STEPS) * width;
    const perColumn = Math.max(1, Math.floor(this.samples.length / width));

    g.clearRect(0, 0, width, height);
    for (let x = 0; x < width; x++) {
      let min = 0;
      let max = 0;
      for (let i = x * perColumn; i < (x + 1) * perColumn && i < this.samples.length; i++) {
        if (this.samples[i] < min) min = this.samples[i];
        if (this.samples[i] > max) max = this.samples[i];
      }
      const inside = x >= start && x <= end;
      g.globalAlpha = inside ? 1 : 0.35;
      g.fillStyle = inside ? accent : muted;
      g.fillRect(x, height / 2 - (max * height) / 2, 1, Math.max(1, ((max - min) * height) / 2));
    }
    g.globalAlpha = 1;
  }

  /**
   * Saves the trimmed recording.
   * @param {HTMLElement} button - Save button.
   * @returns {Promise<void>}
   */
  async save(button) {
    const packId = this.target.value || null;
    try {
      const pack = await withBusy(button, () => api.invoke(Invoke.PACKS_SAVE_RECORDING, {
        bytes: encodeWav(this.selection(), this.sampleRate),
        name: this.nameInput.value,
        packId,
      }));
      this.dialog.close();
      if (!packId) await this.store.saveSettings({ soundId: pack.id });
      showToast({
        kind: ToastKind.SUCCESS,
        title: 'Sound saved',
        message: packId ? `Added to “${pack.name}”.` : `“${pack.name}” is now your active sound.`,
      });
    } catch (err) {
      showError("Couldn't save the recording", err);
    }
  }
}
