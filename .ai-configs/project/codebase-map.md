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
| `src/utils/lifecycleEngine.ts` | Logic | Pure algorithms for task rollover (source-day removals prevent deleted tasks returning) (`performDailyRollover`), aging calculation (`calculateTaskAge`, `getAgingSeverity`), and historical correction (`correctHistoricalCompletion`). |
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
| `src/components/WelcomeModal.tsx` | UI | First-run choice: start fresh, sample data, or restore a backup. |
| `src/components/ui/Dialog.tsx` | UI | Shared accessible dialog/sheet (focus trap, Esc, backdrop, inert app) and button styles. |
| `src/components/ui/Menu.tsx` | UI | Dropdown menu that closes on outside tap/Esc, keyboard navigable. |
| `src/components/ui/feedback.tsx` | UI | In-app `confirmDialog`/`alertDialog` and `showToast` (with Undo); mount `<FeedbackHost />` once. |
| `src/utils/dateFormat.ts` | Logic | The UI's date vocabulary: Today/Yesterday/Tomorrow, "Fri 16 Oct", long dates, ages. No ISO dates on screen. |
| `src/utils/notes.ts` | Logic | Note previews without Markdown syntax, checklist counts, pinned-first sorting. |
| `src/components/TodayView.tsx` | UI | Full-width daily notebook with visual, split and Markdown modes, collapsible sections and progress/planned-day sidebar. |
| `src/components/StandaloneNotesView.tsx` | UI | Full-height notes list and editor, folders, templates, word count and focus mode. |
| `src/components/CalendarView.tsx` | UI | Calendar: month grid and week rows, future planning, day notes and habits, open any day and desktop drag to move. |
| `src/components/TaskItemCard.tsx` | UI | Compact task row: checkbox, title (opens details), status menu, age, "…" menu (Mark done on…, Rename, Delete). Details live in `TaskHistoryDrawer.tsx` (the task details sheet). |
| `src/components/MarkdownPreview.tsx` | UI | Markdown renderer supporting GFM checklists, callouts, and wikilinks. |
| `server.ts`, `server/app.ts` | Backend | Express API (auth, devices, sync, stats, log) built by `createApp(config, store)`; tested in-process by `server/app.test.ts`. |
| `server/store.ts` | Backend | Atomic JSON-file persistence in `DATA_DIR` (account, vault entities with revisions, devices, audit log). |
| `src/sync/merge.ts` | Sync | Three-way merge for daily notes (per task), notes (conflict copies) and settings; shared by server and client. |
| `src/sync/syncClient.ts`, `src/hooks/useSync.ts` | Sync | Client protocol (push changes vs. bases, apply results) and the React hook with auto-sync triggers. |
| `src/components/sync/SyncPanel.tsx`, `src/components/server/ServerDashboard.tsx` | UI | Connect/disconnect, status; server stats, devices, activity, password. |

## Cycle 6 Modules

| File | Layer | Purpose |
| :--- | :--- | :--- |
| `src/utils/appearance.ts` | Logic | One-time upgrade theme choice and resolved appearance, including opaque header colour and safe photo dim. |
| `src/utils/color.ts` | Logic | Colour parsing, luminance, compositing and contrast calculations. |
| `src/hooks/useAppearance.ts` | Hook | Apply class-driven theme, text size, CSS colours and the `daymark_theme` pre-paint mirror; live preview. |
| `src/components/settings/AppearanceTab.tsx` | UI | Light/Dark theme, text size, colour controls, dim and blur. |
| `src/components/settings/ColorField.tsx` | UI | Automatic/custom colour choice and contrast warning. |
| `src/components/settings/PreviewInput.tsx` | UI | Preview colour/range edits live, commit on completion. |
| `src/components/settings/useInstantSettings.ts` | Hook | Validated instant preference saves, draft handling and tab resets. |
| `src/utils/photoEncoder.ts` | Logic | Resize/re-encode photos at 2560px and thumbnails at 320px, quality 0.82; measure luminance. |
| `src/utils/photoStore.ts` | Storage | Five device-only photo slots in existing `daymark`/`kv`: `bgPhoto:*`, `bgThumb:*`, `bgMeta`, `ui:bgSlot`; serialized mutations. |
| `src/hooks/useBackgroundPhoto.ts` | Hook | Load/select/add/remove device photos and manage object URL lifetime. |
| `src/components/settings/BackgroundPhotoSection.tsx` | UI | Photo picker, thumbnails, remove and sixth-photo replacement dialog. |
| `src/utils/collapsedSections.ts` | Storage | Persist section collapse choices per device. |
| `src/utils/dayStats.ts` | Logic | Seven-day done trend and next planned day. |
| `src/utils/noteTemplates.ts` | Logic | Built-in note templates and word counting. |
| `src/utils/calendarGrid.ts` | Logic | Month/week cells with future dates, task totals, titles and note markers. |
| `src/utils/search.ts` | Logic | Search newest live task copies and notes; exclude deleted tasks and label archived ones. |
| `src/utils/shortcuts.ts` | Logic | Central shortcut mapping with field guards and g-prefix navigation. |
| `src/components/SearchDialog.tsx` | UI | Debounced grouped search, arrow/Enter selection, open result. |
| `src/components/ShortcutHelp.tsx` | UI | Keyboard shortcut cheat sheet dialog. |
| `src/utils/widgetStyle.ts` | Logic | Widget style defaults, parsing and app/custom colour resolution. |
| `src/components/settings/WidgetTab.tsx` | UI | Android-only default and per-widget style editors. |
| `src/components/settings/WidgetPreview.tsx` | UI | Live HTML approximation of widget appearance. |
| `mobile/android/app/src/main/java/app/daymark/notes/WidgetStyle.kt` | Native | Kotlin widget style model, JSON round-trip and resolved colours. |
| `mobile/android/app/src/main/java/app/daymark/notes/WidgetConfigActivity.kt` | Native | Place/configure widget and queue its editor request in the app. |
| `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`, `scripts/e2e-sync.mjs`, `scripts/capture-screenshots.mjs` | Tooling | Cycle-6 D1–D8 regressions, layout/theme checks, two-device move/appearance and release captures. |

## Cycle 7 Modules

| File / Directory | Layer | Purpose |
| :--- | :--- | :--- |
| `src/utils/habits.ts` | Logic | Habit lifetime, editing, ticks, streaks, missed days and summaries. |
| `src/utils/habitsOpen.ts` | Storage | Device-only Habits disclosure state in IndexedDB with localStorage fallback. |
| `src/utils/habitWidgetSnapshot.ts` | Native bridge | Compact habit snapshot and replay-safe dated widget actions. |
| `src/components/habits/HabitsBar.tsx` | UI | Daily disclosure, progress, warning chip and checklist entry point. |
| `src/components/habits/HabitChecklist.tsx` | UI | Labelled habit checkboxes, streaks and missed-day warnings. |
| `src/components/habits/HabitEditor.tsx` | UI | Add, rename, reorder, remove and warning-day controls in a shared dialog. |
| `src/components/WeekRows.tsx` | UI | Seven full-width day rows, all task titles, habit dots and selection/drop targets. |
| `mobile/android/app/src/main/java/app/daymark/notes/HabitWidgetModel.kt` | Native | Habit snapshot parsing, dated queued actions and midnight streak/warning calculations. |
| `mobile/android/app/src/main/java/app/daymark/notes/DaymarkHabitsGlanceWidget.kt` | Native | Separate Daymark Habits widget with checklist, progress and per-widget styles. |
| `mobile/android/app/src/main/java/app/daymark/notes/WidgetDateChangeReceiver.kt` | Native | Refresh widgets after date/time/timezone changes. |
| `scripts/helpers/cycle-7-fixture.mjs` | Tooling | Relative-date tasks and habits shared by release captures and UX checks. |
| `scripts/helpers/cycle-7-fixture.test.mjs`, `scripts/helpers/server-session.test.mjs` | Testing | Fixture weekday/year-boundary regressions and server seeding/reset tests; both run once via explicit file arguments in `npm run test:helpers`. |

## Cycle 6 test files

New test files accompany these modules and the integration boundaries:

- App: `src/App.moveTask.test.ts`, `src/App.search.test.ts`.
- Components: `src/components/CalendarView.test.ts`, `src/components/CalendarView.interactions.test.ts`, `src/components/SearchDialog.test.ts`, `src/components/StandaloneNotesView.test.ts`, `src/components/TodayView.test.ts`, `src/components/TaskHistoryDrawer.test.ts`.
- Settings: `src/components/settings/AppearanceTab.test.ts`, `BackgroundPhotoFlow.test.ts`, `BackgroundPhotoSection.test.ts`, `PreviewInput.test.ts`, `SettingsModal.test.ts`, `WidgetPreview.test.ts`, `instantSettingsDraft.test.ts`, `useInstantSettings.test.ts` (all in the same settings directory).
- Dialog/shortcut boundary: `src/components/ui/overlayShortcuts.test.ts`.
- Hooks: `src/hooks/previewAppearance.test.ts`, `src/hooks/useAppearance.test.ts`, `src/hooks/useBackgroundPhoto.test.ts`, `src/hooks/useWidgetSync.test.ts`.
- Native bridge: `src/native/daymarkBridge.test.ts`; Kotlin model: `mobile/android/app/src/test/java/app/daymark/notes/WidgetStyleTest.kt`.
- Utilities (all in `src/utils/`): `appearance.test.ts`, `appearanceSafety.test.ts`, `calendarGrid.test.ts`, `collapsedSections.test.ts`, `color.test.ts`, `dayStats.test.ts`, `noteTemplates.test.ts`, `photoEncoder.test.ts`, `photoStore.test.ts`, `photoVault.test.ts`, `search.test.ts`, `shortcuts.test.ts`, `themePrepaint.test.ts`, `vaultAppearance.test.ts`, `widgetStyle.test.ts`.

## Cycle 8 Modules

| File | Layer | Purpose |
| :--- | :--- | :--- |
| `site/` | Website | Static GitHub Pages site (intro, features, screenshots, download, license) with `{{VERSION}}`-style placeholders. |
| `scripts/build-site.mjs`, `scripts/helpers/site.mjs` | Tooling | Build `_site/` and fill the latest release's version, date and APK link from the GitHub API. |
| `.github/workflows/pages.yml` | CI | Publish the site on every published release and when `site/` changes on main (public repo only). |
| `src/utils/taskActions.ts` (`closeEarlierCopies`, `reopenEarlierCopies`, `followDoneChanges`, `isDoneLater`) | Logic | Finishing a carried task closes its open copies on earlier days as "done later"; unticking reopens them. |
| `LICENSE.md` | Legal | PolyForm Noncommercial License 1.0.0. |

## Cycle 9 Modules

| File / Directory | Layer | Purpose |
| :--- | :--- | :--- |
| `src/components/ui/Menu.tsx`, `src/utils/menuPlacement.ts` | UI / Logic | Portal menus: bottom sheets below 768 px, desktop flip/shift/scroll placement, keyboard focus and dismissal. |
| `src/utils/noteAssets.ts`, `src/utils/notePicture.ts` | Storage / Logic | SHA-256 picture storage and references, compression, authenticated asset transfers and missing-picture recovery. |
| `server/assets.ts`, `server/app.ts` | Server | Protected `/api/assets` list/download/upload/delete routes, hash and size validation, file persistence separate from `/api/sync`. |
| `src/components/StandaloneNotesView.tsx` | UI | Lazy rich editor entry point, Markdown toggle, note state, focus mode and templates. |
| `src/components/notes/RichNoteEditor.tsx`, `src/components/notes/editorExtensions.ts` | Editor | TipTap setup and extensions, Markdown fidelity and editor lifecycle. |
| `src/components/notes/EditorToolbar.tsx`, `src/components/notes/richNoteEditor.css` | UI | Formatting, table and picture controls and editor styling. |
| `src/components/notes/rawMarkdownNode.ts`, `src/components/notes/calloutNode.ts`, `src/components/notes/pictureNode.tsx` | Editor | Verbatim raw blocks, callouts and saved-picture rendering with missing-picture placeholders. |
| `src/components/notes/clipboard.ts`, `src/components/notes/fixtures/paste/` | Editor / Fixtures | Sanitised styled paste, Markdown/plain-text paste and HTML plus Markdown copy; AI chat and article fixtures. |
| `src/components/notes/wikiLink.ts`, `src/components/notes/WikiSuggest.tsx` | Editor / UI | `[[link]]` autocomplete, keyboard selection and create-note option. |
| `src/utils/noteMarkdown.ts`, `src/utils/noteTextSerialization.ts` | Logic | Markdown/editor conversion, raw-block preservation and Markdown text serialisation. |
| `src/components/notes/mermaidNode.tsx`, `src/components/notes/mermaidDiagram.tsx` | Editor / UI | Editable Mermaid code, lazy strict-mode diagram rendering and error fallback. |
| `src/utils/vaultArchive.ts`, `src/utils/vaultStore.ts`, `src/components/SettingsModal.tsx` | Storage / UI | Picture backup/restore, ZIP relative links, storage usage and explicit unused-picture cleanup. |
