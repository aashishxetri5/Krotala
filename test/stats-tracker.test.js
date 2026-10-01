import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, StatsTracker } from '../src/main/core/stats-tracker.js';

const DAY = 86_400_000;

/**
 * @param {number} [start] - Initial time.
 * @returns {{ now: () => number, advance: (ms: number) => void }} Controllable clock.
 */
function clock(start = new Date(2026, 9, 2, 14, 0, 0).getTime()) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('counts keys per day and per key', () => {
  const s = new StatsTracker({}, clock());
  s.record('A');
  s.record('A');
  s.record('Space');
  assert.equal(s.data.total, 3);
  assert.equal(s.today(), 3);
  assert.equal(s.data.keys.A, 2);
});

test('combos grow with steady typing, reset after a pause, and report milestones', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  let milestone = null;
  for (let i = 0; i < 25; i++) {
    c.advance(150);
    ({ milestone } = s.record('A'));
  }
  assert.equal(s.combo, 25);
  assert.equal(milestone, 25);
  c.advance(2000);
  s.record('A');
  assert.equal(s.combo, 1);
  assert.equal(s.data.bestCombo, 25);
});

test('words per minute reflects recent typing and drops to 0 when idle', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  // 60 WPM is 300 characters per minute: one key every 200 ms.
  for (let i = 0; i < 40; i++) {
    c.advance(200);
    s.record('E', { printable: true });
  }
  const wpm = s.currentWpm();
  assert.ok(wpm >= 55 && wpm <= 65, `got ${wpm}`);
  assert.ok(s.data.bestWpm >= 55);
  c.advance(5000);
  assert.equal(s.currentWpm(), 0);
});

test('bursts from macros or pasting do not set an impossible best speed', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  for (let i = 0; i < 60; i++) {
    c.advance(1);
    s.record('X', { printable: true });
  }
  assert.ok(s.data.bestWpm <= 250);
});

test('streak counts consecutive days and tolerates nothing typed yet today', () => {
  const c = clock();
  const days = {};
  for (let i = 1; i <= 4; i++) days[dayKey(c.now() - i * DAY)] = 10;
  const s = new StatsTracker({ days }, c);
  assert.equal(s.streak(), 4);
  s.record('A');
  assert.equal(s.streak(), 5);
});

test('achievements unlock exactly once', () => {
  const s = new StatsTracker({ total: 99 }, clock());
  assert.ok(s.record('A').achievements.some((a) => a.id === 'keys-100'));
  assert.ok(!s.record('A').achievements.some((a) => a.id === 'keys-100'));
  assert.ok(s.notePackCreated().some((a) => a.id === 'creator'));
});

test('trying packs counts each pack once', () => {
  const s = new StatsTracker({}, clock());
  for (const id of ['a', 'b', 'a', 'c', 'd']) s.notePackTried(id);
  assert.deepEqual(s.data.packsTried, ['a', 'b', 'c', 'd']);
  assert.ok(s.notePackTried('e').some((a) => a.id === 'packs-5'));
});

test('Night Owl unlocks after midnight', () => {
  const s = new StatsTracker({}, clock(new Date(2026, 9, 2, 1, 30).getTime()));
  assert.ok(s.record('A').achievements.some((a) => a.id === 'night-owl'));
});

test('snapshot covers 30 days ending today and every achievement', () => {
  const s = new StatsTracker({}, clock());
  s.record('A');
  const snap = s.snapshot();
  assert.equal(snap.days.length, 30);
  assert.equal(snap.days.at(-1).count, 1);
  assert.ok(snap.achievements.length >= 15);
  assert.ok(snap.achievements.every((a) => !('test' in a)));
});

test('history older than a year is pruned', () => {
  const c = clock();
  const s = new StatsTracker({ days: { '2020-01-01': 5 } }, c);
  s.record('A');
  s.prune();
  assert.deepEqual(Object.keys(s.data.days), [dayKey(c.now())]);
});
