/**
 * @file App and tray icons as Electron images.
 */

import { nativeImage } from 'electron';
import { drawIcon } from '../../shared/icon-draw.js';

/** Tray icon pixel sizes for 100%, 125%, 150% and 200% display scaling. */
const TRAY_SCALES = [[1, 16], [1.25, 20], [1.5, 24], [2, 32]];
const APP_ICON_SIZE = 256;

/** @type {Map<string, Electron.NativeImage>} */
const cache = new Map();

/**
 * @param {boolean} [muted=false] - Grey variant shown while sounds are muted.
 * @returns {Electron.NativeImage} Multi-resolution tray icon.
 */
export function trayIcon(muted = false) {
  const key = `tray:${muted}`;
  if (!cache.has(key)) {
    const image = nativeImage.createEmpty();
    for (const [scaleFactor, px] of TRAY_SCALES) image.addRepresentation({ scaleFactor, buffer: drawIcon(px, muted) });
    cache.set(key, image);
  }
  return cache.get(key);
}

/** @returns {Electron.NativeImage} Window and notification icon. */
export function appIcon() {
  if (!cache.has('app')) cache.set('app', nativeImage.createFromBuffer(drawIcon(APP_ICON_SIZE)));
  return cache.get('app');
}
