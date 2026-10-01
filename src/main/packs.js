// .kbpack — a shareable sound pack in a single file: JSON with the audio embedded
// as base64. Packs come from strangers on the internet, so decoding validates everything.

const PACK_FORMAT = 'keyboard-sounds-pack';
const PACK_VERSION = 1;
const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm'];
const MAX_PACK_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 64;
const SPECIAL_KEYS = ['Enter', 'Space', 'Backspace', 'Tab'];
const FILE_NAME = /^[\w-]{1,48}\.([a-z0-9]{2,5})$/;

const extOf = (file) => file.slice(file.lastIndexOf('.') + 1).toLowerCase();

// entry: custom pack { name, emoji, description, variants, special, release } whose files
// are read with readFile(file) -> Buffer. Returns the .kbpack contents as a Buffer.
async function encodePack(entry, readFile) {
  const names = new Map(); // stored file -> name inside the pack
  const files = {};
  const ref = async (file) => {
    if (!names.has(file)) {
      const name = `sound_${names.size}.${extOf(file)}`;
      names.set(file, name);
      files[name] = (await readFile(file)).toString('base64');
    }
    return names.get(file);
  };
  const variants = [];
  for (const f of entry.variants) variants.push(await ref(f));
  const special = {};
  for (const [key, f] of Object.entries(entry.special || {})) special[key] = await ref(f);
  const release = [];
  for (const f of entry.release || []) release.push(await ref(f));

  return Buffer.from(JSON.stringify({
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: entry.name,
    emoji: entry.emoji,
    description: entry.description || '',
    variants,
    special,
    release,
    files,
  }));
}

// Returns { name, emoji, description, files: { name: Buffer }, variants, special, release }.
// Throws an Error with a user-facing message if the pack is invalid.
function decodePack(buffer) {
  if (buffer.length > MAX_PACK_BYTES) throw new Error('Pack is larger than 30 MB.');
  let pack;
  try {
    pack = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('This is not a Keyboard Sounds pack.');
  }
  if (!pack || pack.format !== PACK_FORMAT) throw new Error('This is not a Keyboard Sounds pack.');
  if (pack.version > PACK_VERSION) throw new Error('This pack needs a newer version of Keyboard Sounds.');

  const fileEntries = Object.entries(pack.files || {});
  if (!fileEntries.length || fileEntries.length > MAX_FILES) throw new Error('Pack has no sounds (or too many).');
  const files = {};
  for (const [name, data] of fileEntries) {
    const m = FILE_NAME.exec(name);
    if (!m || !AUDIO_EXTENSIONS.includes(m[1]) || typeof data !== 'string') throw new Error(`Invalid file in pack: ${name}`);
    files[name] = Buffer.from(data, 'base64');
  }

  const refOk = (n) => typeof n === 'string' && Object.hasOwn(files, n);
  const variants = Array.isArray(pack.variants) ? pack.variants : [];
  const release = Array.isArray(pack.release) ? pack.release : [];
  const special = pack.special && typeof pack.special === 'object' ? pack.special : {};
  if (!variants.length || !variants.every(refOk)) throw new Error('Pack has no playable sounds.');
  if (!release.every(refOk)) throw new Error('Pack has a broken key-release sound.');
  for (const [key, n] of Object.entries(special)) {
    if (!SPECIAL_KEYS.includes(key) || !refOk(n)) throw new Error(`Pack has an invalid special key: ${key}`);
  }

  return {
    name: cleanText(pack.name, 32) || 'Imported pack',
    emoji: cleanText(pack.emoji, 8) || '🎵',
    description: cleanText(pack.description, 120),
    files,
    variants,
    special,
    release,
  };
}

// Strips control characters and trims to a maximum length.
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, max).join('');
}

module.exports = { encodePack, decodePack, cleanText, AUDIO_EXTENSIONS, SPECIAL_KEYS, PACK_FORMAT };
