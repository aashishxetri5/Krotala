import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSustainLoop } from '../src/renderer/audio/sustain-loop.js';

const RATE = 8000;

/**
 * @param {number} seconds - Length.
 * @param {(t: number) => number} fn - Sample at time t.
 * @returns {Float32Array} Samples.
 */
function render(seconds, fn) {
  return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => fn(i / RATE));
}

/**
 * @param {Float32Array} data - Samples.
 * @param {number} from - First index.
 * @param {number} to - End index.
 * @returns {number} RMS level of the range.
 */
function level(data, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] ** 2;
  return Math.sqrt(sum / (to - from));
}

// A 220 Hz tone with a quick attack and a slow decay, like a plucked or struck note.
const note = render(1, (t) => Math.sin(2 * Math.PI * 220 * t) * Math.min(1, t / 0.005) * Math.exp(-t / 0.4));

test('a decaying tone gets a loop that starts after the attack', () => {
  const loop = buildSustainLoop([note], RATE);
  assert.ok(loop);
  assert.ok(loop.start > 0.005 && loop.start < 0.1, `start ${loop.start}`);
  assert.ok(loop.channels[0].length > 0.05 * RATE);
});

test('the loop is levelled, so it does not pulse as it repeats', () => {
  const data = buildSustainLoop([note], RATE).channels[0];
  const window = Math.round(0.02 * RATE);
  const head = level(data, window, 2 * window);
  const tail = level(data, data.length - window, data.length);
  assert.ok(Math.abs(head - tail) / head < 0.15, `head ${head.toFixed(3)} tail ${tail.toFixed(3)}`);
});

test('the seam is smooth: the last sample flows into the first', () => {
  const data = buildSustainLoop([note], RATE).channels[0];
  const maxStep = Math.max(...data.slice(1).map((v, i) => Math.abs(v - data[i])));
  const seam = Math.abs(data[0] - data.at(-1));
  assert.ok(seam <= maxStep * 1.5, `seam ${seam.toFixed(3)} vs typical step ${maxStep.toFixed(3)}`);
});

test('the hand-over point matches the original sample exactly', () => {
  const loop = buildSustainLoop([note], RATE);
  const original = Math.round((loop.start + loop.offset) * RATE);
  const inLoop = Math.round(loop.offset * RATE);
  assert.ok(Math.abs(loop.channels[0][inLoop] - note[original]) < 1e-6);
});

test('a steady tone loops from just after its attack, not from wherever it peaks', () => {
  // A flat tone with a 4 ms attack and a 20 ms fade at the end, like a dial pad tone.
  const tone = render(0.13, (t) => Math.sin(2 * Math.PI * 941 * t) * Math.min(1, t / 0.004, (0.13 - t) / 0.02));
  const loop = buildSustainLoop([tone], RATE);
  assert.ok(loop);
  assert.ok(loop.start < 0.05, `start ${loop.start}`);
  assert.ok(loop.channels[0].length >= 0.05 * RATE);
});

test('a short click does not sustain', () => {
  const click = render(0.04, (t) => (Math.random() * 2 - 1) * Math.exp(-t / 0.003));
  assert.equal(buildSustainLoop([click], RATE), null);
});

test('every channel is looped', () => {
  const loop = buildSustainLoop([note, note.map((v) => v * 0.5)], RATE);
  assert.equal(loop.channels.length, 2);
  assert.equal(loop.channels[0].length, loop.channels[1].length);
});
