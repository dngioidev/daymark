# Building signed Android releases

Developer notes, moved out of the user guide (docs/guide/getting-started.md) in Cycle 18.

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
