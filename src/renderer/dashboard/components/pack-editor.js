/**
 * @file Dialog for editing a user pack: name, icon, sustain, samples, sharing and deletion.
 */

import {
  APP_NAME, CUSTOM_PACK_ICONS, Invoke, Limits, Send, ToastKind,
} from '../../../shared/constants.js';
import { api } from '../../shared/bridge.js';
import { $, h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { withBusy } from '../ui/busy.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { showError, showToast } from '../ui/toast.js';

/** The dialog for editing a user pack. */
export class PackEditor {
  /**
   * @param {import('../store.js').Store} store - Dashboard store.
   * @param {object} options
   * @param {(packId: string) => void} options.onRecord - Opens the recorder for this pack.
   */
  constructor(store, { onRecord }) {
    this.store = store;
    this.dialog = /** @type {HTMLDialogElement} */ ($('#pack-dialog'));
    this.nameInput = /** @type {HTMLInputElement} */ ($('#pack-name'));
    this.nameInput.maxLength = Limits.PACK_NAME_LENGTH;
    this.sustainInput = /** @type {HTMLInputElement} */ ($('#pack-sustain'));
    this.iconPicker = $('#pack-icon');
    this.variantList = $('#pack-variants');
    /** @type {string | null} */
    this.packId = null;

    this.iconButtons = CUSTOM_PACK_ICONS.map((name) => h('button', {
      className: 'icon-choice',
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': name.replace(/-/g, ' ') },
      dataset: { icon: name },
      on: { click: () => this.update({ icon: name }) },
    }, icon(name, { size: 18 })));
    this.iconPicker.replaceChildren(...this.iconButtons);

    this.nameInput.addEventListener('change', () => this.update({ name: this.nameInput.value }));
    this.sustainInput.addEventListener('change', () => this.update({ sustain: this.sustainInput.checked }));
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.nameInput.blur(); });
    $('[data-close]', this.dialog).addEventListener('click', () => this.dialog.close());
    $('#pack-add-files').addEventListener('click', (e) => this.addFiles(/** @type {HTMLElement} */ (e.currentTarget)));
    $('#pack-record').addEventListener('click', () => onRecord(this.packId));
    $('#pack-export').addEventListener('click', (e) => this.share(/** @type {HTMLElement} */ (e.currentTarget)));
    $('#pack-delete').addEventListener('click', (e) => this.remove(/** @type {HTMLElement} */ (e.currentTarget)));

    store.subscribe(['sounds'], () => this.render());
  }

  /**
   * Opens the editor for a pack.
   * @param {string} packId - User pack id.
   * @returns {void}
   */
  open(packId) {
    this.packId = packId;
    this.render();
    this.dialog.showModal();
  }

  /** @returns {import('../../../shared/types.js').SoundPack | undefined} The pack being edited. */
  get pack() {
    return this.store.state.sounds.find((s) => s.id === this.packId);
  }

  /**
   * Refreshes the dialog from the store; closes it if the pack no longer exists.
   * @returns {void}
   */
  render() {
    if (!this.dialog.open) return;
    const pack = this.pack;
    if (!pack) {
      this.dialog.close();
      return;
    }
    if (document.activeElement !== this.nameInput) this.nameInput.value = pack.name;
    this.sustainInput.checked = pack.sustain !== false;
    for (const button of this.iconButtons) button.setAttribute('aria-checked', String(button.dataset.icon === pack.icon));

    const canRemove = pack.variants.length > 1;
    this.variantList.replaceChildren(...pack.variants.map((_, index) => h('li', {}, [
      h('span', { text: `Sound ${index + 1}` }),
      h('button', {
        className: 'icon-button small',
        attrs: { type: 'button', 'aria-label': `Play sound ${index + 1}` },
        dataset: { tip: 'Play' },
        on: { click: () => api.send(Send.PREVIEW, { id: pack.id, index }) },
      }, icon('play', { size: 16 })),
      h('button', {
        className: 'icon-button small',
        attrs: { type: 'button', 'aria-label': `Remove sound ${index + 1}`, disabled: !canRemove },
        dataset: { tip: canRemove ? 'Remove' : 'A pack needs at least one sound' },
        on: { click: () => this.removeVariant(index) },
      }, icon('trash', { size: 16 })),
    ])));
  }

  /**
   * @param {{ name?: string, icon?: string, sustain?: boolean }} patch - Changes.
   * @returns {Promise<void>}
   */
  async update(patch) {
    try {
      await api.invoke(Invoke.PACKS_UPDATE, this.packId, patch);
    } catch (err) {
      showError("Couldn't update the pack", err);
    }
  }

  /**
   * @param {HTMLElement} button - Button that started the action.
   * @returns {Promise<void>}
   */
  async addFiles(button) {
    try {
      const result = await withBusy(button, () => api.invoke(Invoke.PACKS_ADD_FILES, this.packId));
      if (result?.skipped.length) {
        showToast({ kind: ToastKind.WARNING, title: 'Some files were skipped', message: result.skipped.join(', ') });
      }
    } catch (err) {
      showError("Couldn't add those files", err);
    }
  }

  /**
   * @param {number} index - Variant index.
   * @returns {Promise<void>}
   */
  async removeVariant(index) {
    try {
      await api.invoke(Invoke.PACKS_REMOVE_VARIANT, this.packId, index);
    } catch (err) {
      showError("Couldn't remove that sound", err);
    }
  }

  /**
   * @param {HTMLElement} button - Button that started the action.
   * @returns {Promise<void>}
   */
  async share(button) {
    try {
      const file = await withBusy(button, () => api.invoke(Invoke.PACKS_EXPORT, this.packId));
      if (file) {
        showToast({
          kind: ToastKind.SUCCESS,
          title: 'Pack saved',
          message: `Send ${file.split(/[\\/]/).pop()} to a friend. Opening it installs the pack in ${APP_NAME}.`,
        });
      }
    } catch (err) {
      showError("Couldn't save the pack", err);
    }
  }

  /**
   * @param {HTMLElement} button - Button that started the action.
   * @returns {Promise<void>}
   */
  async remove(button) {
    const pack = this.pack;
    if (!pack) return;
    const confirmed = await confirmDialog({
      title: `Delete “${pack.name}”?`,
      message: 'Its sounds will be removed from your computer. This cannot be undone.',
      confirmLabel: 'Delete pack',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await withBusy(button, () => api.invoke(Invoke.PACKS_DELETE, pack.id));
      this.dialog.close();
      showToast({ kind: ToastKind.SUCCESS, title: `Deleted “${pack.name}”` });
    } catch (err) {
      showError("Couldn't delete the pack", err);
    }
  }
}
