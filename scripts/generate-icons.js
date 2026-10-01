// Renders the app icon into build/ for electron-builder (it converts to .ico / .icns).
// Run with: npm run icons
const fs = require('fs');
const path = require('path');
const { drawIcon } = require('../src/shared/icon-draw');

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), drawIcon(1024, false));
console.log(`Wrote ${path.join(outDir, 'icon.png')}`);
