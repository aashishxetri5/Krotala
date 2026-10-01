/**
 * @file Overlay window: draws keystroke effects, the combo counter and banners.
 * The animation loop only runs while something is on screen, so an idle overlay
 * costs nothing.
 */

import { Push } from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { $, h } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { draw, spawn, step } from './particles.js';

const MAX_PARTICLES = 400;
const MAX_FRAME_SECONDS = 0.05;
const COMBO_HIDE_MS = 900;

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
 * Shows the combo counter and bumps it.
 * @param {{ count: number }} message - Current combo.
 * @returns {void}
 */
function showCombo({ count }) {
  comboCount.textContent = String(count);
  combo.classList.add('show');
  combo.classList.remove('bump');
  void combo.offsetWidth; // Restart the CSS animation.
  combo.classList.add('bump');
  clearTimeout(comboTimer);
  comboTimer = window.setTimeout(() => combo.classList.remove('show'), COMBO_HIDE_MS);
}

/**
 * Shows an animated banner that removes itself when the animation ends.
 * @param {{ title: string, subtitle?: string, kind?: string, icon?: string }} banner - Banner content.
 * @returns {void}
 */
function showBanner({ title, subtitle, kind, icon: iconName }) {
  const banner = h('div', { className: `banner ${kind ?? ''}` }, [
    h('div', { className: 'banner-title' }, [iconName ? icon(iconName, { size: 40 }) : null, title]),
    subtitle ? h('div', { className: 'banner-subtitle', text: subtitle }) : null,
  ]);
  banner.addEventListener('animationend', () => banner.remove());
  $('#banners').append(banner);
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
