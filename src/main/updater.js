// Auto-updates from GitHub Releases via electron-updater. Updates download in the
// background and install when the app quits (or right away via "Restart to update").

const { app } = require('electron');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

class Updater {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = { status: app.isPackaged ? 'idle' : 'dev', version: null, progress: 0, error: null };
    this.autoUpdater = null;
    this.timer = null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  start(enabled) {
    if (!app.isPackaged) return; // dev builds have nothing to update from
    if (!this.autoUpdater) this.init();
    clearInterval(this.timer);
    this.autoUpdater.autoDownload = enabled;
    if (enabled) {
      setTimeout(() => this.check(), 10_000);
      this.timer = setInterval(() => this.check(), CHECK_EVERY_MS);
    }
  }

  init() {
    const { autoUpdater } = require('electron-updater');
    this.autoUpdater = autoUpdater;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    autoUpdater.on('update-available', (info) => this.set({
      status: autoUpdater.autoDownload ? 'downloading' : 'available', version: info.version, progress: 0,
    }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'latest' }));
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version, progress: 100 }));
    autoUpdater.on('error', (err) => this.set({ status: 'error', error: String(err?.message || err).split('\n')[0] }));
  }

  // Scheduled checks respect the auto-update setting; a manual check always downloads.
  check({ manual = false } = {}) {
    if (!this.autoUpdater) return this.state;
    if (manual) this.autoUpdater.autoDownload = true;
    this.autoUpdater.checkForUpdates().catch(() => { /* reported via the 'error' event */ });
    return this.state;
  }

  install() {
    if (this.state.status === 'ready') this.autoUpdater.quitAndInstall();
  }
}

module.exports = { Updater };
