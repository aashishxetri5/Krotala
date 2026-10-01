const test = require('node:test');
const assert = require('node:assert/strict');
const { StatsTracker, dayKey } = require('../src/main/stats');

function clock(start = new Date(2026, 9, 2, 14, 0, 0).getTime()) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('counts keys per day and per key', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  s.record('A');
  s.record('A');
  s.record('Space');
  assert.equal(s.data.total, 3);
  assert.equal(s.today(), 3);
  assert.equal(s.data.keys.A, 2);
});

test('combo grows with quick typing, resets after a pause, reports milestones', () => {
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

test('words per minute from recent typing', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  // 60 WPM = 300 chars/min = one key every 200 ms
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

test('a burst of pasted/macro keys does not set an absurd best WPM', () => {
  const c = clock();
  const s = new StatsTracker({}, c);
  for (let i = 0; i < 60; i++) {
    c.advance(1);
    s.record('X', { printable: true });
  }
  assert.ok(s.data.bestWpm <= 250);
});

test('streak counts consecutive days, allowing today to be empty', () => {
  const c = clock();
  const day = 86_400_000;
  const days = {};
  for (let i = 1; i <= 4; i++) days[dayKey(c.now() - i * day)] = 10;
  const s = new StatsTracker({ days }, c);
  assert.equal(s.streak(), 4);
  s.record('A');
  assert.equal(s.streak(), 5);
});

test('achievements unlock once', () => {
  const c = clock();
  const s = new StatsTracker({ total: 99 }, c);
  const first = s.record('A').achievements.map((a) => a.id);
  assert.ok(first.includes('keys-100'));
  const second = s.record('A').achievements.map((a) => a.id);
  assert.ok(!second.includes('keys-100'));
  assert.ok(s.notePackCreated().some((a) => a.id === 'creator'));
});

test('trying packs counts unique packs', () => {
  const s = new StatsTracker({}, clock());
  for (const id of ['a', 'b', 'a', 'c', 'd']) s.notePackTried(id);
  assert.deepEqual(s.data.packsTried, ['a', 'b', 'c', 'd']);
  assert.ok(s.notePackTried('e').some((a) => a.id === 'packs-5'));
});

test('night owl unlocks after midnight', () => {
  const s = new StatsTracker({}, clock(new Date(2026, 9, 2, 1, 30).getTime()));
  assert.ok(s.record('A').achievements.some((a) => a.id === 'night-owl'));
});

test('snapshot has 30 days ending today and every achievement', () => {
  const s = new StatsTracker({}, clock());
  s.record('A');
  const snap = s.snapshot();
  assert.equal(snap.days.length, 30);
  assert.equal(snap.days.at(-1).count, 1);
  assert.ok(snap.achievements.length >= 15);
  assert.ok(snap.achievements.every((a) => !('test' in a)));
});

test('prune drops history older than a year', () => {
  const c = clock();
  const s = new StatsTracker({ days: { '2020-01-01': 5 } }, c);
  s.record('A');
  s.prune();
  assert.deepEqual(Object.keys(s.data.days), [dayKey(c.now())]);
});
