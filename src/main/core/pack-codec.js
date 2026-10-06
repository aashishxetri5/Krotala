/**
 * @file The `.kbpack` format: one JSON file containing a pack's metadata and its
 * audio as base64. Packs are shared between users, so decoding validates everything.
 */

import {
  APP_NAME, AUDIO_EXTENSIONS, CUSTOM_PACK_ICONS, DEFAULT_CUSTOM_ICON, Limits, PACK_SPECIAL_KEYS,
} from '../../shared/constants.js';
import { formatMegabytes } from '../../shared/names.js';

export const PACK_FORMAT = 'krotala-pack';
const PACK_VERSION = 1;

const FILE_NAME = /^[\w-]{1,48}\.([a-z0-9]{2,5})$/;
const DEFAULT_PACK_NAME = 'Imported pack';

/** Error with a message that can be shown to the user as-is. */
export class PackError extends Error {}

/**
 * @typedef {object} DecodedPack
 * @property {string} name
 * @property {string} icon
 * @property {string} description
 * @property {boolean} sustain
 * @property {Record<string, Buffer>} files - File name inside the pack → bytes.
 * @property {string[]} variants
 * @property {Record<string, string>} special
 * @property {string[]} release
 */

/**
 * @param {string} file - File name.
 * @returns {string} Lower-case extension without the dot.
 */
const extensionOf = (file) => file.slice(file.lastIndexOf('.') + 1).toLowerCase();

/**
 * Removes control characters, trims, and limits length (by code point).
 * @param {unknown} value - Untrusted input.
 * @param {number} maxLength - Maximum length.
 * @returns {string} Clean text, or '' when the input is not a string.
 */
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, maxLength).join('');
}

/**
 * @param {unknown} icon - Untrusted icon name.
 * @returns {string} The icon if it is an allowed pack icon, else the default.
 */
export function cleanIcon(icon) {
  return CUSTOM_PACK_ICONS.includes(/** @type {string} */ (icon)) ? /** @type {string} */ (icon) : DEFAULT_CUSTOM_ICON;
}

/**
 * Serializes a user pack.
 * @param {import('../../shared/types.js').SoundPack} pack - Pack to export.
 * @param {(file: string) => Promise<Buffer>} readFile - Reads one of the pack's stored files.
 * @returns {Promise<Buffer>} The `.kbpack` contents.
 */
export async function encodePack(pack, readFile) {
  /** @type {Map<string, string>} */
  const names = new Map();
  /** @type {Record<string, string>} */
  const files = {};
  const reference = async (file) => {
    if (!names.has(file)) {
      const name = `sound_${names.size}.${extensionOf(file)}`;
      names.set(file, name);
      files[name] = (await readFile(file)).toString('base64');
    }
    return names.get(file);
  };

  const variants = [];
  for (const file of pack.variants) variants.push(await reference(file));
  const special = {};
  for (const [key, file] of Object.entries(pack.special || {})) special[key] = await reference(file);
  const release = [];
  for (const file of pack.release || []) release.push(await reference(file));

  return Buffer.from(JSON.stringify({
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: pack.name,
    icon: pack.icon,
    description: pack.description || '',
    sustain: pack.sustain !== false,
    variants,
    special,
    release,
    files,
  }));
}

/**
 * Parses and validates a `.kbpack` file.
 * @param {Buffer} buffer - File contents.
 * @returns {DecodedPack} The validated pack.
 * @throws {PackError} When the file is not a valid pack.
 */
export function decodePack(buffer) {
  if (buffer.length > Limits.MAX_PACK_BYTES) throw new PackError(`The pack is larger than ${formatMegabytes(Limits.MAX_PACK_BYTES)}.`);
  let pack;
  try {
    pack = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new PackError(`This file is not a ${APP_NAME} pack.`);
  }
  if (!pack || pack.format !== PACK_FORMAT) throw new PackError(`This file is not a ${APP_NAME} pack.`);
  if (pack.version > PACK_VERSION) throw new PackError(`This pack needs a newer version of ${APP_NAME}.`);

  const entries = Object.entries(pack.files || {});
  if (!entries.length || entries.length > Limits.MAX_PACK_FILES) throw new PackError('The pack has no sounds, or too many.');
  /** @type {Record<string, Buffer>} */
  const files = {};
  for (const [name, data] of entries) {
    const match = FILE_NAME.exec(name);
    if (!match || !AUDIO_EXTENSIONS.includes(match[1]) || typeof data !== 'string') {
      throw new PackError(`The pack contains an invalid file (${name}).`);
    }
    files[name] = Buffer.from(data, 'base64');
  }

  const isReference = (n) => typeof n === 'string' && Object.hasOwn(files, n);
  const variants = Array.isArray(pack.variants) ? pack.variants : [];
  const release = Array.isArray(pack.release) ? pack.release : [];
  const special = pack.special && typeof pack.special === 'object' ? pack.special : {};
  if (!variants.length || !variants.every(isReference)) throw new PackError('The pack has no playable sounds.');
  if (!release.every(isReference)) throw new PackError('The pack has a broken key-release sound.');
  for (const [key, name] of Object.entries(special)) {
    if (!PACK_SPECIAL_KEYS.includes(key) || !isReference(name)) throw new PackError(`The pack maps an unsupported key (${key}).`);
  }

  return {
    name: cleanText(pack.name, Limits.PACK_NAME_LENGTH) || DEFAULT_PACK_NAME,
    icon: cleanIcon(pack.icon),
    description: cleanText(pack.description, Limits.PACK_DESCRIPTION_LENGTH),
    sustain: pack.sustain !== false,
    files,
    variants,
    special,
    release,
  };
}
