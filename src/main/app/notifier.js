/**
 * @file User-facing notifications: dashboard toasts and OS notifications.
 */

import { Notification } from 'electron';
import { Push, ToastKind } from '../../shared/constants.js';
import { appIcon } from '../windows/app-icons.js';

/**
 * @typedef {object} ToastMessage
 * @property {string} kind - One of ToastKind.
 * @property {string} title - Short headline.
 * @property {string} [message] - Optional detail line.
 */

/** Sends toasts to the dashboard and OS notifications. */
export class Notifier {
  /**
   * @param {import('../windows/dashboard-window.js').DashboardWindow} dashboard - Dashboard window.
   */
  constructor(dashboard) {
    this.dashboard = dashboard;
  }

  /**
   * Shows a toast in the dashboard, held until the dashboard is visible.
   * @param {ToastMessage} toast - Toast content.
   * @returns {void}
   */
  toast(toast) {
    this.dashboard.send(Push.TOAST, toast, { queue: true });
  }

  /**
   * @param {string} title - Headline.
   * @param {string} [message] - Detail.
   * @returns {void}
   */
  success(title, message) {
    this.toast({ kind: ToastKind.SUCCESS, title, message });
  }

  /**
   * @param {string} title - Headline.
   * @param {string} [message] - Detail.
   * @returns {void}
   */
  error(title, message) {
    this.toast({ kind: ToastKind.ERROR, title, message });
  }

  /**
   * Shows an OS notification when the dashboard is not visible.
   * @param {string} title - Headline.
   * @param {string} body - Detail.
   * @returns {void}
   */
  system(title, body) {
    if (this.dashboard.isVisible() || !Notification.isSupported()) return;
    new Notification({ title, body, icon: appIcon(), silent: true }).show();
  }
}
