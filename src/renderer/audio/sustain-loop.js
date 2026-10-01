/**
 * @file Builds a seamless loop from the body of a sample so a sound can keep playing
 * while its key is held. Pure functions on sample arrays, unit-tested in
 * test/sustain-loop.test.js.
 *
 * The loop is taken from after the attack, where the sound has decayed to its
 * sustain level, the way instruments decay and then sustain. It is levelled so its
 * end is as loud as its start (no pulsing as it repeats), and its end is crossfaded
 * into its start (no click at the seam).
 */

const FRAME_SECONDS = 0.01;
/** Frames after the peak that are skipped so the attack transient is not repeated. */
const ATTACK_SKIP_FRAMES = 2;
const MIN_LOOP_SECONDS = 0.04;
const MAX_LOOP_SECONDS = 0.3;
const SEAM_CROSSFADE_SECONDS = 0.03;
/** The attack is over once the level reaches this fraction of the peak. */
const ATTACK_END_RATIO = 0.9;
/** Sounds quieter than this fraction of their peak after the attack do not sustain. */
const MIN_RELATIVE_LEVEL = 0.04;
/** Sustain level: the loop is taken from where the sound has decayed to this fraction. */
const SUSTAIN_LEVEL = 0.5;
/** Fallback for sounds that decay too fast to reach SUSTAIN_LEVEL with a usable loop. */
const MIN_REGION_LEVEL = 0.15;
/** Limits how much a decaying tail is boosted when levelling. */
const MAX_LEVEL_BOOST = 8;

/**
 * @typedef {object} SustainLoop
 * @property {Float32Array[]} channels - Loop samples per channel.
 * @property {number} start - Where the loop region begins in the original sample (seconds).
 * @property {number} offset - Position in the loop that matches `start + offset` in the
 *   original, so playback can hand over from the original to the loop without a jump (seconds).
 */

/**
 * Root-mean-square level of each analysis frame.
 * @param {Float32Array} data - Samples.
 * @param {number} frame - Frame length in samples.
 * @returns {number[]} Level per frame.
 */
function frameLevels(data, frame) {
  const levels = [];
  for (let start = 0; start + frame <= data.length; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) sum += data[i] * data[i];
    levels.push(Math.sqrt(sum / frame));
  }
  return levels;
}

/**
 * Finds the last frame, from `first` on, before the level drops to `floor`.
 * @param {number[]} levels - Level per frame.
 * @param {number} first - Frame to start from.
 * @param {number} floor - Level that ends the stretch.
 * @returns {number} Index of the last frame above the floor.
 */
function sustainEnd(levels, first, floor) {
  let last = first;
  while (last + 1 < levels.length && levels[last + 1] > floor) last++;
  return last;
}

/**
 * Turns per-frame levels into a smooth level curve over sample positions.
 * @param {number[]} levels - Level per frame.
 * @param {number} frame - Frame length in samples.
 * @returns {(sample: number) => number} Level at any sample position.
 */
function smoothedEnvelope(levels, frame) {
  // A three-frame average keeps noisy sounds from making the gain flutter.
  const smooth = levels.map((_, i) => {
    const near = levels.slice(Math.max(0, i - 1), i + 2);
    return near.reduce((sum, v) => sum + v, 0) / near.length;
  });
  const last = smooth.length - 1;
  return (sample) => {
    const position = sample / frame - 0.5; // frame centres
    const a = Math.min(last, Math.max(0, Math.floor(position)));
    const b = Math.min(last, a + 1);
    const t = Math.min(1, Math.max(0, position - a));
    return smooth[a] * (1 - t) + smooth[b] * t;
  };
}

/**
 * Creates a sustain loop for a sample.
 * @param {Float32Array[]} channels - Sample data per channel (equal lengths).
 * @param {number} sampleRate - Samples per second.
 * @returns {SustainLoop | null} The loop, or null when the sound is too short or too
 *   quiet after its attack to sustain (clicks, knocks).
 */
export function buildSustainLoop(channels, sampleRate) {
  const frame = Math.max(1, Math.round(FRAME_SECONDS * sampleRate));
  const levels = frameLevels(channels[0], frame);
  if (levels.length < ATTACK_SKIP_FRAMES + 2) return null;

  const peak = Math.max(...levels);
  // The attack ends at the first frame close to the peak. Using the peak itself would
  // pick an arbitrary frame of a steady tone, possibly near its end.
  const attackEnd = levels.findIndex((level) => level >= peak * ATTACK_END_RATIO);
  const firstFrame = attackEnd + ATTACK_SKIP_FRAMES;
  if (firstFrame >= levels.length || levels[firstFrame] <= peak * MIN_RELATIVE_LEVEL) return null;

  // Like an instrument's decay-then-sustain: let the sound decay naturally to about
  // half its level, and loop the stretch just before that. Taps stay natural for as
  // long as possible. Sounds that decay too fast for that loop a quieter stretch.
  const minFrames = Math.ceil((MIN_LOOP_SECONDS * sampleRate) / frame);
  let lastFrame = sustainEnd(levels, firstFrame, Math.max(peak * MIN_RELATIVE_LEVEL, levels[firstFrame] * SUSTAIN_LEVEL));
  if (lastFrame - firstFrame + 1 < minFrames) {
    lastFrame = sustainEnd(levels, firstFrame, Math.max(peak * MIN_RELATIVE_LEVEL, levels[firstFrame] * MIN_REGION_LEVEL));
  }
  const regionFrames = Math.min(lastFrame - firstFrame + 1, Math.floor((MAX_LOOP_SECONDS * sampleRate) / frame));
  if (regionFrames < minFrames) return null;

  const start = (lastFrame - regionFrames + 1) * frame;
  const length = regionFrames * frame;

  const fade = Math.min(Math.round(SEAM_CROSSFADE_SECONDS * sampleRate), Math.floor(length / 3));
  const loopLength = length - fade;
  // Follow the sound's own level curve and hold it at the hand-over level, so the
  // loop neither fades nor swells. Gain is 1 up to the hand-over point, which keeps
  // the switch from the original sample seamless.
  const envelope = smoothedEnvelope(levels, frame);
  const target = envelope(start + fade);
  const gainAt = (i) => (i <= fade
    ? 1
    : Math.min(MAX_LEVEL_BOOST, Math.max(1 / MAX_LEVEL_BOOST, target / Math.max(envelope(start + i), 1e-6))));

  const loopChannels = channels.map((data) => {
    const region = (i) => data[start + i] * gainAt(i);
    const loop = new Float32Array(loopLength);
    for (let i = 0; i < loopLength; i++) {
      if (i < fade) {
        // Equal-power crossfade: the region's tail fades into its head.
        const t = (i / fade) * (Math.PI / 2);
        loop[i] = region(i) * Math.sin(t) + region(loopLength + i) * Math.cos(t);
      } else {
        loop[i] = region(i);
      }
    }
    return loop;
  });

  return { channels: loopChannels, start: start / sampleRate, offset: fade / sampleRate };
}
