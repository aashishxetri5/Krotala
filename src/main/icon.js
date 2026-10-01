// App and tray icons as Electron images (drawing lives in src/shared/icon-draw.js).
const { nativeImage } = require('electron');
const { drawIcon } = require('../shared/icon-draw');

const cache = new Map();

// Tray icon with crisp representations for 100% / 125% / 150% / 200% display scaling.
function trayIcon(muted = false) {
  const key = `tray:${muted}`;
  if (!cache.has(key)) {
    const img = nativeImage.createEmpty();
    for (const [scaleFactor, px] of [[1, 16], [1.25, 20], [1.5, 24], [2, 32]]) {
      img.addRepresentation({ scaleFactor, buffer: drawIcon(px, muted) });
    }
    cache.set(key, img);
  }
  return cache.get(key);
}

function appIcon() {
  if (!cache.has('app')) cache.set('app', nativeImage.createFromBuffer(drawIcon(256, false)));
  return cache.get('app');
}

module.exports = { trayIcon, appIcon };