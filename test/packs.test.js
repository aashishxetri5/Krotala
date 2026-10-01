const test = require('node:test');
const assert = require('node:assert/strict');
const { encodePack, decodePack, cleanText } = require('../src/main/packs');
const { parseActiveMicUsers } = require('../src/main/micwatch');

const files = { 'a1.wav': Buffer.from('RIFFaaaa'), 'b2.mp3': Buffer.from('ID3bbbb') };
const entry = { name: 'Cat Sounds', emoji: '🐱', variants: ['a1.wav', 'b2.mp3'], special: { Enter: 'b2.mp3' }, release: [] };

test('pack round-trips through .kbpack', async () => {
  const data = await encodePack(entry, async (f) => files[f]);
  const pack = decodePack(data);
  assert.equal(pack.name, 'Cat Sounds');
  assert.equal(pack.emoji, '🐱');
  assert.equal(pack.variants.length, 2);
  assert.equal(Object.keys(pack.files).length, 2, 'shared files are stored once');
  assert.deepEqual(pack.files[pack.variants[0]], files['a1.wav']);
  assert.equal(pack.special.Enter, pack.variants[1]);
});

const valid = () => ({
  format: 'keyboard-sounds-pack', version: 1, name: 'X', emoji: '🎵',
  variants: ['sound_0.wav'], special: {}, release: [], files: { 'sound_0.wav': Buffer.from('RIFF').toString('base64') },
});
const bytes = (obj) => Buffer.from(JSON.stringify(obj));

test('rejects files that are not packs', () => {
  assert.throws(() => decodePack(Buffer.from('not json')), /not a Keyboard Sounds pack/);
  assert.throws(() => decodePack(bytes({ ...valid(), format: 'other' })), /not a Keyboard Sounds pack/);
  assert.throws(() => decodePack(bytes({ ...valid(), version: 99 })), /newer version/);
});

test('rejects path traversal and non-audio file names', () => {
  for (const name of ['../evil.wav', 'C:\\x.wav', 'run.exe', 'a/b.wav']) {
    const p = valid();
    p.files = { [name]: 'AAAA' };
    p.variants = [name];
    assert.throws(() => decodePack(bytes(p)), /Invalid file/, name);
  }
});

test('rejects dangling references and unknown special keys', () => {
  assert.throws(() => decodePack(bytes({ ...valid(), variants: ['missing.wav'] })), /no playable/);
  assert.throws(() => decodePack(bytes({ ...valid(), special: { F13: 'sound_0.wav' } })), /special key/);
  assert.throws(() => decodePack(bytes({ ...valid(), release: ['missing.wav'] })), /release/);
});

test('cleans names', () => {
  assert.equal(cleanText('  hi\u0007 there  ', 32), 'hi there');
  assert.equal(cleanText('x'.repeat(50), 32).length, 32);
  assert.equal(cleanText(42, 10), '');
  assert.equal(decodePack(bytes({ ...valid(), name: '' })).name, 'Imported pack');
});

test('mic watcher finds apps using the microphone right now', () => {
  const out = [
    'HKEY_CURRENT_USER\\...\\microphone',
    '    Value    REG_SZ    Allow',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\Zoom',
    '    LastUsedTimeStart    REG_QWORD    0x1dca4785d8ee1e0',
    '    LastUsedTimeStop    REG_QWORD    0x0',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\NonPackaged\\C:#apps#keyboard sounds.exe',
    '    LastUsedTimeStart    REG_QWORD    0x1dca4785d8ee1e0',
    '    LastUsedTimeStop    REG_QWORD    0x0',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\Camera',
    '    LastUsedTimeStart    REG_QWORD    0x1d9ac2c1ed0f5a0',
    '    LastUsedTimeStop    REG_QWORD    0x1d9ac2c26915cee',
  ].join('\r\n');
  assert.deepEqual(parseActiveMicUsers(out, ['C:#apps#Keyboard Sounds.exe']), ['HKEY_CURRENT_USER\\...\\microphone\\Zoom']);
  assert.equal(parseActiveMicUsers(out).length, 2);
});
