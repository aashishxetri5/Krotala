/**
 * @file Renders icons from src/shared/icons.js as inline SVG or canvas paths.
 */

import { ICONS } from '../../shared/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FALLBACK_ICON = 'music';

/**
 * @param {string} name - Icon name.
 * @returns {readonly string[]} Path data for the icon, or the fallback icon.
 */
const pathsFor = (name) => ICONS[name] ?? ICONS[FALLBACK_ICON];

/**
 * Creates an inline SVG icon that inherits the current text colour.
 * @param {string} name - Icon name.
 * @param {object} [options]
 * @param {number} [options.size=18] - Width and height in pixels.
 * @param {string} [options.className] - Extra class names.
 * @param {string} [options.label] - Accessible label; decorative when omitted.
 * @returns {SVGSVGElement} The icon element.
 */
export function icon(name, { size = 18, className = '', label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${className}`.trim());
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of pathsFor(name)) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** @type {Map<string, Path2D[]>} */
const pathCache = new Map();

/**
 * Returns the icon as canvas paths in a 24×24 coordinate space.
 * @param {string} name - Icon name.
 * @returns {Path2D[]} Paths to stroke.
 */
export function iconPaths(name) {
  if (!pathCache.has(name)) pathCache.set(name, pathsFor(name).map((d) => new Path2D(d)));
  return pathCache.get(name);
}

/**
 * Replaces every `[data-icon]` placeholder under a root with its SVG.
 * @param {ParentNode} [root=document] - Where to look.
 * @returns {void}
 */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    const el = /** @type {HTMLElement} */ (node);
    el.replaceChildren(icon(el.dataset.icon, { size: Number(el.dataset.iconSize) || 18 }));
    delete el.dataset.icon;
  }
}
