/**
 * @file Entry point of the hidden audio window: creates the engine and connects it
 * to messages from the main process.
 */

import { Invoke, Push, UiSound } from '../../shared/constants.js';
import { api } from '../shared/bridge.js';
import { AudioEngine } from './audio-engine.js';

const engine = new AudioEngine(new AudioContext({ latencyHint: 'interactive' }));
api.on(Push.PLAY, (command) => engine.play(command));
api.on(Push.RELEASE, ({ voice }) => engine.release(voice));
api.on(Push.SETTINGS, (settings) => engine.applySettings(settings));
api.on(Push.SOUNDS_CHANGED, ({ ids }) => {
  engine.forget(ids);
  if (engine.settings) engine.applySettings(engine.settings);
});

engine.applySettings(await api.invoke(Invoke.SETTINGS_GET));
// Preload everything so switching packs (and Chaos mode) is instant.
for (const sound of await api.invoke(Invoke.SOUNDS_LIST)) engine.load(sound.id);
engine.load(UiSound.COMBO);
engine.load(UiSound.ACHIEVEMENT);
