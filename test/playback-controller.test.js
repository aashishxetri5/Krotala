import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILT_IN_SOUNDS } from '../src/shared/catalog.js';
import { BannerKind, Push } from '../src/shared/constants.js';
import { PlaybackController } from '../src/main/app/playback-controller.js';
import { KeyMapper } from '../src/main/core/keymap.js';
import { StatsTracker } from '../src/main/core/stats-tracker.js';
import { DEFAULT_SETTINGS } from '../src/main/settings/schema.js';

const SOUNDS = BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true }));
const BOUNDS = { x: 0, y: 0, width: 1000, height: 800 };

/**
 * Builds a controller wired to fakes that record what it does.
 * @param {object} [patch] - Settings to override.
 * @returns {object} The controller, its fakes and a clock.
 */
function setup(patch = {}) {
  let now = new Date(2026, 9, 2, 12, 0, 0).getTime();
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...patch };
  const tracker = new StatsTracker({}, { now: () => now });
  const audio = [];
  const overlay = [];
  const toasts = [];
  const context = { muteReason: null, profileSoundId: '' };
  const controller = new PlaybackController({
    settings: { get: () => settings },
    mapper: new KeyMapper(() => SOUNDS, () => 0.5),
    context,
    stats: { update: (operation) => operation(tracker) },
    audio: { send: (channel, payload) => audio.push({ channel, payload }) },
    overlay: {
      effect: () => overlay.push({ type: 'effect' }),
      combo: (count) => overlay.push({ type: 'combo', count }),
      banner: (banner) => overlay.push({ type: 'banner', banner }),
    },
    notifier: { toast: (toast) => toasts.push(toast), system: () => {} },
    screen: {
      getCursorScreenPoint: () => ({ x: 10, y: 10 }),
      getDisplayNearestPoint: () => ({ bounds: BOUNDS }),
      getAllDisplays: () => [{ bounds: BOUNDS }],
      screenToDipPoint: (point) => point,
    },
    getCaretPoint: () => null,
  });
  const press = (key, { isRepeat = false, gap = 100 } = {}) => {
    now += gap;
    controller.onKeyDown({ key, isRepeat });
  };
  const plays = () => audio.filter((m) => m.channel === Push.PLAY);
  return { controller, settings, tracker, audio, overlay, toasts, context, press, plays };
}

test('with the main switch off, nothing happens at all', () => {
  const t = setup({ enabled: false, fxEnabled: true });
  for (let i = 0; i < 60; i++) t.press('A');
  t.controller.onKeyUp({ key: 'A' });
  assert.equal(t.audio.length, 0);
  assert.equal(t.overlay.length, 0);
  assert.equal(t.tracker.data.total, 0, 'no stats');
});

test('auto-mute silences sounds and visuals but keeps counting keys', () => {
  const t = setup({ fxEnabled: true });
  t.context.muteReason = 'Muted while your microphone is in use';
  for (let i = 0; i < 60; i++) t.press('A');
  assert.equal(t.plays().length, 0);
  assert.equal(t.overlay.length, 0, 'no combo counter or banners');
  assert.equal(t.tracker.data.total, 60);
});

test('a sustaining key plays once, ignores auto-repeat, and is released on key-up', () => {
  const t = setup({ soundId: 'piano', sustain: true, playOnRepeat: true });
  t.press('A');
  t.press('A', { isRepeat: true, gap: 30 });
  t.press('A', { isRepeat: true, gap: 30 });
  t.controller.onKeyUp({ key: 'A' });
  assert.equal(t.plays().length, 1);
  assert.equal(t.plays()[0].payload.voice, 'A');
  assert.equal(t.plays()[0].payload.sustain, true);
  assert.deepEqual(t.audio.at(-1), { channel: Push.RELEASE, payload: { voice: 'A' } });
});

test('a sound too short to sustain falls back to auto-repeat', () => {
  const t = setup({ soundId: 'piano', sustain: true, playOnRepeat: true });
  t.press('A');
  t.controller.sustainUnavailable('A'); // reported by the audio engine
  t.press('A', { isRepeat: true, gap: 30 });
  t.controller.onKeyUp({ key: 'A' });
  assert.equal(t.plays().length, 2);
  assert.ok(!t.audio.some((m) => m.channel === Push.RELEASE), 'nothing left to release');
});

test('packs that do not sustain replay on auto-repeat only when asked to', () => {
  const quiet = setup({ soundId: 'mechanical', playOnRepeat: false });
  quiet.press('A');
  quiet.press('A', { isRepeat: true });
  assert.equal(quiet.plays().length, 1);

  const repeating = setup({ soundId: 'mechanical', playOnRepeat: true });
  repeating.press('A');
  repeating.press('A', { isRepeat: true });
  assert.equal(repeating.plays().length, 2);
  assert.ok(!repeating.audio.some((m) => m.channel === Push.RELEASE), 'nothing to release');
});

test('a held sound is released even if sounds were muted while holding', () => {
  const t = setup({ soundId: 'piano', sustain: true });
  t.press('A');
  t.context.muteReason = 'Sounds are off';
  t.controller.onKeyUp({ key: 'A' });
  assert.deepEqual(t.audio.at(-1), { channel: Push.RELEASE, payload: { voice: 'A' } });
});

test('one combo banner at 50 keys, and the counter only from 20', () => {
  const t = setup({ fxEnabled: true, comboEnabled: true });
  for (let i = 0; i < 60; i++) t.press('A');
  const banners = t.overlay.filter((o) => o.type === 'banner' && o.banner.kind === BannerKind.COMBO);
  assert.equal(banners.length, 1);
  assert.equal(banners[0].banner.title, '×50');
  assert.equal(banners[0].banner.tier, 0);
  const achievements = t.overlay.filter((o) => o.type === 'banner' && o.banner.kind === BannerKind.ACHIEVEMENT);
  assert.ok(achievements.some((o) => o.banner.title === 'On Fire'), 'the 50× combo achievement is announced too');
  const counts = t.overlay.filter((o) => o.type === 'combo').map((o) => o.count);
  assert.equal(counts[0], 20);
});

test('mouse clicks play but never sustain', () => {
  const t = setup({ soundId: 'piano', sustain: true, mouseClicks: true });
  t.controller.onMouseDown({ button: 1, x: 900, y: 10 });
  assert.equal(t.plays().length, 1);
  assert.equal(t.plays()[0].payload.voice, undefined);
  assert.ok(t.plays()[0].payload.pan > 0, 'panned toward the click');
});
