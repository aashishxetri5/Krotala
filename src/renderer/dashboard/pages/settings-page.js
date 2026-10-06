/**
 * @file Settings page: shortcut info, update status and controls, stats reset, version.
 */

import { APP_NAME, Invoke, ToastKind, UpdateStatus } from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $ } from '../../shared/dom.js';
import { describeUpdate } from '../copy.js';
import { withBusy } from '../ui/busy.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { showError, showToast } from '../ui/toast.js';

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
  const resetButton = /** @type {HTMLButtonElement} */ ($('#stats-reset'));
  resetButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset all stats?',
      message: 'Key counts, speeds, streaks, combos and achievements will be cleared. This cannot be undone.',
      confirmLabel: 'Reset stats',
      danger: true,
    });
    if (!confirmed) return;
    try {
      store.set({ stats: await withBusy(resetButton, () => api.invoke(Invoke.STATS_RESET)) });
      showToast({ kind: ToastKind.SUCCESS, title: 'Stats reset', message: 'Counting starts again from your next key press.' });
    } catch (err) {
      showError("Couldn't reset your stats", err);
    }
  });

  const startupButton = /** @type {HTMLButtonElement} */ ($('#startup-settings'));
  startupButton.addEventListener('click', async () => {
    try {
      await withBusy(startupButton, () => api.invoke(Invoke.STARTUP_SETTINGS_OPEN));
    } catch (err) {
      showError("Couldn't open Windows startup settings", err);
    }
  });

  installButton.addEventListener('click', async () => {
    try {
      await withBusy(installButton, () => api.invoke(Invoke.UPDATES_INSTALL));
    } catch (err) {
      showError("Couldn't install the update", err);
    }
  });

  store.subscribe(['info'], ({ info }) => {
    if (!info) return;
    $('#hotkey').textContent = info.hotkey;
    if (!info.hotkeyRegistered) $('#hotkey-note').textContent = 'Unavailable: another app is using this shortcut.';
    $('#about').textContent = `${APP_NAME} ${info.version}`;
    // Store installs start through a Windows startup task, which only Windows Settings can change.
    $('#login-item-row').hidden = info.storeBuild;
    $('#startup-task-row').hidden = !info.storeBuild;
  });

  store.subscribe(['updates'], ({ updates }) => {
    if (!updates) return;
    $('#update-status').textContent = describeUpdate(updates);
    // The Store updates the app itself, so there is nothing to switch or check here.
    const storeManaged = updates.status === UpdateStatus.STORE;
    $('#auto-update-row').hidden = storeManaged;
    checkButton.hidden = storeManaged;
    checkButton.disabled = CHECK_DISABLED.includes(updates.status);
    installButton.hidden = updates.status !== UpdateStatus.READY;
    progress.hidden = updates.status !== UpdateStatus.DOWNLOADING;
    progress.style.setProperty('--value', `${updates.progress}%`);
  });
}
