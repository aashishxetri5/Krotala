/**
 * @file Preload bridge shared by every window. Exposes `window.api` with access
 * limited to the IPC channels of the window's role, which the main process passes in
 * through process arguments (see WindowRole in src/main/windows/window-factory.js).
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Must match IPC_ARGUMENT in src/main/windows/window-factory.js. */
const IPC_ARGUMENT = '--ipc-channels=';
const encoded = process.argv.find((arg) => arg.startsWith(IPC_ARGUMENT))?.slice(IPC_ARGUMENT.length);
const allowed = encoded ? JSON.parse(atob(encoded)) : { invoke: [], send: [], listen: [] };

/** Electron prefixes errors thrown in handlers; keep only the original message. */
const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (Error: )?/;

contextBridge.exposeInMainWorld('api', {
  /**
   * Calls a main-process handler.
   * @param {string} channel - Invoke channel.
   * @param {...unknown} args - Arguments.
   * @returns {Promise<unknown>} The handler's result.
   */
  invoke(channel, ...args) {
    if (!allowed.invoke.includes(channel)) return Promise.reject(new Error(`Blocked channel: ${channel}`));
    return ipcRenderer.invoke(channel, ...args).catch((err) => {
      throw new Error(String(err?.message ?? err).replace(REMOTE_ERROR_PREFIX, ''));
    });
  },

  /**
   * Sends a one-way message to the main process.
   * @param {string} channel - Send channel.
   * @param {unknown} payload - Message body.
   * @returns {void}
   */
  send(channel, payload) {
    if (allowed.send.includes(channel)) ipcRenderer.send(channel, payload);
  },

  /**
   * Subscribes to messages from the main process.
   * @param {string} channel - Push channel.
   * @param {(payload: unknown) => void} listener - Handler.
   * @returns {() => void} Unsubscribe function.
   */
  on(channel, listener) {
    if (!allowed.listen.includes(channel)) return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
