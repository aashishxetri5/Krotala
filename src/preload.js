// Shared by the audio, overlay and dashboard windows. Exposes a small whitelisted IPC bridge.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = [
  'settings:get', 'settings:set', 'sounds:list', 'sound:data', 'stats:get', 'runtime:get', 'app:info',
  'songs:list', 'song:restart', 'updates:get', 'updates:check', 'updates:install', 'mic:request',
  'packs:import', 'packs:addFiles', 'packs:update', 'packs:removeVariant', 'packs:delete', 'packs:export',
  'packs:saveRecording', 'profiles:browse',
];
const SEND = ['preview', 'audio:error'];
const LISTEN = [
  'settings', 'stats', 'runtime', 'updates', 'sounds:changed', 'toast', // dashboard
  'play', 'announce',                                                     // audio engine
  'fx', 'combo', 'banner',                                                // overlay
];

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
