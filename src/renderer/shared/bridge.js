/**
 * @file Typed access to the preload bridge (`window.api`).
 */

/**
 * @typedef {object} Bridge
 * @property {(channel: string, ...args: unknown[]) => Promise<any>} invoke - Calls a main-process handler.
 * @property {(channel: string, payload?: unknown) => void} send - Sends a one-way message.
 * @property {(channel: string, listener: (payload: any) => void) => () => void} on - Subscribes to pushes.
 */

/** @type {Bridge} */
export const api = window.api;
