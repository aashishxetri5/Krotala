import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PACK_FORMAT } from '../src/main/core/pack-codec.js';
import { SoundLibrary } from '../src/main/services/sound-library.js';

/**
 * @returns {Promise<{ library: SoundLibrary, dir: string, customDir: string }>} A library in a temp folder.
 */
async function tempLibrary() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krotala-test-'));
  const customDir = path.join(dir, 'custom');
  return { library: new SoundLibrary({ builtInDir: dir, customDir }), dir, customDir };
}

const pack = (files, variants) => JSON.stringify({
  format: PACK_FORMAT,
  version: 1,
  name: 'Test',
  icon: 'music',
  variants,
  special: {},
  release: [],
  files: Object.fromEntries(files.map((name) => [name, Buffer.from(`RIFF ${name}`).toString('base64')])),
});

test('importing a pack stores only the files it uses', async () => {
  const { library, dir, customDir } = await tempLibrary();
  const file = path.join(dir, 'test.kbpack');
  await fs.writeFile(file, pack(['sound_0.wav', 'unused_1.wav', 'unused_2.wav'], ['sound_0.wav']));
  const imported = await library.importPackFile(file);
  assert.equal(imported.variants.length, 1);
  assert.deepEqual(await fs.readdir(customDir), imported.variants);
  await fs.rm(dir, { recursive: true, force: true });
});

test('deleting a pack removes every file it stored', async () => {
  const { library, dir, customDir } = await tempLibrary();
  const file = path.join(dir, 'test.kbpack');
  await fs.writeFile(file, pack(['a.wav', 'b.wav'], ['a.wav', 'b.wav']));
  const imported = await library.importPackFile(file);
  await library.deleteFiles(library.filesOf(imported));
  assert.deepEqual(await fs.readdir(customDir), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('stored file names cannot escape the custom sounds folder', async () => {
  const { library, customDir } = await tempLibrary();
  assert.equal(library.customPath('../../evil.wav'), path.join(customDir, 'evil.wav'));
});
