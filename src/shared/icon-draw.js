/**
 * @file Renders the application icon as PNG: a 3D keycap with a music note and
 * sound waves on a gradient tile. Drawn from signed distance fields so it stays
 * crisp at every size, from 16 px tray icons to the 1024 px installer artwork.
 * Pure Node so that both the app and the build scripts can use it.
 */

import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Colours as [r, g, b] in 0–255. */
const PALETTE = {
  normal: {
    tileTop: [146, 112, 255],
    tileBottom: [72, 38, 212],
    keySide: [38, 20, 120],
    keyTop: [255, 255, 255],
    keyBottom: [222, 214, 255],
    note: [98, 64, 236],
    wave: [255, 255, 255],
  },
  muted: {
    tileTop: [150, 150, 165],
    tileBottom: [86, 86, 104],
    keySide: [48, 48, 60],
    keyTop: [250, 250, 252],
    keyBottom: [214, 214, 222],
    note: [110, 110, 126],
    wave: [255, 255, 255],
  },
};

/** Layout in unit coordinates (0–1, origin top-left). */
const LAYOUT = {
  tile: { cx: 0.5, cy: 0.5, hw: 0.47, hh: 0.47, r: 0.22 },
  keyBody: { cx: 0.385, cy: 0.56, hw: 0.215, hh: 0.2, r: 0.075 },
  keyTop: { cx: 0.385, cy: 0.515, hw: 0.17, hh: 0.15, r: 0.055 },
  shadow: { dy: 0.035, blur: 0.06, alpha: 0.4 },
  noteHead: { cx: 0.36, cy: 0.575, rx: 0.052, ry: 0.04, tilt: -0.45 },
  noteStem: { x0: 0.394, x1: 0.418, y0: 0.405, y1: 0.575 },
  noteFlag: { cx: 0.44, cy: 0.43, hw: 0.04, hh: 0.026, r: 0.02 },
  waves: [
    { r: 0.3, width: 0.05, alpha: 0.95 },
    { r: 0.405, width: 0.05, alpha: 0.6 },
  ],
  waveCentre: { x: 0.385, y: 0.52 },
  /** Half the angle covered by each wave, in radians. */
  waveSpread: 0.68,
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
 * Encodes RGBA pixels as a PNG file.
 * @param {number} width - Width in pixels.
 * @param {number} height - Height in pixels.
 * @param {Buffer} rgba - Non-premultiplied RGBA pixels, row by row.
 * @returns {Buffer} PNG file contents.
 */
function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Geometry (signed distances: negative inside) ----------

/**
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {{ cx: number, cy: number, hw: number, hh: number, r: number }} box - Rounded rectangle.
 * @returns {number} Signed distance.
 */
function roundRect(px, py, { cx, cy, hw, hh, r }) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Approximate signed distance to a rotated ellipse.
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {{ cx: number, cy: number, rx: number, ry: number, tilt: number }} e - Ellipse.
 * @returns {number} Signed distance.
 */
function ellipse(px, py, { cx, cy, rx, ry, tilt }) {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const dx = px - cx;
  const dy = py - cy;
  const x = dx * cos - dy * sin;
  const y = dx * sin + dy * cos;
  const k = Math.hypot(x / rx, y / ry);
  return (k - 1) * Math.min(rx, ry);
}

/**
 * Signed distance to an arc stroke with round caps, opening to the right.
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @param {number} radius - Arc radius.
 * @param {number} width - Stroke width.
 * @returns {number} Signed distance.
 */
function arc(px, py, radius, width) {
  const { x: cx, y: cy } = LAYOUT.waveCentre;
  const dx = px - cx;
  const dy = py - cy;
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angle) <= LAYOUT.waveSpread) return Math.abs(Math.hypot(dx, dy) - radius) - width / 2;
  const end = Math.sign(angle) * LAYOUT.waveSpread;
  return Math.hypot(px - (cx + radius * Math.cos(end)), py - (cy + radius * Math.sin(end))) - width / 2;
}

/**
 * Note head, stem and flag as one shape.
 * @param {number} px - Point x.
 * @param {number} py - Point y.
 * @returns {number} Signed distance.
 */
function note(px, py) {
  const { x0, x1, y0, y1 } = LAYOUT.noteStem;
  const stem = roundRect(px, py, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, r: 0.006 });
  return Math.min(ellipse(px, py, LAYOUT.noteHead), stem, roundRect(px, py, LAYOUT.noteFlag));
}

// ---------- Shading ----------

/**
 * @param {number[]} a - Start colour.
 * @param {number[]} b - End colour.
 * @param {number} t - 0–1.
 * @returns {number[]} Interpolated colour.
 */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * @param {number} edge0 - Lower edge.
 * @param {number} edge1 - Upper edge.
 * @param {number} x - Value.
 * @returns {number} Hermite-smoothed 0–1.
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Colour and opacity of every layer at one point, bottom layer first.
 * @param {number} u - x in unit coordinates.
 * @param {number} v - y in unit coordinates.
 * @param {(d: number) => number} coverage - Anti-aliased coverage for a signed distance.
 * @param {typeof PALETTE.normal} colors - Palette.
 * @param {boolean} muted - Whether to omit the sound waves.
 * @returns {[number[], number][]} Layers as [rgb, alpha].
 */
function layersAt(u, v, coverage, colors, muted) {
  const { tile, keyBody, keyTop, shadow } = LAYOUT;
  const tileT = (v - (tile.cy - tile.hh)) / (2 * tile.hh);
  // Soft highlight in the upper third of the tile.
  const sheen = 0.16 * (1 - smoothstep(0.05, 0.45, v)) * (1 - smoothstep(0.2, 0.9, Math.abs(u - 0.5) * 2));
  const tileColor = mix(mix(colors.tileTop, colors.tileBottom, tileT), [255, 255, 255], sheen);

  const shadowDistance = roundRect(u, v - shadow.dy, keyBody);
  const shadowAlpha = shadow.alpha * (1 - smoothstep(0, shadow.blur, shadowDistance));
  const keyTopT = (v - (keyTop.cy - keyTop.hh)) / (2 * keyTop.hh);

  const tileCover = coverage(roundRect(u, v, tile));
  const layers = [
    [tileColor, tileCover],
    [[0, 0, 0], shadowAlpha * tileCover],
    [colors.keySide, coverage(roundRect(u, v, keyBody))],
    [mix(colors.keyTop, colors.keyBottom, keyTopT), coverage(roundRect(u, v, keyTop))],
    [colors.note, coverage(note(u, v))],
  ];
  if (!muted) {
    for (const wave of LAYOUT.waves) layers.push([colors.wave, wave.alpha * coverage(arc(u, v, wave.r, wave.width)) * tileCover]);
  }
  return layers;
}

/**
 * Draws the app icon.
 * @param {number} size - Edge length of the icon in pixels.
 * @param {object} [options]
 * @param {boolean} [options.muted=false] - Grey variant without waves, shown while sounds are muted.
 * @param {number} [options.width=size] - Image width; a wider image centres the icon on a transparent background.
 * @returns {Buffer} PNG file contents.
 */
export function drawIcon(size, { muted = false, width = size } = {}) {
  const colors = muted ? PALETTE.muted : PALETTE.normal;
  // Small icons are supersampled so thin strokes keep their shape.
  const samples = size <= 64 ? 4 : size <= 256 ? 2 : 1;
  const aa = 1.2 / (size * samples);
  const coverage = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));
  const offset = (width - size) / 2;
  const rgba = Buffer.alloc(width * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x - offset + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          // Composite with "over" in premultiplied space.
          let pr = 0;
          let pg = 0;
          let pb = 0;
          let pa = 0;
          for (const [[lr, lg, lb], la] of layersAt(u, v, coverage, colors, muted)) {
            pr = lr * la + pr * (1 - la);
            pg = lg * la + pg * (1 - la);
            pb = lb * la + pb * (1 - la);
            pa = la + pa * (1 - la);
          }
          r += pr;
          g += pg;
          b += pb;
          a += pa;
        }
      }
      const i = (y * width + x) * 4;
      const n = samples * samples;
      // Convert the averaged premultiplied colour back to straight alpha.
      rgba[i] = a > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = a > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = a > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(width, size, rgba);
}
