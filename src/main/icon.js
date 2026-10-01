// Draws the app icon (a keycap with a music note) procedurally and encodes it as PNG,
// so the app needs no binary image assets.
const zlib = require('zlib');
const { nativeImage } = require('electron');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance helpers (unit square coordinates).
function roundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const circle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

function drawIcon(size, muted) {
  const base = muted ? [96, 96, 112] : [108, 76, 240];
  const face = muted ? [140, 140, 156] : [150, 126, 255];
  const rgba = Buffer.alloc(size * size * 4);
  const aa = 1.2 / size;
  const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const layers = [
        [base, cover(roundRect(u, v, 0.5, 0.5, 0.47, 0.47, 0.18))],
        [face, cover(roundRect(u, v, 0.5, 0.45, 0.37, 0.37, 0.13))],
        [[255, 255, 255], cover(Math.min(
          circle(u, v, 0.43, 0.62, 0.11),
          roundRect(u, v, 0.515, 0.43, 0.035, 0.2, 0.01),
          roundRect(u, v, 0.6, 0.27, 0.12, 0.05, 0.02),
        ))],
      ];
      // Composite layers with "over" (non-premultiplied output).
      let r = 0, g = 0, b = 0, a = 0;
      for (const [[lr, lg, lb], la] of layers) {
        const outA = la + a * (1 - la);
        if (outA > 0) {
          r = (lr * la + r * a * (1 - la)) / outA;
          g = (lg * la + g * a * (1 - la)) / outA;
          b = (lb * la + b * a * (1 - la)) / outA;
        }
        a = outA;
      }
      const i = (y * size + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, rgba);
}

const cache = new Map();

// Tray icon with crisp representations for 100% / 150% / 200% display scaling.
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

module.exports = { trayIcon, appIcon, drawIcon };
