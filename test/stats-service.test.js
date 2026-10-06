import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StatsService } from '../src/main/app/stats-service.js';

test('resetting stats clears counts and achievements, in memory and on disk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krotala-stats-'));
  const file = path.join(dir, 'stats.json');
  const stats = new StatsService(file, null);
  for (let i = 0; i < 120; i++) stats.update((t) => t.record('A', { printable: true }));
  assert.equal(stats.snapshot().total, 120);
  assert.ok(stats.snapshot().achievements.some((a) => a.unlockedAt), 'an achievement was unlocked');

  stats.reset();
  const snapshot = stats.snapshot();
  assert.equal(snapshot.total, 0);
  assert.equal(snapshot.bestCombo, 0);
  assert.ok(snapshot.achievements.every((a) => !a.unlockedAt));

  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.total, 0);
  assert.deepEqual(saved.achievements, {});
  assert.equal(new StatsService(file, null).snapshot().total, 0, 'stays reset after a restart');
  await fs.rm(dir, { recursive: true, force: true });
});
