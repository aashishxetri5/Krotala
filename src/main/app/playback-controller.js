/**
 * @file Turns input events into sounds, on-screen effects, stats and celebrations.
 */

import { BannerKind, FxPosition, FxStyle, PitchMode, Push, ToastKind, UiSound } from '../../shared/constants.js';
import { Combo, IS_WINDOWS, Playback } from '../constants.js';
import { isPrintable } from '../core/keyboard-layout.js';

/** @typedef {import('../../shared/types.js').PlayCommand} PlayCommand */

/**
 * The parts of Electron's `screen` module the controller uses.
 * @typedef {Pick<Electron.Screen, 'getCursorScreenPoint' | 'getDisplayNearestPoint' | 'getAllDisplays' | 'screenToDipPoint'>} ScreenApi
 */

/**
 * @param {string} soundId - UI sound id.
 * @returns {PlayCommand} Command playing the UI sound at natural pitch.
 */
const uiSound = (soundId) => ({ soundId, slot: { type: 'variant', index: 0 }, rate: 1, pan: 0, gain: 1 });

/**
 * Decides what each key press does: plays and sustains sounds, draws effects,
 * records stats and celebrates combos and achievements. Everything it talks to is
 * injected, so the rules are unit-tested in test/playback-controller.test.js.
 */
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
   * @param {ScreenApi} deps.screen - Display geometry (Electron's `screen`).
   * @param {() => Electron.Point | null} deps.getCaretPoint - Text caret in physical pixels, if known.
   */
  constructor({ settings, mapper, context, stats, audio, overlay, notifier, screen, getCaretPoint }) {
    Object.assign(this, { settings, mapper, context, stats, audio, overlay, notifier, screen, getCaretPoint });
    /** @type {Set<string>} Keys whose sound is sustaining until they are released. */
    this.held = new Set();
  }

  /**
   * Handles a key press anywhere in the OS.
   * @param {{ key: string, isRepeat: boolean }} event - Key event.
   * @returns {void}
   */
  onKeyDown({ key, isRepeat }) {
    const s = this.settings.get();
    // The main switch turns everything off: sounds, effects, combos and stats.
    if (!s.enabled) return;
    if (isRepeat) {
      // A sustaining key is already sounding; other keys replay only if asked to.
      if (!this.held.has(key) && s.playOnRepeat && !this.context.muteReason) this.play(key, { repeat: true });
      return;
    }
    this.recordKeystroke(key, s);
    if (!this.context.muteReason) this.play(key);
  }

  /**
   * Handles a key release anywhere in the OS.
   * @param {{ key: string }} event - Key event.
   * @returns {void}
   */
  onKeyUp({ key }) {
    // Always release, even when muted meanwhile, so no sound is left hanging.
    if (this.held.delete(key)) this.audio.send(Push.RELEASE, { voice: key });
    if (this.context.muteReason) return;
    const command = this.mapper.resolveRelease(this.settings.get(), key, { profileSoundId: this.context.profileSoundId });
    if (command) this.audio.send(Push.PLAY, command);
  }

  /**
   * Stops treating a key as sustaining after the audio engine found its sound too
   * short to sustain, so auto-repeat applies to it again.
   * @param {string} key - Key name.
   * @returns {void}
   */
  sustainUnavailable(key) {
    this.held.delete(key);
  }

  /**
   * Handles a mouse click anywhere in the OS.
   * @param {{ button: number, x: number, y: number }} event - Click in physical pixels.
   * @returns {void}
   */
  onMouseDown({ button, x, y }) {
    if (!this.settings.get().mouseClicks || this.context.muteReason) return;
    const point = IS_WINDOWS ? this.screen.screenToDipPoint({ x, y }) : { x, y };
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
   * Announces newly unlocked achievements. While muted (main switch off, a call, a
   * muted app…) they are only listed quietly in the dashboard.
   * @param {import('../core/stats-tracker.js').UnlockedAchievement[]} achievements - Unlocked achievements.
   * @returns {void}
   */
  celebrate(achievements) {
    const quiet = Boolean(this.context.muteReason);
    for (const a of achievements) {
      this.notifier.toast({ kind: ToastKind.ACHIEVEMENT, title: `Achievement unlocked: ${a.name}`, message: a.description });
      if (quiet) continue;
      this.audio.send(Push.PLAY, uiSound(UiSound.ACHIEVEMENT));
      if (this.settings.get().fxEnabled) this.overlay.banner({ kind: BannerKind.ACHIEVEMENT, kicker: 'Achievement unlocked', title: a.name, subtitle: a.description, icon: a.icon, tier: 0 });
      else this.notifier.system(`Achievement unlocked: ${a.name}`, a.description);
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
    const showCombo = s.comboEnabled && !this.context.muteReason;
    if (showCombo && s.fxEnabled && result.combo >= Combo.COUNTER_MIN) this.overlay.combo(result.combo);
    if (showCombo && result.milestone) this.celebrateCombo(result.milestone);
    this.celebrate(result.achievements);
  }

  /**
   * Plays the fanfare and shows the banner for a combo milestone.
   * @param {number} count - Combo milestone reached.
   * @returns {void}
   */
  celebrateCombo(count) {
    this.audio.send(Push.PLAY, uiSound(UiSound.COMBO));
    this.overlay.banner({
      kind: BannerKind.COMBO,
      kicker: 'Combo',
      title: `×${count}`,
      subtitle: Combo.PHRASES[count],
      tier: Combo.MILESTONES.indexOf(count),
    });
  }

  /**
   * Plays the sound for a key and draws its effect.
   * @param {string} key - Key name.
   * @param {object} [options]
   * @param {number | null} [options.pan] - Explicit stereo position.
   * @param {Electron.Point | null} [options.point] - Where to draw the effect.
   * @param {boolean} [options.repeat] - An auto-repeat of a held key (never sustains).
   * @returns {void}
   */
  play(key, { pan = null, point = null, repeat = false } = {}) {
    const s = this.settings.get();
    const playback = this.mapper.resolve(s, key, { profileSoundId: this.context.profileSoundId, pan });
    if (!playback) return;
    const { songNote, fx, icon, sustain, ...command } = playback;
    // Auto-repeats are one-shots; only the original press can sustain.
    if (sustain && !repeat) {
      this.held.add(key);
      this.audio.send(Push.PLAY, { ...command, sustain, voice: key });
    } else {
      this.audio.send(Push.PLAY, command);
    }
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
    const cursor = this.screen.getCursorScreenPoint();
    if (s.fxPosition === FxPosition.RANDOM) {
      const { bounds } = this.screen.getDisplayNearestPoint(cursor);
      return {
        x: bounds.x + bounds.width * (0.1 + Math.random() * 0.8),
        y: bounds.y + bounds.height * (0.2 + Math.random() * 0.6),
      };
    }
    if (s.fxPosition === FxPosition.CARET) {
      const caret = this.getCaretPoint();
      if (caret) return this.screen.screenToDipPoint(caret);
    }
    return cursor;
  }

  /**
   * Stereo position of a point across all monitors.
   * @param {Electron.Point} point - Position in DIPs.
   * @returns {number} Pan from -STEREO_WIDTH to STEREO_WIDTH.
   */
  panForPoint(point) {
    const bounds = this.screen.getAllDisplays().map((d) => d.bounds);
    const left = Math.min(...bounds.map((b) => b.x));
    const right = Math.max(...bounds.map((b) => b.x + b.width));
    return (((point.x - left) / Math.max(1, right - left)) * 2 - 1) * Playback.STEREO_WIDTH;
  }
}
