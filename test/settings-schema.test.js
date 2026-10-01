import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, migrateSettings, sanitizePatch } from '../src/main/settings/schema.js';

test('valid user changes are accepted', () => {
  assert.deepEqual(sanitizePatch({ volume: 0.4, enabled: false, pitchMode: 'song' }), { volume: 0.4, enabled: false, pitchMode: 'song' });
});

test('invalid values and main-process-only keys are dropped', () => {
  const patch = sanitizePatch({
    volume: 3,
    fxSize: Number.NaN,
    pitchMode: 'loud',
    overrides: { NotAKey: 'piano' },
    customSounds: [],
    hasShownTrayHint: true,
    profiles: [{ app: '', soundId: 'piano' }],
  });
  assert.deepEqual(patch, {});
});

test('migration keeps saved values, fills new defaults and extracts v1 stats', () => {
  const { settings, legacyStats } = migrateSettings({
    volume: 0.3,
    overrides: { Enter: 'coin' },
    stats: { total: 41, today: 41, day: '2026-10-01' },
  });
  assert.equal(settings.volume, 0.3);
  assert.equal(settings.overrides.Enter, 'coin');
  assert.equal(settings.overrides.Letters, '');
  assert.equal(settings.fxStyle, DEFAULT_SETTINGS.fxStyle);
  assert.equal('stats' in settings, false);
  assert.deepEqual(legacyStats, { total: 41, today: 41, day: '2026-10-01' });
});

test('settings that no longer exist are dropped', () => {
  const { settings } = migrateSettings({ announcer: true, volume: 0.5 });
  assert.equal('announcer' in settings, false);
  assert.equal(settings.volume, 0.5);
});

test('a missing file yields defaults', () => {
  const { settings, legacyStats } = migrateSettings(null);
  assert.deepEqual(settings, structuredClone(DEFAULT_SETTINGS));
  assert.equal(legacyStats, null);
});
