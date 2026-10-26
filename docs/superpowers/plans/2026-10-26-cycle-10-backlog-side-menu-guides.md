# Cycle 10: Backlog, Side Menu, Move to Section, Zoomable Screenshots, Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Daymark 1.7.0 features: an undated task backlog with category labels, a desktop side rail replacing the top bar, "Move to section" in the task menu, click-to-zoom screenshots on the site, and web/mobile guides in the app and on the site.

**Architecture:** The backlog is its own synced record (`BacklogData`, sync entity `backlog`) modelled on habits: stored locally in kv, a feature flag keeps 1.6.0 clients away from it, merging is per item. Picking a task writes the same task id into a day; a non-destructive reconcile step hides picked backlog items while retaining same-id daily copies from concurrent picks on different days. Daily rollover and Done later handle those copies normally; reconciliation never edits daily documents. The rail replaces `Navbar` on desktop only. Guides are Markdown files in the repo, rendered in-app (bundled) and on the site (build script).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (stone palette), vitest, node:test for helpers, Express sync server, Capacitor Android (no native change), Playwright-based QA scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-cycle-10-backlog-side-menu-guides-design.md`

**Execution notes (from the user):** Codex CLI is the implementer and the model is **GPT-6.1 Sol** (user instruction); Claude Sonnet/Opus review each task. Work on branch `cycle-10-backlog-side-menu-guides` in `D:/dngioi/daymark`. All commits are authored as `dngioidev <172118255+dngioidev@users.noreply.github.com>` with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and no Claude-Session line. No release in this plan; releasing 1.7.0 is a separate request.

## Global Constraints

- Tailwind v4 stone palette only (`stone-50`..`stone-950`); non-existent classes fail.
- Desktop content keeps `max-w-[1800px]`.
- Types come from `src/types/daymark.ts`; the daily Markdown comment `<!-- daymark: task_id=<id> status=<status> created=<date> ... -->` stays valid and old files still parse.
- Rollover stays idempotent (`src/utils/lifecycleEngine.ts`).
- Everything works offline. No native Kotlin change, no backlog widget.
- A 1.6.0 client and a 1.7.0 server keep working together; a 1.7.0 client against a 1.6.0 server falls back without errors (capability fallback like `habitsUnsupported`).
- Verification commands: `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run test:qa`, `npm run test:sync`, `npm run test:e2e`, `npm run validate:ai`; the UX suite is `scripts/ux-suite.mjs` (run as in `package.json`).
- Page title above content is removed on desktop; phones keep the bottom tab bar; no collapsible rail.

## Review Focus

1. **Same item picked twice (two devices, double tap, retry):** exactly one task exists; the backlog item is marked picked. Pinned in Task 1 (`reconcileBacklog`) and Task 3 (two-device test).
2. **Damaged or missing stored backlog must not delete the server's backlog:** a read failure keeps the stored value untouched and does not sync a deletion. Pinned in Task 2.
3. **Move to backlog then rollover/next day:** no copy appears on any day; earlier carried copies are closed and excluded from counts and from the open-task alert. Pinned in Task 1 and Task 5.
4. **Category matching:** `" work "`, `"WORK"`, and `"Work"` all land in an existing "Work" section (using that section's own spelling); an empty or blank label uses the default section; a 200-character label is accepted and truncated for display only. Pinned in Task 1.
5. **Rail at 768px–1100px, with long header colours/photo backgrounds, and Notes focus mode:** nothing overlaps, header contrast follows the user's header colours, focus mode hides the rail and restores it. Pinned in Task 7.
6. **Lightbox:** Esc/arrows/focus return, one image at a time, no JS means plain links. Pinned in Task 9.

---

### Task 1: Backlog domain model, rules and merge (pure logic)

**Files:**
- Modify: `src/types/daymark.ts` (add `BacklogItem`, `BacklogData`; `TaskItem.movedToBacklogDate?: string`)
- Create: `src/utils/backlog.ts`, `src/utils/backlog.test.ts`
- Modify: `src/utils/taskActions.ts` (+ test) for closed copies; `src/utils/dayStats.ts`, `src/utils/lifecycleEngine.ts`, `src/utils/markdownEngine.ts` (+ their tests) wherever `doneLaterDate`/`isDoneLater` is handled
- Modify: `src/sync/merge.ts` (+ `merge.test.ts`): `mergeBacklog`, `isBacklogEntityKey`

**Interfaces:**
- Produces (types):
  - `BacklogItem { id: string; title: string; description?: string; category?: string; status?: string; checklist?: ChecklistItem[]; tags?: string[]; historyLog?: TaskHistoryItem[]; order: number; createdAt: string; updatedAt: string; pickedOn?: string /* YYYY-MM-DD */; deletedAt?: string }`
  - `BacklogData { items: BacklogItem[] }`; `EMPTY_BACKLOG: BacklogData`. Items with `pickedOn` or `deletedAt` are tombstones and are never shown.
- Produces (functions in `backlog.ts`):
  - `visibleBacklog(data: BacklogData): BacklogItem[]` sorted by category group then `order`; unlabelled last.
  - `addBacklogItem(data, input: {title; description?; category?}, nowIso: string, id?: string): BacklogData`
  - `editBacklogItem(data, id, patch: Partial<Pick<BacklogItem,'title'|'description'|'category'>>, nowIso): BacklogData`
  - `removeBacklogItem(data, id, nowIso): BacklogData` (sets `deletedAt`); `restoreBacklogItem(data, id, nowIso)` for Undo
  - `reorderBacklogItem(data, id, direction: 'up'|'down', nowIso): BacklogData`
  - `sectionForCategory(headings: string[], category: string | undefined, fallback: string): { name: string; isNew: boolean }` (trim, case-insensitive; existing spelling wins; blank → `fallback`)
  - `pickBacklogItem(docs: DailyDocument[], data: BacklogData, id: string, date: string, defaultHeadings: string[], nowIso: string): { docs: DailyDocument[]; data: BacklogData } | null` (null if item hidden/unknown, date earlier than today is the caller's check, or the task id already exists on any day)
  - `moveTaskToBacklog(docs, data, taskId, fromDate, nowIso): { docs; data; } | null` (null for done/archived/closed tasks); removes the day copy via `removeTaskFromDocument`, closes earlier copies with `movedToBacklogDate`, revives/creates the item with the section name as category
  - `reconcileBacklog(data: BacklogData, docs: DailyDocument[], nowIso: string): BacklogData` (an active item whose id has an open, non-closed copy on some day becomes `pickedOn` that earliest date)
- Produces (merge): `mergeBacklog(base, ours, theirs): MergeResult<BacklogData>` per item id with three-way equality; missing items on one side are retained; on a true conflict the item with the newer `updatedAt` wins (ties: incoming); a whole-entity delete is honoured only when the other side is unchanged. `isBacklogEntityKey(key) => key === 'backlog'`; `mergeEntity` and `isValidEntityKey` accept `backlog`.
- Consumes: `removeTaskFromDocument`, `restoreTaskToDocument`, `mapEarlierCopies` pattern from `taskActions.ts`.

Behaviour fixed by the spec/my calls: picked tasks start fresh on the pick day (`createdDate` and `originalNoteDate` = pick day, no `carriedFromDate`, so no age/alert), keep description, checklist, tags, history (plus a "Picked from backlog" entry) and status (`done`/`archived` become `not-started`); closed copies show "Moved to backlog" and are excluded from day counts and the alert exactly like Done-later copies; Markdown field `moved_to_backlog=<date>` round-trips.

- [ ] **Step 1: Write failing tests in `backlog.test.ts`:** `sectionForCategory` for `" work "`, `"WORK"`, `""`, a new name, 200-char name; `pickBacklogItem` creates the section when missing and reuses the existing one; picking an item whose id is already on a day returns null; pick keeps checklist/tags/description/history and resets age fields; `moveTaskToBacklog` on a task carried over three days leaves one backlog item with the latest copy's id, removes the latest copy, closes the two earlier copies with `movedToBacklogDate`, and a rollover run afterwards creates no copy; done tasks return null; day→backlog→day→backlog revives the same item; `reconcileBacklog` turns an active item with an open copy on a day into `pickedOn`, and ignores closed copies; reorder swaps within a category only.
- [ ] **Step 2: Write failing tests in `merge.test.ts`:** `mergeBacklog` — both sides add different items (both kept); edit vs edit conflict (newer wins); pick on one side vs edit on the other (item kept, reconcile later fixes the place); delete vs edit (edit wins); entity key `backlog` accepted by `isValidEntityKey`.
- [ ] **Step 3: Run `npx vitest run src/utils/backlog.test.ts src/sync/merge.test.ts`; expect FAIL (missing exports).**
- [ ] **Step 4: Implement the types, `backlog.ts` and `mergeBacklog`** per the Interfaces block, and add `movedToBacklogDate` handling next to `doneLaterDate` in `dayStats`, `lifecycleEngine` (never carried; stripped when carried like `doneLaterDate`) and `markdownEngine` (field `moved_to_backlog`). Introduce one helper `isClosedCopy(task)` in `taskActions.ts` (= done-later or moved-to-backlog) and use it where `isDoneLater` is used for counts and display.
- [ ] **Step 5: Run the same tests plus `npx vitest run src/utils` ; expect PASS.**
- [ ] **Step 6: Commit** `feat: backlog model, picking, moving and merge rules`.

### Task 2: Backlog storage, validation, backups and export

**Files:**
- Modify: `src/utils/vaultStore.ts` (+ tests), `src/utils/vaultValidation.ts` (+ tests), `src/utils/vaultArchive.ts` (+ tests)
- Test: `src/utils/vaultStore` neighbours (`vaultAssetBackups.test.ts` style)

**Interfaces:**
- Produces: `isBacklogItem`, `isBacklogData` in `vaultValidation.ts`; `KEYS.BACKLOG = 'backlog'` with legacy name `daymark_backlog_v1`; `loadBacklog(): BacklogData`, `saveBacklog(data: BacklogData): void`; `SharedKey` gains `'backlog'`; cross-tab refresh like habits; vault reset clears it; ZIP backup/JSON backup include `backlog` and restore it (older backups without it keep the current backlog, like `mergeRestoredHabits`); ZIP export adds `Backlog.md` (one `## <category>` list per label, `Unsorted` last, unchecked checklist lines `- [ ] title`).
- Consumes: `EMPTY_BACKLOG` from Task 1.

- [ ] **Step 1: Failing tests:** validation accepts/rejects item shapes; `loadBacklog` returns `EMPTY_BACKLOG` when nothing stored; **a damaged stored value is kept as-is (not overwritten by an empty save) and is reported as unreadable** (mirror the habits "unedited recovered" safeguard in a simpler form: `uneditedRecoveredBacklog` WeakSet, `saveBacklog` skips it, damaged items are dropped with a console error); backup JSON round trip; old backup without `backlog` leaves the current backlog; ZIP contains `Backlog.md` with grouped lists.
- [ ] **Step 2: Run the new tests; expect FAIL.**
- [ ] **Step 3: Implement** storage, validation, backup/restore/export following the habits code paths named in each file.
- [ ] **Step 4: Run `npx vitest run src/utils` and `npm run lint`; expect PASS.**
- [ ] **Step 5: Commit** `feat: store, back up and export the backlog`.

### Task 3: Backlog sync (client, server, feature flag, fallback)

**Files:**
- Modify: `src/sync/protocol.ts`, `src/sync/syncClient.ts`, `src/hooks/useSync.ts`, `server/app.ts` (+ their tests, including the in-process server tests)
- Modify: `scripts/e2e-sync.mjs`

**Interfaces:**
- Produces: `VaultData.backlog: BacklogData`; `toEntities`/`fromEntities` use key `backlog` with value `{ items }`; `SyncState.backlogSynced?: boolean`; request `features: ['habits', 'backlog']`; server returns `backlog` only when `features` includes `'backlog'`, validates it with `isBacklogData`, merges with `mergeBacklog`; client capability fallback: on `400 Invalid entity key` for `backlog` it drops backlog entities, retries, and remembers for the session (generalise `habitsUnsupported` into a small `unsupported` set without changing habits behaviour); first sync after upgrade uses `sinceRev: 0` until `backlogSynced`; after `applySyncOutcome`, `reconcileBacklog` runs against the merged docs.
- Consumes: Tasks 1–2.

- [ ] **Step 1: Failing tests:** `syncClient` — entities include `backlog`; collectChanges sends only a changed backlog; 1.6.0-style server (rejecting `backlog`) → client retries without it and still syncs docs and habits; server — a request without `features` containing `backlog` never receives `backlog`; invalid backlog payload rejected 400; merge through the server keeps both devices' adds; `applySyncOutcome` reconciles a picked item.
- [ ] **Step 2: Run tests; expect FAIL.**
- [ ] **Step 3: Implement** the client/server changes; wire `backlog` into `useSync.ts` where `vault.habits` is watched and saved.
- [ ] **Step 4: Extend `scripts/e2e-sync.mjs`:** device A adds a backlog item with category "Home" and moves a Today task to the backlog; device B shows both; both devices pick the same item for different days at the same time; after sync one task with that id exists per picked day, no copies are deleted or tombstoned, and the item is not listed.
- [ ] **Step 5: Run `npx vitest run`, `npm run build`, `npm run test:sync`; expect PASS.**
- [ ] **Step 6: Commit** `feat: sync the backlog behind a feature flag`.

### Task 4: Move to section (task menu)

**Files:**
- Modify: `src/utils/taskActions.ts` (+ test), `src/components/TaskItemCard.tsx`, `src/components/TodayView.tsx`, `src/App.tsx`, `src/components/mobile/MobileAppShell.tsx` (prop pass-through only)
- Create: `src/components/MoveToSectionDialog.tsx`
- Test: `src/utils/taskActions.test.ts`, `src/components/TodayView.test.ts`

**Interfaces:**
- Produces: `moveTaskToSection(doc: DailyDocument, taskId: string, sectionName: string, nowIso: string): { doc: DailyDocument; task: TaskItem; created: boolean } | null` — case-insensitive match uses the existing section's spelling; a new name appends a section; the task goes to the end of the section; history gets a `moved` entry (`Moved to <section>`), id and carry fields untouched; same section returns null. Prop `onMoveToSection?: (taskId: string, section: string) => void` on `TaskItemCard`/`TodayView`; menu item **"Move to section…"** (placed after "Move to date…") opens `MoveToSectionDialog` (list of the day's section names with the current one disabled, plus a "New section" text field; Enter submits). Undo toast like "Move to day". Available for open and done tasks, not for closed copies.
- Consumes: `Dialog`, `buttonClass` from `components/ui/Dialog`.

- [ ] **Step 1: Failing tests:** `moveTaskToSection` cases — existing section with different case/whitespace; new section; same section → null; ordering; history entry; empty source section is left as the app leaves empty sections today (assert against the current behaviour of `removeTaskFromDocument`-based moves; do not change it); markdown round trip of the doc after the move; `TodayView` renders the menu item and the dialog lists sections.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the action, dialog, menu item and App handler (with Undo using a snapshot of the previous doc).
- [ ] **Step 4: Run `npx vitest run src/utils/taskActions.test.ts src/components/TodayView.test.ts` and `npm run lint`; expect PASS.**
- [ ] **Step 5: Commit** `feat: move a task to another section`.

### Task 5: Backlog page, New task target and "Move to backlog" (desktop and shared UI)

**Files:**
- Create: `src/components/backlog/BacklogView.tsx`, `src/components/backlog/BacklogView.test.ts`
- Modify: `src/types/daymark.ts` (`ViewTab` gains `'backlog'`; `MobileTab` gains `'backlog'`), `src/App.tsx`, `src/components/QuickCaptureModal.tsx`, `src/components/TaskItemCard.tsx` (menu item), `src/components/TodayView.tsx`, `src/utils/search.ts` (+ test), `src/components/SearchDialog.tsx`, `src/utils/shortcuts.ts` (+ test), `src/components/ShortcutHelp.tsx`
- Modify: `src/hooks` or `App.tsx` state: `backlog` state saved with `saveBacklog`, passed to `useSync`

**Interfaces:**
- Produces: `BacklogView` props `{ backlog: BacklogData; today: string; headings: string[]; onAdd(input); onEdit(id, patch); onRemove(id); onRestore(id); onReorder(id, dir); onPick(id, date) }`. UI: add row (title + category field with `datalist` of existing categories and section names), groups by category, each row has Edit, Up/Down, Delete (Undo toast) and a **"Pick a day"** control (date input, min today, default today, validation message like `getMoveTaskDateError`). Empty state: one sentence explaining the backlog. `QuickCaptureModal` gets a **Date | Backlog** target switch; with Backlog it shows the category field instead of Section/Status and calls `onCaptureBacklog`. Task menu item **"Move to backlog"** (open tasks only, not closed copies) calls `moveTaskToBacklog` with an Undo toast. Search results gain `{ kind: 'backlog'; itemId; title; category? }`, labelled "Backlog"; choosing one opens the Backlog page. Shortcut `g b` opens Backlog.
- Consumes: Task 1 functions; `reconcileBacklog` runs in App on docs/backlog change (effect that only writes when the result differs).

- [ ] **Step 1: Failing tests:** `BacklogView` renders groups with unlabelled last, empty state, pick control rejects past dates, delete shows Undo; capture modal target switch (static render/prop tests in the style of existing component tests); `searchVault` includes backlog items and excludes picked/deleted ones; `shortcutFor` maps `g` then `b`; `TodayView` menu shows "Move to backlog" for open tasks only.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the page, capture target, menu item, search and shortcut; App wiring: `activeDesktopTab === 'backlog'` renders `BacklogView`; picking calls `pickBacklogItem` then shows a toast "Added to <day> in <section>" with Undo (moves it back via `moveTaskToBacklog`).
- [ ] **Step 4: Run `npx vitest run`, `npm run lint`, `npm run build`; expect PASS.**
- [ ] **Step 5: Commit** `feat: backlog page, backlog capture and move to backlog`.

### Task 6: Appearance setting for the menu side

**Files:**
- Modify: `src/types/daymark.ts` (`AppearanceSettings.menuSide?: 'left' | 'right'`), `src/utils/appearance.ts` (+ test; default `'left'`), `src/components/settings/AppearanceTab.tsx` (+ test), `src/utils/vaultValidation.ts` if appearance is validated

**Interfaces:**
- Produces: `resolveMenuSide(appearance?: AppearanceSettings): 'left' | 'right'`; a "Menu side" Left/Right segmented control in the Appearance tab with live preview via the existing instant-settings mechanism; synced with settings (no new entity).

- [ ] **Step 1: Failing tests:** default is left; persisted `'right'` round-trips through settings validation and `toSyncedSettings`; Appearance tab renders the control and calls the instant-settings update.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx vitest run src/utils src/components/settings`; expect PASS.**
- [ ] **Step 5: Commit** `feat: choose the menu side in Appearance`.

### Task 7: Side rail on desktop

**Files:**
- Create: `src/components/SideRail.tsx`, `src/components/SideRail.test.ts`
- Modify: `src/App.tsx` (desktop layout), `src/components/Navbar.tsx` (keep exporting `SYNC_LABELS`, `NavSyncStatus`; remove the component or leave it only if still used by the phone preview), `src/components/TodayView.tsx`, `src/components/CalendarView.tsx`, `src/components/StandaloneNotesView.tsx`, `src/components/notes/*` (spacing), `src/index.css`
- Modify: `scripts/ux-suite.mjs` (line ~504 `header button` check and other navbar selectors), `scripts/e2e-qa-regressions.mjs`, `scripts/capture-screenshots.mjs`, `scripts/e2e-android-pwa.mjs` if they read the navbar

**Interfaces:**
- Produces: `SideRail` props `{ activeTab: ViewTab; onTabChange; onOpenQuickCapture; onOpenSearch; onOpenSettings; onOpenSync; syncStatus: NavSyncStatus; carriedAlertCount: number; todayLabel: string; side: 'left' | 'right'; hidden?: boolean }`. A `<nav aria-label="Main">` of **six equal-height parts** (CSS grid, `grid-template-rows: repeat(6, 1fr)`, full viewport height, sticky, ~168px): Title (app name, date label, sync status button, a prominent **+ New task** button with the Ctrl/⌘ K hint, and a Search button), Today (with the carried-alert badge), Calendar, Notes, Backlog, Settings (opens the Settings dialog; `aria-current` only on page tabs). Uses `--dm-header-bg`/`--dm-header-fg` and accent classes already used by `Navbar`. `hidden` removes it (Notes focus mode). The dev-only "Mobile & Code" tab and "Phone layout preview" move into Settings › Advanced (shown only when `devMode`).
- Layout: desktop root becomes a flex row with the rail on the chosen side (`resolveMenuSide`); the content area keeps `max-w-[1800px]`; the page title row above content is removed on Today, Calendar, Backlog and Notes (controls such as month arrows stay); Notes gets the full height with tighter top padding and the editor toolbar sticky. At widths below 768px the existing phone layout applies, as today.

- [ ] **Step 1: Failing tests:** `SideRail` renders exactly six parts in order, equal rows, `aria-current` on the active page, badge count, sync label, the New task button with `aria-keyshortcuts`, side `right` flips the order, `hidden` renders nothing; App static tests: no `<header>` navbar on desktop; Notes focus mode passes `hidden`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the rail and layout; remove the page-title rows; keep keyboard shortcuts (Ctrl/⌘ K, Ctrl/⌘ Shift F, `/`, `g` combos) working.
- [ ] **Step 4: Update every script selector that depended on the top bar** so existing QA/UX scenarios keep their intent (search for `header`, `getByRole('banner')`, nav button names); add QA scenarios: rail at 1280px and 800px (no overlap, content ≥ 640px wide), side switch left/right in Appearance, Notes focus mode hides and restores the rail, custom header colours applied to the rail in light and dark, photo background readable.
- [ ] **Step 5: Run `npm run lint`, `npm test`, `npm run build`, `npm run test:qa`, UX suite; expect PASS.**
- [ ] **Step 6: Commit** `feat: desktop side rail replaces the top bar`.

### Task 8: Backlog on phones

**Files:**
- Modify: `src/components/mobile/MobileAppShell.tsx` (+ tests), `src/App.tsx`, `src/components/backlog/BacklogView.tsx` (compact layout)

**Interfaces:**
- Produces: bottom bar order **Today, Calendar, + , Backlog, Notes, Settings** (my call; the tabs use `flex-1 min-w-0` instead of `min-w-16` so six slots fit a 360px screen with labels); `activeTab === 'backlog'` renders `BacklogView` in compact mode (stacked rows, full-width pick control, 44px targets); Android Back from Backlog returns to Today; the New task sheet already carries the Backlog target.
- Consumes: Task 5 `BacklogView` props.

- [ ] **Step 1: Failing tests:** `MobileAppShell` static render shows six slots in the stated order and `aria-current` on Backlog; compact `BacklogView` renders without the desktop-only controls.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** and add a QA scenario at 360×740: tab labels do not clip, the + stays centred, the Backlog sheet menu fits above the bar.
- [ ] **Step 4: Run `npx vitest run`, `npm run build`, `npm run test:qa`, `npm run test:e2e`; expect PASS.**
- [ ] **Step 5: Commit** `feat: Backlog tab on phones`.

### Task 9: Zoomable screenshots on the site

**Files:**
- Modify: `site/index.html`, `site/style.css`, `scripts/build-site.mjs` (copy `site/` already includes new files)
- Create: `site/zoom.js`, `scripts/helpers/zoom.test.mjs`
- Modify: `package.json` `test:helpers` script and `.github/workflows/pages.yml` test step to include the new test file

**Interfaces:**
- Produces: every gallery/phone `<figure><img>` is wrapped (at build time or in the HTML) in `<a href="screens/<file>.png" data-zoom>`; `zoom.js` (plain script, no dependency) opens a `<dialog>`-based overlay with the full-size image and caption, previous/next buttons, a close button; Esc/backdrop click closes, ←/→ browse, swipe browses on touch, focus is trapped and returned to the opener; the page behind does not scroll; without JavaScript the anchors open the image file. Exports pure helpers for testing: `nextIndex(index: number, count: number, step: 1 | -1): number` (wraps), `swipeStep(dx: number, threshold = 40): 1 | -1 | 0`.

- [ ] **Step 1: Failing helper tests (`node:test`):** `nextIndex` wraps both ways; `swipeStep` thresholds; the built `_site/index.html` (via `node scripts/build-site.mjs` with no network, as the existing site test does) contains one `data-zoom` anchor per screenshot with its `href` equal to the image `src`.
- [ ] **Step 2: Run `npm run test:helpers`; expect FAIL.**
- [ ] **Step 3: Implement** `zoom.js`, markup and styles (dark/light variables from `style.css`; image `max-width/height: 92vmin`).
- [ ] **Step 4: Verify in a real browser** (Playwright or Chrome tool): open, arrows, Esc, focus return, mobile viewport; record what was checked.
- [ ] **Step 5: Run `npm run test:helpers` and `npm run build:site`; expect PASS.**
- [ ] **Step 6: Commit** `feat: click-to-zoom screenshots on the site`.

### Task 10: Guides (one source, app Help and site Guide)

**Files:**
- Create: `docs/guide/*.md` (one file per topic, front matter `title`, `order`; each has `## Web` and `## Mobile` sections), `scripts/helpers/guide.mjs` (+ `guide.test.mjs`), `src/utils/guideData.ts` (generated, committed or built by a Vite plugin — builder's choice, one mechanism), `src/components/settings/HelpTab.tsx` (+ test)
- Modify: `src/types/daymark.ts` (`SettingsTab` gains `'help'`), `src/components/SettingsModal.tsx` (tab), `scripts/build-site.mjs` (renders `guide.html`), `site/index.html` and `site/style.css` (nav link and styles), `package.json` (`validate:ai`/`test:helpers` hooks if needed)

**Interfaces:**
- Produces: `loadGuide(dir: string): GuideTopic[]` with `GuideTopic { slug: string; title: string; order: number; web: string; mobile: string }` (Markdown strings split at `## Web` / `## Mobile`; throws a clear error if either part is missing or empty); topics in this order: Getting started and install, Today and carrying forward, Sections, statuses and moving tasks, Backlog, Habits, Calendar, Notes, Search, Sync and the server, Backups, Appearance, Widgets (Android), Shortcuts and gestures. In-app `HelpTab`: topic list, Web | Mobile switch defaulting to the mobile text when `appMode`/viewport is the phone layout, offline, rendered with the existing Markdown renderer (`MarkdownPreview`/`markdownHtml`), text only. Site `guide.html`: topic list, same switch (works without JS by showing both sections stacked), reuses `screens/*` images with `data-zoom`. Content is written against the finished 1.7.0 features and the real UI labels (rail parts, "Move to section…", "Move to backlog", Appearance › Menu side).
- Consumes: Tasks 4–8 labels; Task 9 zoom script.

- [ ] **Step 1: Failing tests:** `loadGuide` parses front matter and splits parts; missing `## Mobile` throws; every file in `docs/guide/` has both parts (this is the repo-level check); `HelpTab` renders topics and switches parts; built `_site/guide.html` exists and links every topic.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Write the 14 topic files** (short, task-oriented, each part 80–250 words, no invented features), implement the loader, the in-app tab and the site page.
- [ ] **Step 4: Run `npm run test:helpers`, `npx vitest run src/components/settings`, `npm run build:site`, `npm run build`; expect PASS. Check the APK-bound bundle size grows by less than 100 KB gzip (record the number).**
- [ ] **Step 5: Commit** `feat: web and mobile guides in the app and on the site`.

### Task 11: Regression coverage, docs and cycle-10 release material

**Files:**
- Modify: `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`, `scripts/capture-screenshots.mjs`, `README.md`, `docs/README.md`, `.ai-configs/project/*` (module map: backlog, rail, guide), `site/index.html` (feature cards: backlog, side menu; new screenshots)
- Create: `docs/releases/cycle-10/README.md`, `docs/releases/cycle-10/images/*` (via `node scripts/capture-screenshots.mjs cycle-10`)

- [ ] **Step 1: Add QA/UX scenarios** not already added: add a backlog task with a category and pick it into a day (section reused, section created); move a Today task to the backlog and back; "Move to section…" into an existing and a new section on desktop and in the phone sheet; backlog items absent from Today/Calendar/Week and from the delay alert and day counts; Help tab opens and switches Web/Mobile; the site gallery opens a lightbox (via the built `_site`).
- [ ] **Step 2: Capture cycle-10 screenshots** (rail left and right, Backlog page, New task sheet with Backlog target, Move to section dialog, phone Backlog tab, Help page, lightbox) and write the release README plus website feature cards using only captured images.
- [ ] **Step 3: Update docs** (`README.md` feature list and guide link, module map) and run `npm run validate:ai`.
- [ ] **Step 4: Full verification:** `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run test:qa`, UX suite, `npm run test:sync`, `npm run test:e2e`, `npm run android:build -- --test`; all must pass; record counts in the release README (no release is cut here).
- [ ] **Step 5: Commit** `docs: cycle 10 QA, screenshots and release notes`.

---

## Self-review

- **Spec coverage:** A backlog (Tasks 1, 2, 3, 5, 8), B side rail + Appearance side + Notes space (Tasks 6, 7), C move to section (Task 4), D zoom (Task 9), E guides (Task 10), QA/docs (Task 11). Open design choices recorded: reconcile instead of per-device locks; six-slot phone bar.
- **Types consistent:** `BacklogItem/BacklogData/EMPTY_BACKLOG`, `moveTaskToBacklog`, `pickBacklogItem`, `reconcileBacklog`, `mergeBacklog`, `resolveMenuSide`, `moveTaskToSection`, `loadGuide` are named identically wherever used.
- **Order:** 1 → 2 → 3 (data) → 4 (independent) → 5 → 6 → 7 → 8 → 9 → 10 → 11; Task 7 needs Task 5's `'backlog'` tab and Task 6's setting; Task 10 needs final labels.
