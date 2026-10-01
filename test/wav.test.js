import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav, findSoundBounds, mixToMono, peakOf } from '../src/renderer/dashboard/lib/wav.js';
import { niceStep } from '../src/renderer/dashboard/components/day-chart.js';

const RATE = 1000;

test('channels are averaged into mono', () => {
  assert.deepEqual([...mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])], [0.5, 0.5]);
});

test('silence around a sound is trimmed with a little padding', () => {
  const samples = new Float32Array(2000);
  samples.fill(0.5, 800, 1000);
  const { start, end } = findSoundBounds(samples, RATE);
  assert.equal(start, 790); // 10 ms lead-in
  assert.equal(end, 1080); // 80 ms tail
});

test('a silent recording is kept whole', () => {
  assert.deepEqual(findSoundBounds(new Float32Array(100), RATE), { start: 0, end: 100 });
});

test('WAV output has a valid header and is normalized', () => {
  const samples = new Float32Array(100).fill(0.25);
  const wav = encodeWav(samples, RATE);
  const view = new DataView(wav.buffer);
  const text = (offset, length) => String.fromCharCode(...wav.slice(offset, offset + length));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint32(24, true), RATE);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
  const middle = view.getInt16(44 + 50 * 2, true) / 32767;
  assert.ok(Math.abs(middle - 0.9) < 0.001, 'peak is normalized to 0.9');
  assert.equal(view.getInt16(44, true), 0, 'fades in from silence');
  assert.ok(Math.abs(peakOf(new Float32Array([-0.7, 0.3])) - 0.7) < 1e-6);
});

test('chart ticks use round steps', () => {
  assert.equal(niceStep(0), 1);
  assert.equal(niceStep(4), 1);
  assert.equal(niceStep(950), 250);
  assert.equal(niceStep(12_000), 5000);
});
