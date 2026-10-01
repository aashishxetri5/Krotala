/**
 * @file Melodies for Song mode, where each key press plays the next note.
 * Notes are MIDI numbers (60 = middle C). All melodies are in the public domain.
 */

/**
 * @typedef {object} Song
 * @property {string} id
 * @property {string} name
 * @property {string} composer
 * @property {readonly number[]} notes
 */

/** @type {readonly Song[]} */
export const SONGS = Object.freeze([
  {
    id: 'fur-elise',
    name: 'Für Elise',
    composer: 'Beethoven',
    notes: [
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72,
      64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69,
      71, 72, 74, 76, 67, 77, 76, 74, 65, 76, 74, 72, 64, 74, 72, 71,
    ],
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    composer: 'Beethoven',
    notes: [
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
      62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62, 55,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
    ],
  },
  {
    id: 'mountain-king',
    name: 'In the Hall of the Mountain King',
    composer: 'Grieg',
    notes: [
      57, 59, 60, 62, 64, 60, 64, 63, 59, 63, 62, 58, 62,
      57, 59, 60, 62, 64, 60, 64, 69, 67, 64, 60, 64, 67,
    ],
  },
  {
    id: 'twinkle',
    name: 'Twinkle Twinkle Little Star',
    composer: 'Traditional',
    notes: [
      60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60,
      67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62,
      60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60,
    ],
  },
  {
    id: 'happy-birthday',
    name: 'Happy Birthday',
    composer: 'Traditional',
    notes: [
      55, 55, 57, 55, 60, 59, 55, 55, 57, 55, 62, 60,
      55, 55, 67, 64, 60, 59, 57, 65, 65, 64, 60, 62, 60,
    ],
  },
  {
    id: 'jingle-bells',
    name: 'Jingle Bells',
    composer: 'J. Pierpont',
    notes: [
      64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64,
      65, 65, 65, 65, 65, 64, 64, 64, 64, 62, 62, 64, 62, 67,
      64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64,
      65, 65, 65, 65, 65, 64, 64, 64, 67, 67, 65, 62, 60,
    ],
  },
  {
    id: 'mary-lamb',
    name: 'Mary Had a Little Lamb',
    composer: 'Traditional',
    notes: [
      64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67,
      64, 62, 60, 62, 64, 64, 64, 64, 62, 62, 64, 62, 60,
    ],
  },
]);

/**
 * Finds a song by id.
 * @param {string} id - Song id.
 * @returns {Song} The matching song, or the first song when the id is unknown.
 */
export function songById(id) {
  return SONGS.find((s) => s.id === id) ?? SONGS[0];
}
