/**
 * @file IPC handlers for the dashboard, audio and overlay windows.
 */

import { app, globalShortcut, ipcMain } from 'electron';
import { Invoke, Send } from '../../shared/constants.js';
import { Hotkey, IS_STORE_BUILD } from '../constants.js';
import { openStartupSettings, requestMicrophoneAccess } from '../services/system-integration.js';
import { appIcon } from '../windows/app-icons.js';

/**
 * Only the app's own pages may call into the main process.
 * @param {Electron.IpcMainEvent | Electron.IpcMainInvokeEvent} event - IPC event.
 * @returns {boolean} True for frames loaded from the app bundle.
 */
const isTrustedSender = (event) => Boolean(event.senderFrame?.url.startsWith('file://'));

/**
 * Registers an invoke handler with sender validation and error logging.
 * @param {string} channel - Invoke channel.
 * @param {(...args: any[]) => unknown} handler - Implementation.
 * @returns {void}
 */
function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender');
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`${channel} failed:`, err);
      throw err;
    }
  });
}

/**
 * Registers a fire-and-forget handler with sender validation.
 * @param {string} channel - Send channel.
 * @param {(payload: any) => void} handler - Implementation.
 * @returns {void}
 */
function on(channel, handler) {
  ipcMain.on(channel, (event, payload) => {
    if (isTrustedSender(event)) handler(payload);
  });
}

/**
 * Registers every IPC handler the windows use.
 * @param {object} deps
 * @param {import('../settings/settings-service.js').SettingsService} deps.settings
 * @param {import('./pack-manager.js').PackManager} deps.packs
 * @param {import('./stats-service.js').StatsService} deps.stats
 * @param {import('./context-monitor.js').ContextMonitor} deps.context
 * @param {import('../core/keymap.js').KeyMapper} deps.mapper
 * @param {import('./playback-controller.js').PlaybackController} deps.playback
 * @param {import('../services/updater.js').Updater} deps.updater
 * @param {import('./notifier.js').Notifier} deps.notifier
 * @returns {void}
 */
export function registerIpc({ settings, packs, stats, context, mapper, playback, updater, notifier }) {
  handle(Invoke.SETTINGS_GET, () => settings.get());
  handle(Invoke.SETTINGS_SET, (patch) => {
    settings.update(patch);
    return settings.get();
  });
  handle(Invoke.SOUNDS_LIST, () => packs.list());
  handle(Invoke.SOUND_DATA, (id) => packs.readSoundData(id));
  handle(Invoke.STATS_GET, () => stats.snapshot());
  handle(Invoke.STATS_RESET, () => {
    stats.reset();
    return stats.snapshot();
  });
  handle(Invoke.RUNTIME_GET, () => context.state());
  handle(Invoke.APP_INFO, () => ({
    version: app.getVersion(),
    platform: process.platform,
    hotkey: Hotkey.TOGGLE_MUTE_LABEL,
    hotkeyRegistered: globalShortcut.isRegistered(Hotkey.TOGGLE_MUTE),
    storeBuild: IS_STORE_BUILD,
    icon: appIcon().toDataURL(),
  }));
  handle(Invoke.SONG_PROGRESS, () => mapper.songProgress(settings.get()));
  handle(Invoke.SONG_RESTART, () => mapper.restartSong());
  handle(Invoke.UPDATES_GET, () => updater.state);
  handle(Invoke.UPDATES_CHECK, () => updater.check({ manual: true }));
  handle(Invoke.UPDATES_INSTALL, () => updater.install());
  handle(Invoke.MIC_REQUEST, () => requestMicrophoneAccess());
  handle(Invoke.STARTUP_SETTINGS_OPEN, () => openStartupSettings());

  handle(Invoke.PACKS_IMPORT, () => packs.importFromDialog());
  handle(Invoke.PACKS_ADD_FILES, (id) => packs.addFilesFromDialog(id));
  handle(Invoke.PACKS_UPDATE, (id, patch) => packs.update(id, patch));
  handle(Invoke.PACKS_REMOVE_VARIANT, (id, index) => packs.removeVariant(id, index));
  handle(Invoke.PACKS_DELETE, (id) => packs.delete(id));
  handle(Invoke.PACKS_EXPORT, (id) => packs.exportWithDialog(id));
  handle(Invoke.PACKS_SAVE_RECORDING, (recording) => packs.saveRecording(recording));
  handle(Invoke.PROFILES_BROWSE, () => packs.browseForApp());

  on(Send.PREVIEW, (request) => playback.preview(request));
  on(Send.SUSTAIN_UNAVAILABLE, ({ voice } = {}) => playback.sustainUnavailable(voice));
  on(Send.AUDIO_ERROR, ({ id, message } = {}) => {
    console.warn(`Could not decode ${id}: ${message}`);
    const name = packs.list().find((s) => s.id === id)?.name ?? 'a sound';
    notifier.error(`Couldn't play ${name}`, 'The file may be damaged or in an unsupported format.');
  });
}
