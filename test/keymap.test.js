import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILT_IN_SOUNDS } from '../src/shared/catalog.js';
import {
  CHAOS_SOUND_ID, ChokeGroup, MUTE, PACK_DEFAULT, PitchMode,
} from '../src/shared/constants.js';
import { SONGS } from '../src/shared/songs.js';
import { KeyMapper } from '../src/main/core/keymap.js';
import { isPrintable, keyGroup, keyPan, melodySemitones } from '../src/main/core/keyboard-layout.js';

const SOUNDS = BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true }));
const BASE = { soundId: 'dialpad', pitchMode: PitchMode.OFF, songId: 'fur-elise', stereo: false, keyUpSound: '', overrides: {} };
const mapper = () => new KeyMapper(() => SOUNDS, () => 0.5);
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('keys are grouped for overrides', () => {
  assert.equal(keyGroup('A'), 'Letters');
  assert.equal(keyGroup('7'), 'Numbers');
  assert.equal(keyGroup('Numpad3'), 'Numbers');
  assert.equal(keyGroup('ShiftRight'), 'Modifiers');
  assert.equal(keyGroup('NumpadArrowUp'), 'Arrows');
  assert.equal(keyGroup('Mouse1'), 'Mouse');
  assert.equal(keyGroup('Enter'), null);
});

test('only character keys count toward typing speed', () => {
  for (const key of ['Q', 'Space', 'Comma', '5', 'Numpad5']) assert.ok(isPrintable(key), key);
  for (const key of ['Shift', 'Enter', 'Backspace', 'F5']) assert.ok(!isPrintable(key), key);
});

test('stereo position runs left to right across the keyboard', () => {
  assert.ok(keyPan('Q') < 0);
  assert.ok(keyPan('P') > 0);
  assert.ok(keyPan('A') < keyPan('L'));
  assert.ok(Math.abs(keyPan('Space')) < 0.1);
  for (const key of ['Escape', 'Backquote', 'Enter', 'ShiftRight', 'ArrowLeft']) assert.ok(Math.abs(keyPan(key)) <= 1, key);
});

test('dial pad digits play their own tone', () => {
  const m = mapper();
  assert.deepEqual(m.resolve(BASE, '5').slot, { type: 'variant', index: 5 });
  assert.deepEqual(m.resolve(BASE, 'Numpad0').slot, { type: 'variant', index: 0 });
});

test('a key always gets the same variant', () => {
  const m = mapper();
  const s = { ...BASE, soundId: 'mechanical' };
  assert.deepEqual(m.resolve(s, 'K').slot, m.resolve(s, 'K').slot);
});

test('pack special keys replace the variant, including numpad Enter', () => {
  const m = mapper();
  const s = { ...BASE, soundId: 'typewriter' };
  assert.deepEqual(m.resolve(s, 'Enter').slot, { type: 'special', key: 'Enter' });
  assert.deepEqual(m.resolve(s, 'NumpadEnter').slot, { type: 'special', key: 'Enter' });
});

test('a key override beats its group, and mute silences', () => {
  const m = mapper();
  const s = { ...BASE, overrides: { Letters: 'shotgun', Space: MUTE, Enter: 'coin' } };
  assert.equal(m.resolve(s, 'B').soundId, 'shotgun');
  assert.equal(m.resolve(s, 'Space'), null);
  assert.equal(m.resolve(s, 'Enter').soundId, 'coin');
  assert.equal(m.resolve(s, '1').soundId, 'dialpad');
});

test('an app profile replaces the main sound but not key overrides', () => {
  const m = mapper();
  assert.equal(m.resolve(BASE, 'A', { profileSoundId: 'piano' }).soundId, 'piano');
  assert.equal(m.resolve({ ...BASE, overrides: { Enter: 'coin' } }, 'Enter', { profileSoundId: 'piano' }).soundId, 'coin');
});

test('Chaos mode picks a built-in pack', () => {
  const r = mapper().resolve({ ...BASE, soundId: CHAOS_SOUND_ID }, 'A');
  assert.ok(SOUNDS.some((s) => s.id === r.soundId));
});

test('Melody mode climbs the keyboard rows', () => {
  assert.ok(melodySemitones('Z') < melodySemitones('A'));
  assert.ok(melodySemitones('A') < melodySemitones('Q'));
  assert.ok(melodySemitones('Q') < melodySemitones('1'));
});

test('Song mode plays the notes in order and in tune, skipping modifiers', () => {
  const m = mapper();
  const s = { ...BASE, soundId: 'piano', pitchMode: PitchMode.SONG, songId: 'ode-to-joy' };
  const { notes } = SONGS.find((x) => x.id === 'ode-to-joy');
  ['H', 'E', 'L', 'L'].forEach((key, i) => closeTo(m.resolve(s, key).rate, 2 ** ((notes[i] - 60) / 12)));
  assert.equal(m.resolve(s, 'Shift'), null);
  assert.equal(m.songProgress(s).index, 4);
  m.restartSong();
  assert.equal(m.songProgress(s).index, 0);
});

test('Song notes are centred and cut each other off, so fast typing keeps the tune clear', () => {
  const m = mapper();
  const song = m.resolve({ ...BASE, soundId: 'piano', pitchMode: PitchMode.SONG, stereo: true }, 'Q');
  assert.equal(song.choke, ChokeGroup.SONG);
  assert.equal(song.pan, 0);
  const normal = m.resolve({ ...BASE, soundId: 'piano', stereo: true }, 'Q');
  assert.equal(normal.choke, undefined, 'other modes let notes ring together');
  assert.ok(normal.pan < 0);
});

test('Song mode transposes for the pack base note', () => {
  const r = mapper().resolve({ ...BASE, soundId: 'marimba', pitchMode: PitchMode.SONG, songId: 'twinkle' }, 'A');
  closeTo(r.rate, 2 ** ((60 - 72) / 12));
});

test('panning follows the stereo setting', () => {
  const m = mapper();
  assert.equal(m.resolve(BASE, 'Q').pan, 0);
  assert.ok(m.resolve({ ...BASE, stereo: true }, 'Q').pan < 0);
  assert.equal(m.resolve({ ...BASE, stereo: true }, 'Mouse1', { pan: 0.5 }).pan, 0.5);
});

test('key release sounds', () => {
  const m = mapper();
  assert.equal(m.resolveRelease(BASE, 'A'), null);
  assert.equal(m.resolveRelease({ ...BASE, keyUpSound: PACK_DEFAULT }, 'A'), null, 'dial pad has no release sound');
  assert.equal(m.resolveRelease({ ...BASE, soundId: 'mechanical', keyUpSound: PACK_DEFAULT }, 'A').slot.type, 'release');
  const borrowed = m.resolveRelease({ ...BASE, keyUpSound: 'bubble' }, 'A');
  assert.equal(borrowed.soundId, 'bubble');
  assert.ok(borrowed.gain < 1);
});

test('tonal packs sustain while held when the setting is on', () => {
  const m = mapper();
  assert.equal(m.resolve({ ...BASE, sustain: true, soundId: 'piano' }, 'A').sustain, true);
  assert.equal(m.resolve({ ...BASE, sustain: true, soundId: 'mechanical' }, 'A').sustain, false, 'clicks never sustain');
  assert.equal(m.resolve({ ...BASE, sustain: false, soundId: 'piano' }, 'A').sustain, false);
  assert.equal(m.resolve({ ...BASE, sustain: true, soundId: 'piano' }, 'Mouse1').sustain, false, 'mouse clicks have no release');
});

test('preview picks the requested variant', () => {
  assert.deepEqual(mapper().preview('mechanical', 2).slot, { type: 'variant', index: 2 });
  assert.equal(mapper().preview('missing'), null);
});

test('every song stays within the playable pitch range on every melodic pack', () => {
  for (const song of SONGS) {
    for (const sound of SOUNDS.filter((s) => s.pitched)) {
      for (const note of song.notes) {
        const rate = 2 ** ((note - (sound.baseNote ?? 60)) / 12);
        assert.ok(rate >= 0.25 && rate <= 4, `${song.id} on ${sound.id}`);
      }
    }
  }
});
