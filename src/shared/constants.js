/**
 * @file Constants shared by the main process, the preload bridge and every renderer.
 * Anything that more than one process needs to agree on lives here.
 */

export const APP_NAME = 'Keyboard Sounds';
export const APP_ID = 'com.keyboardsounds.app';

/** Sound id meaning "a random built-in pack on every key". */
export const CHAOS_SOUND_ID = '__chaos';

/** Override / profile value meaning "play nothing". */
export const MUTE = 'mute';

/** `keyUpSound` value meaning "use the active pack's own release sound". */
export const PACK_DEFAULT = 'pack';

/** Prefix of ids for UI sounds that are not user-selectable packs. */
export const UI_SOUND_PREFIX = 'ui:';

/** UI sounds played on milestones. */
export const UiSound = Object.freeze({
  COMBO: 'ui:combo',
  ACHIEVEMENT: 'ui:achievement',
});

export const PitchMode = Object.freeze({
  OFF: 'off',
  WOBBLE: 'wobble',
  MELODY: 'melody',
  SONG: 'song',
});

export const FxStyle = Object.freeze({
  AUTO: 'auto',
  ICON: 'icon',
  NOTES: 'notes',
  RIPPLE: 'ripple',
  CONFETTI: 'confetti',
  BUBBLES: 'bubbles',
  BULLET: 'bullet',
  LASER: 'laser',
  SLASH: 'slash',
});

export const FxPosition = Object.freeze({
  CARET: 'caret',
  MOUSE: 'mouse',
  RANDOM: 'random',
});

/** Keys and key groups that can be given their own sound. A key beats its group. */
export const OVERRIDE_KEYS = Object.freeze([
  'Enter', 'Space', 'Backspace', 'Tab', 'Letters', 'Numbers', 'Modifiers', 'Arrows', 'Mouse',
]);

/** Keys a sound pack may replace with a dedicated sample. */
export const PACK_SPECIAL_KEYS = Object.freeze(['Enter', 'Space', 'Backspace', 'Tab']);

export const SOUND_CATEGORIES = Object.freeze(['Classic', 'Musical', 'Action', 'Retro', 'Funny', 'Custom']);
export const CUSTOM_CATEGORY = 'Custom';

/** Icons a user can pick for their own packs (names from src/shared/icons.js). */
export const CUSTOM_PACK_ICONS = Object.freeze([
  'music', 'audio-waveform', 'mic', 'bell', 'star', 'heart', 'ghost', 'rocket',
  'flame', 'zap', 'guitar', 'drum', 'gamepad-2', 'cat', 'radio', 'disc-3',
]);
export const DEFAULT_CUSTOM_ICON = 'music';

export const AUDIO_EXTENSIONS = Object.freeze(['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm']);
export const PACK_EXTENSION = 'kbpack';

export const Limits = Object.freeze({
  VOLUME_MIN: 0,
  VOLUME_MAX: 1,
  FX_SIZE_MIN: 0.5,
  FX_SIZE_MAX: 2,
  MAX_PROFILES: 50,
  MAX_ID_LENGTH: 100,
  PACK_NAME_LENGTH: 32,
  PACK_DESCRIPTION_LENGTH: 120,
  MAX_IMPORT_BYTES: 10 * 1024 * 1024,
  MAX_PACK_BYTES: 30 * 1024 * 1024,
  MAX_PACK_FILES: 64,
  MAX_RECORDING_BYTES: 5 * 1024 * 1024,
  MAX_RECORDING_MS: 4000,
});

/** Rules that define the typing statistics. The Stats page explains them to users. */
export const StatsRules = Object.freeze({
  /** Longest pause between two keys that keeps a combo going. */
  COMBO_WINDOW_MS: 700,
  /** Best speed is the fastest rate held over this window. */
  SPEED_WINDOW_MS: 10_000,
  /** Gaps between characters up to this long count as time spent typing. */
  ACTIVE_GAP_MS: 2000,
  /** A word is five characters, as in typing tests. */
  CHARS_PER_WORD: 5,
  /** Faster bursts are key mashing, not typing, and are left out of speed stats. */
  MAX_TYPING_WPM: 200,
});

export const UpdateStatus = Object.freeze({
  DEV: 'dev',
  UNAVAILABLE: 'unavailable',
  IDLE: 'idle',
  CHECKING: 'checking',
  LATEST: 'latest',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  ERROR: 'error',
});

export const BannerKind = Object.freeze({
  COMBO: 'combo',
  ACHIEVEMENT: 'achievement',
});

export const ToastKind = Object.freeze({
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  ACHIEVEMENT: 'achievement',
});

/** Request/response channels (renderer → main, `ipcRenderer.invoke`). */
export const Invoke = Object.freeze({
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SOUNDS_LIST: 'sounds:list',
  SOUND_DATA: 'sounds:data',
  STATS_GET: 'stats:get',
  RUNTIME_GET: 'runtime:get',
  APP_INFO: 'app:info',
  SONG_PROGRESS: 'song:progress',
  SONG_RESTART: 'song:restart',
  UPDATES_GET: 'updates:get',
  UPDATES_CHECK: 'updates:check',
  UPDATES_INSTALL: 'updates:install',
  MIC_REQUEST: 'mic:request',
  PACKS_IMPORT: 'packs:import',
  PACKS_ADD_FILES: 'packs:add-files',
  PACKS_UPDATE: 'packs:update',
  PACKS_REMOVE_VARIANT: 'packs:remove-variant',
  PACKS_DELETE: 'packs:delete',
  PACKS_EXPORT: 'packs:export',
  PACKS_SAVE_RECORDING: 'packs:save-recording',
  PROFILES_BROWSE: 'profiles:browse',
});

/** Fire-and-forget channels (renderer → main, `ipcRenderer.send`). */
export const Send = Object.freeze({
  PREVIEW: 'sound:preview',
  AUDIO_ERROR: 'audio:error',
});

/** Push channels (main → renderer). */
export const Push = Object.freeze({
  SETTINGS: 'push:settings',
  STATS: 'push:stats',
  RUNTIME: 'push:runtime',
  UPDATES: 'push:updates',
  SOUNDS_CHANGED: 'push:sounds-changed',
  TOAST: 'push:toast',
  PLAY: 'push:play',
  FX: 'push:fx',
  COMBO: 'push:combo',
  BANNER: 'push:banner',
});
