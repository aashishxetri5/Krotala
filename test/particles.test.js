import assert from 'node:assert/strict';
import test from 'node:test';
import { burst, step } from '../src/renderer/overlay/particles.js';

const MAX_FRAME_SECONDS = 0.05;

/**
 * @returns {import('../src/renderer/overlay/particles.js').Particle[]} A banner burst.
 */
function freshBurst() {
  const particles = [];
  burst(particles, { x: 500, y: 300, glow: '#ffb020', sparks: ['#ffffff'], intensity: 1 });
  return particles;
}

test('particles age by the clock, so a pause in animation never leaves them on screen', () => {
  const particles = freshBurst();
  for (const p of particles) step(p, MAX_FRAME_SECONDS, 1000); // first frame
  // Animation stalls for 5 seconds; the next frame still advances movement by at most one frame…
  const alive = particles.filter((p) => step(p, MAX_FRAME_SECONDS, 6000));
  // …but every particle is past its lifetime and expires.
  assert.equal(alive.length, 0);
});

test('particles live out their lifetime when frames arrive normally', () => {
  const particles = freshBurst();
  let now = 1000;
  for (const p of particles) step(p, 0.016, now);
  now += 100;
  assert.ok(particles.every((p) => step(p, 0.016, now)), 'all alive after 100 ms');
  now += 2000;
  assert.ok(particles.every((p) => !step(p, 0.016, now)), 'all gone after their lifetime');
});
