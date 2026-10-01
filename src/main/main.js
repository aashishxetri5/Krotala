const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, dialog, screen, session, systemPreferences, Notification,
} = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { SettingsStore, DEFAULTS, writeJsonAtomic, readJson } = require('./settings');
const { StatsTracker } = require('./stats');
const { KeyMapper, isPrintable } = require('./keymap');
const { SONGS } = require('./songs');
const { Overlay } = require('./overlay');
const { Updater } = require('./updater');
const { MicWatcher } = require('./micwatch');
const foreground = require('./foreground');
const sounds = require('./sounds');
const { cleanText } = require('./packs');
const { trayIcon, appIcon } = require('./icon');
const { CHAOS_ID } = require('../shared/catalog');

const MUTE_HOTKEY = 'CommandOrControl+Alt+M';
const MUTE_HOTKEY_LABEL = process.platform === 'darwin' ? '⌘ + ⌥ + M' : 'Ctrl + Alt + M';
const PRELOAD = path.join(__dirname, '..', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const IS_MAC = process.platform === 'darwin';

// Let the hidden audio window play without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// keycode -> readable name ("A", "Enter", "Numpad5"...). First name wins for shared codes.
const KEY_NAMES = {};
for (const [name, code] of Object.entries(UiohookKey)) if (!(code in KEY_NAMES)) KEY_NAMES[code] = name;
const keyName = (code) => KEY_NAMES[code] || `Key${code}`;

let store;
let stats;
let mapper;
let overlay;
let updater;
let micWatcher;
let soundList = [];
let tray = null;
let audioWin = null;
let dashWin = null;
let quitting = false;
let pendingPackPath = null;
const pendingToasts = [];

// What's happening right now (not persisted): foreground app, auto-mute state…
const runtime = {
  app: null,            // e.g. 'Code.exe'
  fullscreen: false,
  micActive: false,
  profileSoundId: '',
  muteReason: null,     // null when sounds play, otherwise a human-readable reason
  recentApps: [],       // most recently focused apps, for the profile picker
};

// ---------- Windows ----------

// In development, surface renderer errors in the terminal.
function forwardConsole(win, label) {
  if (app.isPackaged) return;
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'warning' || level === 'error') console.log(`[${label}:${level}] ${message}`);
  });
}

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
    app.dock?.show();
    return;
  }
  dashWin = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 780,
    minHeight: 580,
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
  dashWin.webContents.on('did-finish-load', () => {
    while (pendingToasts.length) sendTo(dashWin, 'toast', pendingToasts.shift());
  });
  app.dock?.show();

  // Closing the dashboard just hides it — the app keeps running in the tray.
  dashWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    dashWin.hide();
    app.dock?.hide();
    if (!store.get().hasShownTrayHint) {
      store.set({ hasShownTrayHint: true });
      const content = `It keeps playing in the background. Use the tray icon to quit, or press ${MUTE_HOTKEY_LABEL} to mute.`;
      if (process.platform === 'win32') {
        tray.displayBalloon({ iconType: 'info', title: 'Keyboard Sounds is still running', content });
      } else if (Notification.isSupported()) {
        new Notification({ title: 'Keyboard Sounds is still running', body: content }).show();
      }
    }
  });
}

function sendTo(win, channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  sendTo(audioWin, channel, payload);
  sendTo(dashWin, channel, payload);
}

function toast(message, kind = 'info') {
  if (dashWin && !dashWin.isDestroyed() && !dashWin.webContents.isLoading()) sendTo(dashWin, 'toast', { message, kind });
  else pendingToasts.push({ message, kind });
}

const dashboardVisible = () => Boolean(dashWin && !dashWin.isDestroyed() && dashWin.isVisible());

// ---------- Settings ----------

function refreshSoundList() {
  soundList = sounds.listSounds(store.get());
}

function onSettingsChanged(changedKeys) {
  const s = store.get();
  broadcast('settings', s);
  if (changedKeys.includes('launchAtLogin')) applyLoginItem();
  if (changedKeys.includes('fxEnabled')) overlay.setEnabled(s.fxEnabled);
  if (changedKeys.includes('autoMuteMic')) applyMicWatcher();
  if (changedKeys.includes('autoUpdate')) updater.start(s.autoUpdate);
  if (changedKeys.includes('soundId') && s.soundId !== CHAOS_ID) celebrateAll(stats.notePackTried(s.soundId));
  if (changedKeys.includes('songId')) mapper.restartSong();
  refreshRuntime();
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
  app.setLoginItemSettings({ openAtLogin, path: process.execPath, args, openAsHidden: true });
}

function toggleEnabled() {
  updateSettings({ enabled: !store.get().enabled });
}

// ---------- Runtime: per-app profiles & auto-mute ----------

const appLabel = (exe) => (exe ? exe.replace(/\.exe$/i, '') : '');

function refreshRuntime() {
  const s = store.get();
  const profile = runtime.app && s.profiles.find((p) => p.app.toLowerCase() === runtime.app.toLowerCase());
  let muteReason = null;
  if (!s.enabled) muteReason = 'Sounds are off';
  else if (profile?.soundId === 'mute') muteReason = `Muted in ${appLabel(runtime.app)}`;
  else if (s.autoMuteMic && runtime.micActive) muteReason = 'Muted while your microphone is in use';
  else if (s.autoMuteFullscreen && runtime.fullscreen) muteReason = 'Muted in a full-screen app';
  const profileSoundId = profile && profile.soundId !== 'mute' ? profile.soundId : '';

  if (muteReason !== runtime.muteReason || profileSoundId !== runtime.profileSoundId) {
    runtime.muteReason = muteReason;
    runtime.profileSoundId = profileSoundId;
    sendTo(dashWin, 'runtime', publicRuntime());
    updateTray();
  }
}

function publicRuntime() {
  return {
    app: runtime.app,
    appLabel: appLabel(runtime.app),
    muteReason: runtime.muteReason,
    profileSoundId: runtime.profileSoundId,
    micActive: runtime.micActive,
    recentApps: runtime.recentApps,
    features: { appDetection: foreground.isSupported(), micDetection: process.platform === 'win32' },
  };
}

function pollForeground() {
  const fg = foreground.getForegroundApp();
  if (!fg) return;
  const own = fg.pid === process.pid;
  const next = own ? null : fg.exe;
  if (next && !runtime.recentApps.includes(next)) {
    runtime.recentApps = [next, ...runtime.recentApps].slice(0, 12);
    if (dashboardVisible()) sendTo(dashWin, 'runtime', publicRuntime());
  }
  if (next !== runtime.app || fg.fullscreen !== runtime.fullscreen) {
    runtime.app = next;
    runtime.fullscreen = !own && fg.fullscreen;
    refreshRuntime();
    if (dashboardVisible()) sendTo(dashWin, 'runtime', publicRuntime());
  }
}

function applyMicWatcher() {
  if (store.get().autoMuteMic) micWatcher.start();
  else micWatcher.stop();
}

// ---------- Playing sounds & effects ----------

function playKey(name, { pan = null, point = null } = {}) {
  const s = store.get();
  const play = mapper.resolve(s, name, { profileSoundId: runtime.profileSoundId, pan });
  if (!play) return;
  sendTo(audioWin, 'play', play);
  if (play.songNote) stats.noteSongNote();
  if (s.fxEnabled) {
    const melodic = s.pitchMode === 'melody' || s.pitchMode === 'song';
    const style = s.fxStyle === 'auto' ? (melodic ? 'notes' : play.fx) : s.fxStyle;
    overlay.effect(point || effectPoint(s), { style, emoji: play.emoji, size: s.fxSize });
  }
}

function effectPoint(s) {
  const cursor = screen.getCursorScreenPoint();
  if (s.fxPosition === 'random') {
    const { bounds } = screen.getDisplayNearestPoint(cursor);
    return {
      x: bounds.x + bounds.width * (0.1 + Math.random() * 0.8),
      y: bounds.y + bounds.height * (0.2 + Math.random() * 0.6),
    };
  }
  if (s.fxPosition === 'caret') {
    const caret = foreground.getCaretPoint(); // physical pixels
    if (caret) return screen.screenToDipPoint(caret);
  }
  return cursor;
}

// Stereo position of a screen point across all monitors.
function panForPoint(point) {
  const all = screen.getAllDisplays().map((d) => d.bounds);
  const left = Math.min(...all.map((b) => b.x));
  const right = Math.max(...all.map((b) => b.x + b.width));
  return (((point.x - left) / Math.max(1, right - left)) * 2 - 1) * 0.8;
}

const COMBO_PHRASES = {
  25: 'Nice!', 50: 'On fire!', 100: 'Unstoppable!', 200: 'Rampage!', 300: 'Godlike!', 500: 'Legendary!', 1000: 'Are you even human?!',
};

function celebrateCombo(count) {
  const s = store.get();
  sendTo(audioWin, 'play', { soundId: 'ui:combo', slot: { type: 'variant', index: 0 }, rate: 1, pan: 0, gain: 1 });
  if (s.announcer) sendTo(audioWin, 'announce', { text: `Combo ${count}!` });
  overlay.banner({ title: `COMBO ×${count}`, sub: COMBO_PHRASES[count] });
}

function celebrateAll(achievements) {
  for (const a of achievements) {
    if (!runtime.muteReason) {
      sendTo(audioWin, 'play', { soundId: 'ui:achievement', slot: { type: 'variant', index: 0 }, rate: 1, pan: 0, gain: 1 });
    }
    if (store.get().fxEnabled) {
      overlay.banner({ kind: 'achievement', title: `${a.emoji} ${a.name}`, sub: 'Achievement unlocked' });
    } else if (Notification.isSupported()) {
      new Notification({ title: `${a.emoji} Achievement unlocked: ${a.name}`, body: a.description, silent: true }).show();
    }
    toast(`${a.emoji} Achievement unlocked: ${a.name}`);
  }
  if (achievements.length) saveStatsSoon();
}

// ---------- Stats ----------

let statsSaveTimer = null;
const statsFile = () => path.join(app.getPath('userData'), 'stats.json');

function saveStatsSoon() {
  if (statsSaveTimer) return;
  statsSaveTimer = setTimeout(() => {
    statsSaveTimer = null;
    stats.prune();
    writeJsonAtomic(statsFile(), stats.data);
  }, 5000);
}

function loadStats() {
  let data = readJson(statsFile());
  if (!data && store.legacyStats) {
    // v1 stored only totals inside settings.json.
    const { total = 0, today = 0, day } = store.legacyStats;
    data = { total, days: day ? { [day]: today } : {} };
  }
  stats = new StatsTracker(data || {});
}

// ---------- Keyboard & mouse hook ----------

const pressed = new Set();

function startHook() {
  uIOhook.on('keydown', (e) => {
    const name = keyName(e.keycode);
    const isRepeat = pressed.has(e.keycode);
    pressed.add(e.keycode);
    const s = store.get();

    if (!isRepeat) {
      const result = stats.record(name, { printable: isPrintable(name) });
      saveStatsSoon();
      if (s.fxEnabled && s.comboEnabled) overlay.combo(result.combo);
      if (result.milestone && s.comboEnabled && !runtime.muteReason) celebrateCombo(result.milestone);
      celebrateAll(result.achievements);
    }
    if (runtime.muteReason || (isRepeat && !s.playOnRepeat)) return;
    playKey(name);
  });

  uIOhook.on('keyup', (e) => {
    pressed.delete(e.keycode);
    const s = store.get();
    if (!s.keyUpSound || runtime.muteReason) return;
    const play = mapper.resolveRelease(s, keyName(e.keycode), { profileSoundId: runtime.profileSoundId });
    if (play) sendTo(audioWin, 'play', play);
  });

  uIOhook.on('mousedown', (e) => {
    const s = store.get();
    if (!s.mouseClicks || runtime.muteReason) return;
    // uiohook reports physical pixels on Windows; Electron works in DIPs.
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: e.x, y: e.y }) : { x: e.x, y: e.y };
    playKey(`Mouse${e.button}`, { pan: panForPoint(point), point });
  });

  uIOhook.start();
}

// macOS only delivers global key events to apps with Accessibility permission.
function ensureMacAccessibility() {
  if (!IS_MAC || systemPreferences.isTrustedAccessibilityClient(false)) return;
  systemPreferences.isTrustedAccessibilityClient(true); // shows the system prompt
  dialog.showMessageBox({
    type: 'info',
    message: 'Allow Keyboard Sounds to hear your keyboard',
    detail: 'Open System Settings → Privacy & Security → Accessibility, enable Keyboard Sounds, then restart the app.',
  });
}

// ---------- Tray ----------

function soundName(id) {
  if (id === CHAOS_ID) return 'Chaos Mode';
  return soundList.find((x) => x.id === id)?.name ?? 'Unknown';
}

function updateTray() {
  if (!tray) return;
  const s = store.get();
  tray.setImage(trayIcon(Boolean(runtime.muteReason)));
  const playing = runtime.profileSoundId || s.soundId;
  tray.setToolTip(`Keyboard Sounds — ${runtime.muteReason || soundName(playing)}`);

  const radio = (label, checked, click) => ({ label, type: 'radio', checked, click });
  const soundItems = [
    ...soundList.map((x) => radio(`${x.emoji}  ${x.name}`, s.soundId === x.id, () => updateSettings({ soundId: x.id }))),
    { type: 'separator' },
    radio('🎲  Chaos Mode', s.soundId === CHAOS_ID, () => updateSettings({ soundId: CHAOS_ID })),
  ];
  const volumeItems = [0.1, 0.25, 0.5, 0.75, 1].map((v) => radio(
    `${Math.round(v * 100)}%`, Math.abs(s.volume - v) < 0.005, () => updateSettings({ volume: v }),
  ));
  const pitchItems = [['off', 'Normal'], ['wobble', 'Wobble'], ['melody', 'Melody'], ['song', 'Song mode']]
    .map(([value, label]) => radio(label, s.pitchMode === value, () => updateSettings({ pitchMode: value })));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: showDashboard },
    { type: 'separator' },
    { label: `Sounds on   (${MUTE_HOTKEY_LABEL})`, type: 'checkbox', checked: s.enabled, click: toggleEnabled },
    ...(runtime.muteReason && s.enabled ? [{ label: runtime.muteReason, enabled: false }] : []),
    { label: 'Sound', submenu: soundItems },
    { label: 'Pitch', submenu: pitchItems },
    { label: `Volume (${Math.round(s.volume * 100)}%)`, submenu: volumeItems },
    { label: 'On-screen effects', type: 'checkbox', checked: s.fxEnabled, click: () => updateSettings({ fxEnabled: !s.fxEnabled }) },
    { type: 'separator' },
    { label: 'Quit Keyboard Sounds', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon(!store.get().enabled));
  if (!IS_MAC) tray.on('click', showDashboard); // on macOS a click opens the menu
  updateTray();
}

// ---------- Custom packs ----------

function saveCustomSounds(list, changedIds = []) {
  store.set({ customSounds: list });
  refreshSoundList();
  broadcast('sounds:changed', { ids: changedIds });
  updateTray();
}

function addPack(pack) {
  saveCustomSounds([...store.get().customSounds, pack]);
  celebrateAll(stats.notePackCreated());
  return pack;
}

function findPack(id) {
  return store.get().customSounds.find((c) => c.id === id);
}

function replacePack(pack) {
  saveCustomSounds(store.get().customSounds.map((c) => (c.id === pack.id ? pack : c)), [pack.id]);
  return pack;
}

async function importPackFromPath(filePath) {
  try {
    const pack = addPack(await sounds.importPackFile(filePath));
    updateSettings({ soundId: pack.id });
    toast(`Imported "${pack.name}" — it's now your active sound.`);
  } catch (err) {
    toast(`Couldn't import ${path.basename(filePath)}: ${err.message}`, 'error');
  }
  showDashboard();
}

const findPackArg = (argv) => argv.find((a) => a.toLowerCase().endsWith('.kbpack') && fs.existsSync(a));

// ---------- IPC ----------

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

  handle('settings:get', () => store.get());
  handle('settings:set', (patch) => updateSettings(patch));
  handle('sounds:list', () => soundList);
  handle('sound:data', (id) => sounds.readSoundData(store.get(), id));
  handle('stats:get', () => stats.snapshot());
  handle('runtime:get', () => publicRuntime());
  handle('songs:list', () => ({
    songs: SONGS.map(({ id, name, composer, notes }) => ({ id, name, composer, length: notes.length })),
    progress: mapper.songProgress(store.get()),
  }));
  handle('song:restart', () => mapper.restartSong());
  handle('updates:get', () => updater.state);
  handle('updates:check', () => updater.check({ manual: true }));
  handle('updates:install', () => updater.install());
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    hotkey: MUTE_HOTKEY_LABEL,
    hotkeyRegistered: globalShortcut.isRegistered(MUTE_HOTKEY),
  }));
  handle('mic:request', async () => (IS_MAC ? systemPreferences.askForMediaAccess('microphone') : true));

  handle('packs:import', async () => {
    const result = await dialog.showOpenDialog(dashWin, {
      title: 'Add your own sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Sounds or sound packs', extensions: [...sounds.AUDIO_EXTENSIONS, 'kbpack'] },
        { name: 'Keyboard Sounds pack', extensions: ['kbpack'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const packFiles = result.filePaths.filter((p) => p.toLowerCase().endsWith('.kbpack'));
    const audioFiles = result.filePaths.filter((p) => !p.toLowerCase().endsWith('.kbpack'));
    const added = [];
    const skipped = [];
    for (const p of packFiles) {
      try {
        added.push(addPack(await sounds.importPackFile(p)));
      } catch (err) {
        skipped.push(`${path.basename(p)} (${err.message})`);
      }
    }
    if (audioFiles.length) {
      const imported = await sounds.importAudioFiles(audioFiles);
      if (imported.pack) added.push(addPack(imported.pack));
      skipped.push(...imported.skipped);
    }
    return { added, skipped };
  });

  handle('packs:addFiles', async (id) => {
    const pack = findPack(id);
    if (!pack) return null;
    const result = await dialog.showOpenDialog(dashWin, {
      title: `Add sounds to "${pack.name}"`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: sounds.AUDIO_EXTENSIONS }],
    });
    if (result.canceled) return null;
    const { pack: updated, skipped } = await sounds.addFilesToPack(pack, result.filePaths);
    return { pack: replacePack(updated), skipped };
  });

  handle('packs:update', (id, patch) => {
    const pack = findPack(id);
    if (!pack || !patch) return null;
    return replacePack({
      ...pack,
      name: cleanText(patch.name, 32) || pack.name,
      emoji: cleanText(patch.emoji, 8) || pack.emoji,
    });
  });

  handle('packs:removeVariant', async (id, index) => {
    const pack = findPack(id);
    if (!pack || pack.variants.length <= 1 || !Number.isInteger(index) || !pack.variants[index]) return null;
    const file = pack.variants[index];
    const updated = replacePack({ ...pack, variants: pack.variants.filter((_, i) => i !== index) });
    if (!sounds.packFiles(updated).includes(file)) await sounds.deleteFiles([file]);
    return updated;
  });

  handle('packs:delete', async (id) => {
    const s = store.get();
    const pack = findPack(id);
    if (!pack) return false;
    await sounds.deleteFiles(sounds.packFiles(pack));
    const clear = (v) => (v === id ? '' : v);
    store.set({
      soundId: s.soundId === id ? DEFAULTS.soundId : s.soundId,
      keyUpSound: clear(s.keyUpSound),
      overrides: Object.fromEntries(Object.entries(s.overrides).map(([k, v]) => [k, clear(v)])),
      profiles: s.profiles.filter((p) => p.soundId !== id),
    });
    saveCustomSounds(s.customSounds.filter((c) => c.id !== id), [id]);
    onSettingsChanged(['soundId', 'overrides', 'keyUpSound', 'profiles']);
    return true;
  });

  handle('packs:export', async (id) => {
    const pack = findPack(id);
    if (!pack) return null;
    const safeName = pack.name.replace(/[^\w -]+/g, '').trim() || 'sound-pack';
    const result = await dialog.showSaveDialog(dashWin, {
      title: 'Share this sound pack',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.kbpack`),
      filters: [{ name: 'Keyboard Sounds pack', extensions: ['kbpack'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await sounds.exportPack(pack, result.filePath);
    return result.filePath;
  });

  handle('packs:saveRecording', async ({ bytes, name, packId } = {}) => {
    const file = await sounds.storeRecording(bytes);
    const existing = packId && findPack(packId);
    if (existing) return replacePack({ ...existing, variants: [...existing.variants, file] });
    const pack = addPack(sounds.newPack({ name: cleanText(name, 32) || 'My recording', emoji: '🎙️', variants: [file] }));
    updateSettings({ soundId: pack.id });
    return pack;
  });

  handle('profiles:browse', async () => {
    const result = await dialog.showOpenDialog(dashWin, {
      title: 'Choose an app',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe'] }] : [],
    });
    return result.canceled ? null : path.basename(result.filePaths[0]);
  });

  // Previews from the dashboard: { id, index? } -> audio engine.
  ipcMain.on('preview', (_e, req) => {
    const play = mapper.preview(req?.id, req?.index ?? null);
    if (play) sendTo(audioWin, 'play', play);
  });
  ipcMain.on('audio:error', (_e, err) => toast(
    `Couldn't play "${soundName(err?.id)}" — the file may be corrupt or an unsupported format.`, 'error',
  ));
}

// Only the dashboard may use the microphone (for recording sounds); deny everything else.
function lockDownPermissions() {
  const allowed = (wc, permission) => permission === 'media' && dashWin && !dashWin.isDestroyed() && wc === dashWin.webContents;
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(allowed(wc, permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed(wc, permission));
}

// ---------- Lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingPackPath = findPackArg(process.argv);

  app.on('second-instance', (_e, argv) => {
    const packPath = findPackArg(argv);
    if (packPath) importPackFromPath(packPath);
    else showDashboard();
  });

  // macOS: double-clicked .kbpack files arrive here (possibly before ready).
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    if (app.isReady() && store) importPackFromPath(filePath);
    else pendingPackPath = filePath;
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.keyboardsounds.app');
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    store.set({ customSounds: store.get().customSounds.map(sounds.normalizeCustom) });
    loadStats();
    refreshSoundList();
    mapper = new KeyMapper(() => soundList);
    overlay = new Overlay({ preload: PRELOAD, html: path.join(RENDERER, 'overlay', 'overlay.html') });
    updater = new Updater((state) => sendTo(dashWin, 'updates', state));
    micWatcher = new MicWatcher({
      ignore: [process.execPath.replace(/\\/g, '#')], // our own recordings don't count
      onChange: (active) => { runtime.micActive = active; refreshRuntime(); },
    });

    // A removed custom sound shouldn't leave us pointing at nothing.
    const s = store.get();
    if (s.soundId !== CHAOS_ID && !sounds.exists(s, s.soundId)) store.set({ soundId: DEFAULTS.soundId });

    lockDownPermissions();
    registerIpc();
    createAudioWindow();
    createTray();
    ensureMacAccessibility();
    startHook();
    globalShortcut.register(MUTE_HOTKEY, toggleEnabled);
    if (s.launchAtLogin) applyLoginItem();
    overlay.setEnabled(s.fxEnabled);
    applyMicWatcher();
    updater.start(s.autoUpdate);
    if (foreground.isSupported()) setInterval(pollForeground, 600);
    setInterval(() => { if (dashboardVisible()) sendTo(dashWin, 'stats', stats.snapshot()); }, 1000);
    refreshRuntime();

    const startHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
    if (pendingPackPath) importPackFromPath(pendingPackPath);
    else if (!startHidden) showDashboard();
    else app.dock?.hide();
  });

  // Stay alive in the tray when every window is closed.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    quitting = true;
    try { uIOhook.stop(); } catch { /* already stopped */ }
    overlay?.destroy();
    micWatcher?.stop();
    store?.flush();
    if (stats) writeJsonAtomic(statsFile(), stats.data);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
