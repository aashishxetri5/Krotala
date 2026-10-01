/**
 * @file Application entry point: single-instance handling, startup wiring and shutdown.
 */

import path from 'node:path';
import { app, globalShortcut } from 'electron';
import { CHAOS_PACK } from '../shared/catalog.js';
import { APP_ID, APP_NAME, CHAOS_SOUND_ID, Push } from '../shared/constants.js';
import { ContextMonitor } from './app/context-monitor.js';
import { registerIpc } from './app/ipc.js';
import { Notifier } from './app/notifier.js';
import { isPackFile, PackManager } from './app/pack-manager.js';
import { PlaybackController } from './app/playback-controller.js';
import { StatsService } from './app/stats-service.js';
import { Hotkey, IS_WINDOWS, Paths, Timing } from './constants.js';
import { KeyMapper } from './core/keymap.js';
import { DEFAULT_SETTINGS } from './settings/schema.js';
import { SettingsService } from './settings/settings-service.js';
import { initForeground } from './services/foreground.js';
import { InputHook } from './services/input-hook.js';
import { SoundLibrary } from './services/sound-library.js';
import {
  applyLoginItem, ensureAccessibilityPermission, restrictPermissions, wasStartedHidden,
} from './services/system-integration.js';
import { Updater } from './services/updater.js';
import { AudioWindow } from './windows/audio-window.js';
import { DashboardWindow } from './windows/dashboard-window.js';
import { OverlayManager } from './windows/overlay-manager.js';
import { TrayController } from './windows/tray.js';

// The hidden audio window must be able to play without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/**
 * @param {string[]} argv - Process arguments.
 * @returns {string | undefined} A `.kbpack` path passed on the command line.
 */
const findPackArgument = (argv) => argv.slice(1).find(isPackFile);

/**
 * Creates and connects every service, then starts the app.
 * @returns {Promise<{ openPack: (file: string) => Promise<void>, showDashboard: () => void, shutdown: () => void }>}
 *   Handles used by the lifecycle events.
 */
async function startApp() {
  app.setAppUserModelId(APP_ID);
  await initForeground();
  const userData = app.getPath('userData');

  const settings = new SettingsService(path.join(userData, Paths.SETTINGS_FILE));
  settings.set({ customSounds: settings.get().customSounds.map(SoundLibrary.normalizeCustom) });
  const stats = new StatsService(path.join(userData, Paths.STATS_FILE), settings.legacyStats);
  const library = new SoundLibrary({
    builtInDir: path.join(app.getAppPath(), Paths.BUILT_IN_SOUNDS_DIR),
    customDir: path.join(userData, Paths.CUSTOM_SOUNDS_DIR),
  });

  const dashboard = new DashboardWindow({ onHide: () => showTrayHintOnce() });
  const packs = new PackManager({ settings, library, getParentWindow: () => dashboard.parent });
  const current = settings.get().soundId;
  if (current !== CHAOS_SOUND_ID && !packs.exists(current)) settings.set({ soundId: DEFAULT_SETTINGS.soundId });

  const mapper = new KeyMapper(() => packs.list());
  const audio = new AudioWindow();
  const overlay = new OverlayManager();
  const notifier = new Notifier(dashboard);
  const context = new ContextMonitor(settings);
  const playback = new PlaybackController({ settings, mapper, context, stats, audio, overlay, notifier });
  const updater = new Updater((state) => dashboard.send(Push.UPDATES, state));
  const input = new InputHook();

  const showDashboard = () => dashboard.show();
  const toggleEnabled = () => settings.update({ enabled: !settings.get().enabled });
  const tray = new TrayController({
    openDashboard: showDashboard,
    toggleEnabled,
    updateSettings: (patch) => settings.update(patch),
    quit: () => app.quit(),
  });

  const updateTray = () => {
    const s = settings.get();
    const activeId = context.profileSoundId || s.soundId;
    const activeSoundName = activeId === CHAOS_SOUND_ID ? CHAOS_PACK.name : packs.list().find((p) => p.id === activeId)?.name ?? '';
    tray.update({ settings: s, sounds: packs.list(), muteReason: context.muteReason, activeSoundName });
  };

  function showTrayHintOnce() {
    if (settings.get().hasShownTrayHint) return;
    settings.set({ hasShownTrayHint: true });
    const title = `${APP_NAME} is still running`;
    const body = `Sounds keep playing in the background. Use the tray icon to quit, or press ${Hotkey.TOGGLE_MUTE_LABEL} to mute.`;
    if (IS_WINDOWS) tray.balloon(title, body);
    else notifier.system(title, body);
  }

  settings.on('change', (keys) => {
    const s = settings.get();
    audio.send(Push.SETTINGS, s);
    dashboard.send(Push.SETTINGS, s);
    if (keys.includes('launchAtLogin')) applyLoginItem(s.launchAtLogin);
    if (keys.includes('fxEnabled')) overlay.setEnabled(s.fxEnabled);
    if (keys.includes('autoMuteMic')) context.applyMicSetting();
    if (keys.includes('autoUpdate')) updater.configure(s.autoUpdate);
    if (keys.includes('songId')) mapper.restartSong();
    if (keys.includes('soundId') && s.soundId !== CHAOS_SOUND_ID) {
      playback.celebrate(stats.update((t) => t.notePackTried(s.soundId)));
    }
    context.refresh();
    updateTray();
  });
  packs.on('changed', (payload) => {
    audio.send(Push.SOUNDS_CHANGED, payload);
    dashboard.send(Push.SOUNDS_CHANGED, payload);
    updateTray();
  });
  packs.on('created', () => playback.celebrate(stats.update((t) => t.notePackCreated())));
  context.on('change', (state) => {
    dashboard.send(Push.RUNTIME, state);
    updateTray();
  });
  input.on('keydown', (e) => playback.onKeyDown(e));
  input.on('keyup', (e) => playback.onKeyUp(e));
  input.on('mousedown', (e) => playback.onMouseDown(e));

  const statsTimer = setInterval(() => {
    if (dashboard.isVisible()) dashboard.send(Push.STATS, stats.snapshot());
  }, Timing.STATS_PUSH_INTERVAL_MS);

  registerIpc({ settings, packs, stats, context, mapper, playback, updater, notifier });
  restrictPermissions(() => dashboard.webContents);
  audio.create();
  updateTray();
  ensureAccessibilityPermission();
  input.start();
  globalShortcut.register(Hotkey.TOGGLE_MUTE, toggleEnabled);

  const s = settings.get();
  if (s.launchAtLogin) applyLoginItem(true);
  overlay.setEnabled(s.fxEnabled);
  context.start();
  updater.configure(s.autoUpdate);

  /**
   * Imports a pack opened from the file manager and reports the outcome.
   * @param {string} file - Path of the `.kbpack` file.
   * @returns {Promise<void>}
   */
  async function openPack(file) {
    showDashboard();
    try {
      const pack = await packs.importFromPath(file);
      settings.update({ soundId: pack.id });
      notifier.success(`Added “${pack.name}”`, 'It is now your active sound.');
    } catch (err) {
      notifier.error(`Couldn't add ${path.basename(file)}`, err.message);
    }
  }

  return {
    openPack,
    showDashboard,
    shutdown() {
      clearInterval(statsTimer);
      input.stop();
      context.stop();
      overlay.setEnabled(false);
      audio.close();
      dashboard.allowClose();
      settings.flush();
      stats.flush();
    },
  };
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  /** @type {Awaited<ReturnType<typeof startApp>> | null} */
  let instance = null;
  let pendingPack = findPackArgument(process.argv);

  app.on('second-instance', (_event, argv) => {
    const pack = findPackArgument(argv);
    if (pack) instance?.openPack(pack);
    else instance?.showDashboard();
  });

  // macOS delivers double-clicked files here, possibly before the app is ready.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (instance) instance.openPack(file);
    else pendingPack = file;
  });

  app.whenReady().then(async () => {
    instance = await startApp();
    if (pendingPack) instance.openPack(pendingPack);
    else if (!wasStartedHidden()) instance.showDashboard();
    else app.dock?.hide();
  });

  // Keep running in the tray when every window is closed.
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => instance?.shutdown());
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
