/**
 * @file Built-in sound packs. Sample files are produced by scripts/generate-sounds.js
 * into assets/sounds/; `npm run check` verifies every file referenced here exists.
 */

import { FxStyle, UiSound } from './constants.js';

/**
 * Builds the file names `prefix_0.wav` … `prefix_{count-1}.wav`.
 * @param {string} prefix - File name prefix.
 * @param {number} count - Number of files.
 * @returns {string[]} File names.
 */
const range = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}_${i}.wav`);

/** @type {readonly import('./types.js').SoundPack[]} */
export const BUILT_IN_SOUNDS = Object.freeze([
  {
    id: 'dialpad', sustain: true, digitKeys: true, name: 'Dial Pad', icon: 'phone', category: 'Classic', fx: FxStyle.RIPPLE,
    description: 'Phone keypad tones. Each digit plays its real tone.',
    variants: range('dialpad', 12),
  },
  {
    id: 'mechanical', name: 'Mechanical', icon: 'keyboard', category: 'Classic', fx: FxStyle.RIPPLE,
    description: 'Clicky switches with a deep spacebar thock.',
    variants: range('mechanical', 4),
    special: { Space: 'mechanical_space.wav', Enter: 'mechanical_space.wav' },
    release: range('mechanical_up', 4),
  },
  {
    id: 'typewriter', name: 'Typewriter', icon: 'type', category: 'Classic', fx: FxStyle.ICON,
    description: 'Type-bar clacks and a bell on Enter.',
    variants: range('typewriter', 3),
    special: { Enter: 'typewriter_bell.wav' },
  },
  {
    id: 'piano', sustain: true, name: 'Piano', icon: 'piano', category: 'Musical', pitched: true, baseNote: 60, fx: FxStyle.NOTES,
    description: 'Bright acoustic piano. Try it with Song mode.',
    variants: ['piano.wav'],
  },
  {
    id: 'harmonium', sustain: true, name: 'Harmonium', icon: 'keyboard-music', category: 'Musical', pitched: true, baseNote: 60, fx: FxStyle.NOTES,
    description: 'Reedy bellows organ.',
    variants: ['harmonium.wav'],
  },
  {
    id: 'marimba', sustain: true, name: 'Marimba', icon: 'music-4', category: 'Musical', pitched: true, baseNote: 72, fx: FxStyle.NOTES,
    description: 'Warm wooden mallet tones.',
    variants: ['marimba.wav'],
  },
  {
    id: 'drums', name: 'Drum Kit', icon: 'drum', category: 'Musical', fx: FxStyle.CONFETTI,
    description: 'Every key is a drum. Space is the kick, Enter the crash.',
    variants: ['drum_hat.wav', 'drum_snare.wav', 'drum_tom_hi.wav', 'drum_tom_lo.wav', 'drum_hat_open.wav'],
    special: { Space: 'drum_kick.wav', Enter: 'drum_crash.wav' },
  },
  {
    id: 'pewpew', sustain: true, name: 'Pew Pew', icon: 'zap', category: 'Action', fx: FxStyle.LASER,
    description: 'Sci-fi laser blasts.',
    variants: range('pewpew', 3),
  },
  {
    id: 'shotgun', name: 'Shotgun', icon: 'crosshair', category: 'Action', fx: FxStyle.BULLET,
    description: 'Full blast on every key. Enter racks the pump.',
    variants: ['shotgun.wav'],
    special: { Enter: 'shotgun_pump.wav' },
  },
  {
    id: 'swoosh', sustain: true, name: 'Ninja Swoosh', icon: 'swords', category: 'Action', fx: FxStyle.SLASH,
    description: 'Fast blade swipes.',
    variants: range('swoosh', 3),
  },
  {
    id: 'coin', sustain: true, name: 'Retro Coin', icon: 'coins', category: 'Retro', baseNote: 83, fx: FxStyle.ICON,
    description: '8-bit coin pickup.',
    variants: ['coin.wav'],
  },
  {
    id: 'jump', sustain: true, name: '8-bit Jump', icon: 'gamepad-2', category: 'Retro', fx: FxStyle.ICON,
    description: 'Platformer jump sounds.',
    variants: range('jump', 2),
  },
  {
    id: 'bubble', sustain: true, name: 'Bubble Pop', icon: 'droplets', category: 'Funny', fx: FxStyle.BUBBLES,
    description: 'Short, satisfying bloops.',
    variants: range('bubble', 3),
  },
  {
    id: 'boing', sustain: true, name: 'Boing', icon: 'activity', category: 'Funny', baseNote: 57, fx: FxStyle.ICON,
    description: 'Cartoon spring.',
    variants: ['boing.wav'],
  },
  {
    id: 'squeak', sustain: true, name: 'Squeaky Toy', icon: 'bird', category: 'Funny', fx: FxStyle.ICON,
    description: 'Rubber duck squeaks.',
    variants: range('squeak', 3),
  },
  {
    id: 'bonk', name: 'Bonk', icon: 'hammer', category: 'Funny', fx: FxStyle.ICON,
    description: 'Hollow wooden cartoon bonk.',
    variants: range('bonk', 2),
  },
]);

/** UI sound id → sample file. */
export const SYSTEM_SOUND_FILES = Object.freeze({
  [UiSound.COMBO]: 'ui_combo.wav',
  [UiSound.ACHIEVEMENT]: 'ui_achievement.wav',
});

/** Pseudo-pack shown in pickers for CHAOS_SOUND_ID. */
export const CHAOS_PACK = Object.freeze({
  name: 'Chaos Mode',
  icon: 'dices',
  description: 'A random pack on every key.',
});
