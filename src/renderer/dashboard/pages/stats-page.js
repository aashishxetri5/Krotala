/**
 * @file Stats page: summary tiles, keys-per-day chart, key heatmap and achievements.
 */

import { $ } from '../../shared/dom.js';
import { formatNumber } from '../../shared/format.js';
import { renderAchievements } from '../components/achievement-list.js';
import { renderDayChart } from '../components/day-chart.js';
import { renderKeyHeatmap } from '../components/key-heatmap.js';

const TILES = {
  '#st-today': 'today',
  '#st-total': 'total',
  '#st-streak': 'streak',
  '#st-wpm': 'currentWpm',
  '#st-best-wpm': 'bestWpm',
  '#st-best-combo': 'bestCombo',
};

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @param {() => boolean} isVisible - Whether the page is on screen; hidden pages skip rendering.
 * @returns {(() => void)} Function that renders the latest stats (call when the page is shown).
 */
export function mountStatsPage(store, isVisible) {
  const render = () => {
    const { stats } = store.state;
    if (!stats || !isVisible()) return;
    for (const [selector, key] of Object.entries(TILES)) $(selector).textContent = formatNumber(stats[key]);
    renderDayChart($('#day-chart'), $('#day-table'), stats.days);
    renderKeyHeatmap($('#heatmap'), stats.keys);
    renderAchievements($('#achievements'), $('#achievement-count'), stats.achievements);
  };
  store.subscribe(['stats'], render);
  return render;
}
