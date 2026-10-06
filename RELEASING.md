# Releasing

Windows ships two ways: through the **Microsoft Store**, which signs the app so Windows trusts it, and as an **installer on GitHub Releases**. Linux ships as an AppImage on GitHub Releases. There is no macOS release.

## 1. Prepare

1. Update `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Run `npm run lint` and `npm test`.
3. Commit, then tag and push:

   ```bash
   git tag v1.0.0
   git push origin main --tags
   ```

The Release workflow builds the Windows installer and the Linux AppImage and attaches them to a **draft** release. Drafts are visible only to people with write access to the repository, so nothing is public yet.

## 2. Check the draft before publishing

Open the draft under **Releases** on GitHub and download the `.exe`.

1. **Install it on a clean account.** Your own account already has settings and stats from development, which can hide first-run problems. Create a test account under Settings → Accounts → Other users → Add account → "I don't have this person's sign-in information" → "Add a user without a Microsoft account". Sign in to it, install the app, then check:
   - sounds play in other apps
   - the tray icon works
   - effects appear
   - "Start with your computer" works after you sign out and back in
   - the app uninstalls cleanly

   Delete the test account afterwards.
2. **Scan it.** Upload the `.exe` and the `.AppImage` to [VirusTotal](https://www.virustotal.com). It checks the file against about 70 antivirus engines. Apps that listen to the keyboard sometimes get flagged by mistake. A detection or two from little-known engines is common for unsigned apps. If Microsoft Defender or another major engine flags it, report it as a false positive before publishing; for Microsoft, use [submit a file](https://www.microsoft.com/wdsi/filesubmission) and choose "Software developer".
3. **Publish** the draft. Installed copies from GitHub see the update within 6 hours and install it the next time they quit.

## 3. Microsoft Store

### First time

1. Create a free individual developer account at [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com).
2. In [Partner Center](https://partner.microsoft.com/dashboard), go to **Apps and games → New product → MSIX or PWA app** and reserve the app's name. Store names are unique, so reserve it early.
3. Open **Product management → Product identity**. Copy these three values into `build.appx` in `package.json`:

   | Partner Center | `package.json` key |
   | --- | --- |
   | Package/Identity/Name | `identityName` |
   | Package/Identity/Publisher | `publisher` |
   | Package/Properties/PublisherDisplayName | `publisherDisplayName` |

   Without them the package gets placeholder values and Partner Center rejects it.
4. Run `npm run dist:store`. This creates `dist/Krotala-<version>.appx`. It is unsigned, which is expected: the Store signs it after review.
5. Start a submission:
   - **Pricing and availability:** free. Set **Visibility** to *Private audience* for the first submission, so you can install the Store build yourself before anyone else sees it.
   - **Properties:** category *Music*. Link the privacy policy: `https://github.com/aashishxetri5/krotala/blob/main/PRIVACY.md`.
   - **Age ratings:** answer the questionnaire. The app has no user-generated content, chat or purchases.
   - **Packages:** upload the `.appx`.
   - **Submission options → Restricted capabilities:** the package asks for `runFullTrust`, as every desktop app does. Explain: *"Desktop app built with Electron. Full trust is needed to play a sound for key presses in other apps; key presses are counted for local statistics and never stored or sent anywhere."*
   - **Store listing:** a description and at least one screenshot (1366×768 or larger).
6. Submit. Certification usually takes up to three business days.
7. Install the app from your private Store link and repeat the checks from step 2. Then change Visibility to public.

### Updates

Bump the version, run `npm run dist:store`, and create a new submission with the new package. The Store installs updates for its users. The app's own updater is switched off in Store installs, and the "Start with Windows" option is managed in Windows Settings.

## Code signing for the GitHub installer (later)

The GitHub installer is unsigned, so Windows shows "Windows protected your PC" until the user chooses **More info → Run anyway**. Signing it is optional while the Store is the main download. Even a signed installer shows that warning until enough people have downloaded it. Options:

- [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/): about $10/month. For individuals it is available only in the USA and Canada. electron-builder supports it through `win.azureSignOptions`.
- [SignPath Foundation](https://signpath.org): free for open-source projects that are already released and in use. You approve each release by hand.
- An OV code-signing certificate from a certificate authority: about $150–300/year.

Avoid EV certificates: since 2024 they no longer skip the warning.
