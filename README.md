# Daymark

> **A local-first daily Markdown notebook that carries unfinished tasks forward, lets you record when work was really done, and warns you about tasks that keep slipping.**

Each day is a plain Markdown note. Unfinished tasks move to today automatically, keeping their history; tasks that keep getting carried get amber and red aging alerts. Notes stay on your device, work offline, export as an Obsidian-compatible vault, and can optionally sync between your phone and computers through a server you run yourself.

Website and Android download: **https://dngioidev.github.io/daymark/** · [Latest release](https://github.com/dngioidev/daymark/releases/latest) · Release notes per cycle: [`docs/releases/`](./docs/releases/).

---

## Get it

| Platform | How |
| :--- | :--- |
| **Android app** (with home-screen widget) | `npm run android:build`, then install `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (USB: `adb install -r …`, or copy the file to the phone). Debug build, sideloaded. |
| **Any browser / installable PWA** | Open the server address (below) in Chrome, Edge or Safari and choose *Install* / *Add to Home Screen*. Works offline after the first visit. |
| **Self-hosted server** (sync + serves the PWA) | `DAYMARK_PASSWORD='choose-a-strong-one' docker compose up -d` |

### Self-hosting the sync server
The server stores your vault in plain JSON files under `./data` and also serves the web app.

**Docker (recommended)**
```bash
DAYMARK_PASSWORD='choose-a-strong-one' docker compose up -d
```

**Node 20+**
```bash
npm ci && npm run build
DAYMARK_PASSWORD='choose-a-strong-one' npm start
```

Open `http://<server-ip>:3000` in your browser and **Sign in** with the user `admin` (or `DAYMARK_USER`) and your password. The site needs sign-in before you can use the notebook, in development and production. App code files stay public but contain no user data; data routes require an access token. The browser syncs with the server that serves it, with no server-address field or local-only choice. A web build hosted on another origin is local-only; use **Backup & restore** to move its notes.

On Android, **Sign in to sync** on the welcome screen opens **Settings → Sync**: enter your server address, username, password and a name for the device, then **Connect and sync**. To use the app locally, choose **Start fresh** instead; you can connect later. Existing local notes merge into the server on first sign-in. The password is only read on the first start (8+ characters); change it later from the app.

Access tokens last **15 minutes**. Refresh tokens last **30 days**, renewed on each refresh, so active devices stay signed in. `DAYMARK_REFRESH_TTL_DAYS` replaces `DAYMARK_TOKEN_TTL_DAYS`; after upgrading, every device must sign in once more. Each refresh replaces the previous refresh token. Reusing a retired token signs that device out; a lost response on a bad connection can also mean signing in again. Changing the password signs out every device, including the current one.

**Sign out** in **Settings → Sync** first tries to sync, then removes the vault, sync state and cached app files from that browser. If the server cannot be reached or edits are still unsent, a warning shows how many changes would be lost: choose **Cancel** to keep working or **Sign out anyway** to discard them. Android's **Disconnect this device** stops syncing and keeps its local notes. Remote sign-out or a password change wipes the browser copy when it next learns the session has ended; Android keeps its local copy.

**Plain HTTP is for LAN only:** the sign-in cookie is not `Secure` there. Use HTTPS (e.g. Caddy) on a public address. Full configuration and API reference: [`.ai-configs/project/api-and-sync.md`](./.ai-configs/project/api-and-sync.md). See the [server sign-in release notes](./docs/releases/server-sign-in/README.md) for the screens and upgrade notes.

Behind a reverse proxy in Docker, set `DAYMARK_TRUST_PROXY=uniquelocal` (default: `loopback`) so Express trusts the private proxy hop for HTTPS cookies and per-client sign-in limits. Limit trust to your proxy network and bind the published port to loopback so clients cannot supply trusted forwarding headers directly. For Caddy running on the host, use this Compose configuration and proxy to `127.0.0.1:3000`:

```yaml
services:
  daymark:
    ports:
      - "127.0.0.1:3000:3000" # replace the default 3000:3000 mapping
    environment:
      DAYMARK_TRUST_PROXY: uniquelocal
```

### Your data
- Stored in the browser/app (IndexedDB) on each device. The server-hosted web app syncs automatically after sign-in; Android sync is optional and a standalone web build stays local-only.
- **Settings → Backup & restore → Back up now** saves a ZIP of Markdown files (plus a full snapshot); **Choose a backup file…** restores one. A technical JSON backup is under **Advanced**. On Android the file opens in the share sheet (save to Drive, Files, email…). Restoring while sync is on merges the backup with your server instead of deleting anything.
- Uninstalling the app or clearing site data deletes the local vault, so keep a backup or use sync.

---

## Features

- **Your own look:** choose Light or Dark, header and text colours, text size, and up to five background photos with dim and blur. Photos stay on this device; appearance settings sync.
- **Calendar:** plan future days, switch between month and week, and open any day to write. Week view shows seven full-width day rows with every task, two task columns on desktop and one on phones. Drag a task onto today or a future day on desktop.
- **Daily habits:** open the Habits bar above Today’s tasks to tick your daily list, see streaks and missed-day warnings, or edit names, order and warning days. Correct past ticks in Calendar. Habits stay separate from task totals and daily Markdown; backups include them.
- **Roomier Today:** full-width lists and Markdown, collapsible sections, a seven-day progress strip and the next planned day. Move a task to tomorrow or another date, with Undo.
- **Notes:** a full-height editor, focus mode, word count and Blank, Meeting, Daily review and Decision record templates.
- **Search:** find tasks across days and notes, then open the result directly.
- **Settings:** a steady-sized window with changes saved as you make them.
- **Android widgets:** give each widget its own colours, font, size, corners and visible details, or match the app. Add **Daymark Habits** from the home-screen widget list to tick today’s habits; changes reach the notebook when the app next opens or resumes.
- **Daily Markdown, offline access, backups and optional sync** keep your notes portable. Deleted tasks no longer come back the next morning.

Habits sync only between devices on **1.4.0 or later**. Older apps do not see habits and cannot change them. Update the sync server together with the apps. See the [cycle 7 release notes](./docs/releases/cycle-7/README.md) for screenshots and details.

## Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| Ctrl/⌘ K | New task |
| Ctrl/⌘ Shift F or / | Search tasks and notes |
| ? | Shortcut help |
| g t | Go to Today |
| g c | Go to Calendar |
| g n | Go to Notes |
| Ctrl/⌘ . | Toggle Notes focus mode |
| Enter / Space on the Habits bar | Open or close habits |
| Space on a habit checkbox | Tick or untick that habit |

Search, help and navigation shortcuts pause while you type in a field. New task and Notes focus mode also work while typing.

## Develop

```bash
npm install
npm run dev            # Express + Vite on http://localhost:3000 (dev password: daymark-dev)
npm run lint           # TypeScript
npm test               # unit + in-process server tests
npm run test:helpers   # screenshot, server-session and site helper tests
npm run build:site     # GitHub Pages site into _site/ (published by the Pages workflow on each release)
npm run build          # production bundle
npm run test:e2e       # PWA on an emulated Android phone, incl. offline
npm run test:sync      # two devices syncing through a fresh server
npm run android:build  # debug APK (JDK 21 + Android SDK); -- --test for Kotlin tests
node scripts/e2e-android-native.mjs   # app + widget + sync on a booted emulator
node scripts/ux-audit.mjs <cycle>     # screenshots of every screen, phone/desktop, light/dark
node scripts/ux-suite.mjs             # UX/UI test suite (docs/testing) + accessibility scans
```

AI agents: start at [`CLAUDE.md`](./CLAUDE.md) / [`AGENTS.md`](./AGENTS.md).

## Documentation
Project knowledge lives in [`.ai-configs/project/`](./.ai-configs/project/):
- [`architecture.md`](./.ai-configs/project/architecture.md): system topology, data flow, PWA, Android shell, sync.
- [`specification.md`](./.ai-configs/project/specification.md): schemas, rollover, historical completion, aging, Markdown format.
- [`api-and-sync.md`](./.ai-configs/project/api-and-sync.md): server configuration, REST API, sync protocol, deployment.
- [`codebase-map.md`](./.ai-configs/project/codebase-map.md): file-by-file guide.
- [`decisions.md`](./.ai-configs/project/decisions.md): architecture decision records.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): the cycles that took the prototype to 1.0.

## Mobile notes
- **Android**: Capacitor app around the web build plus a native Jetpack Glance widget (`mobile/android/`). See [`mobile/README.md`](./mobile/README.md).
- **iOS**: use the PWA (Add to Home Screen in Safari). `mobile/ios/` holds WidgetKit sketches that are not built or tested.

## Sovereignty
Daily notes are standard Markdown (`YYYY-MM-DD.md`) with task metadata in HTML comments (`<!-- daymark: task_id=… -->`) that other Markdown apps ignore. Export everything at any time. No telemetry.

## License
Daymark is source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE.md). You may use, copy, change and share it for any noncommercial purpose: personal use, study, research, hobby projects, and use by charities, schools and government bodies. Commercial use needs separate permission from the copyright holder, dngioidev.
