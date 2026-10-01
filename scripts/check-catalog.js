/**
 * @file Verifies that every sample referenced by the catalog exists in assets/sounds.
 * Run with `npm run check`; exits with code 1 when files are missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_IN_SOUNDS, SYSTEM_SOUND_FILES } from '../src/shared/catalog.js';

const SOUNDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

const referenced = [
  ...BUILT_IN_SOUNDS.flatMap((s) => [...s.variants, ...Object.values(s.special ?? {}), ...(s.release ?? [])].map((f) => [s.id, f])),
  ...Object.entries(SYSTEM_SOUND_FILES),
];
const missing = referenced.filter(([, file]) => !fs.existsSync(path.join(SOUNDS_DIR, file)));

if (missing.length) {
  console.error(`Missing sound files:\n${missing.map(([id, f]) => `  ${id}: ${f}`).join('\n')}\nRun: npm run assets`);
  process.exit(1);
}
console.log(`All ${BUILT_IN_SOUNDS.length} packs and ${Object.keys(SYSTEM_SOUND_FILES).length} UI sounds are present.`);
