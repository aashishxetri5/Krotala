// Shared by the audio and dashboard windows. Exposes a small whitelisted IPC bridge.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = ['settings:get', 'settings:set', 'sounds:list', 'sound:data', 'sounds:import', 'sounds:remove', 'stats:get', 'app:info'];
const SEND = ['preview', 'audio:error'];
const LISTEN = ['settings', 'stats', 'key', 'preview', 'sounds:changed', 'toast'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => (INVOKE.includes(channel)
    ? ipcRenderer.invoke(channel, ...args)
    : Promise.reject(new Error(`Blocked channel: ${channel}`))),
  send: (channel, payload) => {
    if (SEND.includes(channel)) ipcRenderer.send(channel, payload);
  },
  on: (channel, fn) => {
    if (!LISTEN.includes(channel)) return () => {};
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
