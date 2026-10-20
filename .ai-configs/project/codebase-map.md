# Daymark Codebase Map

Canonical map of key source directories, modules, and component responsibilities.

## Directory Organization

```text
daymark/
├── docs/                 # Authoritative technical documentation
├── mobile/               # Native Android Glance & iOS WidgetKit code
├── public/               # Static assets & PWA manifest
├── src/                  # React 19 frontend application
│   ├── components/       # Modular UI components (Desktop, Mobile, Server)
│   ├── types/            # Master TypeScript types (`daymark.ts`)
│   ├── utils/            # Core lifecycle, markdown, and storage engines
│   ├── App.tsx           # Global state orchestrator
│   └── main.tsx          # Client bootstrap
├── .ai-configs/          # Canonical universal AI agent configuration
├── package.json          # Dependencies & build scripts
├── server.ts             # Server entry: config, account bootstrap, Vite (dev) or dist/ (prod)
├── server/               # Sync server: config, auth (scrypt, HMAC tokens, rate limit), file store, REST API
└── vite.config.ts        # Vite configuration
```

## Critical Modules & Responsibilities

| File / Directory | Layer | Purpose |
| :--- | :--- | :--- |
| `src/types/daymark.ts` | Types | Master TypeScript interfaces (`TaskItem`, `DailyDocument`, `AppSettings`, `SyncPayload`). |
| `src/utils/lifecycleEngine.ts` | Logic | Pure algorithms for task rollover (`performDailyRollover`), aging calculation (`calculateTaskAge`, `getAgingSeverity`), and historical correction (`correctHistoricalCompletion`). |
| `src/utils/markdownEngine.ts` | Logic | Canonical Markdown parsing and serialization with frontmatter and `<!-- daymark: ... -->` comments. |
| `src/utils/vaultStore.ts` | Storage | IndexedDB persistence with in-memory cache (`initVaultStore`), localStorage migration/fallback, onboarding flag, sample-data load, JSON/ZIP download. |
| `src/utils/vaultArchive.ts` | Storage | Pure ZIP build/import (`buildVaultZip`, `importVaultFromZip`); exports include a full-fidelity `.daymark/vault.json`, import falls back to Markdown parsing. |
| `src/utils/clock.ts` | Logic | Real local date helpers; `resolveToday` applies the optional developer date override. |
| `src/hooks/useRealToday.ts`, `src/hooks/usePwa.ts` | Hooks | Midnight/visibility-aware current date; online status and PWA install prompt. |
| `public/sw.js`, `public/manifest.json`, `public/icons/` | PWA | Offline app-shell service worker, install manifest, PNG icons (regenerate with `node scripts/generate-icons.mjs`). |
| `mobile/android/` | Native | Capacitor Android project: `DaymarkBridgePlugin`, `WidgetStore`, `WidgetModel` (JVM unit tests), `DaymarkGlanceWidget`. Build with `npm run android:build`. |
| `src/native/daymarkBridge.ts`, `src/hooks/useWidgetSync.ts`, `src/utils/widgetSnapshot.ts`, `src/utils/taskActions.ts` | Native bridge | JS side of the widget: snapshot builder, queued-action handling, shared task toggle. No-ops in the browser. |
| `src/native/backButton.ts` | Native | Android Back handling: dialogs, editor and tabs register handlers; otherwise the app minimises. |
| `scripts/ux-audit.mjs` | Tooling | Screenshots of every main screen (phone/desktop, light/dark) for UI review. |
| `src/components/WelcomeModal.tsx` | UI | First-run choice: empty vault or sample data. |
| `src/components/TodayView.tsx` | UI | Daily notebook view with visual, split, and raw markdown modes. |
| `src/components/StandaloneNotesView.tsx` | UI | 3-column evergreen notes workspace with folder navigation and editor. |
| `src/components/DailyHistoryView.tsx` | UI | Historical calendar archive with heat-map and task reopen capabilities. |
| `src/components/TaskItemCard.tsx` | UI | Interactive task card with aging badges, status picker, and subtasks. |
| `src/components/MarkdownPreview.tsx` | UI | Markdown renderer supporting GFM checklists, callouts, and wikilinks. |
| `server.ts`, `server/app.ts` | Backend | Express API (auth, devices, sync, stats, log) built by `createApp(config, store)`; tested in-process by `server/app.test.ts`. |
| `server/store.ts` | Backend | Atomic JSON-file persistence in `DATA_DIR` (account, vault entities with revisions, devices, audit log). |
| `src/sync/merge.ts` | Sync | Three-way merge for daily notes (per task), notes (conflict copies) and settings; shared by server and client. |
| `src/sync/syncClient.ts`, `src/hooks/useSync.ts` | Sync | Client protocol (push changes vs. bases, apply results) and the React hook with auto-sync triggers. |
| `src/components/sync/SyncPanel.tsx`, `src/components/server/ServerDashboard.tsx` | UI | Connect/disconnect, status; server stats, devices, activity, password. |
