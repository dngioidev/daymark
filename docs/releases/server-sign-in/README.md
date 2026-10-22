# Server sign-in

Date: 2026-10-22 · Branch: `feat/server-sign-in` · Tag: none

## What shipped

- **Sign in before opening your notebook.** Visit your Daymark server and enter your username and password. The site needs sign-in in development and production. App code files stay public but contain no user data; reading or changing notes needs an access token.
- **Stay signed in on each device.** Access tokens last **15 minutes**. Refresh tokens last **30 days**, renewed on every refresh, so there is no idle lock while you keep using the device. Each refresh replaces the old token. Reusing a retired refresh token signs that device out; a refresh response lost on a bad connection can also mean signing in again. Other devices stay signed in.
- **Sign out clears the browser.** In **Settings → Sync**, the account view shows Server, Account, This device, **Sync now** and **Sign out**. Sign-out tries to sync first, then removes the local vault, sync state and cached app files. If the server cannot be reached or changes are still unsent, **Sign out?** shows how many changes would be lost. **Cancel** keeps your notes here; **Sign out anyway** discards the browser copy.
- **Control signed-in devices.** Changing the password signs out every device, including the one making the change. Remote sign-out also ends that device's session. When a browser next learns its session has ended, its local copy is wiped without an unsent-change confirmation. Android keeps its local notes.
- **Android still works without an account.** The first-run screen, **Welcome to Daymark**, offers **Sign in to sync** alongside **Start fresh** for local use, sample data and restoring a backup. Sign-in opens **Settings → Sync** for the server address, username, password and device name, then **Connect and sync**. You can also connect later; existing local notes merge on first sync. **Disconnect this device** stops syncing and keeps the phone's local copy.
- **Web sync uses its own server.** The server-hosted browser app always syncs with that server, with no local-only choice or server-address field. A signed-in PWA can still edit offline and sync when back online. A web build hosted on another origin is local-only; use **Backup & restore** to move notes.

## Upgrade and self-hosting

After upgrading, **every device signs in once more**. The old 90-day tokens no longer work. Replace `DAYMARK_TOKEN_TTL_DAYS` with `DAYMARK_REFRESH_TTL_DAYS` (default **30**). The access-token lifetime stays at **15 minutes**.

Use a positive, finite refresh lifetime or leave it unset. Values ≤ 0 or invalid should fall back to 30, but the current parser does not reject negative numbers or `Infinity`; this needs a separate server fix. Missing, empty, nonnumeric and zero values already fall back to 30.

**Plain HTTP is for LAN only:** its refresh cookie is not `Secure`. Use HTTPS (e.g. Caddy) on a public address. The server keeps the refresh token in an `HttpOnly`, `SameSite=Strict` cookie; data routes still require a Bearer access token. The account remains the single self-hosted account created on first start from `DAYMARK_USER` (default `admin`) and `DAYMARK_PASSWORD`.

See the [self-hosting instructions](../../../README.md#self-hosting-the-sync-server) and [configuration/API reference](../../../.ai-configs/project/api-and-sync.md).

## Screenshots

Capture is pending on the controller: `node scripts/capture-screenshots.mjs server-sign-in`. These are the three configured views; images have not been generated or visually checked in the sandbox.

| Screen | Image |
| :--- | :--- |
| Desktop 1440×900: signed-out sign-in page | ![Sign in](images/sign-in.png) |
| Phone 412×915: Settings → Sync account and Sign out (server web mode) | ![Sync account](images/sync-account.png) |
| Phone 412×915: Sign out? after adding a change while the API is unreachable | ![Sign-out warning](images/sign-out-warning.png) |

The Android first-run screen is described above. It requires the native app and cannot be captured by the browser screenshot script; the phone screenshots show the server web app at an Android viewport size.

## How it was verified

Documentation was checked against the design and the implemented configuration, API, gate, sync hook and account panel. `npm run lint` and `node --check scripts/capture-screenshots.mjs` pass. `npm run validate:ai` fails because the three screenshot files are still missing (three image links and the release screenshot check). No server, browser or screenshot capture was started in this sandbox; the new capture entries still need a live run and visual review.

## Known gaps

- The controller must capture and inspect the three screenshots above. Link and release-image validation will fail until those files exist.
- Refresh lifetime validation still accepts negative and non-finite numbers; use a positive, finite value or the default until corrected.
- Native Android first-run behaviour is described from the current UI code, without a new device capture.
