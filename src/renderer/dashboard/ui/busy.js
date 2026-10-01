/**
 * @file Busy state for buttons that start slow operations.
 */

import { icon } from '../../shared/icons.js';

/**
 * Disables a control and shows a spinner while a task runs. A second click while
 * the task is running is ignored.
 * @template T
 * @param {HTMLElement} control - Button or card that started the task.
 * @param {() => Promise<T>} task - The operation.
 * @returns {Promise<T | undefined>} The task's result, or undefined when ignored (errors propagate).
 */
export async function withBusy(control, task) {
  if (control.getAttribute('aria-busy') === 'true') return undefined;
  control.setAttribute('aria-busy', 'true');
  control.classList.add('busy');
  if ('disabled' in control) control.disabled = true;
  const spinner = icon('loader-circle', { size: 16, className: 'spin busy-spinner' });
  control.append(spinner);
  try {
    return await task();
  } finally {
    spinner.remove();
    control.removeAttribute('aria-busy');
    control.classList.remove('busy');
    if ('disabled' in control) control.disabled = false;
  }
}
