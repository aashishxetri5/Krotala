/**
 * @file Renders the application icon (a keycap with a music note) as PNG.
 * Pure Node so that both the app and the build scripts can use it.
 */

import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const COLORS = {
  normal: { base: [108, 76, 240], face: [150, 126, 255] },
  muted: { base: [96, 96, 112], face: [140, 140, 156] },
  note: [255, 255, 255],
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/**
 * Computes the CRC-32 used by PNG chunks.
 * @param {Buffer} buf - Bytes to checksum.
 * @returns {number} Unsigned CRC-32.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Builds one PNG chunk.
 * @param {string} type - Four-letter chunk type.
 * @param {Buffer} data - Chunk payload.
 * @returns {Buffer} Encoded chunk.
 */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Encodes square RGBA pixels as a PNG file.
 * @param {number} size - Width and height in pixels.
 * @param {Buffer} rgba - Non-premultiplied RGBA pixels, row by row.
 * @returns {Buffer} PNG file contents.
 */
export function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Signed distance from a point to a rounded rectangle.
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {number} cx - Rectangle centre x.
 * @param {number} cy - Rectangle centre y.
 * @param {number} hw - Half width.
 * @param {number} hh - Half height.
 * @param {number} r - Corner radius.
 * @returns {number} Negative inside, positive outside.
 */
function roundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Signed distance from a point to a circle.
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {number} cx - Centre x.
 * @param {number} cy - Centre y.
 * @param {number} r - Radius.
 * @returns {number} Negative inside, positive outside.
 */
const circle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

/**
 * Draws the app icon.
 * @param {number} size - Edge length in pixels.
 * @param {boolean} [muted=false] - Grey variant shown while sounds are muted.
 * @returns {Buffer} PNG file contents.
 */
export function drawIcon(size, muted = false) {
  const { base, face } = muted ? COLORS.muted : COLORS.normal;
  const rgba = Buffer.alloc(size * size * 4);
  const aa = 1.2 / size;
  const coverage = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const layers = [
        [base, coverage(roundRect(u, v, 0.5, 0.5, 0.47, 0.47, 0.18))],
        [face, coverage(roundRect(u, v, 0.5, 0.45, 0.37, 0.37, 0.13))],
        [COLORS.note, coverage(Math.min(
          circle(u, v, 0.43, 0.62, 0.11),
          roundRect(u, v, 0.515, 0.43, 0.035, 0.2, 0.01),
          roundRect(u, v, 0.6, 0.27, 0.12, 0.05, 0.02),
        ))],
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
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
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, rgba);
}
