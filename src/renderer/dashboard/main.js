/**
 * @file Dashboard entry point: loads initial data, builds navigation and the header,
 * mounts every page and subscribes to updates from the main process.
 */

import { CHAOS_PACK } from '../../shared/catalog.js';
import { CHAOS_SOUND_ID, Invoke, Push, ToastKind } from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { $, $$, h } from '../shared/dom.js';
import { formatPercent } from '../shared/format.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { readPreference, writePreference } from '../shared/storage.js';
import { DEFAULT_PAGE, PAGES } from './copy.js';
import { bindRange, bindSwitches } from './components/controls.js';
import { PackEditor } from './components/pack-editor.js';
import { Recorder } from './components/recorder.js';
import { mountAppsPage } from './pages/apps-page.js';
import { mountEffectsPage } from './pages/effects-page.js';
import { mountKeysPage } from './pages/keys-page.js';
import { mountSettingsPage } from './pages/settings-page.js';
import { mountSoundsPage } from './pages/sounds-page.js';
import { mountStatsPage } from './pages/stats-page.js';
import { Store } from './store.js';
import { initTooltips } from './ui/tooltip.js';
import { showError, showToast } from './ui/toast.js';

const PAGE_PREFERENCE = 'page';

/**
 * Builds the sidebar and switches pages.
 * @param {(pageId: string) => void} onShow - Called after a page becomes visible.
 * @returns {{ current: () => string }} Accessor for the visible page.
 */
function mountNavigation(onShow) {
  let current = readPreference(PAGE_PREFERENCE);
  if (!PAGES.some((p) => p.id === current)) current = DEFAULT_PAGE;

  const buttons = PAGES.map((page) => h('button', {
    className: 'nav-item',
    attrs: { type: 'button' },
    dataset: { page: page.id },
    on: { click: () => show(page.id) },
  }, [icon(page.icon, { size: 18 }), page.label]));
  $('#nav').replaceChildren(...buttons, h('div', { className: 'sidebar-foot' }, [
    icon('lock', { size: 14 }),
    'Keys are counted, never recorded.',
  ]));

  function show(pageId) {
    current = pageId;
    writePreference(PAGE_PREFERENCE, pageId);
    for (const button of buttons) {
      if (button.dataset.page === pageId) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const page of $$('.page')) page.hidden = page.id !== `page-${pageId}`;
    window.scrollTo(0, 0);
    onShow(pageId);
  }

  show(current);
  return { current: () => current };
}

/**
 * Header: status line, volume and the on/off switch.
 * @param {import('./store.js').Store} store - Dashboard store.
 * @returns {void}
 */
function mountHeader(store) {
  const status = $('#status');
  const statusText = $('#status-text');
  const enabled = /** @type {HTMLInputElement} */ ($('#enabled'));

  enabled.addEventListener('change', () => store.saveSettings({ enabled: enabled.checked }));
  bindRange(store, /** @type {HTMLInputElement} */ ($('#volume')), /** @type {HTMLOutputElement} */ ($('#volume-value')), 'volume', {
    toSetting: (v) => v / 100,
    toSlider: (v) => Math.round(v * 100),
    format: formatPercent,
  });

  store.subscribe(['settings', 'runtime', 'sounds'], ({ settings, runtime, sounds }) => {
    if (!settings || !runtime) return;
    enabled.checked = settings.enabled;
    $('#enabled-label').textContent = settings.enabled ? 'On' : 'Off';
    const activeId = runtime.profileSoundId || settings.soundId;
    const name = activeId === CHAOS_SOUND_ID ? CHAOS_PACK.name : sounds.find((s) => s.id === activeId)?.name ?? '';
    let text = runtime.muteReason ?? `Playing ${name}`;
    if (!runtime.muteReason && runtime.profileSoundId) text += ` in ${runtime.appLabel}`;
    statusText.textContent = text;
    status.classList.remove('loading');
    status.classList.toggle('muted-state', Boolean(runtime.muteReason));
  });
}

/**
 * Starts the dashboard.
 * @returns {Promise<void>}
 */
async function start() {
  hydrateIcons();
  initTooltips();
  $('#status').classList.add('loading');

  const store = new Store();
  const recorder = new Recorder(store);
  const packEditor = new PackEditor(store, { onRecord: (packId) => recorder.open(packId) });

  let renderStats = () => {};
  const navigation = mountNavigation((pageId) => {
    if (pageId === 'stats') renderStats();
  });
  mountHeader(store);
  bindSwitches(store, document);
  mountSoundsPage(store, { packEditor, recorder });
  mountKeysPage(store);
  mountEffectsPage(store);
  mountAppsPage(store);
  renderStats = mountStatsPage(store, () => navigation.current() === 'stats');
  mountSettingsPage(store);

  api.on(Push.SETTINGS, (settings) => store.set({ settings }));
  api.on(Push.RUNTIME, (runtime) => store.set({ runtime }));
  api.on(Push.STATS, (stats) => store.set({ stats }));
  api.on(Push.UPDATES, (updates) => store.set({ updates }));
  api.on(Push.SOUNDS_CHANGED, async () => store.set({ sounds: await api.invoke(Invoke.SOUNDS_LIST) }));
  api.on(Push.TOAST, (toast) => showToast(toast));

  try {
    const [settings, sounds, runtime, stats, updates, info] = await Promise.all([
      api.invoke(Invoke.SETTINGS_GET),
      api.invoke(Invoke.SOUNDS_LIST),
      api.invoke(Invoke.RUNTIME_GET),
      api.invoke(Invoke.STATS_GET),
      api.invoke(Invoke.UPDATES_GET),
      api.invoke(Invoke.APP_INFO),
    ]);
    store.set({ settings, sounds, runtime, stats, updates, info });
    document.body.classList.remove('is-loading');
  } catch (err) {
    showError("Couldn't load your settings", err);
    showToast({ kind: ToastKind.INFO, title: 'Try closing and reopening the dashboard.' });
  }
}

start();
