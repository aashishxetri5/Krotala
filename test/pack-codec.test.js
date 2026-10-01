import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CUSTOM_ICON } from '../src/shared/constants.js';
import { cleanText, decodePack, encodePack, PackError, PACK_FORMAT } from '../src/main/core/pack-codec.js';

const FILES = { 'a1.wav': Buffer.from('RIFFaaaa'), 'b2.mp3': Buffer.from('ID3bbbb') };
const PACK = { name: 'Cat Sounds', icon: 'cat', variants: ['a1.wav', 'b2.mp3'], special: { Enter: 'b2.mp3' }, release: [] };

const validPack = () => ({
  format: PACK_FORMAT,
  version: 1,
  name: 'X',
  icon: 'music',
  variants: ['sound_0.wav'],
  special: {},
  release: [],
  files: { 'sound_0.wav': Buffer.from('RIFF').toString('base64') },
});
const bytes = (obj) => Buffer.from(JSON.stringify(obj));

test('a pack survives export and import', async () => {
  const decoded = decodePack(await encodePack(PACK, async (f) => FILES[f]));
  assert.equal(decoded.name, 'Cat Sounds');
  assert.equal(decoded.icon, 'cat');
  assert.equal(decoded.variants.length, 2);
  assert.equal(Object.keys(decoded.files).length, 2, 'shared files are stored once');
  assert.deepEqual(decoded.files[decoded.variants[0]], FILES['a1.wav']);
  assert.equal(decoded.special.Enter, decoded.variants[1]);
  assert.equal(decoded.sustain, true);
});

test('the sustain choice travels with a shared pack', async () => {
  const decoded = decodePack(await encodePack({ ...PACK, sustain: false }, async (f) => FILES[f]));
  assert.equal(decoded.sustain, false);
  assert.equal(decodePack(bytes(validPack())).sustain, true, 'packs without the field sustain');
});

test('files that are not packs are rejected', () => {
  assert.throws(() => decodePack(Buffer.from('not json')), PackError);
  assert.throws(() => decodePack(bytes({ ...validPack(), format: 'other' })), /not a Keyboard Sounds pack/);
  assert.throws(() => decodePack(bytes({ ...validPack(), version: 99 })), /newer version/);
});

test('path traversal and non-audio file names are rejected', () => {
  for (const name of ['../evil.wav', 'C:\\x.wav', 'run.exe', 'a/b.wav']) {
    const pack = { ...validPack(), files: { [name]: 'AAAA' }, variants: [name] };
    assert.throws(() => decodePack(bytes(pack)), /invalid file/, name);
  }
});

test('broken references and unsupported keys are rejected', () => {
  assert.throws(() => decodePack(bytes({ ...validPack(), variants: ['missing.wav'] })), /no playable/);
  assert.throws(() => decodePack(bytes({ ...validPack(), special: { F13: 'sound_0.wav' } })), /unsupported key/);
  assert.throws(() => decodePack(bytes({ ...validPack(), release: ['missing.wav'] })), /release/);
});

test('names and icons are sanitized', () => {
  assert.equal(cleanText('  hi\u0007 there  ', 32), 'hi there');
  assert.equal(cleanText('x'.repeat(50), 32).length, 32);
  assert.equal(cleanText(42, 10), '');
  assert.equal(decodePack(bytes({ ...validPack(), name: '' })).name, 'Imported pack');
  assert.equal(decodePack(bytes({ ...validPack(), icon: '<script>' })).icon, DEFAULT_CUSTOM_ICON);
});
