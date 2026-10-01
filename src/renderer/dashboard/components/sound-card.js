/**
 * @file A selectable sound pack card with preview and edit actions.
 */

import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

/**
 * @typedef {object} SoundCardHandlers
 * @property {() => void} onSelect - Card chosen.
 * @property {() => void} onPreview - Preview button pressed.
 * @property {(() => void) | null} [onEdit] - Edit button pressed (user packs only).
 */

/**
 * Creates a card for a pack.
 * @param {{ id: string, name: string, icon: string, description: string, pitched?: boolean }} pack - Pack to show.
 * @param {SoundCardHandlers} handlers - Callbacks.
 * @returns {HTMLElement} The card.
 */
export function soundCard(pack, { onSelect, onPreview, onEdit = null }) {
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  const actions = h('div', { className: 'card-actions' }, [
    h('button', {
      className: 'icon-button small',
      attrs: { type: 'button', 'aria-label': `Preview ${pack.name}` },
      dataset: { tip: 'Preview' },
      on: { click: stop(onPreview) },
    }, icon('play', { size: 16 })),
    onEdit ? h('button', {
      className: 'icon-button small',
      attrs: { type: 'button', 'aria-label': `Edit ${pack.name}` },
      dataset: { tip: 'Edit pack' },
      on: { click: stop(onEdit) },
    }, icon('square-pen', { size: 16 })) : null,
  ]);

  return h('div', {
    className: 'card',
    attrs: { role: 'radio', tabindex: '0', 'aria-checked': 'false', 'aria-label': pack.name },
    dataset: { id: pack.id },
    on: {
      click: onSelect,
      keydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      },
    },
  }, [
    h('span', { className: 'card-check' }, icon('circle-check', { size: 18 })),
    h('span', { className: 'card-icon' }, icon(pack.icon, { size: 22 })),
    h('span', { className: 'card-name' }, [pack.name, pack.pitched ? h('span', { className: 'card-badge', text: 'Melodic' }) : null]),
    h('span', { className: 'card-desc', text: pack.description }),
    actions,
  ]);
}

/**
 * Creates a dashed card for adding content.
 * @param {string} iconName - Icon name.
 * @param {string} title - Card title.
 * @param {string} description - Short description.
 * @param {(card: HTMLElement) => void} onClick - Called with the card (for busy state).
 * @returns {HTMLElement} The card.
 */
export function actionCard(iconName, title, description, onClick) {
  const card = h('button', { className: 'card add', attrs: { type: 'button' } }, [
    h('span', { className: 'card-icon' }, icon(iconName, { size: 22 })),
    h('span', { className: 'card-name', text: title }),
    h('span', { className: 'card-desc', text: description }),
  ]);
  card.addEventListener('click', () => onClick(card));
  return card;
}
