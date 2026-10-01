/**
 * @file Apps page: auto-mute options and per-app sound profiles.
 */

import { Invoke, MUTE, ToastKind } from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $, h, setOptions } from '../../shared/dom.js';
import { formatAppName } from '../../shared/format.js';
import { icon } from '../../shared/icons.js';
import { soundOptions } from '../components/controls.js';
import { showError, showToast } from '../ui/toast.js';

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @returns {void}
 */
export function mountAppsPage(store) {
  const list = $('#profiles');
  const picker = /** @type {HTMLSelectElement} */ ($('#profile-app'));
  const addButton = /** @type {HTMLButtonElement} */ ($('#profile-add'));
  const browseButton = /** @type {HTMLButtonElement} */ ($('#profile-browse'));

  const profiles = () => store.state.settings.profiles;
  const saveProfiles = (next) => store.saveSettings({ profiles: next });

  const addProfile = (app) => {
    if (!app || profiles().some((p) => p.app.toLowerCase() === app.toLowerCase())) return;
    saveProfiles([...profiles(), { app, soundId: MUTE }]);
  };

  const removeProfile = (index) => {
    const previous = profiles();
    const removed = previous[index];
    saveProfiles(previous.filter((_, i) => i !== index));
    showToast({
      kind: ToastKind.INFO,
      title: `Removed ${formatAppName(removed.app)}`,
      action: { label: 'Undo', onClick: () => saveProfiles(previous) },
    });
  };

  addButton.addEventListener('click', () => addProfile(picker.value));
  browseButton.addEventListener('click', async () => {
    try {
      addProfile(await api.invoke(Invoke.PROFILES_BROWSE));
    } catch (err) {
      showError("Couldn't add that app", err);
    }
  });

  const renderStatus = ({ settings, runtime }) => {
    const status = $('#apps-status');
    if (!runtime.features.appDetection) {
      status.textContent = 'Per-app sounds and full-screen detection are available on Windows.';
    } else if (runtime.muteReason && settings.enabled) {
      status.textContent = `${runtime.muteReason}.`;
    } else if (runtime.app) {
      const profile = store.state.sounds.find((s) => s.id === runtime.profileSoundId);
      status.textContent = profile
        ? `You're in ${runtime.appLabel}. Playing ${profile.name} from its profile.`
        : `You're in ${runtime.appLabel}. Using your main sound.`;
    } else {
      status.textContent = 'Switch to another app to see it here.';
    }
  };

  const renderProfiles = ({ settings, sounds, runtime }) => {
    if (!settings.profiles.length) {
      list.replaceChildren(h('div', { className: 'empty-state' }, [
        icon('app-window', { size: 22 }),
        'No per-app sounds yet. Add an app below.',
      ]));
    } else {
      const options = soundOptions(sounds, { leading: [{ value: MUTE, label: 'Mute' }], chaos: true });
      list.replaceChildren(...settings.profiles.map((profile, index) => {
        const select = /** @type {HTMLSelectElement} */ (h('select', { attrs: { 'aria-label': `Sound for ${formatAppName(profile.app)}` } }));
        setOptions(select, options, profile.soundId);
        select.addEventListener('change', () => saveProfiles(profiles().map((p, i) => (i === index ? { ...p, soundId: select.value } : p))));
        const isActive = runtime?.app?.toLowerCase() === profile.app.toLowerCase();
        return h('div', { className: 'profile-row' }, [
          h('span', { className: 'profile-name', attrs: { title: profile.app } }, [
            formatAppName(profile.app),
            isActive ? h('span', { className: 'profile-active', text: 'Active' }) : null,
          ]),
          select,
          h('button', {
            className: 'icon-button small',
            attrs: { type: 'button', 'aria-label': `Remove ${formatAppName(profile.app)}` },
            dataset: { tip: 'Remove' },
            on: { click: () => removeProfile(index) },
          }, icon('trash', { size: 16 })),
        ]);
      }));
    }

    const taken = new Set(settings.profiles.map((p) => p.app.toLowerCase()));
    const candidates = (runtime?.recentApps ?? []).filter((app) => !taken.has(app.toLowerCase()));
    setOptions(picker, candidates.length
      ? candidates.map((app) => ({ value: app, label: formatAppName(app) }))
      : [{ value: '', label: 'Switch to an app to list it here' }], candidates[0] ?? '');
    const supported = Boolean(runtime?.features.appDetection);
    picker.disabled = !supported || !candidates.length;
    addButton.disabled = !supported || !candidates.length;
    browseButton.disabled = !supported;
  };

  store.subscribe(['settings', 'runtime', 'sounds'], (state) => {
    if (!state.settings || !state.runtime) return;
    $('#row-auto-mute-mic').hidden = !state.runtime.features.micDetection;
    renderStatus(state);
    renderProfiles(state);
  });
}
