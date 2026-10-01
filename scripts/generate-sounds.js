/**
 * @file Synthesizes every built-in sound into assets/sounds/*.wav (16-bit mono, 44.1 kHz).
 *
 * All audio is generated procedurally, so the app ships without third-party samples.
 * Change a recipe below and run `npm run assets` to hear the result.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const TAU = Math.PI * 2;
/** Harmonics above this frequency are skipped to avoid aliasing. */
const HARMONIC_CEILING_HZ = 16000;

// ---------- DSP helpers ----------

let seed = 1;

/**
 * Resets the noise generator so each recipe renders identically on every run.
 * @param {number} value - Seed.
 * @returns {void}
 */
function setSeed(value) {
  seed = value >>> 0;
}

/**
 * Deterministic pseudo-random number (mulberry32).
 * @returns {number} Value in [0, 1).
 */
function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** @returns {number} White noise sample in [-1, 1). */
const noise = () => rand() * 2 - 1;

/**
 * Exponential decay envelope.
 * @param {number} t - Time in seconds.
 * @param {number} tau - Time constant in seconds.
 * @returns {number} Envelope value.
 */
const exp = (t, tau) => Math.exp(-t / tau);

/**
 * Renders a sound by evaluating `fn` for every sample.
 * @param {number} duration - Length in seconds.
 * @param {(t: number, i: number) => number} fn - Sample generator (time, index).
 * @returns {Float32Array} Samples.
 */
function render(duration, fn) {
  const n = Math.round(duration * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

/** Second-order filter (RBJ Audio EQ Cookbook). Call `set` per sample for sweeps. */
class Biquad {
  /**
   * @param {'lowpass' | 'highpass' | 'bandpass'} type - Filter type.
   * @param {number} freq - Cutoff or centre frequency in Hz.
   * @param {number} [q=0.707] - Resonance.
   */
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.set(freq, q);
  }

  /**
   * Recomputes the coefficients.
   * @param {number} freq - Frequency in Hz.
   * @param {number} [q=this.q] - Resonance.
   * @returns {void}
   */
  set(freq, q = this.q) {
    this.q = q;
    const f = Math.min(Math.max(freq, 10), SR * 0.45);
    const w0 = (TAU * f) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (this.type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    } else if (this.type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha; // Constant 0 dB peak gain.
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /**
   * Filters one sample.
   * @param {number} x - Input sample.
   * @returns {number} Output sample.
   */
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Phase accumulator for oscillators whose frequency changes over time. */
class Osc {
  constructor() {
    this.phase = 0;
  }

  /**
   * Advances by one sample.
   * @param {number} freq - Current frequency in Hz.
   * @returns {number} Phase in radians.
   */
  next(freq) {
    this.phase += freq / SR;
    return this.phase * TAU;
  }
}

/**
 * Band-limited square wave built from odd harmonics.
 * @param {number} phase - Phase in radians.
 * @param {number} freq - Fundamental in Hz (limits the harmonic count).
 * @param {number} [maxHarmonic=31] - Highest harmonic.
 * @returns {number} Sample.
 */
function square(phase, freq, maxHarmonic = 31) {
  let s = 0;
  for (let k = 1; k <= maxHarmonic && k * freq < HARMONIC_CEILING_HZ; k += 2) s += Math.sin(k * phase) / k;
  return s;
}

/**
 * Normalizes to a target peak and applies short fades so samples never click.
 * @param {Float32Array} samples - Samples, modified in place.
 * @param {number} [gain=0.9] - Target peak.
 * @param {number} [fadeOut=0.01] - Fade-out length in seconds.
 * @returns {Float32Array} The same samples.
 */
function finish(samples, gain = 0.9, fadeOut = 0.01) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? gain / peak : 0;
  const fadeInN = Math.round(0.001 * SR);
  const fadeOutN = Math.min(Math.round(fadeOut * SR), samples.length);
  for (let i = 0; i < samples.length; i++) {
    let g = scale;
    if (i < fadeInN) g *= i / fadeInN;
    const fromEnd = samples.length - 1 - i;
    if (fromEnd < fadeOutN) g *= fromEnd / fadeOutN;
    samples[i] *= g;
  }
  return samples;
}

/**
 * Writes samples as a 16-bit mono WAV file.
 * @param {string} name - File name inside OUT_DIR.
 * @param {Float32Array} samples - Samples in [-1, 1].
 * @returns {void}
 */
function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT_DIR, name), Buffer.concat([header, data]));
}

// ---------- Recipes ----------

/** File name → rendered samples. */
const sounds = {};

// Dial pad: real DTMF pairs. Index 0-9 = digits, 10 = *, 11 = #.
const DTMF = [
  [941, 1336], [697, 1209], [697, 1336], [697, 1477], [770, 1209], [770, 1336],
  [770, 1477], [852, 1209], [852, 1336], [852, 1477], [941, 1209], [941, 1477],
];
DTMF.forEach(([lo, hi], i) => {
  const dur = 0.13;
  sounds[`dialpad_${i}.wav`] = finish(render(dur, (t) => {
    const env = Math.min(1, t / 0.004) * Math.min(1, (dur - t) / 0.02);
    return (Math.sin(TAU * lo * t) + Math.sin(TAU * hi * t)) * env;
  }), 0.55);
});

/**
 * Mechanical switch: the click of the switch, then the bottom-out thock.
 * @param {number} v - Variant number (shifts pitch and seed).
 * @param {{ thockF?: number, thockDecay?: number, dur?: number }} [options] - Thock pitch, decay and length.
 * @returns {Float32Array} Samples.
 */
function mechanical(v, { thockF = 300 + v * 25, thockDecay = 0.02, dur = 0.09 } = {}) {
  setSeed(100 + v);
  const hp = new Biquad('highpass', 2000 + v * 300);
  const lp = new Biquad('lowpass', 1200, 0.9);
  const ping = 3000 + v * 250;
  return render(dur, (t) => {
    let s = hp.process(noise()) * exp(t, 0.0025) * 0.9;
    s += Math.sin(TAU * ping * t) * exp(t, 0.006) * 0.3;
    const t2 = t - 0.011;
    const n = lp.process(t2 > 0 ? noise() : 0);
    if (t2 > 0) {
      s += n * exp(t2, thockDecay * 0.6) * 0.8;
      s += Math.sin(TAU * thockF * t2) * exp(t2, thockDecay) * 0.5;
    }
    return s;
  });
}
for (let v = 0; v < 4; v++) sounds[`mechanical_${v}.wav`] = finish(mechanical(v), 0.8);
sounds['mechanical_space.wav'] = finish(mechanical(9, { thockF: 150, thockDecay: 0.045, dur: 0.16 }), 0.85);

// Mechanical key release: the lighter, higher "tick" of the switch springing back.
for (let v = 0; v < 4; v++) {
  setSeed(150 + v);
  const hp = new Biquad('highpass', 3500 + v * 250);
  sounds[`mechanical_up_${v}.wav`] = finish(render(0.045, (t) => (
    hp.process(noise()) * exp(t, 0.0015) + Math.sin(TAU * (4200 + v * 300) * t) * exp(t, 0.004) * 0.25
  )), 0.45);
}

// Typewriter: type-bar strike + platen thud + return clack.
for (let v = 0; v < 3; v++) {
  setSeed(200 + v);
  const hp = new Biquad('highpass', 1500);
  const hp2 = new Biquad('highpass', 2500);
  const lp = new Biquad('lowpass', 600);
  sounds[`typewriter_${v}.wav`] = finish(render(0.12, (t) => {
    let s = hp.process(noise()) * exp(t, 0.003);
    s += Math.sin(TAU * (1800 + v * 200) * t) * exp(t, 0.01) * 0.4;
    s += lp.process(noise()) * exp(t, 0.03) * 0.6;
    s += Math.sin(TAU * 120 * t) * exp(t, 0.025) * 0.4;
    const t3 = t - 0.05;
    s += hp2.process(t3 > 0 ? noise() : 0) * (t3 > 0 ? exp(t3, 0.004) * 0.35 : 0);
    return s;
  }), 0.8);
}
{
  setSeed(250);
  const hp = new Biquad('highpass', 4000);
  const partials = [[1, 1, 0.9], [2.0, 0.5, 0.5], [2.76, 0.35, 0.35], [5.4, 0.2, 0.2], [8.93, 0.1, 0.1]];
  const f0 = 1800;
  sounds['typewriter_bell.wav'] = finish(render(1.4, (t) => {
    let s = hp.process(noise()) * exp(t, 0.002) * 0.3;
    for (const [ratio, amp, tau] of partials) s += Math.sin(TAU * f0 * ratio * t) * amp * exp(t, tau);
    return s;
  }), 0.6, 0.1);
}

// Piano (C4): inharmonic partials, two slightly detuned strings, hammer noise.
{
  setSeed(300);
  const f0 = 261.63, B = 0.0004;
  const lp = new Biquad('lowpass', 2500);
  const harmonics = [];
  for (let n = 1; n <= 10; n++) {
    harmonics.push({
      f: n * f0 * Math.sqrt(1 + B * n * n),
      amp: (1 / Math.pow(n, 1.1)) * (n === 7 ? 0.3 : 1), // hammer-position notch
      tau: 1.6 / (1 + 0.35 * (n - 1)),
    });
  }
  sounds['piano.wav'] = finish(render(1.6, (t) => {
    let s = lp.process(noise()) * exp(t, 0.004) * 0.15;
    for (const h of harmonics) {
      const env = 0.6 * exp(t, 0.15) + 0.4 * exp(t, h.tau);
      s += (Math.sin(TAU * h.f * t) + Math.sin(TAU * h.f * 1.0005 * t)) * h.amp * env;
    }
    return s * Math.min(1, t / 0.002);
  }), 0.8, 0.15);
}

// Harmonium (C4): two detuned reeds, saw-like spectrum with a formant bump, bellows tremolo.
{
  setSeed(400);
  const f0 = 261.63, dur = 0.55, release = 0.38;
  const bp = new Biquad('bandpass', 1500, 1);
  const partials = [];
  for (let n = 1; n <= 14; n++) {
    const formant = 1 + 1.5 * Math.exp(-(((n * f0 - 1200) / 600) ** 2));
    partials.push({ n, amp: formant / n, phi: rand() * TAU });
  }
  sounds['harmonium.wav'] = finish(render(dur, (t) => {
    let s = 0;
    for (const p of partials) {
      s += Math.sin(TAU * p.n * f0 * t + p.phi) * p.amp;
      s += Math.sin(TAU * p.n * f0 * 1.0015 * t + p.phi * 1.3) * p.amp;
    }
    s += bp.process(noise()) * 0.15;
    const env = (1 - exp(t, 0.012)) * (t > release ? exp(t - release, 0.05) : 1);
    return s * env * (1 + 0.04 * Math.sin(TAU * 5.5 * t));
  }), 0.55, 0.02);
}

// Marimba (C5): fundamental + 4th and ~10th partials that die fast, mallet click.
{
  setSeed(500);
  const f = 523.25;
  const lp = new Biquad('lowpass', 3000);
  sounds['marimba.wav'] = finish(render(0.9, (t) => {
    return Math.sin(TAU * f * t) * exp(t, 0.35)
      + 0.25 * Math.sin(TAU * 4 * f * t) * exp(t, 0.05)
      + 0.08 * Math.sin(TAU * 9.9 * f * t) * exp(t, 0.015)
      + lp.process(noise()) * exp(t, 0.002) * 0.2;
  }), 0.8, 0.1);
}

// Drum kit
{
  setSeed(600);
  const osc = new Osc();
  const hp = new Biquad('highpass', 3000);
  sounds['drum_kick.wav'] = finish(render(0.5, (t) => {
    const s = Math.sin(osc.next(45 + 105 * exp(t, 0.035))) * exp(t, 0.2) + hp.process(noise()) * exp(t, 0.0015) * 0.3;
    return Math.tanh(1.5 * s);
  }), 0.9);
}
{
  setSeed(601);
  const hp = new Biquad('highpass', 1200);
  sounds['drum_snare.wav'] = finish(render(0.3, (t) => (
    Math.sin(TAU * 185 * t) * exp(t, 0.04) * 0.6
    + Math.sin(TAU * 330 * t) * exp(t, 0.03) * 0.3
    + hp.process(noise()) * exp(t, 0.07) * 0.8
  )), 0.8);
}
/**
 * Hi-hat: double high-passed noise.
 * @param {number} seedN - Noise seed.
 * @param {number} tau - Decay time constant.
 * @param {number} dur - Length in seconds.
 * @returns {Float32Array} Samples.
 */
function hat(seedN, tau, dur) {
  setSeed(seedN);
  const hp1 = new Biquad('highpass', 7000), hp2 = new Biquad('highpass', 7000);
  return finish(render(dur, (t) => hp2.process(hp1.process(noise())) * exp(t, tau)), 0.45);
}
sounds['drum_hat.wav'] = hat(602, 0.018, 0.08);
sounds['drum_hat_open.wav'] = hat(603, 0.12, 0.4);
/**
 * Tom: a sine whose pitch drops quickly, plus a little stick noise.
 * @param {number} seedN - Noise seed.
 * @param {number} lo - Resting pitch in Hz.
 * @param {number} sweep - Extra pitch at the strike in Hz.
 * @param {number} tau - Decay time constant.
 * @param {number} dur - Length in seconds.
 * @returns {Float32Array} Samples.
 */
function tom(seedN, lo, sweep, tau, dur) {
  setSeed(seedN);
  const osc = new Osc();
  const lp = new Biquad('lowpass', 1500);
  return finish(render(dur, (t) => (
    Math.sin(osc.next(lo + sweep * exp(t, 0.05))) * exp(t, tau) + lp.process(noise()) * exp(t, 0.01) * 0.2
  )), 0.8);
}
sounds['drum_tom_hi.wav'] = tom(604, 150, 70, 0.18, 0.5);
sounds['drum_tom_lo.wav'] = tom(605, 95, 60, 0.22, 0.6);
{
  setSeed(606);
  const hp = new Biquad('highpass', 3500);
  const bp = new Biquad('bandpass', 5000, 0.8);
  sounds['drum_crash.wav'] = finish(render(1.8, (t) => {
    const n = noise();
    return (hp.process(n) * 0.7 + bp.process(n) * 0.6) * (1 - exp(t, 0.002)) * exp(t, 0.55);
  }), 0.5, 0.2);
}

// Pew pew: fast exponential pitch dive, half sine / half squashed square.
[[1800, 220, 0.17], [1500, 180, 0.2], [2200, 300, 0.14]].forEach(([start, end, dur], v) => {
  const osc = new Osc();
  sounds[`pewpew_${v}.wav`] = finish(render(dur, (t) => {
    const p = osc.next(end + (start - end) * exp(t, dur * 0.28));
    const s = 0.6 * Math.sin(p) + 0.4 * Math.tanh(4 * Math.sin(p));
    return s * Math.min(1, t / 0.002) * exp(t, dur * 0.45);
  }), 0.6);
});

// Shotgun: supersonic crack + sweeping noise body + low thump + room tail, saturated.
{
  setSeed(700);
  const crackHp = new Biquad('highpass', 3000);
  const bodyLp = new Biquad('lowpass', 4000, 0.8);
  const roomLp = new Biquad('lowpass', 800);
  const osc = new Osc();
  sounds['shotgun.wav'] = finish(render(0.9, (t) => {
    bodyLp.set(300 + 4000 * exp(t, 0.03));
    let s = crackHp.process(noise()) * exp(t, 0.006);
    s += bodyLp.process(noise()) * exp(t, 0.08) * 1.4;
    s += Math.sin(osc.next(40 + 90 * exp(t, 0.03))) * exp(t, 0.12) * 0.9;
    s += roomLp.process(noise()) * exp(t, 0.3) * 0.25 * (1 - exp(t, 0.02));
    return Math.tanh(1.8 * s);
  }), 0.95, 0.1);
}
{
  // Pump action: "chk ... chk" with a slide in between.
  setSeed(701);
  const bp1 = new Biquad('bandpass', 2500, 2);
  const bp2 = new Biquad('bandpass', 2200, 2);
  const slide = new Biquad('bandpass', 1500, 1.5);
  sounds['shotgun_pump.wav'] = finish(render(0.35, (t) => {
    const n = noise();
    const t2 = t - 0.18;
    let s = bp1.process(n) * exp(t, 0.01) * 2 + Math.sin(TAU * 900 * t) * exp(t, 0.008) * 0.3;
    s += slide.process(n) * (t > 0.02 && t < 0.17 ? 0.25 * Math.sin((Math.PI * (t - 0.02)) / 0.15) : 0);
    s += bp2.process(t2 > 0 ? n : 0) * (t2 > 0 ? exp(t2, 0.012) * 2.5 : 0);
    if (t2 > 0) s += Math.sin(TAU * 700 * t2) * exp(t2, 0.01) * 0.35;
    return s;
  }), 0.8);
}

// Swoosh: band-passed noise whose center frequency sweeps up then down.
[0.22, 0.28, 0.18].forEach((dur, v) => {
  setSeed(800 + v);
  const bp = new Biquad('bandpass', 500, 1.5);
  sounds[`swoosh_${v}.wav`] = finish(render(dur, (t) => {
    const x = t / dur;
    bp.set(500 + (3500 + v * 400) * Math.sin(Math.PI * x) ** 2);
    return bp.process(noise()) * Math.pow(x, 1.2) * Math.pow(1 - x, 2);
  }), 0.75);
});

// Retro coin: B5 -> E6 square.
{
  const osc = new Osc();
  sounds['coin.wav'] = finish(render(0.5, (t) => {
    const f = t < 0.075 ? 988 : 1319;
    const env = t < 0.075 ? 1 : exp(t - 0.075, 0.12);
    return square(osc.next(f), f) * env;
  }), 0.4, 0.05);
}

// 8-bit jump: rising square sweep.
[[280, 900], [220, 700]].forEach(([from, to], v) => {
  const osc = new Osc();
  const sweep = 0.18;
  sounds[`jump_${v}.wav`] = finish(render(0.22, (t) => {
    const f = from * Math.pow(to / from, Math.min(t, sweep) / sweep);
    const env = t < 0.15 ? 1 : exp(t - 0.15, 0.03);
    return square(osc.next(f), f) * env;
  }), 0.38);
});

// Bubble pop: pure sine with a fast upward glide.
[350, 480, 600].forEach((f0, v) => {
  const osc = new Osc();
  const dur = 0.09;
  sounds[`bubble_${v}.wav`] = finish(render(0.12, (t) => (
    Math.sin(osc.next(f0 * Math.exp((t / dur) * 1.3))) * (1 - exp(t, 0.004)) * exp(t, 0.03)
  )), 0.75);
});

// Boing: dropping pitch with a decaying wobble.
{
  const osc = new Osc();
  sounds['boing.wav'] = finish(render(0.7, (t) => {
    const f = 220 * Math.exp(-t * 0.8) * (1 + 0.35 * Math.sin(TAU * 14 * t) * exp(t, 0.25));
    const p = osc.next(f);
    const s = Math.sin(p) + 0.25 * Math.sin(2 * p) + 0.1 * Math.sin(3 * p);
    return s * (1 - exp(t, 0.003)) * exp(t, 0.28);
  }), 0.7, 0.05);
}

// Squeaky toy: buzzy rise-and-fall through a resonant filter.
[[1000, 0.16], [1200, 0.2], [850, 0.13]].forEach(([base, dur], v) => {
  setSeed(900 + v);
  const osc = new Osc();
  const bp = new Biquad('bandpass', 2500, 1.2);
  sounds[`squeak_${v}.wav`] = finish(render(dur, (t) => {
    const x = t / dur;
    const f = base * (1 + 0.5 * Math.sin(Math.PI * x)) * (1 + 0.02 * Math.sin(TAU * 30 * t));
    const p = osc.next(f);
    let saw = 0;
    for (let k = 1; k <= 12 && k * f < 16000; k++) saw += Math.sin(k * p) / k;
    const s = saw * 0.4 + bp.process(saw) * 1.2 + noise() * 0.03;
    return s * Math.pow(Math.sin(Math.PI * x), 0.6);
  }), 0.55);
});

// Bonk: hollow wooden knock with a quick pitch drop.
[500, 380].forEach((base, v) => {
  setSeed(1000 + v);
  const osc = new Osc();
  const bp = new Biquad('bandpass', base * 1.8, 8);
  const hp = new Biquad('highpass', 3000);
  sounds[`bonk_${v}.wav`] = finish(render(0.3, (t) => {
    const p = osc.next(base + 400 * exp(t, 0.01));
    return Math.sin(p) * exp(t, 0.06)
      + Math.sin(p * 2.3) * exp(t, 0.02) * 0.3
      + bp.process(noise()) * exp(t, 0.04) * 1.5
      + hp.process(noise()) * exp(t, 0.002) * 0.3;
  }), 0.85);
});

// ---------- UI sounds ----------

// Combo milestone: quick rising arpeggio (C5 E5 G5 C6) with a little sparkle.
{
  setSeed(1100);
  const hp = new Biquad('highpass', 6000);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const step = 0.07;
  sounds['ui_combo.wav'] = finish(render(0.6, (t) => {
    let s = 0;
    notes.forEach((f, i) => {
      const tn = t - i * step;
      if (tn < 0) return;
      const decay = i === notes.length - 1 ? 0.18 : 0.06;
      const p = TAU * f * tn;
      s += (Math.sin(p) * 0.7 + Math.sin(2 * p) * 0.2 + Math.sin(3 * p) * 0.1) * exp(tn, decay);
    });
    const tl = t - 3 * step;
    if (tl > 0) s += hp.process(noise()) * exp(tl, 0.12) * 0.15;
    return s;
  }), 0.6, 0.05);
}

// Achievement: two bell strikes (G5 then C6) with shimmering partials.
{
  const strike = (f, t) => {
    if (t < 0) return 0;
    return [[1, 1, 0.6], [2.0, 0.4, 0.35], [3.01, 0.25, 0.2], [4.2, 0.12, 0.12]]
      .reduce((s, [ratio, amp, tau]) => s + Math.sin(TAU * f * ratio * t) * amp * exp(t, tau), 0);
  };
  sounds['ui_achievement.wav'] = finish(render(1.2, (t) => strike(783.99, t) + strike(1046.5, t - 0.12) * 1.1), 0.6, 0.1);
}

// ---------- Write ----------

fs.mkdirSync(OUT_DIR, { recursive: true });
let bytes = 0;
for (const [name, samples] of Object.entries(sounds)) {
  writeWav(name, samples);
  bytes += samples.length * 2 + 44;
}
console.log(`Wrote ${Object.keys(sounds).length} sounds (${(bytes / 1024).toFixed(0)} KB) to ${OUT_DIR}`);
