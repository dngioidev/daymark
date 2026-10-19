# Daymark Project Architecture

Canonical, concise architecture specification covering system topology, operational modes, and data flow.

## System Topology & Tri-Mode Paradigm

Daymark operates across three primary environments:

```
┌─────────────────────────────────────────────────────────────┐
│                       DAYMARK SYSTEM                        │
├──────────────────────────────┬──────────────────────────────┤
│ 1. Desktop Workspace         │ 2. Dedicated Mobile App      │
│ - Full-width 3-column view   │ - Touch-friendly PWA / Shell │
│ - Split Markdown/Visual pane │ - Quick capture drawer       │
│ - Instant rollover & aging   │ - Native Glance/WidgetKit    │
├──────────────────────────────┴──────────────────────────────┤
│ 3. Self-Hosted Server & Gateway                             │
│ - Express backend on port 3000                              │
│ - User/Password auth & multi-device token pairing           │
│ - REST synchronization API (/api/sync)                      │
│ - Static production asset hosting (dist/)                   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow & Storage Model

1. **Local-First Sovereign Storage**:
   - Primary persistence in the browser uses IndexedDB (`vaultStore.ts`): an in-memory cache is hydrated by `initVaultStore()` before first render, writes are queued to IndexedDB, failures surface as toasts. Legacy `localStorage` data is migrated once; `localStorage` is only a degraded fallback.
   - A service worker (`public/sw.js`, registered in production builds only) caches the app shell so the PWA works offline; `/api/*` is never cached.
   - Android: a Capacitor shell (`mobile/android`) loads the same web build inside a WebView; `src/native/daymarkBridge.ts` talks to the `DaymarkBridge` plugin (snapshot for the home-screen widget, queued widget actions, pin widget). In the shell the service worker is skipped and exports use Filesystem + Share.
   - A fresh profile starts with an empty vault and a welcome dialog (empty vs. sample data).
   - Notes are stored in canonical Markdown format (`YYYY-MM-DD.md`) with YAML frontmatter.
   - Machine metadata is embedded via unobtrusive HTML comments:
     `<!-- daymark: task_id=<id> status=<status> created=<date> ... -->`.
   - Vaults export directly to standard Obsidian-compatible `.zip` archives.

2. **Synchronization Architecture**:
   - Clients sync bidirectionally with the Express backend via `/api/sync`.
   - The sync engine computes document hashes and merges non-conflicting updates.
   - Tasks and notes are reconciled without destroying daily historical journal entries.

3. **Native Mobile Widgets**:
   - Android Glance widget (`mobile/android/DaymarkGlanceWidget.kt`) in Jetpack Compose.
   - iOS WidgetKit widget (`mobile/ios/DaymarkWidget.swift`) in SwiftUI.
   - Both widgets interface with the sync gateway or local note files via deep links.
