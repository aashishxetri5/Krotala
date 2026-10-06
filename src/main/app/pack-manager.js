/**
 * @file User pack management: import, record, edit, share and delete. Keeps
 * settings consistent when a pack disappears.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { app, dialog } from 'electron';
import {
  APP_NAME, AUDIO_EXTENSIONS, CUSTOM_PACK_ICONS, DEFAULT_RECORDING_NAME, Limits, PACK_EXTENSION,
} from '../../shared/constants.js';
import { DEFAULT_SETTINGS } from '../settings/schema.js';
import { cleanText } from '../core/pack-codec.js';
import { IS_WINDOWS } from '../constants.js';

/** @typedef {import('../../shared/types.js').SoundPack} SoundPack */

const RECORDING_ICON = 'mic';
const EXPORT_FALLBACK_NAME = 'sound-pack';

/**
 * @param {string} file - File path.
 * @returns {boolean} True for `.kbpack` files.
 */
export const isPackFile = (file) => file.toLowerCase().endsWith(`.${PACK_EXTENSION}`);

/**
 * Emits `changed` with `{ ids }` (packs whose samples changed) and `created` with the new pack.
 */
export class PackManager extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('../settings/settings-service.js').SettingsService} deps.settings
   * @param {import('../services/sound-library.js').SoundLibrary} deps.library
   * @param {() => Electron.BrowserWindow | undefined} deps.getParentWindow - Parent for file dialogs.
   */
  constructor({ settings, library, getParentWindow }) {
    super();
    this.settings = settings;
    this.library = library;
    this.getParentWindow = getParentWindow;
    /** @type {SoundPack[] | null} */
    this.cache = null;
    settings.on('change', (keys) => {
      if (keys.includes('customSounds')) this.cache = null;
    });
  }

  /** @returns {SoundPack[]} Every available pack. */
  list() {
    this.cache ??= this.library.list(this.settings.get().customSounds);
    return this.cache;
  }

  /**
   * @param {string} id - Pack id.
   * @returns {boolean} True if the pack exists.
   */
  exists(id) {
    return this.list().some((s) => s.id === id);
  }

  /**
   * @param {string} id - Pack id.
   * @returns {Promise<import('../services/sound-library.js').SoundData>} Sample bytes.
   */
  readSoundData(id) {
    return this.library.readSoundData(this.settings.get().customSounds, id);
  }

  /**
   * Asks for audio files and/or `.kbpack` files and imports them.
   * @returns {Promise<{ added: SoundPack[], skipped: string[] } | null>} Result, or null when cancelled.
   */
  async importFromDialog() {
    const result = await dialog.showOpenDialog(this.getParentWindow(), {
      title: 'Add your own sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Sounds and sound packs', extensions: [...AUDIO_EXTENSIONS, PACK_EXTENSION] },
        { name: `${APP_NAME} pack`, extensions: [PACK_EXTENSION] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;

    const added = [];
    const skipped = [];
    for (const file of result.filePaths.filter(isPackFile)) {
      try {
        added.push(this.add(await this.library.importPackFile(file)));
      } catch (err) {
        skipped.push(`${path.basename(file)} (${err.message})`);
      }
    }
    const audioFiles = result.filePaths.filter((f) => !isPackFile(f));
    if (audioFiles.length) {
      const imported = await this.library.importAudioFiles(audioFiles);
      if (imported.pack) added.push(this.add(imported.pack));
      skipped.push(...imported.skipped);
    }
    return { added, skipped };
  }

  /**
   * Imports a `.kbpack` file opened from the file manager.
   * @param {string} file - Pack path.
   * @returns {Promise<SoundPack>} The imported pack.
   */
  async importFromPath(file) {
    return this.add(await this.library.importPackFile(file));
  }

  /**
   * Asks for audio files and adds them to a pack.
   * @param {string} id - Pack id.
   * @returns {Promise<{ pack: SoundPack, skipped: string[] } | null>} Result, or null when cancelled.
   */
  async addFilesFromDialog(id) {
    const pack = this.findCustom(id);
    if (!pack) return null;
    const result = await dialog.showOpenDialog(this.getParentWindow(), {
      title: `Add sounds to “${pack.name}”`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: [...AUDIO_EXTENSIONS] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const { pack: updated, skipped } = await this.library.addFilesToPack(pack, result.filePaths);
    return { pack: this.replace(updated), skipped };
  }

  /**
   * Renames a pack, changes its icon, or turns sustain on or off.
   * @param {string} id - Pack id.
   * @param {{ name?: string, icon?: string, sustain?: boolean }} patch - Untrusted changes.
   * @returns {SoundPack | null} Updated pack, or null when not found.
   */
  update(id, patch) {
    const pack = this.findCustom(id);
    if (!pack || !patch) return null;
    return this.replace({
      ...pack,
      name: cleanText(patch.name, Limits.PACK_NAME_LENGTH) || pack.name,
      icon: CUSTOM_PACK_ICONS.includes(patch.icon) ? patch.icon : pack.icon,
      sustain: typeof patch.sustain === 'boolean' ? patch.sustain : pack.sustain,
    }, { samplesChanged: false });
  }

  /**
   * Removes one sample from a pack; a pack always keeps at least one.
   * @param {string} id - Pack id.
   * @param {number} index - Variant index.
   * @returns {Promise<SoundPack | null>} Updated pack, or null when not allowed.
   */
  async removeVariant(id, index) {
    const pack = this.findCustom(id);
    if (!pack || pack.variants.length <= 1 || !Number.isInteger(index) || !pack.variants[index]) return null;
    const file = pack.variants[index];
    const updated = this.replace({ ...pack, variants: pack.variants.filter((_, i) => i !== index) });
    if (!this.library.filesOf(updated).includes(file)) await this.library.deleteFiles([file]);
    return updated;
  }

  /**
   * Deletes a pack and every setting that referred to it.
   * @param {string} id - Pack id.
   * @returns {Promise<boolean>} True when deleted.
   */
  async delete(id) {
    const pack = this.findCustom(id);
    if (!pack) return false;
    const s = this.settings.get();
    const clear = (value) => (value === id ? '' : value);
    this.settings.set({
      soundId: s.soundId === id ? DEFAULT_SETTINGS.soundId : s.soundId,
      keyUpSound: clear(s.keyUpSound),
      overrides: Object.fromEntries(Object.entries(s.overrides).map(([key, value]) => [key, clear(value)])),
      profiles: s.profiles.filter((p) => p.soundId !== id),
    });
    this.save(s.customSounds.filter((p) => p.id !== id), [id]);
    await this.library.deleteFiles(this.library.filesOf(pack));
    return true;
  }

  /**
   * Asks where to save and writes a `.kbpack` file.
   * @param {string} id - Pack id.
   * @returns {Promise<string | null>} Saved path, or null when cancelled.
   */
  async exportWithDialog(id) {
    const pack = this.findCustom(id);
    if (!pack) return null;
    const safeName = pack.name.replace(/[^\w -]+/g, '').trim() || EXPORT_FALLBACK_NAME;
    const result = await dialog.showSaveDialog(this.getParentWindow(), {
      title: 'Share sound pack',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.${PACK_EXTENSION}`),
      filters: [{ name: `${APP_NAME} pack`, extensions: [PACK_EXTENSION] }],
    });
    if (result.canceled || !result.filePath) return null;
    await this.library.exportPack(pack, result.filePath);
    return result.filePath;
  }

  /**
   * Saves a recording as a new pack or as an extra sample of an existing pack.
   * @param {{ bytes: Uint8Array, name?: string, packId?: string | null }} recording - WAV data and target.
   * @returns {Promise<SoundPack>} The new or updated pack.
   */
  async saveRecording({ bytes, name, packId } = {}) {
    const file = await this.library.storeRecording(bytes);
    const existing = packId ? this.findCustom(packId) : undefined;
    if (existing) return this.replace({ ...existing, variants: [...existing.variants, file] });
    return this.add(this.library.createPack({
      name: cleanText(name, Limits.PACK_NAME_LENGTH) || DEFAULT_RECORDING_NAME,
      icon: RECORDING_ICON,
      variants: [file],
    }));
  }

  /**
   * Asks for an application to create a profile for.
   * @returns {Promise<string | null>} Executable name, or null when cancelled.
   */
  async browseForApp() {
    const result = await dialog.showOpenDialog(this.getParentWindow(), {
      title: 'Choose an app',
      properties: ['openFile'],
      filters: IS_WINDOWS ? [{ name: 'Programs', extensions: ['exe'] }] : [],
    });
    return result.canceled ? null : path.basename(result.filePaths[0]);
  }

  /**
   * @param {string} id - Pack id.
   * @returns {SoundPack | undefined} The user pack with that id.
   */
  findCustom(id) {
    return this.settings.get().customSounds.find((p) => p.id === id);
  }

  /**
   * @param {SoundPack} pack - New pack.
   * @returns {SoundPack} The same pack, now saved.
   */
  add(pack) {
    this.save([...this.settings.get().customSounds, pack], []);
    this.emit('created', pack);
    return pack;
  }

  /**
   * @param {SoundPack} pack - Updated pack.
   * @param {object} [options]
   * @param {boolean} [options.samplesChanged=true] - Whether the audio engine must reload it.
   * @returns {SoundPack} The same pack, now saved.
   */
  replace(pack, { samplesChanged = true } = {}) {
    this.save(this.settings.get().customSounds.map((p) => (p.id === pack.id ? pack : p)), samplesChanged ? [pack.id] : []);
    return pack;
  }

  /**
   * @param {SoundPack[]} customSounds - New list of user packs.
   * @param {string[]} changedIds - Packs whose samples changed.
   * @returns {void}
   */
  save(customSounds, changedIds) {
    this.settings.set({ customSounds });
    this.emit('changed', { ids: changedIds });
  }
}
