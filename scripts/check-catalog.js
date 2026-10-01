// Verifies every file referenced by the catalog exists in assets/sounds.
const fs = require('fs');
const path = require('path');
const { BUILT_IN_SOUNDS, SYSTEM_SOUNDS } = require('../src/shared/catalog');

const dir = path.join(__dirname, '..', 'assets', 'sounds');
const missing = [];
for (const s of BUILT_IN_SOUNDS) {
  for (const f of [...s.variants, ...Object.values(s.special || {}), ...(s.release || [])]) {
    if (!fs.existsSync(path.join(dir, f))) missing.push(`${s.id}: ${f}`);
  }
}
for (const [id, f] of Object.entries(SYSTEM_SOUNDS)) {
  if (!fs.existsSync(path.join(dir, f))) missing.push(`ui:${id}: ${f}`);
}
if (missing.length) {
  console.error('Missing sound files:\n  ' + missing.join('\n  ') + '\nRun: npm run sounds');
  process.exit(1);
}
console.log(`All ${BUILT_IN_SOUNDS.length} packs and ${Object.keys(SYSTEM_SOUNDS).length} UI sounds OK.`);
