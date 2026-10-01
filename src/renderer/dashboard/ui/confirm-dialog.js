/**
 * @file Accessible confirmation dialog that replaces `window.confirm`.
 */

import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

/**
 * @typedef {object} ConfirmOptions
 * @property {string} title - Question, e.g. "Delete this pack?".
 * @property {string} [message] - Consequences of confirming.
 * @property {string} [confirmLabel='Confirm']
 * @property {string} [cancelLabel='Cancel']
 * @property {boolean} [danger=false] - Style the confirm button as destructive.
 */

/**
 * Asks the user to confirm an action.
 * @param {ConfirmOptions} options - Dialog content.
 * @returns {Promise<boolean>} True when confirmed.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const cancel = h('button', { className: 'btn', text: cancelLabel, attrs: { type: 'button' } });
    const confirm = h('button', { className: `btn btn-primary${danger ? ' btn-danger' : ''}`, text: confirmLabel, attrs: { type: 'button' } });
    const dialog = h('dialog', { className: 'modal modal-small', attrs: { 'aria-labelledby': 'confirm-title' } }, [
      h('div', { className: 'modal-body' }, [
        h('div', { className: 'confirm-head' }, [
          h('span', { className: `confirm-icon${danger ? ' danger' : ''}` }, icon(danger ? 'triangle-alert' : 'info', { size: 20 })),
          h('h2', { text: title, attrs: { id: 'confirm-title' } }),
        ]),
        message ? h('p', { className: 'muted', text: message }) : null,
        h('div', { className: 'modal-actions end' }, [cancel, confirm]),
      ]),
    ]);

    const finish = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });

    document.body.append(dialog);
    dialog.showModal();
    (danger ? cancel : confirm).focus();
  });
}
