/**
 * @file Particle effects for the overlay canvas. Each style has a spawner that adds
 * particles and a drawer that renders one particle per frame.
 */

import { FxStyle } from '../../shared/constants.js';
import { iconPaths } from '../shared/icons.js';

const PALETTE = ['#7c5cff', '#ff5c8a', '#ffb020', '#2ed3a0', '#3fb6ff', '#ff7a45'];
const NOTE_ICONS = ['music', 'music-2', 'music-4'];
const SPARK_COLORS = ['#ffd166', '#ff9f1c', '#fff3b0'];
const LASER_COLORS = ['#ff3df5', '#3dfcff', '#7dff6b'];
const ICON_GRID = 24;

/**
 * @typedef {object} Particle
 * @property {string} kind - Drawer to use.
 * @property {number} x
 * @property {number} y
 * @property {number} ttl - Lifetime in seconds.
 * @property {number} [born] - Time of the particle's first frame (milliseconds).
 * @property {number} [life] - Age in seconds.
 * @property {number} [vx] - Velocity (px/s).
 * @property {number} [vy]
 * @property {number} [gravity] - Downward acceleration (px/s²).
 * @property {number} [drag] - Exponential slow-down rate (1/s).
 * @property {number} [rot] - Rotation (radians).
 * @property {number} [vr] - Angular velocity (radians/s).
 * @property {string} [color] - Stroke or fill colour.
 * @property {string} [icon] - Icon name, for 'icon' particles.
 * @property {boolean} [glow] - Draw with a coloured glow instead of a shadow.
 * @property {number} [size] - Icon size in pixels.
 * @property {number} [sway] - Phase of the side-to-side sway.
 * @property {number} [r] - Radius (bubbles, bullet holes).
 * @property {number} [r0] - Start radius (rings, shockwaves).
 * @property {number} [r1] - End radius (rings, shockwaves).
 * @property {number} [width] - Line width.
 * @property {number} [w] - Width (confetti).
 * @property {number} [h] - Height (confetti).
 * @property {[number, number, number][]} [cracks] - Bullet-hole cracks as [angle, length, bend].
 * @property {number} [angle] - Direction (beams, slashes).
 * @property {number} [len] - Length (beams, slashes).
 */

/**
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Random number in [min, max).
 */
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * @template T
 * @param {T[]} list - Choices.
 * @returns {T} A random element.
 */
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Adds particles for one key press.
 * @param {Particle[]} particles - Live particle list.
 * @param {{ style: string, x: number, y: number, size: number, icon: string }} fx - Effect request.
 * @returns {void}
 */
export function spawn(particles, { style, x, y, size, icon }) {
  switch (style) {
    case FxStyle.NOTES:
      particles.push({
        kind: 'icon', icon: pick(NOTE_ICONS), color: pick(PALETTE), glow: true, x, y, sway: rand(0, Math.PI * 2),
        vx: rand(-15, 15), vy: rand(-120, -80), gravity: 0, rot: rand(-0.3, 0.3), vr: 0, size: 28 * size, ttl: 1.3,
      });
      break;
    case FxStyle.RIPPLE:
      particles.push({ kind: 'ring', x, y, r0: 4, r1: 48 * size, width: 3, color: pick(PALETTE), ttl: 0.45 });
      break;
    case FxStyle.CONFETTI:
      for (let i = 0; i < 14; i++) {
        const angle = rand(-Math.PI, 0);
        const speed = rand(180, 420) * size;
        particles.push({
          kind: 'rect', x, y, w: rand(5, 9) * size, h: rand(8, 14) * size, color: pick(PALETTE),
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 900, rot: rand(0, Math.PI), vr: rand(-10, 10), ttl: rand(0.8, 1.2),
        });
      }
      break;
    case FxStyle.BUBBLES:
      for (let i = 0; i < 3; i++) {
        particles.push({
          kind: 'bubble', x: x + rand(-14, 14), y, r: rand(6, 14) * size, sway: rand(0, Math.PI * 2),
          vx: 0, vy: rand(-140, -70), gravity: 0, ttl: rand(0.7, 1.1),
        });
      }
      break;
    case FxStyle.BULLET: {
      const cracks = Array.from({ length: Math.floor(rand(5, 9)) }, () => [rand(0, Math.PI * 2), rand(14, 34) * size, rand(-0.35, 0.35)]);
      particles.push({ kind: 'hole', x, y, r: 7 * size, cracks, ttl: 1.8 });
      for (let i = 0; i < 8; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(120, 320);
        particles.push({ kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 600, color: pick(SPARK_COLORS), ttl: rand(0.2, 0.4) });
      }
      break;
    }
    case FxStyle.LASER:
      particles.push({ kind: 'beam', x, y, angle: rand(-Math.PI * 0.9, -Math.PI * 0.1), len: rand(140, 220) * size, color: pick(LASER_COLORS), ttl: 0.28 });
      particles.push({ kind: 'ring', x, y, r0: 2, r1: 18 * size, width: 2, color: '#ffffff', ttl: 0.2 });
      break;
    case FxStyle.SLASH:
      particles.push({ kind: 'slash', x, y, angle: rand(-0.9, -0.4) + (Math.random() < 0.5 ? Math.PI : 0), len: rand(90, 150) * size, ttl: 0.32 });
      break;
    default:
      particles.push({
        kind: 'icon', icon, color: '#ffffff', glow: false, x, y,
        vx: rand(-40, 40), vy: rand(-170, -110), gravity: 160, rot: rand(-0.4, 0.4), vr: rand(-2, 2), size: 30 * size, ttl: 1.1,
      });
  }
}

/**
 * Adds the explosion behind a banner: shockwaves, a ring of light streaks and,
 * for intense themes, confetti.
 * @param {Particle[]} particles - Live particle list.
 * @param {object} options
 * @param {number} options.x - Centre x.
 * @param {number} options.y - Centre y.
 * @param {string} options.glow - Shockwave colour.
 * @param {string[]} options.sparks - Streak and confetti colours.
 * @param {number} options.intensity - 0–1.
 * @returns {void}
 */
export function burst(particles, { x, y, glow, sparks, intensity }) {
  particles.push({ kind: 'shockwave', x, y, r0: 30, r1: 320 + 520 * intensity, width: 14, color: glow, ttl: 0.75 });
  particles.push({ kind: 'shockwave', x, y, r0: 10, r1: 180 + 300 * intensity, width: 6, color: '#ffffff', ttl: 0.5 });

  const streaks = Math.round(36 + 84 * intensity);
  for (let i = 0; i < streaks; i++) {
    const angle = (i / streaks) * Math.PI * 2 + rand(-0.08, 0.08);
    const speed = rand(420, 1100) * (0.7 + intensity * 0.6);
    particles.push({
      kind: 'streak', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      gravity: 260, drag: 2.2, color: pick(sparks), width: rand(2, 4.5), ttl: rand(0.55, 1.1),
    });
  }

  if (intensity < 0.5) return;
  const confetti = Math.round(40 * intensity);
  for (let i = 0; i < confetti; i++) {
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const speed = rand(500, 1100);
    particles.push({
      kind: 'rect', x, y, w: rand(7, 12), h: rand(10, 18), color: pick(sparks),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 1300, rot: rand(0, Math.PI), vr: rand(-12, 12), ttl: rand(1.2, 1.8),
    });
  }
}

/**
 * Advances a particle by one frame. Age comes from the clock rather than from
 * summed frame times, so after any pause in animation the particle expires on time.
 * @param {Particle} p - Particle.
 * @param {number} dt - Seconds since the last frame (capped), for movement.
 * @param {number} now - Current time in milliseconds (performance.now()).
 * @returns {boolean} False once the particle has expired.
 */
export function step(p, dt, now) {
  p.born ??= now;
  p.life = (now - p.born) / 1000;
  if (p.life >= p.ttl) return false;
  if (p.vx !== undefined) {
    if (p.drag) {
      const slow = Math.exp(-p.drag * dt);
      p.vx *= slow;
      p.vy *= slow;
    }
    p.vy += (p.gravity ?? 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (p.vr) p.rot += p.vr * dt;
  return true;
}

/**
 * Draws one particle.
 * @param {CanvasRenderingContext2D} g - Canvas context.
 * @param {Particle} p - Particle.
 * @param {number} t - Time in seconds (for sway).
 * @returns {void}
 */
export function draw(g, p, t) {
  const k = p.life / p.ttl;
  const fade = 1 - k;
  g.save();
  try {
    DRAWERS[p.kind](g, p, k, fade, t);
  } finally {
    g.restore();
  }
}

/**
 * Renders one particle for the current frame.
 * @callback Drawer
 * @param {CanvasRenderingContext2D} g - Canvas context (state is saved and restored around the call).
 * @param {Particle} p - Particle to draw.
 * @param {number} k - Progress through its life, 0–1.
 * @param {number} fade - `1 - k`, for fading out.
 * @param {number} t - Time in seconds, for sway and wobble.
 * @returns {void}
 */

/** @type {Readonly<Record<string, Drawer>>} Drawer for each particle kind. */
const DRAWERS = {
  icon(g, p, k, fade, t) {
    const pop = Math.min(1, p.life / 0.08);
    const sway = p.sway !== undefined ? Math.sin(t * 6 + p.sway) * 8 : 0;
    const scale = (p.size / ICON_GRID) * pop;
    g.globalAlpha = Math.min(1, fade * 1.6);
    g.translate(p.x + sway, p.y);
    g.rotate(p.rot);
    g.scale(scale, scale);
    g.translate(-ICON_GRID / 2, -ICON_GRID / 2);
    g.strokeStyle = p.color;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = p.glow ? p.color : 'rgba(0, 0, 0, 0.6)';
    g.shadowBlur = p.glow ? 10 : 6;
    for (const path of iconPaths(p.icon)) g.stroke(path);
  },
  ring(g, p, k, fade) {
    const ease = 1 - (1 - k) ** 3;
    g.globalAlpha = fade;
    g.strokeStyle = p.color;
    g.lineWidth = p.width * fade + 0.5;
    g.beginPath();
    g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease, 0, Math.PI * 2);
    g.stroke();
  },
  shockwave(g, p, k, fade) {
    const ease = 1 - (1 - k) ** 4;
    g.globalAlpha = fade ** 1.5;
    g.strokeStyle = p.color;
    g.shadowColor = p.color;
    g.shadowBlur = 30;
    g.lineWidth = p.width * fade + 1;
    g.beginPath();
    g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease, 0, Math.PI * 2);
    g.stroke();
  },
  streak(g, p, k, fade) {
    const tail = 0.035;
    g.globalAlpha = Math.min(1, fade * 1.4);
    g.strokeStyle = p.color;
    g.shadowColor = p.color;
    g.shadowBlur = 12;
    g.lineCap = 'round';
    g.lineWidth = p.width * fade + 0.5;
    g.beginPath();
    g.moveTo(p.x - p.vx * tail, p.y - p.vy * tail);
    g.lineTo(p.x, p.y);
    g.stroke();
  },
  rect(g, p, k, fade) {
    g.globalAlpha = Math.min(1, fade * 2);
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  },
  bubble(g, p, k, fade, t) {
    const x = p.x + Math.sin(t * 5 + p.sway) * 6;
    g.globalAlpha = Math.min(1, fade * 2);
    g.strokeStyle = 'rgba(160, 220, 255, 0.95)';
    g.fillStyle = 'rgba(160, 220, 255, 0.15)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, p.y, p.r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath();
    g.arc(x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, Math.PI * 2);
    g.fill();
  },
  hole(g, p, k) {
    g.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
    g.translate(p.x, p.y);
    g.strokeStyle = 'rgba(230, 230, 240, 0.75)';
    g.lineWidth = 1.2;
    for (const [angle, len, bend] of p.cracks) {
      g.beginPath();
      g.moveTo(Math.cos(angle) * p.r * 0.8, Math.sin(angle) * p.r * 0.8);
      g.quadraticCurveTo(Math.cos(angle + bend) * len * 0.6, Math.sin(angle + bend) * len * 0.6, Math.cos(angle) * len, Math.sin(angle) * len);
      g.stroke();
    }
    const gradient = g.createRadialGradient(0, 0, 0, 0, 0, p.r * 1.6);
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(0.55, '#14141a');
    gradient.addColorStop(0.7, 'rgba(200, 200, 210, 0.9)');
    gradient.addColorStop(1, 'rgba(200, 200, 210, 0)');
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(0, 0, p.r * 1.6, 0, Math.PI * 2);
    g.fill();
  },
  spark(g, p, k, fade) {
    g.globalAlpha = fade;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    g.fill();
  },
  beam(g, p, k, fade) {
    const head = Math.min(1, k * 3) * p.len;
    const tail = Math.max(0, k * 3 - 1) * p.len * 0.5;
    g.globalAlpha = fade;
    g.strokeStyle = p.color;
    g.shadowColor = p.color;
    g.shadowBlur = 16;
    g.lineCap = 'round';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(p.x + Math.cos(p.angle) * tail, p.y + Math.sin(p.angle) * tail);
    g.lineTo(p.x + Math.cos(p.angle) * head, p.y + Math.sin(p.angle) * head);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.stroke();
  },
  slash(g, p, k, fade) {
    const sweep = Math.min(1, k * 2.5);
    const dx = Math.cos(p.angle) * p.len;
    const dy = Math.sin(p.angle) * p.len;
    const segments = 12;
    const at = (s) => [p.x - dx / 2 + dx * s, p.y - dy / 2 + dy * s - Math.sin(s * Math.PI) * p.len * 0.18];
    g.globalAlpha = fade;
    g.strokeStyle = '#ffffff';
    g.shadowColor = '#bfe3ff';
    g.shadowBlur = 14;
    g.lineCap = 'round';
    for (let i = 0; i < segments * sweep; i++) {
      const [x1, y1] = at(i / segments);
      const [x2, y2] = at((i + 1) / segments);
      g.lineWidth = 1 + Math.sin((i / segments) * Math.PI) * 6;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
  },
};
