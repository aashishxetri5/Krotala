/**
 * @file The sound library: built-in packs plus packs the user imports, records or
 * receives as `.kbpack` files. User audio lives in `<userData>/custom-sounds/`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILT_IN_SOUNDS, SYSTEM_SOUND_FILES } from '../../shared/catalog.js';
import {
  AUDIO_EXTENSIONS, CUSTOM_CATEGORY, DEFAULT_CUSTOM_ICON, Limits, UI_SOUND_PREFIX,
} from '../../shared/constants.js';
import { formatMegabytes } from '../../shared/names.js';
import { WAV_HEADER_BYTES } from '../../shared/wav.js';
import {
  cleanIcon, cleanText, decodePack, encodePack, PackError,
} from '../core/pack-codec.js';

/** @typedef {import('../../shared/types.js').SoundPack} SoundPack */

/**
 * Raw bytes of a pack's samples, decoded by the audio engine.
 * @typedef {object} SoundData
 * @property {Buffer[]} variants
 * @property {Record<string, Buffer>} special
 * @property {Buffer[]} release
 */

const DEFAULT_IMPORT_NAME = 'My sounds';

/**
 * @returns {string} Random 8-character hex id.
 */
const randomHex = () => crypto.randomBytes(4).toString('hex');

/**
 * Describes a pack by its size, for packs without a description.
 * @param {number} count - Number of samples.
 * @returns {string} Description text.
 */
const describeCount = (count) => `${count} sound${count === 1 ? '' : 's'} by you`;

/** Reads and writes the sound files behind built-in and user packs. */
export class SoundLibrary {
  /**
   * @param {object} dirs
   * @param {string} dirs.builtInDir - Folder with the generated built-in samples.
   * @param {string} dirs.customDir - Folder for user samples.
   */
  constructor({ builtInDir, customDir }) {
    this.builtInDir = builtInDir;
    this.customDir = customDir;
  }

  /**
   * Lists every pack available to the user.
   * @param {SoundPack[]} customPacks - User packs from settings.
   * @returns {SoundPack[]} Built-in packs followed by user packs.
   */
  list(customPacks) {
    return [
      ...BUILT_IN_SOUNDS.map((s) => ({ ...s, builtIn: true })),
      ...customPacks.map((p) => ({
        ...p,
        category: CUSTOM_CATEGORY,
        description: p.description || describeCount(p.variants.length),
        custom: true,
      })),
    ];
  }

  /**
   * Upgrades a user pack saved by an earlier version to the current shape.
   * @param {Record<string, any>} entry - Saved pack.
   * @returns {SoundPack} Normalized pack.
   */
  static normalizeCustom(entry) {
    const { file, emoji: _emoji, ...rest } = entry;
    return {
      description: '',
      special: {},
      release: [],
      sustain: true,
      ...rest,
      icon: cleanIcon(rest.icon),
      variants: rest.variants?.length ? rest.variants : [file].filter(Boolean),
    };
  }

  /**
   * Reads the samples of a pack or UI sound.
   * @param {SoundPack[]} customPacks - User packs from settings.
   * @param {string} id - Pack id or UI sound id.
   * @returns {Promise<SoundData>} Sample bytes.
   * @throws {Error} When the id is unknown.
   */
  async readSoundData(customPacks, id) {
    if (id.startsWith(UI_SOUND_PREFIX)) {
      const file = SYSTEM_SOUND_FILES[id];
      if (!file) throw new Error(`Unknown UI sound: ${id}`);
      return { variants: [await fs.readFile(path.join(this.builtInDir, file))], special: {}, release: [] };
    }
    const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === id);
    const pack = builtIn || customPacks.find((p) => p.id === id);
    if (!pack) throw new Error(`Unknown sound: ${id}`);

    const read = (file) => fs.readFile(builtIn ? path.join(this.builtInDir, file) : this.customPath(file));
    const special = {};
    for (const [key, file] of Object.entries(pack.special || {})) special[key] = await read(file);
    return {
      variants: await Promise.all(pack.variants.map(read)),
      special,
      release: await Promise.all((pack.release || []).map(read)),
    };
  }

  /**
   * Creates a pack object (not yet saved to settings).
   * @param {object} fields
   * @param {string} fields.name
   * @param {string} [fields.icon]
   * @param {string} [fields.description]
   * @param {string[]} fields.variants
   * @param {Record<string, string>} [fields.special]
   * @param {string[]} [fields.release]
   * @param {boolean} [fields.sustain] - Keep sounding while a key is held.
   * @returns {SoundPack} New pack with a fresh id.
   */
  createPack({ name, icon = DEFAULT_CUSTOM_ICON, description = '', variants, special = {}, release = [], sustain = true }) {
    return { id: `custom:${randomHex()}`, name, icon, description, category: CUSTOM_CATEGORY, variants, special, release, sustain };
  }

  /**
   * Imports audio files as one new pack; each key will get one of the files.
   * @param {string[]} filePaths - Files chosen by the user.
   * @returns {Promise<{ pack: SoundPack | null, skipped: string[] }>} The pack (null if nothing was usable) and rejected files.
   */
  async importAudioFiles(filePaths) {
    const { files, skipped } = await this.copyAudioFiles(filePaths);
    if (!files.length) return { pack: null, skipped };
    const firstName = path.basename(filePaths[0], path.extname(filePaths[0])).replace(/[_-]+/g, ' ');
    const name = cleanText(firstName, Limits.PACK_NAME_LENGTH) || DEFAULT_IMPORT_NAME;
    return { pack: this.createPack({ name, variants: files }), skipped };
  }

  /**
   * Adds audio files to an existing pack.
   * @param {SoundPack} pack - Pack to extend.
   * @param {string[]} filePaths - Files chosen by the user.
   * @returns {Promise<{ pack: SoundPack, skipped: string[] }>} Updated pack and rejected files.
   */
  async addFilesToPack(pack, filePaths) {
    const { files, skipped } = await this.copyAudioFiles(filePaths);
    return { pack: { ...pack, variants: [...pack.variants, ...files] }, skipped };
  }

  /**
   * Imports a `.kbpack` file.
   * @param {string} filePath - Path of the pack.
   * @returns {Promise<SoundPack>} The imported pack.
   * @throws {import('../core/pack-codec.js').PackError} When the file is invalid.
   */
  async importPackFile(filePath) {
    if ((await fs.stat(filePath)).size > Limits.MAX_PACK_BYTES) {
      throw new PackError(`The pack is larger than ${formatMegabytes(Limits.MAX_PACK_BYTES)}.`);
    }
    const decoded = decodePack(await fs.readFile(filePath));
    // Only files the pack uses are stored; anything else could never be cleaned up.
    const used = new Set([...decoded.variants, ...Object.values(decoded.special), ...decoded.release]);
    const stored = {};
    try {
      for (const name of used) stored[name] = await this.storeBytes(decoded.files[name], path.extname(name).slice(1));
    } catch (err) {
      await this.deleteFiles(Object.values(stored));
      throw err;
    }
    return this.createPack({
      name: decoded.name,
      icon: decoded.icon,
      description: decoded.description,
      sustain: decoded.sustain,
      variants: decoded.variants.map((n) => stored[n]),
      special: Object.fromEntries(Object.entries(decoded.special).map(([key, n]) => [key, stored[n]])),
      release: decoded.release.map((n) => stored[n]),
    });
  }

  /**
   * Writes a pack to a `.kbpack` file.
   * @param {SoundPack} pack - User pack.
   * @param {string} destination - Output path.
   * @returns {Promise<void>}
   */
  async exportPack(pack, destination) {
    await fs.writeFile(destination, await encodePack(pack, (file) => fs.readFile(this.customPath(file))));
  }

  /**
   * Stores a WAV recorded in the dashboard.
   * @param {Uint8Array} bytes - 16-bit PCM WAV file.
   * @returns {Promise<string>} Stored file name.
   * @throws {Error} When the bytes are not a reasonable WAV file.
   */
  async storeRecording(bytes) {
    const buf = Buffer.from(bytes);
    const isWav = buf.length > WAV_HEADER_BYTES
      && buf.toString('ascii', 0, 4) === 'RIFF'
      && buf.toString('ascii', 8, 12) === 'WAVE';
    if (!isWav || buf.length > Limits.MAX_RECORDING_BYTES) throw new Error('Invalid recording.');
    return this.storeBytes(buf, 'wav');
  }

  /**
   * @param {SoundPack} pack - User pack.
   * @returns {string[]} Every stored file the pack references.
   */
  filesOf(pack) {
    return [...pack.variants, ...Object.values(pack.special || {}), ...(pack.release || [])];
  }

  /**
   * Deletes stored files; missing files are ignored.
   * @param {string[]} files - Stored file names.
   * @returns {Promise<void>}
   */
  async deleteFiles(files) {
    await Promise.all(files.map((f) => fs.rm(this.customPath(f), { force: true })));
  }

  /**
   * @param {string} file - Stored file name.
   * @returns {string} Absolute path, confined to the custom sounds folder.
   */
  customPath(file) {
    return path.join(this.customDir, path.basename(file));
  }

  /**
   * Saves bytes under a random name.
   * @param {Buffer} bytes - File contents.
   * @param {string} extension - File extension without the dot.
   * @returns {Promise<string>} Stored file name.
   */
  async storeBytes(bytes, extension) {
    await fs.mkdir(this.customDir, { recursive: true });
    const file = `${randomHex()}.${extension}`;
    await fs.writeFile(this.customPath(file), bytes);
    return file;
  }

  /**
   * Copies supported audio files into the library.
   * @param {string[]} filePaths - Source files.
   * @returns {Promise<{ files: string[], skipped: string[] }>} Stored names and rejected files with reasons.
   */
  async copyAudioFiles(filePaths) {
    const files = [];
    const skipped = [];
    try {
      for (const source of filePaths) {
        const label = path.basename(source);
        const extension = path.extname(source).slice(1).toLowerCase();
        const stat = await fs.stat(source).catch(() => null);
        if (!stat || !AUDIO_EXTENSIONS.includes(extension)) {
          skipped.push(`${label} (unsupported format)`);
        } else if (stat.size > Limits.MAX_IMPORT_BYTES) {
          skipped.push(`${label} (larger than ${formatMegabytes(Limits.MAX_IMPORT_BYTES)})`);
        } else {
          files.push(await this.storeBytes(await fs.readFile(source), extension));
        }
      }
    } catch (err) {
      // Don't leave half an import behind.
      await this.deleteFiles(files);
      throw err;
    }
    return { files, skipped };
  }
}
