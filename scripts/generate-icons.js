/**
 * @file Renders the app icon to build/icon.png, which electron-builder converts to
 * .ico and .icns, and the Microsoft Store tile images to build/appx/. Run as part of
 * `npm run assets`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIcon } from '../src/shared/icon-draw.js';

const ICON_SIZE = 1024;
const BUILD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
const STORE_TILE_DIR = path.join(BUILD_DIR, 'appx');

/** Store tile images as [name, height, width] at 100% scale. */
const STORE_TILES = [
  ['StoreLogo', 50, 50],
  ['Square44x44Logo', 44, 44],
  ['Square150x150Logo', 150, 150],
  ['Wide310x150Logo', 150, 310],
];
/** Display scales to render tiles for, in percent. */
const STORE_TILE_SCALES = [100, 200];

/**
 * @param {string} file - Output path.
 * @param {Buffer} png - PNG file contents.
 * @returns {void}
 */
function write(file, png) {
  fs.writeFileSync(file, png);
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

fs.mkdirSync(STORE_TILE_DIR, { recursive: true });
write(path.join(BUILD_DIR, 'icon.png'), drawIcon(ICON_SIZE));
for (const [name, height, width] of STORE_TILES) {
  for (const scale of STORE_TILE_SCALES) {
    const size = (height * scale) / 100;
    write(path.join(STORE_TILE_DIR, `${name}.scale-${scale}.png`), drawIcon(size, { width: (width * scale) / 100 }));
  }
}
