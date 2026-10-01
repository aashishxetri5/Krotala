/**
 * @file Grid of achievements, locked and unlocked.
 */

import { h } from '../../shared/dom.js';
import { formatDateTime } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';

/**
 * @typedef {object} AchievementView
 * @property {string} id
 * @property {string} icon
 * @property {string} name
 * @property {string} description
 * @property {number | null} unlockedAt
 */

/**
 * Renders the achievements and the "x of y unlocked" count.
 * @param {HTMLElement} container - Grid container.
 * @param {HTMLElement} counter - Element for the count text.
 * @param {AchievementView[]} achievements - All achievements.
 * @returns {void}
 */
export function renderAchievements(container, counter, achievements) {
  const signature = achievements.map((a) => `${a.id}:${a.unlockedAt ?? ''}`).join('|');
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;

  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  counter.textContent = `${unlocked} of ${achievements.length} unlocked`;
  container.replaceChildren(...achievements.map((a) => h('div', {
    className: `achievement ${a.unlockedAt ? 'unlocked' : 'locked'}`,
    dataset: { tip: a.unlockedAt ? `Unlocked\n${formatDateTime(a.unlockedAt)}` : 'Locked' },
  }, [
    h('span', { className: 'achievement-icon' }, icon(a.unlockedAt ? a.icon : 'lock', { size: 18 })),
    h('div', {}, [
      h('div', { className: 'achievement-name', text: a.name }),
      h('div', { className: 'achievement-desc', text: a.description }),
    ]),
  ])));
}
