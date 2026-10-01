# Keyboard Sounds

Plays a sound on every keystroke, anywhere in Windows, like a phone dial pad but with shotguns, lasers, pianos, drums and squeaky toys. It runs in the system tray, and a dashboard lets you pick sounds, set the volume and more.

## Run it

```bash
npm install
npm start
```

The app opens the dashboard and puts an icon in the tray. Closing the dashboard hides it, and the sounds keep playing. To quit, right-click the tray icon.

## Features

- **16 built-in sound packs**, all synthesized by code: Dial Pad (real DTMF tones), Mechanical, Typewriter, Piano, Harmonium, Marimba, Drum Kit, Pew Pew, Shotgun, Ninja Swoosh, Retro Coin, 8-bit Jump, Bubble Pop, Boing, Squeaky Toy, Bonk.
- **Chaos Mode** plays a random pack on every key.
- **Your own sounds**: add WAV/MP3/OGG/FLAC/M4A files from the dashboard.
- **Pitch modes**:
  - *Off*
  - *Wobble*: a random slight detune on each press.
  - *Melody*: each key is a note on a pentatonic scale, so any typing sounds musical.
- **Per-key voices**: packs with several variants give each key its own sound. Packs can also have special keys, such as the typewriter bell on Enter or the kick drum on Space.
- **Special-key overrides**: give Enter, Space or Backspace a different sound, or silence them.
- Volume, an on/off switch, sound on key-repeat, mouse-click sounds, and launch at startup (starts in the tray).
- **Global mute hotkey**: `Ctrl + Alt + M`.
- Tray menu for quick switching of sound and volume.
- Keystroke counter for today and all time. Keys are only counted, never recorded.

## Project layout

```
assets/sounds/          generated WAV files, not committed (rebuilt by `npm start`)
scripts/
  generate-sounds.js    synthesizes every built-in sound (npm run sounds)
  check-catalog.js      verifies every catalog file exists (npm run check)
src/
  shared/catalog.js     list of built-in packs (names, emoji, variants, special keys)
  main/                 Electron main process
    main.js             tray, windows, global keyboard hook, IPC
    settings.js         persisted settings (%APPDATA%/Keyboard Sounds/settings.json)
    sounds.js           built-in + custom sound library
    icon.js             procedurally drawn app/tray icon
  preload.js            whitelisted IPC bridge
  renderer/
    audio/              hidden window running the Web Audio engine
    dashboard/          settings UI
```

**How it works:** [uiohook-napi](https://github.com/SnosMe/uiohook-napi) hooks the keyboard at the OS level from the main process. Each key press is sent over IPC to an invisible window. That window holds the decoded sound buffers and plays them through Web Audio, which gives low latency, lets sounds overlap without limit, and passes them through a limiter so fast typing doesn't clip.

## Adding a built-in sound

1. Add a recipe to `scripts/generate-sounds.js` that writes `yourpack.wav` (or `yourpack_0.wav`, `yourpack_1.wav`, … for variants).
2. Add an entry to `src/shared/catalog.js`.
3. Run `npm run sounds && npm run check`.

## Notes

- Windows blocks hooks in apps running as Administrator unless Keyboard Sounds also runs as Administrator. Keystrokes in those apps won't play sounds.
- If `npm start` behaves like plain Node (`Cannot read properties of undefined (reading 'commandLine')`), the variable `ELECTRON_RUN_AS_NODE` is set in your shell. Unset it first.
