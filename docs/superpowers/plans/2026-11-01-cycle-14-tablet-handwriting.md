# Cycle 14: Tablet Inset, Handwritten Notes, Pen Highlighting, Signed APK, Widget Thresholds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Daymark comfortable on the owner's Samsung tablet: no controls under the status bar, notebook-style handwritten notes that sync, S Pen highlighting on typed notes, a properly signed APK, and widgets that use the owner's warning thresholds.

**Architecture:** Handwritten notes are ordinary `StandaloneNote`s with a `kind: 'handwritten'` marker and placeholder text; their ink lives in separate per-page sync entities `ink:<noteId>:<page>`, gated by a new `ink` sync feature so old clients never receive or push them. Ink pages merge as a union of strokes with removal records, so no stroke is ever lost. The writing surface is a canvas in the WebView with pen/touch/palm classification, a live layer for the stroke in progress and a cached layer for committed strokes. Typed-note highlights use TipTap's highlight mark stored as `<mark>` HTML in the note Markdown.

**Tech Stack:** React 19, TypeScript, TipTap 3, Vite, Tailwind v4 (stone palette), IndexedDB, Express sync server, Capacitor 8 Android (Kotlin widgets), Vitest (`--maxWorkers=2`), Playwright e2e scripts.

**Spec:** `docs/superpowers/specs/2026-11-01-cycle-14-tablet-handwriting-design.md`

## Global Constraints

- Old versions keep syncing without data loss: a device on 1.10.0 or earlier must not erase or corrupt ink or break; it shows the handwritten note with the plain placeholder text. Refusing old clients is not acceptable.
- Ink never loses a stroke in a sync conflict; two devices writing on the same page both keep their strokes.
- Pen on typed notes: highlighting only while the toolbar **highlighter tool** is on and only for pointer type `pen`; finger and mouse never highlight by dragging; with the tool off the pen behaves as today.
- Eraser: both **erase by area** (default) and **erase by stroke**, chosen in the eraser options, remembered per device.
- Handwritten notes: separate fixed A4-portrait pages; pens in several colours, a highlighter drawn under the ink, eraser; paper lined, grid (and blank, builder's call kept); writing allowed only with pen input, read only otherwise.
- Writing feel is the top priority; WebView only this cycle (no native ink layer). If the target cannot be reached, stop and report with measurements.
- Notebooks up to 50 pages open, write and sync smoothly; one stroke must not re-send the whole notebook (per-page entities).
- Sync batches are limited by count and an 8 MiB byte budget (cycle 13).
- Signed APK: keystore and passwords never in the repository; a release build without the key fails clearly, never falls back to the debug key; release asset named `daymark-X.Y.Z.apk` with `SHA256SUMS`.
- Widgets use the owner's `agingThresholds` (attentionDays, criticalDays, enabled) and counting days; older APKs fall back to 3 and 7.
- `CLAUDE.md` invariants: stone palette only, types in `src/types/daymark.ts`, `max-w-[1800px]` desktop width, markdown comment format preserved.
- Vitest with `--maxWorkers=2`, heavy suites one at a time. Commits authored as `dngioidev`. No push, release or deploy without the owner's request.
- Branch `cycle-14-tablet` from `main` (1.10.0).

## Review Focus

1. A 1.10.0 device keeps syncing while handwritten notes exist: it never receives or pushes `ink:` entities, never deletes them, and the `kind` marker survives its edits. Pinned in Task 5.
2. The app is closed or killed right after writing: every finished stroke is saved within 1 s and on `pagehide`/app pause, so nothing written is lost. Pinned in Task 6.
3. A palm, a second finger or a pen hover while writing never leaves a mark; after the pen has been used, finger input scrolls and never draws. Pinned in Task 6.
4. A dense page (2,000 strokes) stays under 1 MB as an entity and redraws without stalls; a 50-page notebook opens without loading every page at once. Pinned in Tasks 4 and 6.
5. A typed note with highlights edited on a 1.10.0 device: highlights are kept or the loss is a stated limit backed by a test. Pinned in Task 8.

## File Structure

- `src/types/daymark.ts` (modify): `StandaloneNote.kind?`, `StandaloneNote.paper?`, `InkTool`, `InkStroke`, `InkPage`.
- `src/ink/inkModel.ts` (create): pure stroke encode/decode, add, erase by stroke, erase by area, page merge, entity key helpers.
- `src/ink/inkRender.ts` (create): pure stroke-to-path geometry with pressure widths; paper backgrounds.
- `src/ink/pointerPolicy.ts` (create): pure pen/touch/palm classification.
- `src/components/ink/InkCanvas.tsx`, `InkToolbar.tsx`, `InkPageView.tsx`, `HandwrittenNoteView.tsx` (create): writing surface, tools, read-only page view, note screen.
- `src/sync/merge.ts`, `src/sync/syncClient.ts`, `server/app.ts`, `src/utils/vaultValidation.ts`, `src/utils/vaultStore.ts`, `src/utils/vaultArchive.ts` (modify): ink entities, feature gate, persistence, backup.
- `src/components/notes/editorExtensions.ts`, `EditorToolbar.tsx`, `RichNoteEditor.tsx` (modify), `src/components/notes/penHighlight.ts` (create): typed-note highlighter.
- `src/components/notes/NoteNavigation.tsx`, `src/components/StandaloneNotesView.tsx` (modify): create and list handwritten notes.
- `scripts/build-android.mjs`, `mobile/android/app/build.gradle`, `.gitignore` (modify): release signing.
- `src/utils/widgetSnapshot.ts`, `src/utils/habitWidgetSnapshot.ts`, Kotlin `WidgetModel.kt`, `WidgetStore.kt` (modify): thresholds.

---

### Task 1: Tablet top inset

**Files:**
- Modify: the desktop/tablet shells and headers that sit at the top edge: `src/components/SideRail.tsx`, `src/components/notes/NotesStrip.tsx`, `src/components/notes/NotesDrawer.tsx`, `src/components/StandaloneNotesView.tsx` (Notes column header), `src/components/ui/Dialog.tsx` (the `sm:` sizes), the graph toolbar under `src/components/notes/graph/`, `src/App.tsx` top-level layout, and the Capacitor/Android status-bar setup if needed (`capacitor.config.*`, `mobile/android/app/src/main/...`)
- Test: `src/components/safeAreaTop.test.ts` (create), `scripts/helpers/` screenshot helper if useful

**Interfaces:**
- Produces: a shared CSS custom property `--dm-safe-top` (= `env(safe-area-inset-top, 0px)`, or the Capacitor-provided inset if the Android WebView reports 0) defined once in the global stylesheet, used by every top-edge container.

- [ ] **Step 1: Write the failing test** `safeAreaTop.test.ts`: render the desktop layout (SideRail + Notes view) and a `sm`-size Dialog with `--dm-safe-top: 24px` set on `:root`; assert each top-edge container's computed top padding (or inline style/class) includes the variable — at minimum assert the class or style string references `--dm-safe-top` for: side rail title part, Notes column header, Notes strip, drawer header, dialog header, graph toolbar.
- [ ] **Step 2: Run** `npx vitest run src/components/safeAreaTop.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the variable and apply `padding-top: var(--dm-safe-top)` (or `top` offset for fixed/sticky elements) to those containers. Check in `mobile/android` whether the WebView draws edge-to-edge under the status bar (targetSdk 35+ enforces it) and whether `env(safe-area-inset-top)` is non-zero there; if it is 0, read the real inset natively (Capacitor `SystemBars`/insets API or a small `WindowInsets` listener in `MainActivity`) and set `--dm-safe-top` from it. The phone shell keeps its current behaviour (switch it to the shared variable).
- [ ] **Step 4: Run** the test, `npm run lint`, and the existing layout tests (`src/components/SideRail.test.ts`, `src/components/StandaloneNotesView.responsive.test.ts`, `src/components/mobile/MobileAppShell.test.ts`). Expected: PASS. Controller verifies on an Android tablet emulator in portrait and landscape with screenshots.
- [ ] **Step 5: Commit** `fix: leave room for the status bar on tablets`.

---

### Task 2: Widgets use the owner's warning thresholds

**Files:**
- Modify: `src/utils/widgetSnapshot.ts`, `src/hooks/useWidgetSync.ts`, `mobile/android/app/src/main/java/app/daymark/notes/WidgetModel.kt`, `WidgetStore.kt`, `DaymarkGlanceWidget.kt` if it calls `severity`
- Test: `src/utils/widgetSnapshot.test.ts`, `mobile/android/app/src/test/java/app/daymark/notes/WidgetModelTest.kt`

**Interfaces:**
- Produces: optional top-level snapshot fields `aging?: { attentionDays: number; criticalDays: number; enabled: boolean }`; Kotlin `WidgetModel.severity(ageDays, aging)` with `Aging(attentionDays = 3, criticalDays = 7, enabled = true)` defaults when the field is missing.

- [ ] **Step 1: Write the failing tests**: TS — the snapshot carries `aging` from `settings.agingThresholds` (e.g. 2 / 5 / true) and omits nothing else; Kotlin — `severity(4, Aging(2, 5, true))` is attention, `severity(5, …)` critical, `severity(9, Aging(enabled = false))` normal, and parsing a snapshot without `aging` yields 3 / 7 / enabled.
- [ ] **Step 2: Run** `npx vitest run src/utils/widgetSnapshot.test.ts --maxWorkers=2` (Kotlin tests run by the controller via `npm run android:build -- --test`). Expected: FAIL.
- [ ] **Step 3: Implement** the field in the snapshot builder and in Kotlin parsing; `severity` uses it; counting days already flow through `countingDays`.
- [ ] **Step 4: Run** the TS test and `npm run lint`. Expected: PASS. Controller runs the Android build with Kotlin tests.
- [ ] **Step 5: Commit** `fix: widgets use your own warning thresholds`.

---

### Task 3: Signed release APK

**Files:**
- Modify: `scripts/build-android.mjs`, `mobile/android/app/build.gradle`, `.gitignore`, `docs/guide/` Android/install page, `.ai-configs/project/` release notes or `CLAUDE.md` build commands section (document `--release`)
- Test: `scripts/helpers/build-android.test.mjs` (create, node:test) for the pure argument/env logic

**Interfaces:**
- Produces: `npm run android:build -- --release` → runs `assembleRelease`, copies the signed APK to `mobile/android/app/build/outputs/apk/release/app-release.apk`; signing inputs from env `DAYMARK_KEYSTORE` (path), `DAYMARK_KEYSTORE_PASSWORD`, `DAYMARK_KEY_ALIAS`, `DAYMARK_KEY_PASSWORD`, or from a git-ignored `mobile/android/keystore.properties` with keys `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. `--release --test` runs `testReleaseUnitTest` first.

- [ ] **Step 1: Write the failing test** for an exported pure helper `releaseSigning(env, fileProps) -> { ok: true, config } | { ok: false, message }`: env wins over file; missing any of the four values gives `ok: false` with a message naming the missing value and pointing at the guide; never returns the debug keystore.
- [ ] **Step 2: Run** `npm run test:helpers`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and the `--release` path; in `build.gradle` add a `signingConfigs.release` read from `keystore.properties` or env and use it for `buildTypes.release`; if absent, the release task fails with the message (Gradle `throw new GradleException`). Add `keystore.properties`, `*.jks`, `*.keystore` to `.gitignore`. Document in the guide: how the keystore is made (`keytool -genkeypair -v -keystore <path outside repo> -alias daymark -keyalg RSA -keysize 4096 -validity 36500`), where to keep it, how to back up keystore and passwords, and the one-time switch (sync or back up, uninstall the debug-signed app, install the signed APK, sign in again).
- [ ] **Step 4: Run** `npm run test:helpers`, `npm run validate:ai`. Expected: PASS. Controller later creates the real keystore outside the repo and runs the release build.
- [ ] **Step 5: Commit** `feat: signed release APK build`.

---

### Task 4: Ink model (pure)

**Files:**
- Modify: `src/types/daymark.ts`
- Create: `src/ink/inkModel.ts`, `src/ink/inkModel.test.ts`

**Interfaces:**
- Produces (types in `daymark.ts`):
  - `type InkTool = 'pen' | 'highlighter'`
  - `interface InkStroke { id: string; tool: InkTool; color: string; width: number; points: string; createdAt: string }` — `points` is base64 of little-endian Int16 delta-encoded triples (x, y, pressure×1000) in page units, page = 1000 × 1414 (A4 portrait).
  - `interface InkPage { noteId: string; page: number; strokes: InkStroke[]; removed: string[]; updatedAt: string }`
  - `StandaloneNote.kind?: 'handwritten'`, `StandaloneNote.paper?: 'lined' | 'grid' | 'blank'`
- Produces (functions in `inkModel.ts`):
  - `encodePoints(points: { x: number; y: number; p: number }[]): string`, `decodePoints(s: string): { x: number; y: number; p: number }[]`
  - `inkKey(noteId: string, page: number): string` → `ink:<noteId>:<page>`; `parseInkKey(key: string): { noteId: string; page: number } | null`; `isInkEntityKey(key: string): boolean`
  - `addStroke(page: InkPage, stroke: InkStroke, now: string): InkPage`
  - `eraseStrokes(page: InkPage, ids: string[], now: string): InkPage` (erase by stroke: ids go to `removed`)
  - `eraseArea(page: InkPage, center: { x: number; y: number }, radius: number, newId: () => string, now: string): InkPage` (erase by area: each hit stroke is removed and its surviving runs of points become new strokes)
  - `visibleStrokes(page: InkPage): InkStroke[]` (strokes not in `removed`, highlighters first, then pens, each group by `createdAt`)
  - `mergeInkPage(base: InkPage | null, ours: InkPage | null, theirs: InkPage | null): InkPage | null` (union of strokes by id, union of removed; never drops a stroke that is not in `removed`; null only when both sides are null)
  - `PAGE_WIDTH = 1000`, `PAGE_HEIGHT = 1414`

- [ ] **Step 1: Write the failing tests**: encode/decode round-trips within 1 unit and 0.001 pressure, including negative deltas and 3,000-point strokes; `inkKey`/`parseInkKey` round-trip and reject `ink:a:b`, `ink::1`, `doc:2026-10-01`; erase by stroke hides only the named ids; erase by area through the middle of a horizontal stroke leaves two strokes covering the left and right parts and none inside the radius; merge keeps strokes added on both sides, keeps a removal from either side, is the same in both argument orders, and is idempotent; a page of 2,000 strokes × 60 points serialized with `JSON.stringify` is under 1,000,000 bytes.
- [ ] **Step 2: Run** `npx vitest run src/ink/inkModel.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** `inkModel.ts` (pure, no DOM).
- [ ] **Step 4: Run** the test and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: ink stroke model with lossless merge`.

---

### Task 5: Ink sync, storage and backup

**Files:**
- Modify: `src/sync/merge.ts` (`isValidEntityKey`, `mergeEntity` → `mergeInkPage` for ink keys), `src/sync/syncClient.ts` (`VaultData.ink: InkPage[]`, `toEntities`/`fromEntities`, `features` adds `'ink'`, older-server fallback probes `'ink'` first), `server/app.ts` (validation, feature gate: refuse ink changes without the `ink` feature; never send ink entities to clients without it), `src/utils/vaultValidation.ts` (`isInkPage`), `src/utils/vaultStore.ts` (persist ink under its own key; debounced and flushed), `src/utils/vaultArchive.ts` (`.zip` sidecar `ink/<noteId>.json` per handwritten note, `.json` backup `ink` array; restore exactly), `src/hooks/useSync.ts` if it builds `VaultData`
- Test: `src/sync/audit/ink.test.ts` (create, rig), `src/sync/merge.test.ts`, `src/utils/vaultArchive.test.ts`, `server/app.test.ts`

**Interfaces:**
- Consumes: Task 4 types and functions.
- Produces: `VaultData.ink`; `SyncFeature` includes `'ink'`; `saveInkPages(pages: InkPage[]): void`, `loadInkPages(): Promise<InkPage[]>` in `vaultStore.ts`.

- [ ] **Step 1: Write the failing tests**: rig — device A writes strokes on pages 0 and 1 of a handwritten note, syncs; device B receives both pages exactly; A and B each add a stroke to page 0 offline and both strokes survive on both; a **legacy** device (extend the rig's legacy mode to omit `'ink'` from `features` and strip `kind`/`paper` only if 1.10 would — check the 1.10 code and mirror it) syncs before and after: it never receives `ink:` keys, never sends deletions for them, the note's `kind` marker survives a legacy edit of the note text, and A still has all strokes; server refuses an `ink:` change from a client without the feature (400) and does not include ink in its response to such a client; a new client against a server that rejects `ink:` keys falls back and still syncs everything else; `.zip` and `.json` backup round-trips ink exactly; a 50-page note syncs within the batch budget and a single new stroke pushes only its page.
- [ ] **Step 2: Run** `npx vitest run src/sync/audit/ink.test.ts src/sync/merge.test.ts src/utils/vaultArchive.test.ts server/app.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** the entity, gate, persistence and backup.
- [ ] **Step 4: Run** the tests, `npm run lint`, then `npx vitest run src/sync server --maxWorkers=2`. Expected: PASS (all existing sync tests unchanged).
- [ ] **Step 5: Commit** `feat: sync and back up handwritten ink safely`.

---

### Task 6: Writing surface

**Files:**
- Create: `src/ink/inkRender.ts`, `src/ink/pointerPolicy.ts`, `src/components/ink/InkCanvas.tsx`, `src/components/ink/InkToolbar.tsx`, `src/components/ink/InkPageView.tsx`
- Test: `src/ink/inkRender.test.ts`, `src/ink/pointerPolicy.test.ts`, `src/components/ink/InkCanvas.test.ts`, `scripts/ink-bench.mjs` (create)

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `classifyPointer(state: PointerState, e: { pointerType: string; width: number; height: number; isPrimary: boolean }): { action: 'draw' | 'scroll' | 'ignore'; state: PointerState }` — `pen` draws; `touch` never draws (it scrolls or turns pages); a large contact (width or height > 30 CSS px) or any extra touch while a pen stroke is active is `ignore` (palm); `mouse` draws only when the canvas prop `allowMouse` is set (tests only).
  - `strokeOutline(points, width, tool): Path2D-compatible polygon points` with width scaled by pressure (pen: 0.5×–1.5× of `width`; highlighter: constant width, drawn at 35% opacity under pens).
  - `<InkCanvas page paper tool color width eraserMode onChange readOnly />`; `<InkToolbar />` with pen colours (black `#1c1917`, blue `#1d4ed8`, red `#b91c1c`, green `#15803d`), sizes (fine, medium, thick), highlighter colours (yellow `#fde047`, green `#86efac`, pink `#f9a8d4`), eraser with an "Erase by area / Erase by stroke" option (default area, remembered per device in localStorage key `dm.ink.eraserMode`), undo, redo; `<InkPageView page paper />` read-only renderer.
- [ ] **Step 1: Write the failing tests**: `pointerPolicy` table — pen draws; touch scrolls and never draws; palm-sized touch ignored; a second touch while a pen stroke is active ignored; mouse ignored unless `allowMouse`; `inkRender` — pressure 0 and 1 give the min and max widths, highlighters render before pens; `InkCanvas` (jsdom with a canvas stub) — a synthetic pen pointerdown/moves/up commits exactly one stroke via `onChange`, a palm touch during the stroke adds nothing, erase by area and by stroke call the model functions, undo/redo restore the previous page, a finished stroke is persisted within 1 s and immediately on `pagehide`; `readOnly` ignores pen input.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement**: committed strokes rendered to an offscreen/cached layer redrawn only when the committed set changes; the stroke in progress drawn on a live layer per animation frame from `getCoalescedEvents()` (and `getPredictedEvents()` for the live segment only, never committed); `touch-action: none` on the canvas while a pen is active so the browser does not scroll under the pen; device-pixel-ratio aware sizing; paper drawn as a CSS background (lined 32 px rule spacing at page scale, grid 32 px squares), not as strokes.
- [ ] **Step 4: Run** the tests and `npm run lint`. Then `node scripts/ink-bench.mjs` (after `npm run build`): a Playwright script that opens a dev route with a page of 2,000 existing strokes, dispatches 600 pen `pointermove` events at 240 Hz via CDP `Input.dispatchMouseEvent`/pointer events with `pointerType: 'pen'`, and reports the 95th-percentile time from event to the frame that shows it. Expected: p95 ≤ 16 ms and no long task > 50 ms. If it misses, stop and report the numbers (spec: do not ship laggy writing).
- [ ] **Step 5: Commit** `feat: low-latency ink writing surface`.

---

### Task 7: Handwritten notes in the Notes screens

**Files:**
- Modify: `src/components/notes/NoteNavigation.tsx` (New note ▾ menu gains "Handwritten note"; rows show a pen icon and "N pages" for handwritten notes), `src/components/StandaloneNotesView.tsx`, `src/components/notes/PhoneNotes.tsx` (open a handwritten note in `HandwrittenNoteView`), search (title match only for handwritten notes), graph (title only), Markdown export (placeholder text)
- Create: `src/components/ink/HandwrittenNoteView.tsx`
- Test: `src/components/ink/HandwrittenNoteView.test.ts`, `src/components/notes/NoteNavigation.test.ts`, `src/components/StandaloneNotesView.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: `HANDWRITTEN_PLACEHOLDER = 'Handwritten note: open Daymark 1.11 or later on a tablet to view.'` (stored as the note's `content`); `createHandwrittenNote(folder: string, paper: 'lined' | 'grid' | 'blank', now: string): StandaloneNote`; `canWrite(): boolean` (true once a pen pointer has been seen on this device, persisted in localStorage `dm.ink.penSeen`, so phones and laptops stay read only).

- [ ] **Step 1: Write the failing tests**: the menu item creates a note with `kind: 'handwritten'`, the chosen paper, the placeholder content, in the current folder, and opens it; the row shows the pen icon and the page count; `HandwrittenNoteView` shows page 1, adds a page with "Add page", navigates pages, loads only the visible page and its neighbours (a 50-page note mounts at most 3 `InkCanvas` instances), is read only (pages scaled to width, no toolbar) when `canWrite()` is false; search finds it by title, not by placeholder text; export writes the placeholder; renaming, moving and pinning work as for typed notes.
- [ ] **Step 2: Run** the test files. Expected: FAIL.
- [ ] **Step 3: Implement** the view and the wiring.
- [ ] **Step 4: Run** the tests, `npm run lint`, and `npx vitest run src/components --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: handwritten notes in the notes column`.

---

### Task 8: Pen highlighter on typed notes

**Files:**
- Modify: `package.json` (add `@tiptap/extension-highlight` matching the installed TipTap 3 version), `src/components/notes/editorExtensions.ts`, `src/components/notes/EditorToolbar.tsx`, `src/components/notes/RichNoteEditor.tsx`
- Create: `src/components/notes/penHighlight.ts`
- Test: `src/components/notes/penHighlight.test.ts`, `src/components/notes/RichNoteEditor.test.ts`

**Interfaces:**
- Produces: `wordRangeForStroke(doc, positions: number[]): { from: number; to: number } | null` (expands the min and max text positions crossed by the stroke to whole-word boundaries within one textblock or across consecutive textblocks); toolbar toggle "Highlighter" with the three highlighter colours from Task 6; highlights serialized as `<mark data-color="#fde047" style="background-color: #fde047">text</mark>` in the note Markdown.

- [ ] **Step 1: Write the failing tests**: `wordRangeForStroke` snaps a stroke from the middle of "learning" to the middle of "notes" in "Study learning and taking notes" to exactly "learning and taking notes"; a stroke inside one word highlights that word; Markdown round-trip keeps the mark and its colour; with the tool on, a synthetic pen drag applies the highlight; with the tool off, a pen drag places the cursor/selects as before; a mouse or finger drag never highlights; the tool state is per editor and off by default; a note saved with highlights and then loaded and saved by an editor **without** the highlight extension (simulating 1.10.0) — record whether `<mark>` survives; if it does not, add the known limit to the release notes task and keep the test asserting current behaviour.
- [ ] **Step 2: Run** the test files. Expected: FAIL.
- [ ] **Step 3: Implement**: on pen `pointerdown` with the tool on, capture the pointer, collect `view.posAtCoords` along the path, show a translucent preview, and on `pointerup` apply `setHighlight({ color })` to `wordRangeForStroke`; dragging across highlighted words with the same colour removes it (toggle), matching Samsung Notes.
- [ ] **Step 4: Run** the tests, `npm run lint`, `npx vitest run src/components/notes --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: S Pen highlighter on typed notes`.

---

### Task 9: Browser e2e, docs and release notes

**Files:**
- Modify: `scripts/e2e-qa-regressions.mjs` or a new `scripts/helpers/cycle-14-qa.mjs`, `scripts/e2e-sync.mjs`, `docs/guide/notes.md`, a new or updated Android guide section, `site/index.html`, `docs/releases/cycle-14/README.md` (create) with `images/`

- [ ] **Step 1: Add e2e checks**: tablet viewport (1280 × 800 and 800 × 1280) with `--dm-safe-top: 24px` forced: no top control's bounding box starts above 24 px; create a handwritten note, write two pen strokes via pointer events with `pointerType: 'pen'`, a touch drag does not draw; second browser receives the note read only with both strokes; highlighter tool on a typed note highlights the crossed words and the highlight shows in the second browser.
- [ ] **Step 2: Run** `npm run build`, `npm run test:qa`, `npm run test:sync`. Expected: all pass.
- [ ] **Step 3: Write** `docs/releases/cycle-14/README.md`: what changed; the one-time switch to the signed APK in plain steps (sync or back up first, uninstall, install, sign in) and why; keystore backup reminder; known limits (WebView ink; owner trial on the Samsung tablet is the final acceptance; any highlight limit from Task 8); screenshots (tablet layout, handwritten note lined and grid, highlighter on a typed note, read-only view on phone width).
- [ ] **Step 4: Run** `npm run lint`, `npx vitest run --maxWorkers=2`, `npm run test:helpers`, `npm run validate:ai`. Expected: all green.
- [ ] **Step 5: Commit** `docs: cycle 14 release notes and e2e coverage`.
