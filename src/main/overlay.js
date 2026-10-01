// On-screen effects: one transparent, click-through, always-on-top window per display.
// Effects are routed to the window of the display that contains the point.

const { BrowserWindow, screen } = require('electron');

class Overlay {
  constructor({ preload, html }) {
    this.preload = preload;
    this.html = html;
    this.windows = new Map(); // display.id -> { win, bounds }
    this.enabled = false;
    this.listening = false;
    this.onDisplaysChanged = () => this.enabled && this.sync();
  }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      if (!this.listening) {
        screen.on('display-added', this.onDisplaysChanged);
        screen.on('display-removed', this.onDisplaysChanged);
        screen.on('display-metrics-changed', this.onDisplaysChanged);
        this.listening = true;
      }
      this.sync();
    } else {
      for (const { win } of this.windows.values()) if (!win.isDestroyed()) win.destroy();
      this.windows.clear();
    }
  }

  destroy() {
    this.setEnabled(false);
  }

  sync() {
    const displays = screen.getAllDisplays();
    const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    for (const [id, entry] of this.windows) {
      const display = displays.find((d) => d.id === id);
      if (!display || !same(display.bounds, entry.bounds) || entry.win.isDestroyed()) {
        if (!entry.win.isDestroyed()) entry.win.destroy();
        this.windows.delete(id);
      }
    }
    for (const display of displays) if (!this.windows.has(display.id)) this.create(display);
  }

  create(display) {
    const { bounds } = display;
    const win = new BrowserWindow({
      ...bounds,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: { preload: this.preload, sandbox: true, contextIsolation: true, backgroundThrottling: false },
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.setBounds(bounds);
      win.showInactive();
    });
    win.loadFile(this.html);
    this.windows.set(display.id, { win, bounds });
  }

  send(point, channel, payload) {
    if (!this.enabled) return;
    const display = screen.getDisplayNearestPoint(point);
    const entry = this.windows.get(display.id);
    if (!entry || entry.win.isDestroyed() || entry.win.webContents.isLoading()) return;
    entry.win.webContents.send(channel, {
      ...payload,
      x: point.x - display.bounds.x,
      y: point.y - display.bounds.y,
    });
  }

  effect(point, payload) {
    this.send(point, 'fx', payload);
  }

  // Banners and the combo counter appear on the display the mouse is on.
  banner(payload) {
    this.send(screen.getCursorScreenPoint(), 'banner', payload);
  }

  combo(count) {
    this.send(screen.getCursorScreenPoint(), 'combo', { count });
  }
}

module.exports = { Overlay };
