/**
 * @file Renders the app icon to build/icon.png; electron-builder converts it to
 * .ico and .icns. Run as part of `npm run assets`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIcon } from '../src/shared/icon-draw.js';

const ICON_SIZE = 1024;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), drawIcon(ICON_SIZE));
console.log(`Wrote ${path.join(OUT_DIR, 'icon.png')}`);
