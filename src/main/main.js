const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, dialog } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { SettingsStore, DEFAULTS } = require('./settings');
const sounds = require('./sounds');
const { trayIcon, appIcon } = require('./icon');
const { CHAOS_ID } = require('../shared/catalog');

const MUTE_HOTKEY = 'CommandOrControl+Alt+M';
const MUTE_HOTKEY_LABEL = 'Ctrl + Alt + M';
const PRELOAD = path.join(__dirname, '..', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');

// Let the hidden audio window play without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// keycode -> readable name ("A", "Enter", "Numpad5"...). First name wins for shared codes.
const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) if (!(code in KEY_NAMES)) KEY_NAMES[code] = name;

let store;
let tray = null;
let audioWin = null;
let dashWin = null;
let quitting = false;

// ---------- Windows ----------

function createAudioWindow() {
  // Invisible window that owns the Web Audio engine; it lives for the whole session.
  audioWin = new BrowserWindow({
    show: false,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  forwardConsole(audioWin, 'audio');
  audioWin.loadFile(path.join(RENDERER, 'audio', 'audio.html'));
  audioWin.webContents.on('render-process-gone', () => {
    if (quitting) return;
    audioWin.destroy();
    createAudioWindow();
  });
}

function showDashboard() {
  if (dashWin && !dashWin.isDestroyed()) {
    if (dashWin.isMinimized()) dashWin.restore();
    dashWin.show();
    dashWin.focus();
    return;
  }
  dashWin = new BrowserWindow({
    width: 1080,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    title: 'Keyboard Sounds',
    icon: appIcon(),
    backgroundColor: '#101018',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true },
  });
  dashWin.removeMenu();
  forwardConsole(dashWin, 'dashboard');
  dashWin.loadFile(path.join(RENDERER, 'dashboard', 'index.html'));
  dashWin.once('ready-to-show', () => dashWin.show());

  // Closing the dashboard just hides it — the app keeps running in the tray.
  dashWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    dashWin.hide();
    if (!store.get().hasShownTrayHint) {
      store.set({ hasShownTrayHint: true });
      tray.displayBalloon({
        iconType: 'info',
        title: 'Keyboard Sounds is still running',
        content: `It keeps playing in the background. Right-click the tray icon to quit, or press ${MUTE_HOTKEY_LABEL} to mute.`,
      });
    }
  });
}

// In development, surface renderer errors in the terminal.
function forwardConsole(win, label) {
  if (app.isPackaged) return;
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'warning' || level === 'error') console.log(`[${label}:${level}] ${message}`);
  });
}

function sendTo(win, channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  sendTo(audioWin, channel, payload);
  sendTo(dashWin, channel, payload);
}

// ---------- Settings ----------

function onSettingsChanged(changedKeys) {
  const s = store.get();
  broadcast('settings', s);
  if (changedKeys.includes('launchAtLogin')) applyLoginItem();
  updateTray();
}

function updateSettings(patch) {
  const changed = store.applyUserPatch(patch);
  if (changed.length) onSettingsChanged(changed);
  return store.get();
}

function applyLoginItem() {
  const openAtLogin = store.get().launchAtLogin;
  // In dev, Electron needs the app folder as its first argument.
  const args = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];
  app.setLoginItemSettings({ openAtLogin, path: process.execPath, args });
}

function toggleEnabled() {
  updateSettings({ enabled: !store.get().enabled });
}

// ---------- Keyboard hook ----------

const pressed = new Set();
let statsPushTimer = null;

function countKeystroke() {
  const s = store.get();
  const day = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const stats = s.stats.day === day
    ? { ...s.stats, total: s.stats.total + 1, today: s.stats.today + 1 }
    : { day, total: s.stats.total + 1, today: 1 };
  store.set({ stats });
  if (!statsPushTimer) {
    statsPushTimer = setTimeout(() => {
      statsPushTimer = null;
      if (dashWin && dashWin.isVisible()) sendTo(dashWin, 'stats', store.get().stats);
    }, 250);
  }
}

function startHook() {
  uIOhook.on('keydown', (e) => {
    const isRepeat = pressed.has(e.keycode);
    pressed.add(e.keycode);
    if (!isRepeat) countKeystroke();
    const s = store.get();
    if (!s.enabled || (isRepeat && !s.playOnRepeat)) return;
    sendTo(audioWin, 'key', { name: KEY_NAMES[e.keycode] || `Key${e.keycode}` });
  });
  uIOhook.on('keyup', (e) => pressed.delete(e.keycode));
  uIOhook.on('mousedown', (e) => {
    const s = store.get();
    if (s.enabled && s.mouseClicks) sendTo(audioWin, 'key', { name: `Mouse${e.button}` });
  });
  uIOhook.start();
}

// ---------- Tray ----------

function soundName(id) {
  if (id === CHAOS_ID) return 'Chaos Mode';
  return sounds.listSounds(store.get()).find((x) => x.id === id)?.name ?? 'Unknown';
}

function updateTray() {
  if (!tray) return;
  const s = store.get();
  tray.setImage(trayIcon(!s.enabled));
  tray.setToolTip(`Keyboard Sounds — ${s.enabled ? soundName(s.soundId) : 'Muted'}`);

  const soundItems = [
    ...sounds.listSounds(s).map((x) => ({
      label: `${x.emoji}  ${x.name}`,
      type: 'radio',
      checked: s.soundId === x.id,
      click: () => updateSettings({ soundId: x.id }),
    })),
    { type: 'separator' },
    { label: '🎲  Chaos Mode', type: 'radio', checked: s.soundId === CHAOS_ID, click: () => updateSettings({ soundId: CHAOS_ID }) },
  ];
  const volumeItems = [0.1, 0.25, 0.5, 0.75, 1].map((v) => ({
    label: `${Math.round(v * 100)}%`,
    type: 'radio',
    checked: Math.abs(s.volume - v) < 0.005,
    click: () => updateSettings({ volume: v }),
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: showDashboard },
    { type: 'separator' },
    { label: `Sounds on   (${MUTE_HOTKEY_LABEL})`, type: 'checkbox', checked: s.enabled, click: toggleEnabled },
    { label: 'Sound', submenu: soundItems },
    { label: `Volume (${Math.round(s.volume * 100)}%)`, submenu: volumeItems },
    { type: 'separator' },
    { label: 'Quit Keyboard Sounds', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon(!store.get().enabled));
  tray.on('click', showDashboard);
  updateTray();
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, patch) => updateSettings(patch));
  ipcMain.handle('sounds:list', () => sounds.listSounds(store.get()));
  ipcMain.handle('sound:data', (_e, id) => sounds.readSoundData(store.get(), id));
  ipcMain.handle('stats:get', () => store.get().stats);
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    hotkey: MUTE_HOTKEY_LABEL,
    hotkeyRegistered: globalShortcut.isRegistered(MUTE_HOTKEY),
  }));

  ipcMain.handle('sounds:import', async () => {
    const result = await dialog.showOpenDialog(dashWin, {
      title: 'Add your own sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: sounds.AUDIO_EXTENSIONS }],
    });
    if (result.canceled || !result.filePaths.length) return { added: [], skipped: [] };
    const { added, skipped } = await sounds.importSounds(result.filePaths);
    if (added.length) {
      store.set({ customSounds: [...store.get().customSounds, ...added] });
      broadcast('sounds:changed');
      updateTray();
    }
    return { added, skipped };
  });

  ipcMain.handle('sounds:remove', async (_e, id) => {
    const s = store.get();
    const entry = s.customSounds.find((c) => c.id === id);
    if (!entry) return false;
    await sounds.deleteCustomFile(entry);
    const overrides = Object.fromEntries(Object.entries(s.overrides).map(([k, v]) => [k, v === id ? '' : v]));
    store.set({
      customSounds: s.customSounds.filter((c) => c.id !== id),
      soundId: s.soundId === id ? DEFAULTS.soundId : s.soundId,
      overrides,
    });
    broadcast('sounds:changed');
    onSettingsChanged(['soundId', 'overrides']);
    return true;
  });

  // Preview requests from the dashboard go to the audio engine.
  ipcMain.on('preview', (_e, id) => sendTo(audioWin, 'preview', id));
  ipcMain.on('audio:error', (_e, err) => sendTo(dashWin, 'toast', {
    kind: 'error',
    message: `Couldn't play "${soundName(err?.id)}" — the file may be corrupt or an unsupported format.`,
  }));
}

// ---------- Lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showDashboard);

  app.whenReady().then(() => {
    app.setAppUserModelId('com.keyboardsounds.app');
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));

    // A removed custom sound shouldn't leave us pointing at nothing.
    const s = store.get();
    if (s.soundId !== CHAOS_ID && !sounds.exists(s, s.soundId)) store.set({ soundId: DEFAULTS.soundId });

    registerIpc();
    createAudioWindow();
    createTray();
    startHook();
    globalShortcut.register(MUTE_HOTKEY, toggleEnabled);
    if (s.launchAtLogin) applyLoginItem();
    if (!process.argv.includes('--hidden')) showDashboard();
  });

  // Stay alive in the tray when every window is closed.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    quitting = true;
    try { uIOhook.stop(); } catch { /* already stopped */ }
    store?.flush();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
