/**
 * @file Turns input events into sounds, on-screen effects, stats and celebrations.
 */

import { screen } from 'electron';
import { FxPosition, FxStyle, PitchMode, Push, ToastKind, UiSound } from '../../shared/constants.js';
import { Combo, IS_WINDOWS, Playback } from '../constants.js';
import { isPrintable } from '../core/keyboard-layout.js';
import { getCaretPoint } from '../services/foreground.js';

/** @typedef {import('../../shared/types.js').PlayCommand} PlayCommand */

/**
 * @param {string} soundId - UI sound id.
 * @returns {PlayCommand} Command playing the UI sound at natural pitch.
 */
const uiSound = (soundId) => ({ soundId, slot: { type: 'variant', index: 0 }, rate: 1, pan: 0, gain: 1 });

export class PlaybackController {
  /**
   * @param {object} deps
   * @param {import('../settings/settings-service.js').SettingsService} deps.settings
   * @param {import('../core/keymap.js').KeyMapper} deps.mapper
   * @param {import('./context-monitor.js').ContextMonitor} deps.context
   * @param {import('./stats-service.js').StatsService} deps.stats
   * @param {import('../windows/audio-window.js').AudioWindow} deps.audio
   * @param {import('../windows/overlay-manager.js').OverlayManager} deps.overlay
   * @param {import('./notifier.js').Notifier} deps.notifier
   */
  constructor({ settings, mapper, context, stats, audio, overlay, notifier }) {
    Object.assign(this, { settings, mapper, context, stats, audio, overlay, notifier });
  }

  /**
   * Handles a key press anywhere in the OS.
   * @param {{ key: string, isRepeat: boolean }} event - Key event.
   * @returns {void}
   */
  onKeyDown({ key, isRepeat }) {
    const s = this.settings.get();
    if (!isRepeat) this.recordKeystroke(key, s);
    if (this.context.muteReason || (isRepeat && !s.playOnRepeat)) return;
    this.play(key);
  }

  /**
   * Handles a key release anywhere in the OS.
   * @param {{ key: string }} event - Key event.
   * @returns {void}
   */
  onKeyUp({ key }) {
    if (this.context.muteReason) return;
    const command = this.mapper.resolveRelease(this.settings.get(), key, { profileSoundId: this.context.profileSoundId });
    if (command) this.audio.send(Push.PLAY, command);
  }

  /**
   * Handles a mouse click anywhere in the OS.
   * @param {{ button: number, x: number, y: number }} event - Click in physical pixels.
   * @returns {void}
   */
  onMouseDown({ button, x, y }) {
    if (!this.settings.get().mouseClicks || this.context.muteReason) return;
    const point = IS_WINDOWS ? screen.screenToDipPoint({ x, y }) : { x, y };
    this.play(`Mouse${button}`, { pan: this.panForPoint(point), point });
  }

  /**
   * Plays a pack preview requested by the dashboard.
   * @param {{ id: string, index?: number }} request - Pack and optional variant.
   * @returns {void}
   */
  preview(request) {
    const command = this.mapper.preview(request?.id, request?.index ?? null);
    if (command) this.audio.send(Push.PLAY, command);
  }

  /**
   * Announces newly unlocked achievements.
   * @param {import('../core/stats-tracker.js').UnlockedAchievement[]} achievements - Unlocked achievements.
   * @returns {void}
   */
  celebrate(achievements) {
    for (const a of achievements) {
      if (!this.context.muteReason) this.audio.send(Push.PLAY, uiSound(UiSound.ACHIEVEMENT));
      if (this.settings.get().fxEnabled) this.overlay.banner({ kind: 'achievement', title: a.name, subtitle: 'Achievement unlocked', icon: a.icon });
      else this.notifier.system(`Achievement unlocked: ${a.name}`, a.description);
      this.notifier.toast({ kind: ToastKind.ACHIEVEMENT, title: `Achievement unlocked: ${a.name}`, message: a.description });
    }
  }

  /**
   * Updates stats for a key press and triggers combo milestones and achievements.
   * @param {string} key - Key name.
   * @param {import('../../shared/types.js').Settings} s - Current settings.
   * @returns {void}
   */
  recordKeystroke(key, s) {
    const result = this.stats.update((t) => t.record(key, { printable: isPrintable(key) }));
    if (s.fxEnabled && s.comboEnabled && result.combo >= Combo.COUNTER_MIN) this.overlay.combo(result.combo);
    if (result.milestone && s.comboEnabled && !this.context.muteReason) this.celebrateCombo(result.milestone, s);
    this.celebrate(result.achievements);
  }

  /**
   * @param {number} count - Combo milestone reached.
   * @param {import('../../shared/types.js').Settings} s - Current settings.
   * @returns {void}
   */
  celebrateCombo(count, s) {
    this.audio.send(Push.PLAY, uiSound(UiSound.COMBO));
    if (s.announcer) this.audio.send(Push.ANNOUNCE, { text: `Combo ${count}!` });
    this.overlay.banner({ title: `Combo ×${count}`, subtitle: Combo.PHRASES[count] });
  }

  /**
   * Plays the sound for a key and draws its effect.
   * @param {string} key - Key name.
   * @param {object} [options]
   * @param {number | null} [options.pan] - Explicit stereo position.
   * @param {Electron.Point | null} [options.point] - Where to draw the effect.
   * @returns {void}
   */
  play(key, { pan = null, point = null } = {}) {
    const s = this.settings.get();
    const playback = this.mapper.resolve(s, key, { profileSoundId: this.context.profileSoundId, pan });
    if (!playback) return;
    const { songNote, fx, icon, ...command } = playback;
    this.audio.send(Push.PLAY, command);
    if (songNote) this.stats.update((t) => t.noteSongNote());
    if (!s.fxEnabled) return;

    const melodic = s.pitchMode === PitchMode.MELODY || s.pitchMode === PitchMode.SONG;
    const style = s.fxStyle === FxStyle.AUTO ? (melodic ? FxStyle.NOTES : fx) : s.fxStyle;
    this.overlay.effect(point ?? this.effectPoint(s), { style, icon, size: s.fxSize });
  }

  /**
   * Chooses where to draw a keystroke effect.
   * @param {import('../../shared/types.js').Settings} s - Current settings.
   * @returns {Electron.Point} Position in DIPs.
   */
  effectPoint(s) {
    const cursor = screen.getCursorScreenPoint();
    if (s.fxPosition === FxPosition.RANDOM) {
      const { bounds } = screen.getDisplayNearestPoint(cursor);
      return {
        x: bounds.x + bounds.width * (0.1 + Math.random() * 0.8),
        y: bounds.y + bounds.height * (0.2 + Math.random() * 0.6),
      };
    }
    if (s.fxPosition === FxPosition.CARET) {
      const caret = getCaretPoint();
      if (caret) return screen.screenToDipPoint(caret);
    }
    return cursor;
  }

  /**
   * Stereo position of a point across all monitors.
   * @param {Electron.Point} point - Position in DIPs.
   * @returns {number} Pan from -STEREO_WIDTH to STEREO_WIDTH.
   */
  panForPoint(point) {
    const bounds = screen.getAllDisplays().map((d) => d.bounds);
    const left = Math.min(...bounds.map((b) => b.x));
    const right = Math.max(...bounds.map((b) => b.x + b.width));
    return (((point.x - left) / Math.max(1, right - left)) * 2 - 1) * Playback.STEREO_WIDTH;
  }
}
