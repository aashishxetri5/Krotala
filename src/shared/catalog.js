// Built-in sound packs. Each file lives in assets/sounds/ and is produced by
// scripts/generate-sounds.js — edit both together.
//
//   variants : one is picked per key (stable per key, so every key has its own voice)
//   special  : optional per-key replacements built into the pack (e.g. typewriter bell on Enter)
//   pitched  : tonal sound that works best with "Melody" pitch mode

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${i}.wav`);

const BUILT_IN_SOUNDS = [
  {
    id: 'dialpad', name: 'Dial Pad', emoji: '📞', category: 'Classic',
    description: 'Real DTMF phone tones — digits play their own tone',
    variants: range('dialpad', 12),
  },
  {
    id: 'mechanical', name: 'Mechanical', emoji: '⌨️', category: 'Classic',
    description: 'Clicky switches with a deep spacebar thock',
    variants: range('mechanical', 4),
    special: { Space: 'mechanical_space.wav', Enter: 'mechanical_space.wav' },
  },
  {
    id: 'typewriter', name: 'Typewriter', emoji: '📠', category: 'Classic',
    description: 'Clacky keys, and a bell when you hit Enter',
    variants: range('typewriter', 3),
    special: { Enter: 'typewriter_bell.wav' },
  },
  {
    id: 'piano', name: 'Piano', emoji: '🎹', category: 'Musical', pitched: true,
    description: 'Grand-ish piano. Try Melody mode!',
    variants: ['piano.wav'],
  },
  {
    id: 'harmonium', name: 'Harmonium', emoji: '🪗', category: 'Musical', pitched: true,
    description: 'Reedy bellows organ',
    variants: ['harmonium.wav'],
  },
  {
    id: 'marimba', name: 'Marimba', emoji: '🪘', category: 'Musical', pitched: true,
    description: 'Warm wooden mallet tones',
    variants: ['marimba.wav'],
  },
  {
    id: 'drums', name: 'Drum Kit', emoji: '🥁', category: 'Musical',
    description: 'Every key is a drum. Space = kick, Enter = crash',
    variants: ['drum_hat.wav', 'drum_snare.wav', 'drum_tom_hi.wav', 'drum_tom_lo.wav', 'drum_hat_open.wav'],
    special: { Space: 'drum_kick.wav', Enter: 'drum_crash.wav' },
  },
  {
    id: 'pewpew', name: 'Pew Pew', emoji: '🔫', category: 'Action',
    description: 'Sci-fi laser blasts',
    variants: range('pewpew', 3),
  },
  {
    id: 'shotgun', name: 'Shotgun', emoji: '💥', category: 'Action',
    description: 'BOOM. Enter racks the pump',
    variants: ['shotgun.wav'],
    special: { Enter: 'shotgun_pump.wav' },
  },
  {
    id: 'swoosh', name: 'Ninja Swoosh', emoji: '🥷', category: 'Action',
    description: 'Swift blade swipes',
    variants: range('swoosh', 3),
  },
  {
    id: 'coin', name: 'Retro Coin', emoji: '🪙', category: 'Retro',
    description: '8-bit coin pickup',
    variants: ['coin.wav'],
  },
  {
    id: 'jump', name: '8-bit Jump', emoji: '🍄', category: 'Retro',
    description: 'Boing-boing platformer hops',
    variants: range('jump', 2),
  },
  {
    id: 'bubble', name: 'Bubble Pop', emoji: '🫧', category: 'Funny',
    description: 'Satisfying little bloops',
    variants: range('bubble', 3),
  },
  {
    id: 'boing', name: 'Boing', emoji: '🌀', category: 'Funny',
    description: 'Cartoon spring',
    variants: ['boing.wav'],
  },
  {
    id: 'squeak', name: 'Squeaky Toy', emoji: '🐤', category: 'Funny',
    description: 'Rubber duck energy',
    variants: range('squeak', 3),
  },
  {
    id: 'bonk', name: 'Bonk', emoji: '🔨', category: 'Funny',
    description: 'Wooden cartoon bonk',
    variants: range('bonk', 2),
  },
];

// Pseudo-pack: picks a random built-in pack on every keystroke.
const CHAOS_ID = '__chaos';

module.exports = { BUILT_IN_SOUNDS, CHAOS_ID };
