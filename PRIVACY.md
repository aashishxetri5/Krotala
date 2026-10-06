# Privacy Policy

Last updated: 7 October 2026

Krotala plays a sound when you press a key. To do that it has to notice every key press, which is a lot to ask, so this page explains exactly what it sees, what it keeps and what it sends. The short version: it keeps counts, never what you type, and it sends nothing about you anywhere.

## What the app sees while it runs

- **Key presses and mouse clicks**, in every app, so it can choose and play a sound at that moment.
- **The name of the app you are using** (for example `Code.exe`), so per-app sounds and muted apps work.
- **Whether another app is using your microphone or a full-screen app is open**, so it can mute itself during calls, games and presentations.
- **Where the text cursor is**, so on-screen effects appear where you type.

None of this is recorded except for the counts listed below.

## What the app stores

Everything is stored in files on your computer:

- **Settings**, including the sound packs you picked for specific apps (stored by program name).
- **Sound packs you create**, made from audio files you import or sounds you record.
- **Typing stats:**
  - how many times each key was pressed, in total
  - how many keys you pressed each day
  - how long you spent typing each day
  - your best typing speed and longest combo
  - which built-in packs you have tried
  - the achievements you have unlocked

The app never stores the text you type, the order of your key presses, or which app a key was pressed in.

## Microphone

The microphone is used only while you record a sound in the pack editor, after you press Record. The recording is saved as a sound in your pack and goes nowhere else.

## What the app sends

- **Microsoft Store version:** nothing. The Store installs updates.
- **Version downloaded from GitHub:** a check for new versions on GitHub Releases, 10 seconds after the app starts and then every 6 hours. You can turn this off under Settings → Updates. Like any web request, it reveals your IP address and the app version to GitHub. [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement) covers how GitHub handles that.

There are no analytics, no crash reports, no ads and no accounts.

## Sharing

A `.kbpack` file contains only the sounds and settings of one pack. It is created only when you export a pack, and you decide who gets it.

## Deleting your data

- **Stats:** Settings → Privacy → Reset stats.
- **Packs you made:** delete them on the Sounds page.
- **Everything:**
  - Microsoft Store version: uninstalling removes all of its data.
  - Installer version: after uninstalling, delete `%APPDATA%\Krotala`.
  - Linux: delete `~/.config/Krotala`.

## Changes

If this policy changes, the new version will be published here with a new date. A change that collects more data would also be listed in the release notes.

## Contact

Questions or concerns: [open an issue on GitHub](https://github.com/aashishxetri5/krotala/issues).
