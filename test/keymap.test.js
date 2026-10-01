const test = require('node:test');
const assert = require('node:assert/strict');
const { KeyMapper, keyGroup, keyPan, isPrintable, melodySemitones } = require('../src/main/keymap');
const { BUILT_IN_SOUNDS, CHAOS_ID } = require('../src/shared/catalog');
const { SONGS } = require('../src/main/songs');

const SOUNDS = BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true }));
const base = {
  soundId: 'dialpad', pitchMode: 'off', songId: 'fur-elise', stereo: false, keyUpSound: '',
  overrides: {},
};
const mapper = () => new KeyMapper(() => SOUNDS, () => 0.5);

test('key groups', () => {
  assert.equal(keyGroup('A'), 'Letters');
  assert.equal(keyGroup('7'), 'Numbers');
  assert.equal(keyGroup('Numpad3'), 'Numbers');
  assert.equal(keyGroup('ShiftRight'), 'Modifiers');
  assert.equal(keyGroup('NumpadArrowUp'), 'Arrows');
  assert.equal(keyGroup('Mouse1'), 'Mouse');
  assert.equal(keyGroup('Enter'), null);
});

test('printable keys count toward WPM, modifiers do not', () => {
  assert.ok(isPrintable('Q'));
  assert.ok(isPrintable('Space'));
  assert.ok(isPrintable('Comma'));
  assert.ok(!isPrintable('Shift'));
  assert.ok(!isPrintable('Enter'));
});

test('stereo pan runs left to right across the keyboard', () => {
  assert.ok(keyPan('Q') < 0);
  assert.ok(keyPan('P') > 0);
  assert.ok(keyPan('A') < keyPan('L'));
  assert.ok(Math.abs(keyPan('Space')) < 0.1);
  for (const k of ['Escape', 'Backquote', 'Enter', 'ShiftRight', 'ArrowLeft']) assert.ok(Math.abs(keyPan(k)) <= 1);
});

test('dial pad digits play their own DTMF tone', () => {
  const m = mapper();
  assert.deepEqual(m.resolve(base, '5').slot, { type: 'variant', index: 5 });
  assert.deepEqual(m.resolve(base, 'Numpad0').slot, { type: 'variant', index: 0 });
});

test('same key always gets the same variant', () => {
  const m = mapper();
  const s = { ...base, soundId: 'mechanical' };
  assert.deepEqual(m.resolve(s, 'K').slot, m.resolve(s, 'K').slot);
});

test('pack special keys win over variants', () => {
  const m = mapper();
  assert.deepEqual(m.resolve({ ...base, soundId: 'typewriter' }, 'Enter').slot, { type: 'special', key: 'Enter' });
  assert.deepEqual(m.resolve({ ...base, soundId: 'typewriter' }, 'NumpadEnter').slot, { type: 'special', key: 'Enter' });
});

test('overrides: specific key beats group, mute silences', () => {
  const m = mapper();
  const s = { ...base, overrides: { Letters: 'shotgun', A: '', Space: 'mute' } };
  assert.equal(m.resolve(s, 'B').soundId, 'shotgun');
  assert.equal(m.resolve(s, 'Space'), null);
  const s2 = { ...base, overrides: { Letters: 'shotgun', Enter: 'coin' } };
  assert.equal(m.resolve(s2, 'Enter').soundId, 'coin');
  assert.equal(m.resolve(s2, '1').soundId, 'dialpad');
});

test('per-app profile sound replaces the main sound but not overrides', () => {
  const m = mapper();
  assert.equal(m.resolve(base, 'A', { profileSoundId: 'piano' }).soundId, 'piano');
  const s = { ...base, overrides: { Enter: 'coin' } };
  assert.equal(m.resolve(s, 'Enter', { profileSoundId: 'piano' }).soundId, 'coin');
});

test('chaos mode picks a built-in pack', () => {
  const r = mapper().resolve({ ...base, soundId: CHAOS_ID }, 'A');
  assert.ok(SOUNDS.some((s) => s.id === r.soundId));
});

test('melody mode climbs keyboard rows', () => {
  assert.ok(melodySemitones('Z') < melodySemitones('A'));
  assert.ok(melodySemitones('A') < melodySemitones('Q'));
  assert.ok(melodySemitones('Q') < melodySemitones('1'));
  const r = mapper().resolve({ ...base, soundId: 'piano', pitchMode: 'melody' }, 'Q');
  assert.ok(r.rate > 0.25 && r.rate < 4);
});

test('song mode plays the song in tune and in order, skipping modifiers', () => {
  const m = mapper();
  const s = { ...base, soundId: 'piano', pitchMode: 'song', songId: 'ode-to-joy' };
  const notes = SONGS.find((x) => x.id === 'ode-to-joy').notes;
  const rates = ['H', 'E', 'L', 'L'].map((k) => m.resolve(s, k).rate);
  rates.forEach((rate, i) => assert.ok(Math.abs(rate - 2 ** ((notes[i] - 60) / 12)) < 1e-9));
  assert.equal(m.resolve(s, 'Shift'), null);
  assert.equal(m.songProgress(s).index, 4);
  m.restartSong();
  assert.equal(m.songProgress(s).index, 0);
});

test('song mode respects a pack base note', () => {
  const m = mapper();
  const r = m.resolve({ ...base, soundId: 'marimba', pitchMode: 'song', songId: 'twinkle' }, 'A');
  assert.ok(Math.abs(r.rate - 2 ** ((60 - 72) / 12)) < 1e-9);
});

test('stereo setting controls panning', () => {
  const m = mapper();
  assert.equal(m.resolve(base, 'Q').pan, 0);
  assert.ok(m.resolve({ ...base, stereo: true }, 'Q').pan < 0);
  assert.equal(m.resolve({ ...base, stereo: true }, 'Mouse1', { pan: 0.5 }).pan, 0.5);
});

test('key release sounds', () => {
  const m = mapper();
  assert.equal(m.resolveRelease(base, 'A'), null);
  assert.equal(m.resolveRelease({ ...base, keyUpSound: 'pack' }, 'A'), null); // dial pad has none
  const pack = m.resolveRelease({ ...base, soundId: 'mechanical', keyUpSound: 'pack' }, 'A');
  assert.equal(pack.slot.type, 'release');
  const other = m.resolveRelease({ ...base, keyUpSound: 'bubble' }, 'A');
  assert.equal(other.soundId, 'bubble');
  assert.ok(other.gain < 1);
});

test('every song is playable on every pitched pack', () => {
  for (const song of SONGS) {
    assert.ok(song.notes.length > 10, song.id);
    for (const sound of SOUNDS.filter((s) => s.pitched)) {
      for (const note of song.notes) {
        const rate = 2 ** ((note - (sound.baseNote ?? 60)) / 12);
        assert.ok(rate >= 0.25 && rate <= 4, `${song.id} on ${sound.id}`);
      }
    }
  }
});
