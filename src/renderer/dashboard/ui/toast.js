/**
 * @file Toast notifications: stacked, auto-dismissing, pausable on hover, with an
 * optional action button (e.g. Undo).
 */

import { ToastKind } from '../../../shared/constants.js';
import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

const MAX_VISIBLE = 4;
const DURATION_MS = { default: 4500, error: 7000, withAction: 7000 };
const KIND_ICONS = {
  [ToastKind.INFO]: 'info',
  [ToastKind.SUCCESS]: 'circle-check',
  [ToastKind.WARNING]: 'triangle-alert',
  [ToastKind.ERROR]: 'circle-alert',
  [ToastKind.ACHIEVEMENT]: 'trophy',
};

/**
 * @typedef {object} ToastOptions
 * @property {string} [kind] - One of ToastKind (default info).
 * @property {string} title - Headline.
 * @property {string} [message] - Optional detail line.
 * @property {{ label: string, onClick: () => void }} [action] - Optional action button.
 */

let region = null;

/**
 * @returns {HTMLElement} The live region that holds toasts, created on first use.
 */
function getRegion() {
  if (!region) {
    // A manual popover lives in the top layer, so toasts stay visible above open dialogs.
    region = h('div', { className: 'toast-region', attrs: { popover: 'manual', 'aria-live': 'polite', 'aria-relevant': 'additions' } });
    document.body.append(region);
  }
  return region;
}

/**
 * Moves the toast region above anything else in the top layer (such as a dialog opened after it).
 * @returns {void}
 */
function raiseRegion() {
  if (region.matches(':popover-open')) region.hidePopover();
  region.showPopover();
}

/**
 * Shows a toast.
 * @param {ToastOptions} options - Toast content.
 * @returns {() => void} Function that dismisses the toast.
 */
export function showToast({ kind = ToastKind.INFO, title, message, action }) {
  const container = getRegion();
  const isError = kind === ToastKind.ERROR;
  let timer = null;
  let remaining = action ? DURATION_MS.withAction : isError ? DURATION_MS.error : DURATION_MS.default;
  let startedAt = 0;

  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  const start = () => {
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
  };
  const pause = () => {
    clearTimeout(timer);
    remaining -= Date.now() - startedAt;
  };

  const toast = h('div', {
    className: `toast toast-${kind}`,
    attrs: { role: isError ? 'alert' : 'status' },
    on: { mouseenter: pause, mouseleave: start },
  }, [
    h('span', { className: 'toast-icon' }, icon(KIND_ICONS[kind] ?? KIND_ICONS[ToastKind.INFO], { size: 18 })),
    h('div', { className: 'toast-body' }, [
      h('div', { className: 'toast-title', text: title }),
      message ? h('div', { className: 'toast-message', text: message }) : null,
    ]),
    action ? h('button', {
      className: 'toast-action',
      text: action.label,
      attrs: { type: 'button' },
      on: { click: () => { action.onClick(); dismiss(); } },
    }) : null,
    h('button', {
      className: 'toast-close',
      attrs: { type: 'button', 'aria-label': 'Dismiss' },
      on: { click: dismiss },
    }, icon('x', { size: 14 })),
  ]);

  container.append(toast);
  while (container.children.length > MAX_VISIBLE) container.firstElementChild.remove();
  raiseRegion();
  start();
  return dismiss;
}

/**
 * Shows an error toast for a failed operation.
 * @param {string} title - What failed, e.g. "Couldn't export the pack".
 * @param {unknown} error - The error.
 * @returns {void}
 */
export function showError(title, error) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  showToast({ kind: ToastKind.ERROR, title, message });
}
