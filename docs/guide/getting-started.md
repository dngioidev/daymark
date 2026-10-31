---
title: Getting started and install
order: 1
---
## Web
Open your Daymark server in a modern browser and sign in. On a fresh device, choose an empty vault or sample data when offered. Your daily notebook is ready on Today. Use New task to capture something small, then tick it when finished. Notes provides a separate place for longer writing.

You can install the web app from your browser's installation menu. After the first successful load, the installed app can open offline. Keep a backup before clearing browser data: that browser profile holds your local vault. Sync connects other devices through your own server; it does not replace a backup.
## Mobile
Download the Android APK from Daymark's release page. Android may ask you to allow installation from your browser or file manager. Updates signed with the same key preserve local data. Connect to your server in Settings for sync. Back up before uninstalling or clearing app data.

You can also install the web app from your phone's browser menu; it works offline.

**One-time switch from debug to release:** sync or back up first, uninstall the debug-signed app, install the signed APK, then sign in again. Uninstalling deletes device-only data. The new signing key requires this: Android refuses to update an app signed with a different key.

### Building signed Android releases
Create the release key once, outside the repository:
```sh
keytool -genkeypair -v -keystore <path outside repo> -alias daymark -keyalg RSA -keysize 4096 -validity 36500
```
Keep the keystore outside the repository. Back up the key and passwords securely in separate locations; losing them prevents future updates from installing over the app.

Supply `DAYMARK_KEYSTORE`, `DAYMARK_KEYSTORE_PASSWORD`, `DAYMARK_KEY_ALIAS`, `DAYMARK_KEY_PASSWORD` through environment variables, or create git-ignored `mobile/android/keystore.properties`:
```properties
storeFile=D:/private/daymark-release.jks
storePassword=<store password>
keyAlias=daymark
keyPassword=<key password>
```
Use an absolute path with forward slashes; Java properties escaping applies. Each nonempty environment value overrides its file property. Keep passwords private; never commit signing inputs.

Run `npm run android:build -- --release`; add `--test` to run `testReleaseUnitTest` before `assembleRelease`. Missing signing inputs fail without a debug-key fallback. The signed output is `mobile/android/app/build/outputs/apk/release/app-release.apk`. Publish it as `daymark-X.Y.Z.apk` with `SHA256SUMS`. Without `--release`, builds remain debug builds requiring no release key.
