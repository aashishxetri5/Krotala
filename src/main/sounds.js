// Sound library: built-in packs plus user-imported files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { BUILT_IN_SOUNDS } = require('../shared/catalog');

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm'];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const builtInDir = () => path.join(app.getAppPath(), 'assets', 'sounds');
const customDir = () => path.join(app.getPath('userData'), 'custom-sounds');

function listSounds(settings) {
  return [
    ...BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true })),
    ...settings.customSounds.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: '🎵',
      category: 'Custom',
      description: 'Your own sound',
      variants: [c.file],
      custom: true,
    })),
  ];
}

function exists(settings, id) {
  return listSounds(settings).some((s) => s.id === id);
}

// Raw file bytes for every variant of a sound; the audio window decodes them.
async function readSoundData(settings, id) {
  const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === id);
  if (builtIn) {
    const read = (f) => fs.promises.readFile(path.join(builtInDir(), f));
    const special = {};
    for (const [key, file] of Object.entries(builtIn.special || {})) special[key] = await read(file);
    return { variants: await Promise.all(builtIn.variants.map(read)), special };
  }
  const custom = settings.customSounds.find((c) => c.id === id);
  if (custom) {
    return { variants: [await fs.promises.readFile(path.join(customDir(), custom.file))], special: {} };
  }
  throw new Error(`Unknown sound: ${id}`);
}

// Copies the chosen files into the app's data folder. Returns { added, skipped }.
async function importSounds(filePaths) {
  await fs.promises.mkdir(customDir(), { recursive: true });
  const added = [];
  const skipped = [];
  for (const src of filePaths) {
    const ext = path.extname(src).slice(1).toLowerCase();
    const stat = await fs.promises.stat(src).catch(() => null);
    if (!stat || !AUDIO_EXTENSIONS.includes(ext)) { skipped.push(`${path.basename(src)} (unsupported)`); continue; }
    if (stat.size > MAX_IMPORT_BYTES) { skipped.push(`${path.basename(src)} (over 10 MB)`); continue; }
    const hex = crypto.randomBytes(4).toString('hex');
    const file = `${hex}.${ext}`;
    await fs.promises.copyFile(src, path.join(customDir(), file));
    const name = path.basename(src, path.extname(src)).replace(/[_-]+/g, ' ').trim().slice(0, 32) || 'My sound';
    added.push({ id: `custom:${hex}`, name, file });
  }
  return { added, skipped };
}

async function deleteCustomFile(entry) {
  await fs.promises.rm(path.join(customDir(), entry.file), { force: true });
}

module.exports = { listSounds, exists, readSoundData, importSounds, deleteCustomFile, AUDIO_EXTENSIONS };
