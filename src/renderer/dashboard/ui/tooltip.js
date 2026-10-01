/**
 * @file Hover tooltips for any element with a `data-tip` attribute. The first line
 * is shown in bold. Uses event delegation, so it survives re-renders.
 */

import { h } from '../../shared/dom.js';

const OFFSET_PX = 12;

/**
 * Installs the tooltip handler on the document.
 * @returns {void}
 */
export function initTooltips() {
  const tip = h('div', { className: 'tooltip', attrs: { role: 'tooltip', hidden: true } });
  document.body.append(tip);
  let current = null;

  document.addEventListener('pointermove', (e) => {
    const target = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest('[data-tip]') : null);
    if (!target) {
      tip.hidden = true;
      current = null;
      return;
    }
    if (target !== current || tip.dataset.text !== target.dataset.tip) {
      const [title, ...lines] = target.dataset.tip.split('\n');
      tip.replaceChildren(h('strong', { text: title }), ...lines.map((line) => h('div', { text: line })));
      tip.dataset.text = target.dataset.tip;
      current = target;
    }
    tip.hidden = false;
    const { width, height } = tip.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - width / 2, 8), innerWidth - width - 8);
    const y = e.clientY - height - OFFSET_PX < 8 ? e.clientY + OFFSET_PX : e.clientY - height - OFFSET_PX;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  });
  document.addEventListener('pointerleave', () => { tip.hidden = true; });
}
