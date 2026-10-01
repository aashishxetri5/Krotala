/**
 * @file Stats page: summary tiles, keys-per-day chart, key heatmap and achievements.
 */

import { $ } from '../../shared/dom.js';
import { formatNumber } from '../../shared/format.js';
import { STAT_DEFINITIONS } from '../copy.js';
import { renderAchievements } from '../components/achievement-list.js';
import { renderDayChart } from '../components/day-chart.js';
import { renderKeyHeatmap } from '../components/key-heatmap.js';

/** Tile element → snapshot field. Null values (not enough data yet) show a dash. */
const TILES = {
  '#st-today': 'today',
  '#st-total': 'total',
  '#st-streak': 'streak',
  '#st-average-wpm': 'averageWpm',
  '#st-best-wpm': 'bestWpm',
  '#st-best-combo': 'bestCombo',
};
const NO_DATA = '–';

/**
 * @param {import('../../../main/core/stats-tracker.js').StatsSnapshot} stats - Snapshot.
 * @returns {string} Breakdown line under "Keys today", or '' when it isn't available.
 */
function describeBreakdown(stats) {
  if (stats.charactersToday == null) return '';
  return `${formatNumber(stats.charactersToday)} characters · ${formatNumber(stats.otherKeysToday)} other keys`;
}

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @param {() => boolean} isVisible - Whether the page is on screen; hidden pages skip rendering.
 * @returns {(() => void)} Function that renders the latest stats (call when the page is shown).
 */
export function mountStatsPage(store, isVisible) {
  for (const [selector, key] of Object.entries(TILES)) $(selector).closest('.tile').dataset.tip = STAT_DEFINITIONS[key];

  const render = () => {
    const { stats } = store.state;
    if (!stats || !isVisible()) return;
    for (const [selector, key] of Object.entries(TILES)) {
      $(selector).textContent = stats[key] == null ? NO_DATA : formatNumber(stats[key]);
    }
    $('#st-breakdown').textContent = describeBreakdown(stats);
    renderDayChart($('#day-chart'), $('#day-table'), stats.days);
    renderKeyHeatmap($('#heatmap'), stats.keys);
    renderAchievements($('#achievements'), $('#achievement-count'), stats.achievements);
  };
  store.subscribe(['stats'], render);
  return render;
}
