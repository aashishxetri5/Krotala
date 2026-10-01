/**
 * @file Settings page: shortcut info, update status and controls, version.
 */

import { Invoke, UpdateStatus } from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $ } from '../../shared/dom.js';
import { describeUpdate } from '../copy.js';
import { withBusy } from '../ui/busy.js';
import { showError } from '../ui/toast.js';

/** States in which "Check now" does nothing useful. */
const CHECK_DISABLED = [UpdateStatus.DEV, UpdateStatus.UNAVAILABLE, UpdateStatus.CHECKING, UpdateStatus.DOWNLOADING];

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @returns {void}
 */
export function mountSettingsPage(store) {
  const checkButton = /** @type {HTMLButtonElement} */ ($('#update-check'));
  const installButton = $('#update-install');
  const progress = $('#update-progress');

  checkButton.addEventListener('click', async () => {
    try {
      store.set({ updates: await withBusy(checkButton, () => api.invoke(Invoke.UPDATES_CHECK)) });
    } catch (err) {
      showError("Couldn't check for updates", err);
    }
  });
  installButton.addEventListener('click', () => api.invoke(Invoke.UPDATES_INSTALL));

  store.subscribe(['info'], ({ info }) => {
    if (!info) return;
    $('#hotkey').textContent = info.hotkey;
    if (!info.hotkeyRegistered) $('#hotkey-note').textContent = 'Unavailable: another app is using this shortcut.';
    $('#about').textContent = `Keyboard Sounds ${info.version}`;
  });

  store.subscribe(['updates'], ({ updates }) => {
    if (!updates) return;
    $('#update-status').textContent = describeUpdate(updates);
    checkButton.disabled = CHECK_DISABLED.includes(updates.status);
    installButton.hidden = updates.status !== UpdateStatus.READY;
    progress.hidden = updates.status !== UpdateStatus.DOWNLOADING;
    progress.style.setProperty('--value', `${updates.progress}%`);
  });
}
