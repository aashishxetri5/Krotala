/**
 * @file Rules for when sounds are muted and which app profile applies.
 */

import { MUTE } from '../../shared/constants.js';

/**
 * @typedef {object} Environment
 * @property {string | null} app - Executable in the foreground (null when it is this app).
 * @property {boolean} micActive - Another app is using the microphone.
 * @property {boolean} fullscreen - The foreground app covers its whole display.
 */

/**
 * Strips the `.exe` extension for display.
 * @param {string | null} exe - Executable name.
 * @returns {string} Display label.
 */
export function appLabel(exe) {
  return exe ? exe.replace(/\.exe$/i, '') : '';
}

/**
 * Decides whether sounds play right now and which profile pack applies.
 * @param {import('../../shared/types.js').Settings} settings - Current settings.
 * @param {Environment} env - What the user is doing.
 * @returns {{ muteReason: string | null, profileSoundId: string }} Mute reason (null when playing) and profile pack.
 */
export function resolveAudioContext(settings, env) {
  const profile = env.app ? settings.profiles.find((p) => p.app.toLowerCase() === env.app.toLowerCase()) : undefined;
  const profileSoundId = profile && profile.soundId !== MUTE ? profile.soundId : '';

  let muteReason = null;
  if (!settings.enabled) muteReason = 'Sounds are off';
  else if (profile?.soundId === MUTE) muteReason = `Muted in ${appLabel(env.app)}`;
  else if (settings.autoMuteMic && env.micActive) muteReason = 'Muted while your microphone is in use';
  else if (settings.autoMuteFullscreen && env.fullscreen) muteReason = 'Muted in a full-screen app';

  return { muteReason, profileSoundId };
}
