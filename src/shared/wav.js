/**
 * @file WAV encoding plus helpers for recordings (mono mixdown, silence trimming).
 * Pure functions used by the dashboard recorder and the sound generator, unit-tested
 * in test/wav.test.js.
 */

/** Size of the canonical PCM WAV header. */
export const WAV_HEADER_BYTES = 44;
const PEAK_TARGET = 0.9;
const FADE_SECONDS = 0.005;
const TRIM_THRESHOLD_MIN = 0.01;
const TRIM_THRESHOLD_RATIO = 0.08;
const TRIM_LEAD_SECONDS = 0.01;
const TRIM_TAIL_SECONDS = 0.08;

/**
 * Averages all channels into one.
 * @param {Float32Array[]} channels - Channel data of equal length.
 * @returns {Float32Array} Mono samples.
 */
export function mixToMono(channels) {
  const mono = new Float32Array(channels[0]?.length ?? 0);
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels.length;
  }
  return mono;
}

/**
 * @param {Float32Array} samples - Audio samples.
 * @returns {number} Largest absolute sample value.
 */
export function peakOf(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/**
 * Finds where the sound starts and ends, ignoring leading and trailing silence, so a
 * recorded sound fires the instant a key is pressed.
 * @param {Float32Array} samples - Audio samples.
 * @param {number} sampleRate - Samples per second.
 * @returns {{ start: number, end: number }} Sample range to keep (end exclusive).
 */
export function findSoundBounds(samples, sampleRate) {
  const threshold = Math.max(TRIM_THRESHOLD_MIN, peakOf(samples) * TRIM_THRESHOLD_RATIO);
  let first = samples.findIndex((v) => Math.abs(v) > threshold);
  if (first < 0) return { start: 0, end: samples.length };
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) <= threshold) last--;
  first = Math.max(0, first - Math.round(TRIM_LEAD_SECONDS * sampleRate));
  last = Math.min(samples.length - 1, last + Math.round(TRIM_TAIL_SECONDS * sampleRate));
  return { start: first, end: last + 1 };
}

/**
 * Encodes mono samples as a 16-bit PCM WAV file.
 * @param {Float32Array} samples - Audio samples in [-1, 1].
 * @param {number} sampleRate - Samples per second.
 * @param {object} [options]
 * @param {boolean} [options.normalize=true] - Scale so the loudest sample reaches 0.9.
 * @param {number} [options.fadeSeconds] - Fade in and out to avoid clicks (default 5 ms).
 * @returns {Uint8Array} WAV file bytes.
 */
export function encodeWav(samples, sampleRate, { normalize = true, fadeSeconds = FADE_SECONDS } = {}) {
  const peak = peakOf(samples);
  const gain = normalize && peak > 0 ? PEAK_TARGET / peak : 1;
  const fade = Math.min(Math.round(fadeSeconds * sampleRate), Math.floor(samples.length / 2));
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset, text) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);            // fmt chunk size
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, 1, true);             // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);             // block align
  view.setUint16(34, 16, true);            // bits per sample
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * gain;
    if (fade > 0) {
      if (i < fade) v *= i / fade;
      const fromEnd = samples.length - 1 - i;
      if (fromEnd < fade) v *= fromEnd / fade;
    }
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true);
  }
  return new Uint8Array(buffer);
}
