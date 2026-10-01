/**
 * @file JSDoc type definitions shared across processes. This module exports nothing at runtime.
 */

/**
 * A sound pack, built-in or created by the user.
 * @typedef {object} SoundPack
 * @property {string} id - Stable identifier (`custom:<hex>` for user packs).
 * @property {string} name - Display name.
 * @property {string} icon - Icon name from src/shared/icons.js.
 * @property {string} category - One of SOUND_CATEGORIES.
 * @property {string} description - One-line description shown on the card.
 * @property {string[]} variants - Sample files; each key is mapped to one of them.
 * @property {Record<string, string>} [special] - Key name → sample that replaces the variant for that key.
 * @property {string[]} [release] - Key-up samples.
 * @property {boolean} [pitched] - Tonal sound that suits Melody and Song mode.
 * @property {number} [baseNote] - MIDI note the samples are recorded at (default 60).
 * @property {string} [fx] - Default on-screen effect style.
 * @property {boolean} [builtIn] - True for packs shipped with the app.
 * @property {boolean} [custom] - True for user packs.
 */

/**
 * Which sample of a pack to play.
 * @typedef {{ type: 'variant' | 'release', index: number } | { type: 'special', key: string }} SampleSlot
 */

/**
 * Instruction sent to the audio engine to play one sample.
 * @typedef {object} PlayCommand
 * @property {string} soundId - Pack id (or a UI sound id).
 * @property {SampleSlot} slot - Sample within the pack.
 * @property {number} rate - Playback rate (pitch); 1 is natural.
 * @property {number} pan - Stereo position from -1 (left) to 1 (right).
 * @property {number} gain - Linear gain applied before the master volume.
 */

/**
 * Result of mapping a key press: what to play and how to draw it.
 * @typedef {PlayCommand & { songNote: boolean, fx: string, icon: string }} KeyPlayback
 */

/**
 * Per-app profile.
 * @typedef {object} AppProfile
 * @property {string} app - Executable name, e.g. `Code.exe`.
 * @property {string} soundId - Pack id, CHAOS_SOUND_ID or MUTE.
 */

/**
 * Persisted user settings. Defaults live in src/main/settings/schema.js.
 * @typedef {object} Settings
 * @property {boolean} enabled
 * @property {number} volume - 0..1.
 * @property {string} soundId
 * @property {string} pitchMode - One of PitchMode.
 * @property {string} songId
 * @property {boolean} stereo
 * @property {boolean} playOnRepeat
 * @property {boolean} mouseClicks
 * @property {string} keyUpSound - '' (off), PACK_DEFAULT or a pack id.
 * @property {Record<string, string>} overrides - OVERRIDE_KEYS → '' | MUTE | pack id.
 * @property {boolean} fxEnabled
 * @property {string} fxStyle - One of FxStyle.
 * @property {number} fxSize
 * @property {string} fxPosition - One of FxPosition.
 * @property {boolean} comboEnabled
 * @property {boolean} announcer
 * @property {AppProfile[]} profiles
 * @property {boolean} autoMuteMic
 * @property {boolean} autoMuteFullscreen
 * @property {boolean} launchAtLogin
 * @property {boolean} autoUpdate
 * @property {SoundPack[]} customSounds
 * @property {boolean} hasShownTrayHint
 */

/**
 * Live state that is not persisted.
 * @typedef {object} RuntimeState
 * @property {string | null} app - Executable in the foreground, null when it is this app.
 * @property {string} appLabel - `app` without the extension.
 * @property {string | null} muteReason - Why sounds are silent right now, or null.
 * @property {string} profileSoundId - Pack chosen by the active app profile, or ''.
 * @property {boolean} micActive
 * @property {string[]} recentApps - Recently focused executables, newest first.
 * @property {{ appDetection: boolean, micDetection: boolean }} features
 */

export {};
