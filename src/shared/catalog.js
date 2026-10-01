// Built-in sound packs. Each file lives in assets/sounds/ and is produced by
// scripts/generate-sounds.js — edit both together.
//
//   variants : one is picked per key (stable per key, so every key has its own voice)
//   special  : optional per-key replacements built into the pack (e.g. typewriter bell on Enter)
//   release  : optional key-up sounds (used when "Key release sound" is set to "Pack default")
//   pitched  : tonal sound that works best with Melody / Song mode
//   baseNote : MIDI note the recording is pitched at, so Song mode plays in tune (default 60 = C4)
//   fx       : on-screen effect style used when the effect style is "Auto"

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${i}.wav`);

const BUILT_IN_SOUNDS = [
  {
    id: 'dialpad', name: 'Dial Pad', emoji: '📞', category: 'Classic', fx: 'ripple',
    description: 'Real DTMF phone tones — digits play their own tone',
    variants: range('dialpad', 12),
  },
  {
    id: 'mechanical', name: 'Mechanical', emoji: '⌨️', category: 'Classic', fx: 'ripple',
    description: 'Clicky switches with a deep spacebar thock',
    variants: range('mechanical', 4),
    special: { Space: 'mechanical_space.wav', Enter: 'mechanical_space.wav' },
    release: range('mechanical_up', 4),
  },
  {
    id: 'typewriter', name: 'Typewriter', emoji: '📠', category: 'Classic', fx: 'emoji',
    description: 'Clacky keys, and a bell when you hit Enter',
    variants: range('typewriter', 3),
    special: { Enter: 'typewriter_bell.wav' },
  },
  {
    id: 'piano', name: 'Piano', emoji: '🎹', category: 'Musical', pitched: true, baseNote: 60, fx: 'notes',
    description: 'Grand-ish piano. Try Melody or Song mode!',
    variants: ['piano.wav'],
  },
  {
    id: 'harmonium', name: 'Harmonium', emoji: '🪗', category: 'Musical', pitched: true, baseNote: 60, fx: 'notes',
    description: 'Reedy bellows organ',
    variants: ['harmonium.wav'],
  },
  {
    id: 'marimba', name: 'Marimba', emoji: '🪘', category: 'Musical', pitched: true, baseNote: 72, fx: 'notes',
    description: 'Warm wooden mallet tones',
    variants: ['marimba.wav'],
  },
  {
    id: 'drums', name: 'Drum Kit', emoji: '🥁', category: 'Musical', fx: 'confetti',
    description: 'Every key is a drum. Space = kick, Enter = crash',
    variants: ['drum_hat.wav', 'drum_snare.wav', 'drum_tom_hi.wav', 'drum_tom_lo.wav', 'drum_hat_open.wav'],
    special: { Space: 'drum_kick.wav', Enter: 'drum_crash.wav' },
  },
  {
    id: 'pewpew', name: 'Pew Pew', emoji: '🔫', category: 'Action', fx: 'laser',
    description: 'Sci-fi laser blasts',
    variants: range('pewpew', 3),
  },
  {
    id: 'shotgun', name: 'Shotgun', emoji: '💥', category: 'Action', fx: 'bullet',
    description: 'BOOM. Enter racks the pump',
    variants: ['shotgun.wav'],
    special: { Enter: 'shotgun_pump.wav' },
  },
  {
    id: 'swoosh', name: 'Ninja Swoosh', emoji: '🥷', category: 'Action', fx: 'slash',
    description: 'Swift blade swipes',
    variants: range('swoosh', 3),
  },
  {
    id: 'coin', name: 'Retro Coin', emoji: '🪙', category: 'Retro', baseNote: 83, fx: 'emoji',
    description: '8-bit coin pickup',
    variants: ['coin.wav'],
  },
  {
    id: 'jump', name: '8-bit Jump', emoji: '🍄', category: 'Retro', fx: 'emoji',
    description: 'Boing-boing platformer hops',
    variants: range('jump', 2),
  },
  {
    id: 'bubble', name: 'Bubble Pop', emoji: '🫧', category: 'Funny', fx: 'bubbles',
    description: 'Satisfying little bloops',
    variants: range('bubble', 3),
  },
  {
    id: 'boing', name: 'Boing', emoji: '🌀', category: 'Funny', baseNote: 57, fx: 'emoji',
    description: 'Cartoon spring',
    variants: ['boing.wav'],
  },
  {
    id: 'squeak', name: 'Squeaky Toy', emoji: '🐤', category: 'Funny', fx: 'emoji',
    description: 'Rubber duck energy',
    variants: range('squeak', 3),
  },
  {
    id: 'bonk', name: 'Bonk', emoji: '🔨', category: 'Funny', fx: 'emoji',
    description: 'Wooden cartoon bonk',
    variants: range('bonk', 2),
  },
];

// UI sounds that aren't packs (combo milestones, achievements).
const SYSTEM_SOUNDS = {
  combo: 'ui_combo.wav',
  achievement: 'ui_achievement.wav',
};

// Pseudo-pack: picks a random built-in pack on every keystroke.
const CHAOS_ID = '__chaos';

module.exports = { BUILT_IN_SOUNDS, SYSTEM_SOUNDS, CHAOS_ID };
