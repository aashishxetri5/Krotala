// Sound library: built-in packs plus user packs (imported files, recordings, .kbpack files).
//
// A custom pack entry (stored in settings.customSounds) looks like:
//   { id: 'custom:ab12cd34', name, emoji, description, variants: [file], special: { Enter: file }, release: [file] }
// where every file lives in <userData>/custom-sounds/.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { BUILT_IN_SOUNDS, SYSTEM_SOUNDS } = require('../shared/catalog');
const { encodePack, decodePack, cleanText, AUDIO_EXTENSIONS } = require('./packs');

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const builtInDir = () => path.join(app.getAppPath(), 'assets', 'sounds');
const customDir = () => path.join(app.getPath('userData'), 'custom-sounds');
const customPath = (file) => path.join(customDir(), path.basename(file));
const randomId = () => crypto.randomBytes(4).toString('hex');

// Older versions stored a single `file`; upgrade to the pack shape.
function normalizeCustom(entry) {
  const { file, ...rest } = entry;
  return {
    emoji: '🎵',
    description: '',
    special: {},
    release: [],
    ...rest,
    variants: rest.variants?.length ? rest.variants : [file].filter(Boolean),
  };
}

function listSounds(settings) {
  return [
    ...BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true })),
    ...settings.customSounds.map((c) => ({
      ...c,
      category: 'Custom',
      description: c.description || `${c.variants.length} sound${c.variants.length === 1 ? '' : 's'} by you`,
      custom: true,
    })),
  ];
}

function exists(settings, id) {
  return listSounds(settings).some((s) => s.id === id);
}

// Raw file bytes for a sound; the audio window decodes them.
async function readSoundData(settings, id) {
  if (id.startsWith('ui:')) {
    const file = SYSTEM_SOUNDS[id.slice(3)];
    if (!file) throw new Error(`Unknown UI sound: ${id}`);
    return { variants: [await fs.promises.readFile(path.join(builtInDir(), file))], special: {}, release: [] };
  }
  const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === id);
  const custom = settings.customSounds.find((c) => c.id === id);
  const entry = builtIn || custom;
  if (!entry) throw new Error(`Unknown sound: ${id}`);

  const read = (f) => fs.promises.readFile(builtIn ? path.join(builtInDir(), f) : customPath(f));
  const special = {};
  for (const [key, file] of Object.entries(entry.special || {})) special[key] = await read(file);
  return {
    variants: await Promise.all(entry.variants.map(read)),
    special,
    release: await Promise.all((entry.release || []).map(read)),
  };
}

async function storeBytes(bytes, ext) {
  await fs.promises.mkdir(customDir(), { recursive: true });
  const file = `${randomId()}.${ext}`;
  await fs.promises.writeFile(customPath(file), bytes);
  return file;
}

// Copies audio files into the library. Returns { files, skipped }.
async function copyAudioFiles(filePaths) {
  const files = [];
  const skipped = [];
  for (const src of filePaths) {
    const ext = path.extname(src).slice(1).toLowerCase();
    const stat = await fs.promises.stat(src).catch(() => null);
    if (!stat || !AUDIO_EXTENSIONS.includes(ext)) { skipped.push(`${path.basename(src)} (unsupported)`); continue; }
    if (stat.size > MAX_IMPORT_BYTES) { skipped.push(`${path.basename(src)} (over 10 MB)`); continue; }
    files.push(await storeBytes(await fs.promises.readFile(src), ext));
  }
  return { files, skipped };
}

function newPack({ name, emoji = '🎵', description = '', variants, special = {}, release = [] }) {
  return { id: `custom:${randomId()}`, name, emoji, description, variants, special, release };
}

// Several files picked together become one pack (each key gets one of them).
async function importAudioFiles(filePaths) {
  const { files, skipped } = await copyAudioFiles(filePaths);
  if (!files.length) return { pack: null, skipped };
  const first = path.basename(filePaths[0], path.extname(filePaths[0]));
  const name = cleanText(first.replace(/[_-]+/g, ' '), 32) || 'My sounds';
  return { pack: newPack({ name, variants: files }), skipped };
}

async function addFilesToPack(entry, filePaths) {
  const { files, skipped } = await copyAudioFiles(filePaths);
  return { pack: { ...entry, variants: [...entry.variants, ...files] }, skipped };
}

async function importPackFile(filePath) {
  const decoded = decodePack(await fs.promises.readFile(filePath));
  const stored = {};
  for (const [name, bytes] of Object.entries(decoded.files)) {
    stored[name] = await storeBytes(bytes, path.extname(name).slice(1));
  }
  return newPack({
    name: decoded.name,
    emoji: decoded.emoji,
    description: decoded.description,
    variants: decoded.variants.map((n) => stored[n]),
    special: Object.fromEntries(Object.entries(decoded.special).map(([k, n]) => [k, stored[n]])),
    release: decoded.release.map((n) => stored[n]),
  });
}

async function exportPack(entry, destPath) {
  const data = await encodePack(entry, (file) => fs.promises.readFile(customPath(file)));
  await fs.promises.writeFile(destPath, data);
}

// A recording made in the dashboard (16-bit WAV bytes).
async function storeRecording(bytes) {
  const buf = Buffer.from(bytes);
  if (buf.length < 44 || buf.length > 5 * 1024 * 1024 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid recording.');
  }
  return storeBytes(buf, 'wav');
}

function packFiles(entry) {
  return [...entry.variants, ...Object.values(entry.special || {}), ...(entry.release || [])];
}

async function deleteFiles(files) {
  await Promise.all(files.map((f) => fs.promises.rm(customPath(f), { force: true })));
}

module.exports = {
  listSounds,
  exists,
  normalizeCustom,
  readSoundData,
  importAudioFiles,
  addFilesToPack,
  importPackFile,
  exportPack,
  storeRecording,
  newPack,
  packFiles,
  deleteFiles,
  AUDIO_EXTENSIONS,
};
