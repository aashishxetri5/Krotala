import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, StatsTracker } from '../src/main/core/stats-tracker.js';
import { isPrintable } from '../src/main/core/keyboard-layout.js';

const DAY = 86_400_000;

/**
 * @param {number} [start] - Initial time.
 * @returns {{ now: () => number, advance: (ms: number) => void }} Controllable clock.
 */
function clock(start = new Date(2026, 9, 2, 14, 0, 0).getTime()) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

/**
 * Types keys at a steady interval, the way the input hook reports them.
 * @param {StatsTracker} stats - Tracker under test.
 * @param {{ advance: (ms: number) => void }} c - Clock.
 * @param {string[]} keys - Key names.
 * @param {number} intervalMs - Time between keys.
 * @returns {void}
 */
function type(stats, c, keys, intervalMs) {
  for (const key of keys) {
    c.advance(intervalMs);
    stats.record(key, { printable: isPrintable(key) });
  }
}

test('typing "Hello" is 6 keys: Shift plus 5 characters', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, ['Shift', 'H', 'E', 'L', 'L', 'O'], 150);
  const snap = s.snapshot();
  assert.equal(snap.today, 6);
  assert.equal(snap.charactersToday, 5);
  assert.equal(snap.otherKeysToday, 1);
  assert.equal(s.data.keys.L, 2);
});

test('the breakdown is withheld when part of today was counted before it existed', () => {
  const c = clock();
  const s = new StatsTracker({ days: { [dayKey(c.now())]: 100 } }, c);
  type(s, c, ['A'], 100);
  assert.equal(s.snapshot().today, 101);
  assert.equal(s.snapshot().charactersToday, null);
});

test('combos grow with steady typing, reset after a pause, and report milestones', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  const milestones = [];
  for (let i = 0; i < 100; i++) {
    c.advance(150);
    const { milestone } = s.record('A');
    if (milestone) milestones.push(milestone);
  }
  assert.deepEqual(milestones, [50, 100]);
  c.advance(2000);
  s.record('A');
  assert.equal(s.combo, 1);
  assert.equal(s.data.bestCombo, 100);
});

test('best speed measures intervals exactly', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  // 60 WPM is 300 characters per minute: one character every 200 ms.
  type(s, c, Array(40).fill('E'), 200);
  assert.equal(s.data.bestWpm, 60);
});

test('best speed ignores bursts too fast to be typed by hand', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, Array(60).fill('X'), 1);
  assert.equal(s.data.bestWpm, 0);
});

test('average speed counts typing time and leaves pauses out', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, Array(30).fill('E'), 200);
  c.advance(10_000); // a long pause in the middle
  type(s, c, Array(30).fill('E'), 200);
  assert.equal(s.snapshot().averageWpm, 60);
});

test('key mashing in the middle of typing does not inflate speed', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, Array(60).fill('E'), 200); // 60 WPM
  type(s, c, Array(40).fill('J'), 10); // mashing
  type(s, c, Array(10).fill('E'), 200);
  const snap = s.snapshot();
  assert.ok(snap.averageWpm >= 59 && snap.averageWpm <= 66, `average ${snap.averageWpm}`);
  assert.ok(snap.bestWpm <= 66, `best ${snap.bestWpm}`);
  assert.equal(snap.today, 110, 'mashed keys are still counted as keys');
});

test('a best speed saved before mash detection is cleared when implausible', () => {
  assert.equal(new StatsTracker({ bestWpm: 248 }, clock()).data.bestWpm, 0);
  assert.equal(new StatsTracker({ bestWpm: 95 }, clock()).data.bestWpm, 95);
});

test('modifier and shortcut keys do not dilute average speed', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, Array.from({ length: 60 }, () => ['E', 'Shift']).flat(), 100);
  // 60 characters, each 200 ms apart once the interleaved Shift is ignored.
  assert.equal(s.snapshot().averageWpm, 60);
});

test('average speed waits for enough typing', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  type(s, c, Array(10).fill('E'), 200);
  assert.equal(s.snapshot().averageWpm, null);
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

test('daily counters roll over at local midnight', () => {
  const c = clock(new Date(2026, 9, 2, 23, 59, 59).getTime());
  const s = new StatsTracker({}, c);
  type(s, c, ['A'], 0);
  c.advance(2000);
  type(s, c, ['B', 'C'], 0);
  const days = s.snapshot().days;
  assert.equal(days.at(-1).count, 2);
  assert.equal(days.at(-2).count, 1);
  assert.equal(s.data.total, 3);
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

test('history older than a year is pruned from every daily counter', () => {
  const c = clock();
  const old = '2020-01-01';
  const s = new StatsTracker({
    days: { [old]: 5 }, characters: { [old]: 4 }, otherKeys: { [old]: 1 }, activeMs: { [old]: 900 }, activeChars: { [old]: 3 },
  }, c);
  s.record('A', { printable: true });
  s.prune();
  for (const field of ['days', 'characters', 'otherKeys', 'activeMs', 'activeChars']) {
    assert.ok(!(old in s.data[field]), field);
  }
});
