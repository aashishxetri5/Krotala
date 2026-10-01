/**
 * @file Overlay window: draws keystroke effects, the combo counter and banners.
 * The animation loop only runs while something is on screen, so an idle overlay
 * costs nothing.
 */

import { BannerKind, Push } from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { $, h } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { themeFor } from './banner-themes.js';
import { burst, draw, spawn, step } from './particles.js';

const MAX_PARTICLES = 400;
const MAX_FRAME_SECONDS = 0.05;
const COMBO_HIDE_MS = 1200;
/** The counter pulses on multiples of this. */
const COMBO_PULSE_EVERY = 10;
/** Vertical position of banners, as a fraction of the screen height. */
const BANNER_CENTER_Y = 0.4;
/** Matches the moment the title lands in the slam-in animation. */
const BURST_DELAY_MS = 220;

const canvas = /** @type {HTMLCanvasElement} */ ($('#fx'));
const g = canvas.getContext('2d');
/** @type {import('./particles.js').Particle[]} */
const particles = [];
let running = false;
let lastFrame = 0;

/**
 * Matches the canvas to the window size and pixel density.
 * @returns {void}
 */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Renders one animation frame.
 * @param {number} now - Frame timestamp in milliseconds.
 * @returns {void}
 */
function frame(now) {
  const dt = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;
  g.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = particles.length - 1; i >= 0; i--) {
    if (step(particles[i], dt)) draw(g, particles[i], now / 1000);
    else particles.splice(i, 1);
  }
  if (particles.length) requestAnimationFrame(frame);
  else running = false;
}

/**
 * Starts the animation loop if it is idle.
 * @returns {void}
 */
function ensureRunning() {
  if (running) return;
  running = true;
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

const combo = $('#combo');
const comboCount = $('#combo-count');
let comboTimer = 0;

/**
 * Shows the combo counter. It only pulses on round numbers so it stays calm while typing.
 * @param {{ count: number }} message - Current combo.
 * @returns {void}
 */
function showCombo({ count }) {
  comboCount.textContent = String(count);
  combo.classList.add('show');
  if (count % COMBO_PULSE_EVERY === 0) {
    combo.classList.remove('bump');
    void combo.offsetWidth; // Restart the CSS animation.
    combo.classList.add('bump');
  }
  clearTimeout(comboTimer);
  comboTimer = window.setTimeout(() => combo.classList.remove('show'), COMBO_HIDE_MS);
}

/** @type {HTMLElement | null} */
let activeBanner = null;
let bannerTimer = 0;

/**
 * Shows a full-screen banner with an edge flash, light rays, a slam-in title and a
 * particle burst. A new banner replaces the one on screen.
 * @param {import('../../shared/types.js').Banner} banner - Banner content.
 * @returns {void}
 */
function showBanner(banner) {
  const theme = themeFor(banner, BannerKind.ACHIEVEMENT);
  activeBanner?.remove();
  clearTimeout(bannerTimer);

  const element = h('div', { className: `banner banner-${banner.kind}` }, [
    h('div', { className: 'banner-flash' }),
    h('div', { className: 'banner-rays' }),
    h('div', { className: 'banner-content' }, [
      h('div', { className: 'banner-kicker' }, [banner.icon ? icon(banner.icon, { size: 28 }) : null, banner.kicker]),
      h('div', { className: 'banner-title', text: banner.title }),
      banner.subtitle ? h('div', { className: 'banner-subtitle', text: banner.subtitle }) : null,
    ]),
  ]);
  element.style.setProperty('--light', theme.light);
  element.style.setProperty('--dark', theme.dark);
  element.style.setProperty('--glow', theme.glow);
  element.style.setProperty('--intensity', String(theme.intensity));
  element.style.setProperty('--duration', `${theme.durationMs}ms`);
  document.body.append(element);
  activeBanner = element;
  bannerTimer = window.setTimeout(() => {
    element.remove();
    if (activeBanner === element) activeBanner = null;
  }, theme.durationMs);

  // The burst goes off as the title lands.
  window.setTimeout(() => {
    burst(particles, { x: innerWidth / 2, y: innerHeight * BANNER_CENTER_Y, ...theme });
    ensureRunning();
  }, BURST_DELAY_MS);
}

addEventListener('resize', resize);
resize();
api.on(Push.FX, (fx) => {
  if (particles.length >= MAX_PARTICLES) return;
  spawn(particles, fx);
  ensureRunning();
});
api.on(Push.COMBO, showCombo);
api.on(Push.BANNER, showBanner);
