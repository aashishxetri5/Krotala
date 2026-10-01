/**
 * @file System tray icon and menu.
 */

import { Menu, Tray } from 'electron';
import { CHAOS_PACK } from '../../shared/catalog.js';
import { APP_NAME, CHAOS_SOUND_ID, PitchMode } from '../../shared/constants.js';
import { Hotkey, IS_MAC } from '../constants.js';
import { trayIcon } from './app-icons.js';

const VOLUME_STEPS = [0.1, 0.25, 0.5, 0.75, 1];
const PITCH_LABELS = [
  [PitchMode.OFF, 'Normal'],
  [PitchMode.WOBBLE, 'Wobble'],
  [PitchMode.MELODY, 'Melody'],
  [PitchMode.SONG, 'Song mode'],
];

/**
 * @typedef {object} TrayActions
 * @property {() => void} openDashboard
 * @property {() => void} toggleEnabled
 * @property {(patch: object) => void} updateSettings
 * @property {() => void} quit
 */

/**
 * @typedef {object} TrayState
 * @property {import('../../shared/types.js').Settings} settings
 * @property {import('../../shared/types.js').SoundPack[]} sounds
 * @property {string | null} muteReason
 * @property {string} activeSoundName
 */

export class TrayController {
  /**
   * @param {TrayActions} actions - Menu callbacks.
   */
  constructor(actions) {
    this.actions = actions;
    this.tray = new Tray(trayIcon());
    // On macOS a click opens the menu instead.
    if (!IS_MAC) this.tray.on('click', actions.openDashboard);
  }

  /**
   * Rebuilds the icon, tooltip and menu.
   * @param {TrayState} state - Current state.
   * @returns {void}
   */
  update({ settings, sounds, muteReason, activeSoundName }) {
    const { actions } = this;
    this.tray.setImage(trayIcon(Boolean(muteReason)));
    this.tray.setToolTip(`${APP_NAME}: ${muteReason || activeSoundName}`);

    const radio = (label, checked, patch) => ({ label, type: 'radio', checked, click: () => actions.updateSettings(patch) });
    const soundItems = [
      ...sounds.map((s) => radio(s.name, settings.soundId === s.id, { soundId: s.id })),
      { type: 'separator' },
      radio(CHAOS_PACK.name, settings.soundId === CHAOS_SOUND_ID, { soundId: CHAOS_SOUND_ID }),
    ];
    const volumeItems = VOLUME_STEPS.map((v) => radio(`${Math.round(v * 100)}%`, Math.abs(settings.volume - v) < 0.005, { volume: v }));
    const pitchItems = PITCH_LABELS.map(([mode, label]) => radio(label, settings.pitchMode === mode, { pitchMode: mode }));

    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: actions.openDashboard },
      { type: 'separator' },
      { label: 'Sounds On', type: 'checkbox', checked: settings.enabled, accelerator: Hotkey.TOGGLE_MUTE, registerAccelerator: false, click: actions.toggleEnabled },
      ...(muteReason && settings.enabled ? [{ label: muteReason, enabled: false }] : []),
      { label: 'Sound', submenu: soundItems },
      { label: 'Pitch', submenu: pitchItems },
      { label: `Volume (${Math.round(settings.volume * 100)}%)`, submenu: volumeItems },
      { label: 'On-Screen Effects', type: 'checkbox', checked: settings.fxEnabled, click: () => actions.updateSettings({ fxEnabled: !settings.fxEnabled }) },
      { type: 'separator' },
      { label: `Quit ${APP_NAME}`, click: actions.quit },
    ]));
  }

  /**
   * Shows a one-off balloon (Windows only).
   * @param {string} title - Balloon title.
   * @param {string} content - Balloon text.
   * @returns {void}
   */
  balloon(title, content) {
    this.tray.displayBalloon({ iconType: 'info', title, content });
  }
}
