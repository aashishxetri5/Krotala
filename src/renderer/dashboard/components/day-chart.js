/**
 * @file Column chart of keys per day, with hover tooltips and a table alternative.
 */

import { h } from '../../shared/dom.js';
import { formatLongDay, formatNumber, formatShortDay } from '../../shared/format.js';

const TICK_COUNT = 4;
/** Bars this close to either end get their label aligned inward. */
const EDGE_LABEL_SLOTS = 3;

/**
 * Picks a round tick step (1, 2, 2.5, 5 or 10 × a power of ten).
 * @param {number} max - Largest value to show.
 * @returns {number} Step between ticks.
 */
export function niceStep(max) {
  if (max <= 0) return 1;
  const raw = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
}

/**
 * Renders the chart and its table view. Skips work when the data is unchanged.
 * @param {HTMLElement} chart - Chart container.
 * @param {HTMLElement} tableBody - `<tbody>` of the table view.
 * @param {{ day: string, count: number }[]} days - Daily counts, oldest first, ending today.
 * @returns {void}
 */
export function renderDayChart(chart, tableBody, days) {
  const signature = JSON.stringify(days);
  if (chart.dataset.signature === signature) return;
  chart.dataset.signature = signature;

  const max = Math.max(0, ...days.map((d) => d.count));
  const step = niceStep(max);
  const top = Math.max(step * TICK_COUNT, step * Math.ceil(max / step));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peak = max > 0 ? days.findIndex((d) => d.count === max) : -1;
  const percent = (v) => `${(v / top) * 100}%`;
  const lastIndex = days.length - 1;

  const yAxis = h('div', { className: 'y-axis' }, ticks.map((t) => {
    const label = h('span', { text: formatNumber(t) });
    label.style.bottom = percent(t);
    return label;
  }));

  const plot = h('div', { className: 'plot' }, ticks.slice(1).map((t) => {
    const line = h('div', { className: 'gridline' });
    line.style.bottom = percent(t);
    return line;
  }));
  plot.append(h('div', { className: 'bars' }, days.map((d, i) => {
    const bar = h('div', { className: 'bar' });
    bar.style.height = percent(d.count);
    const slot = h('div', {
      className: `bar-slot${i === lastIndex ? ' today' : ''}`,
      dataset: { tip: `${formatNumber(d.count)} keys\n${formatLongDay(d.day)}${i === lastIndex ? ' (today)' : ''}` },
    }, bar);
    // Label only the busiest day; the axis and tooltips carry the rest.
    if (i === peak) {
      // Labels near either end are aligned inward so they never spill past the chart.
      const edge = i < EDGE_LABEL_SLOTS ? ' align-start' : i >= days.length - EDGE_LABEL_SLOTS ? ' align-end' : '';
      const label = h('span', { className: `bar-label${edge}`, text: formatNumber(d.count) });
      label.style.bottom = percent(d.count);
      slot.append(label);
    }
    return slot;
  })));

  const middle = Math.floor(days.length / 2);
  const xAxis = h('div', { className: 'x-axis', attrs: { 'aria-hidden': 'true' } }, [
    h('span', { text: formatShortDay(days[0].day) }),
    h('span', { text: formatShortDay(days[middle].day) }),
    h('span', { text: 'Today' }),
  ]);
  chart.replaceChildren(yAxis, plot, xAxis);

  tableBody.replaceChildren(...[...days].reverse().map((d) => h('tr', {}, [
    h('td', { text: formatLongDay(d.day) }),
    h('td', { text: formatNumber(d.count) }),
  ])));
}
