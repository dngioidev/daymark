# Daymark

> **A local-first daily Markdown notebook that carries unfinished tasks forward, lets you record when work was really done, and warns you about tasks that keep slipping.**

Each day is a plain Markdown note. Unfinished tasks move to today automatically, keeping their history; tasks that keep getting carried get amber and red aging alerts. Notes stay on your device, work offline, export as an Obsidian-compatible vault, and can optionally sync between your phone and computers through a server you run yourself.

Version **1.0.0**. Release notes per cycle: [`docs/releases/`](./docs/releases/).

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

Then on each device open **Settings → Sync** (or tap the sync status in the header), enter `http://<server-ip>:3000`, the user `admin` and your password. Devices merge edits task by task; nothing is overwritten. The password is only read on the first start (8+ characters); change it later from the app. Put the server behind HTTPS (e.g. Caddy or nginx) if it is reachable from the internet. Full reference: [`.ai-configs/project/api-and-sync.md`](./.ai-configs/project/api-and-sync.md).

### Your data
- Stored in the browser/app (IndexedDB) on each device; nothing leaves the device unless you connect a sync server.
- **Settings → Backup & restore → Back up now** saves a ZIP of Markdown files (plus a full snapshot); **Choose a backup file…** restores one. A technical JSON backup is under **Advanced**. On Android the file opens in the share sheet (save to Drive, Files, email…). Restoring while sync is on merges the backup with your server instead of deleting anything.
- Uninstalling the app or clearing site data deletes the local vault, so keep a backup or use sync.

---

## Develop

```bash
npm install
npm run dev            # Express + Vite on http://localhost:3000 (dev password: daymark-dev)
npm run lint           # TypeScript
npm test               # unit + in-process server tests
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
