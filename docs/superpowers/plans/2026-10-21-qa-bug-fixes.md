# QA Bug Fixes (BUG-01 … BUG-17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 17 bugs found in the 2026-10-21 QA pass and pin each one with a permanent test.

**Architecture:** Domain fixes go into `src/utils/` (lifecycle, markdown, task actions, a new validation module) and `src/sync/merge.ts`. Server hardening goes into `server/app.ts`. UI fixes are thin and live in the components that own the behaviour. The QA browser probe becomes a permanent regression script, so every UI fix has a failing check before the fix and a passing one after.

**Tech Stack:** React 19, TypeScript 7, Vite 8, vitest 5, Express 4, playwright-core (local Chrome/Edge), IndexedDB. New runtime dependency: `dompurify` (Task 2).

**Spec:** `docs/reports/qa-e2e/2026-10-21-qa-report.md` (bug IDs, evidence, root causes). Read it first.

## Global Constraints

- Markdown task comment format is unchanged: `<!-- daymark: task_id=<id> status=<status> created=<YYYY-MM-DD> [carried_from=<YYYY-MM-DD>] [completed=<YYYY-MM-DD>] -->`.
- `performDailyRollover` must stay idempotent (never duplicate a task id in a day).
- Types live in `src/types/daymark.ts`; new fields are **optional** so existing vaults load unchanged. No `any`.
- Tailwind: stone palette only (`stone-50`..`stone-950`); desktop keeps `max-w-[1800px]`.
- Any change to `lifecycleEngine.ts` or `markdownEngine.ts` adds tests to the sibling `*.test.ts`.
- User-facing copy is plain language, matching existing toasts (e.g. `Backup restored.`, `Deleted “X”`).
- Work on a new branch `qa-fixes-2026-10-21` cut from `cycle-5-ux-redesign`. Commit once per task, and end each message with the repo's Co-Authored-By line.
- Gate after every task: `npm run lint && npm test`. Tasks that touch UI also run `npm run build && npm run test:qa -- <prefix>` for their probe IDs.

## Review Focus

1. **Existing vaults with junk already stored** (from BUG-03/04 before the fix): the app and the server must still open, and sync must still work. Covered by Task 4 step "repairs a corrupt stored entity" and Task 3 `loadDailyDocuments` filter.
2. **Obsidian / hand-written Markdown ZIP import** after the parser change: `## Section` style files must still split into sections. Covered by Task 11 test `keeps ## headings as sections when the file uses ## for sections`.
3. **Undo after the vault changed in another tab** (Task 9 + Task 7 interplay): Undo must re-insert into the *latest* day, not a stale copy. Covered by Task 7 functional-update design plus Task 9 probe `B9`.
4. **Sync of the new optional fields** (`removedTaskIds`, `statusBeforeDone`) between an updated and a not-yet-updated device: an old client drops unknown fields, so the merge must not report a conflict loop. Covered by Task 7 merge test `drops tombstones for tasks that are present`.
5. **Restoring a backup while sync is on** keeps the server's settings (consequence of Task 5). This is intentional; it is documented in the release notes and pinned by Task 5 test `fresh device adopts server settings`.

---

### Task 1: Permanent QA regression script

**Files:**
- Move: `docs/reports/qa-e2e/qa-e2e-probe.mjs` → `scripts/e2e-qa-regressions.mjs`
- Modify: `package.json` (scripts), `CLAUDE.md` §4 and `.ai-configs/rules/testing-and-verification.md` §4 (add the command)

**Interfaces:**
- Produces: `npm run test:qa [-- <idPrefix>]`. It exits non-zero when any check fails. Check IDs (B1…B15, C1…C4) are referenced by later tasks.

- [ ] **Step 1:** `git mv` the file. Change the header comment to describe it as the regression suite. Change the final `process.exit(0)` to `process.exit(results.some((r) => !r.ok) ? 1 : 0)`. Remove the `check('B13a', … || true …)` informational check.
- [ ] **Step 2:** Add `"test:qa": "node scripts/e2e-qa-regressions.mjs"` to `package.json`. Add the command line to both docs.
- [ ] **Step 3:** Run `npm run build && npm run test:qa`. Expected: exit 1. FAIL lines for B1c, B2a, B2b, B3a, B3b, B4, B5, B6a, B7a, B7b, B8a, B9, B15/C4, C1, C2b, C3 (B8 now asserts properly; see Task 3).
- [ ] **Step 4:** Fix B8 so it asserts the vault was **not** replaced. After clicking Restore, `readDocs` must still contain `keep me`, and an alert dialog must be visible. Fix B11 to assert that the Section `<select id="capture-section">` has ≥1 option with a non-empty value. Rerun; B8a and B11 now FAIL too.
- [ ] **Step 5:** `npm run validate:ai`. Expected: ALL CHECKS PASSED.
- [ ] **Step 6:** Commit `test: add QA regression e2e suite (fails until bugs are fixed)`.

### Task 2: Sanitise rendered Markdown (BUG-01)

**Files:**
- Create: `src/utils/markdownHtml.ts`
- Modify: `src/components/MarkdownPreview.tsx:72-131`, `package.json` (`dompurify` dependency)

**Interfaces:**
- Produces: `renderMarkdownHtml(body: string, interactive: boolean): string`. It is pure apart from DOMPurify and returns safe HTML.

- [ ] **Step 1:** `npm install dompurify` (v3 ships its own types).
- [ ] **Step 2:** Move the callout / `[[link]]` / `marked.parse` / checkbox pipeline out of the `useMemo` in `MarkdownPreview.tsx` into `renderMarkdownHtml`. Add these changes:
  - HTML-escape `calloutTitle` and the `[[…]]` text before interpolating (`&<>"'`).
  - Finish with `DOMPurify.sanitize(html, { ADD_ATTR: ['data-internal-note', 'data-task-index'], FORBID_TAGS: ['style', 'form'], ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^#|^\/(?!\/)/i })`. Keep `data-*` allowed, which is DOMPurify's default.
- [ ] **Step 3:** Run `npm run build && npm run test:qa -- B7`. Expected: B7a and B7b PASS.
- [ ] **Step 4:** Add a probe to the B7 scenario: a note containing `[x](javascript:window.__xss4=1)`. Click the link and assert `window.__xss4` is undefined. Also assert that `> [!TIP] Title` still renders `.daymark-callout-tip` and that `[[Plan]]` still renders a `button[data-internal-note="Plan"]`. Run: PASS.
- [ ] **Step 5:** Manually check one note with a checklist, a code block and a callout in light and dark mode (`npm run dev`).
- [ ] **Step 6:** Commit `fix(security): sanitise rendered Markdown (BUG-01)`.

### Task 3: Validate backups before replacing the vault (BUG-03)

**Files:**
- Create: `src/utils/vaultValidation.ts`, `src/utils/vaultValidation.test.ts`
- Modify: `src/App.tsx` (`handleImportJson`), `src/utils/vaultArchive.ts` (`importVaultFromZip`), `src/utils/vaultStore.ts` (`loadDailyDocuments`, `loadStandaloneNotes`)

**Interfaces:**
- Produces (used by Task 4):
  - `isDailyDocument(v: unknown): v is DailyDocument`. Requires: `date` matching `/^\d{4}-\d{2}-\d{2}$/`; `headings` an array of `{ name: string; items: TaskItem-like[] }`; each item has string `id`, `title`, `status`, `createdDate`.
  - `isStandaloneNote(v: unknown): v is StandaloneNote`. Requires string `id`, `title`, `content`, `folder`, and an array `tags`.
  - `isSyncedSettings(v: unknown): boolean`. Requires an object with an array `statuses` and an array `defaultHeadings`.
  - `vaultProblem(docs: unknown, notes: unknown): string | null`. Returns `null` when valid, otherwise a sentence for the user.

- [ ] **Step 1: Failing tests** in `vaultValidation.test.ts`:
```ts
it('accepts the sample vault', () => expect(vaultProblem(SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES)).toBeNull());
it('rejects a day without headings', () => expect(vaultProblem([{ foo: 1 }], [])).toMatch(/damaged/i));
it('rejects non-arrays', () => expect(vaultProblem('x', [])).not.toBeNull());
it('rejects two copies of one day', () => expect(vaultProblem([day('2026-10-20'), day('2026-10-20')], [])).toMatch(/twice/i));
it('rejects a task without an id', () => expect(isDailyDocument({ ...day('2026-10-20'), headings: [{ name: 'Work', items: [{ title: 'x' }] }] })).toBe(false));
```
plus, in `vaultArchive.test.ts`: `importVaultFromZip` of a ZIP whose `vault.json` has `daily_documents: [{ foo: 1 }]` **rejects** with the `vaultProblem` message.
- [ ] **Step 2:** `npx vitest run src/utils/vaultValidation.test.ts src/utils/vaultArchive.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the module. Messages: `This backup is damaged: day <n> can't be read.` / `This backup has <date> twice.` / `This isn't a Daymark backup.`
- [ ] **Step 4:** Wire it in:
  - `importVaultFromZip` throws `new Error(problem)`, for both the snapshot path and the parsed-Markdown path.
  - `handleImportJson` calls `alertDialog("This file can't be restored", problem)` and returns **before** `confirmReplaceVault`.
  - `loadDailyDocuments` / `loadStandaloneNotes` filter out entries that fail `isDailyDocument` / `isStandaloneNote` and `console.error` how many were dropped. This repairs vaults already damaged by the bug.
- [ ] **Step 5:** `npm test`, then `npm run build && npm run test:qa -- B8`. Expected: PASS.
- [ ] **Step 6:** Commit `fix: refuse damaged backups instead of replacing the vault (BUG-03)`.

### Task 4: Server rejects malformed sync values (BUG-04)

**Files:**
- Modify: `server/app.ts` (`runSync`), `server/app.test.ts`

**Interfaces:**
- Consumes: `isDailyDocument`, `isStandaloneNote`, `isSyncedSettings` from Task 3.
- Produces: `POST /api/sync` returns `400 { error: 'Invalid value for <key>.' }` and writes nothing when any change is invalid.

- [ ] **Step 1: Failing tests** in `server/app.test.ts` (new `describe('sync validation')`):
```ts
it('rejects a doc without headings with 400 and stores nothing', …) // push { key:'doc:2026-10-20', base:null, value:{ date:'2026-10-20', junk:true } } → 400; GET /api/server/stats .dailyNotes stays 0
it('rejects a doc whose date does not match its key', …)            // key doc:2026-01-01, value day() dated 2026-10-20 → 400
it('rejects a note whose id does not match its key', …)
it('is atomic: one bad change rejects the whole request', …)        // [valid doc, invalid doc] → 400, stats.dailyNotes 0
it('repairs a corrupt stored entity instead of failing every sync', …) // write junk straight into store.vault.entities['doc:2026-10-20'], then a valid push of that day → 200 and the pushed doc is stored
```
For the last test, expose the `FileStore` from `start()` as a module variable.
- [ ] **Step 2:** `npx vitest run server/app.test.ts`. Expected: the 5 new tests FAIL (200/500).
- [ ] **Step 3:** In `runSync`, after the key check, validate every `change.value !== null` with a `validValue(key, value)` helper (doc: `isDailyDocument && value.date === key.slice(4)`; note: `isStandaloneNote && value.id === key.slice(5)`; settings: `isSyncedSettings`). Do this before the write loop. Inside the loop, treat a stored value that fails `validValue` as `null`.
- [ ] **Step 4:** Run the tests: PASS. Then run `npm run test:sync`: 7/7 PASS.
- [ ] **Step 5:** Commit `fix(server): validate sync values atomically (BUG-04)`.

### Task 5: A newly connected device adopts the server's settings (BUG-05)

**Files:**
- Modify: `src/sync/merge.ts` (`mergeSettings`), `src/sync/merge.test.ts`, `server/app.test.ts`

- [ ] **Step 1: Failing tests:**
```ts
// merge.test.ts
it('fresh device adopts server settings', () => {
  const server = toSyncedSettings({ ...DEFAULT_SETTINGS, defaultHeadings: ['Deep work', 'Admin'] });
  const r = mergeSettings(null, server, toSyncedSettings(DEFAULT_SETTINGS));
  expect(r.value?.defaultHeadings).toEqual(['Deep work', 'Admin']);
});
it('with a shared base the incoming change still wins', …) // existing behaviour, keep green
// app.test.ts: laptop with custom headings syncs; fresh phone connects + syncs; laptop syncs again → both have ['Deep work','Admin']
```
- [ ] **Step 2:** Run: the first and third tests FAIL.
- [ ] **Step 3:** In `mergeSettings`, when `base === null` and the values conflict, return `ours` (the server copy) with the conflict message `This device now uses the settings from your other devices.`
- [ ] **Step 4:** `npm test`: PASS.
- [ ] **Step 5:** Commit `fix(sync): new devices adopt existing settings (BUG-05)`.

### Task 6: Deterministic carry-forward (BUG-10)

**Files:**
- Modify: `src/utils/lifecycleEngine.ts` (`performDailyRollover`, history entry), `src/utils/lifecycleEngine.test.ts`, `server/app.test.ts`

- [ ] **Step 1: Failing tests:**
```ts
it('two independent rollovers produce identical carried tasks', () => {
  const past = [doc('2026-10-20', [task('a', 'in-progress', '2026-10-20')])];
  const one = allItems(performDailyRollover('2026-10-21', past, statuses).updatedDocs, '2026-10-21');
  const two = allItems(performDailyRollover('2026-10-21', past, statuses).updatedDocs, '2026-10-21');
  expect(one).toEqual(two);
});
// app.test.ts: laptop + phone share a past day, each rolls over 2026-10-21 locally, both sync → conflicts [] and 1 task on 2026-10-21
```
- [ ] **Step 2:** Run: FAIL (history id/timestamp differ).
- [ ] **Step 3:** Set the carried history entry to `id: \`hist-carry-${task.id}-${targetDate}\`` and `timestamp: new Date(\`${targetDate}T00:00:00\`).toISOString()`.
- [ ] **Step 4:** `npm test`: PASS.
- [ ] **Step 5:** Commit `fix: carry-forward is deterministic so synced devices agree (BUG-10)`.

### Task 7: Deleted tasks stay deleted; Undo restores a single task (BUG-07, BUG-13)

**Files:**
- Modify: `src/types/daymark.ts` (`DailyDocument.removedTaskIds?: string[]`), `src/utils/taskActions.ts`, `src/utils/lifecycleEngine.ts` (`performDailyRollover`), `src/sync/merge.ts` (`mergeDailyDocument`), `src/components/TodayView.tsx` (`handleTaskDelete`, `handleTaskUpdate` undo, `saveMarkdown`), `src/App.tsx` (`handleDeleteTaskInDay`, `handleConfirmHistoricalCorrection` undo, new `patchDocument`), `src/components/mobile/MobileAppShell.tsx` (pass-through prop)
- Test: `src/utils/taskActions.test.ts` (new), `src/utils/lifecycleEngine.test.ts`, `src/sync/merge.test.ts`

**Interfaces:**
- Produces:
  - `interface RemovedTask { task: TaskItem; heading: string; index: number }`
  - `removeTaskFromDocument(doc: DailyDocument, taskId: string): { doc: DailyDocument; removed: RemovedTask } | null`. Adds the id to `removedTaskIds`.
  - `restoreTaskToDocument(doc: DailyDocument, removed: RemovedTask): DailyDocument`. Re-inserts at `index` (clamped) in `heading` (creating it if missing), drops the id from `removedTaskIds`, and does nothing if the id is already present.
  - TodayView prop `onPatchDocument: (date: string, patch: (doc: DailyDocument) => DailyDocument) => void`. App implements it with `setDailyDocs((prev) => …)`, so the patch runs on the latest state.

- [ ] **Step 1: Failing tests:**
```ts
// lifecycleEngine.test.ts
it('does not bring back a task deleted from the target day', …) // rollover → removeTaskFromDocument on 10-21 → rollover again → 10-21 has no 'a'
// taskActions.test.ts
it('restore puts the task back at its position and clears the tombstone', …)
it('restore keeps edits made to other tasks after the delete', …) // remove A, rename B in the doc, restore A → titles ['A', 'B renamed']
it('restore is a no-op when the task is already back', …)
// merge.test.ts
it('unions tombstones from both devices', …)
it('drops tombstones for tasks that are present', …)            // ours removed 'a', theirs re-added 'a' → merged has 'a' and removedTaskIds excludes 'a'
```
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement the helpers. In `performDailyRollover`, seed `existingTaskIds` with `activeTargetDoc.removedTaskIds ?? []`. In `mergeDailyDocument`, set `removedTaskIds` to the union of both sides minus ids present in the merged headings, and omit the field when empty.
- [ ] **Step 4:** UI wiring:
  - Every delete (TodayView card, App details sheet) goes through `removeTaskFromDocument`. Its Undo is `onPatchDocument(date, (d) => restoreTaskToDocument(d, removed))`.
  - Done-Undo in `handleTaskUpdate` patches only that task back to `previous`.
  - `saveMarkdown` adds ids that were in `currentDocument` but are missing from the parsed doc to `removedTaskIds`.
  - Historical-correction Undo becomes `setDailyDocs((prev) => (prev === after ? before : prev))`. When the docs changed in the meantime, show the toast `Can't undo: the list changed since.`
- [ ] **Step 5:** `npm test`, then `npm run build && npm run test:qa -- B1 && npm run test:qa -- C4`. Expected: PASS.
- [ ] **Step 6:** Commit `fix: deleted tasks stay deleted and Undo restores just that task (BUG-07, BUG-13)`.

### Task 8: Completion and reopen act on the right copy (BUG-08, BUG-09)

**Files:**
- Modify: `src/utils/lifecycleEngine.ts` (`correctHistoricalCompletion`, `reopenTask`), `src/utils/lifecycleEngine.test.ts`, `src/App.tsx` (`handleReopenTask`)

**Interfaces:**
- Produces: `reopenTask(taskId: string, targetDate: string, dailyDocs: DailyDocument[], defaultHeadings?: string[]): { updatedDocs; updatedTask }`. The signature is the existing one plus an optional last parameter.

- [ ] **Step 1: Failing tests** (helpers `task`/`doc`/`allItems` already exist in the file):
```ts
it('historical completion keeps the latest edits', …)        // copies 10-15 'old title', 10-17 'NEW title' + description → 10-16 copy is 'NEW title', done, completedDate 10-16
it('reopen on the day it was done reopens that copy', …)     // 10-20 in-progress, 10-21 done(completed 10-21) → reopenTask('a','2026-10-21') → 10-21 copy status in-progress, completedDate undefined
it('reopen into a day with no note creates the note', …)     // only 10-19 done → reopenTask('a','2026-10-21', docs, ['Work']) → 10-21 has 'a' not done
it('reopen leaves other days unchanged', …)                 // the 10-20 copy is still identical to its input
```
- [ ] **Step 2:** Run: FAIL (oldest copy used).
- [ ] **Step 3:** Add a shared private helper `latestCopy(taskId, docs, onOrBefore?: string): TaskItem | null`. It scans docs by date descending. In `correctHistoricalCompletion`, use `latestCopy(taskId, docs)`. In `reopenTask`:
  - if the target doc has the id, reopen that copy in place;
  - otherwise insert a reopened clone of `latestCopy(taskId, docs, targetDate)` into the target doc, creating it from `defaultHeadings` when missing;
  - either way, remove the id from the target doc's `removedTaskIds` (field from Task 7).
- [ ] **Step 4:** In `App.handleReopenTask`: when `targetDate < today`, run `performDailyRollover(today, updatedDocs, …)` on the result so the task shows on Today. Toast: `Reopened “X”. It's back on today's list.`
- [ ] **Step 5:** `npm test`, then `npm run build && npm run test:qa -- B4 && npm run test:qa -- B5 && npm run test:qa -- B6`. Expected: PASS.
- [ ] **Step 6:** Commit `fix: reopen and mark-done-on-day use the task's latest copy (BUG-08, BUG-09)`.

### Task 9: Keep open tabs in step (BUG-06)

**Files:**
- Modify: `src/utils/vaultStore.ts`, `src/App.tsx`

**Interfaces:**
- Produces: `subscribeExternalChanges(listener: (key: 'daily_docs' | 'notes' | 'settings', value: unknown) => void): () => void`

- [ ] **Step 1:** Confirm that `npm run test:qa -- B9` FAILS (Task 1 baseline).
- [ ] **Step 2:** In `vaultStore.ts`, open `new BroadcastChannel('daymark-vault')` when available:
  - `writeValue` returns early when `value === cache.get(key)`. This is the loop guard: a received value set into React state is saved back by the same reference.
  - After queueing the write, it posts `{ key, value }` for `SETTINGS`, `DAILY_DOCS` and `NOTES`.
  - On message, it sets the cache and notifies listeners.
- [ ] **Step 3:** In `App.tsx`, add one effect that subscribes and calls `setDailyDocs` / `setNotes` / `setSettings(normalizeSettings(v))` by key.
- [ ] **Step 4:** `npm run build && npm run test:qa -- B9`. Expected: PASS. Then run `npm run test:e2e` (16/16) and `npm run test:sync` (7/7).
- [ ] **Step 5:** Commit `fix: open tabs share changes instead of overwriting each other (BUG-06)`.

### Task 10: The Markdown draft belongs to its day (BUG-02, BUG-12)

**Files:**
- Modify: `src/components/TodayView.tsx`

- [ ] **Step 1:** Confirm that `npm run test:qa -- B2` and `-- C2` FAIL.
- [ ] **Step 2:** Add `draftDate` state (set in `openMarkdown`), plus `confirmLeaveDraft(): Promise<boolean>` that reuses the existing "Discard your Markdown changes?" dialog from `switchMode`. Route these through it before acting: Previous day, Next day, the Today button, and the "New section" menu item (that item must call `switchMode('visual')` instead of `setEditorMode`).
- [ ] **Step 3:** Defensive guard for date changes from outside (History "Open this day", midnight, Settings). Add an effect on `date`: if `rawDirty && draftDate !== date`, reload the draft from the new day and toast `Unsaved Markdown for <formatDay(draftDate)> was discarded.` (tone `error`). Also, `saveMarkdown` returns early when `draftDate !== date`.
- [ ] **Step 4:** `npm run build && npm run test:qa -- B2 && npm run test:qa -- C2`. Expected: PASS. B2a passes because the discard dialog appears; the probe must click **Cancel** and assert the shown day is unchanged.
- [ ] **Step 5:** Commit `fix: unsaved Markdown can't be saved into another day (BUG-02, BUG-12)`.

### Task 11: Markdown round trip keeps the day's structure (BUG-11)

**Files:**
- Modify: `src/utils/markdownEngine.ts` (`parseDailyDocument`), `src/utils/markdownEngine.test.ts`

- [ ] **Step 1: Failing tests** (`rt = (d) => parseDailyDocument(serializeDailyDocument(d), d.date)`):
```ts
it('keeps a description that starts with #', …)          // description '#urgent call vendor' → headings ['Work'], description unchanged
it('keeps ## sub-headings inside section notes', …)       // notes '## Agenda\n- point' → headings ['Work'], notesContent contains '## Agenda'
it('keeps checklist lines in notes as notes', …)          // notes 'Shopping:\n- [ ] milk\n- [x] eggs' → 0 tasks, notes unchanged
it('keeps blank lines inside a description', …)           // 'para one\n\npara two' round-trips exactly
it('keeps ## headings as sections when the file uses ## for sections', …) // '## Work\n- [ ] a\n### Sub\ntext\n## Home\n- [ ] b' → sections ['Work','Home'], 'Sub' in Work notes
it('still treats bare checklists before any notes as tasks', …)           // '# Work\n\n- [ ] plain task' → 1 task
```
- [ ] **Step 2:** Run: the first five FAIL.
- [ ] **Step 3:** Parser rules (one line each in the code comment):
  - (a) A section heading is a **column-0** `#…` line whose level equals the level of the first heading in the file. Deeper levels are notes text, and indented lines are never headings.
  - (b) Once a section's notes have non-blank text, a `- [ ]` line is a task only if the next line is a `<!-- daymark: … -->` comment.
  - (c) An indented whitespace-only line while a task has a description adds a blank line to the description.
- [ ] **Step 4:** `npm test`: all markdown, archive and probe tests PASS. Then `npm run build && npm run test:qa -- B3`: PASS.
- [ ] **Step 5:** Commit `fix: saving the Markdown view no longer splits sections or turns notes into tasks (BUG-11)`.

### Task 12: Unticking restores the previous status (BUG-14)

**Files:**
- Modify: `src/types/daymark.ts` (`TaskItem.statusBeforeDone?: string`), `src/utils/taskActions.ts` (`toggleTaskDoneInDocument`), `src/components/TodayView.tsx` (`keepTaskMetadata` keeps `statusBeforeDone`), `src/components/TaskItemCard.tsx` (if it toggles status itself; route it through the same rule)
- Test: `src/utils/taskActions.test.ts`

- [ ] **Step 1: Failing tests:**
```ts
it('unticking returns a blocked task to blocked', …)  // toggle twice → status 'blocked', statusBeforeDone undefined
it('falls back to in-progress without a remembered status', …)
it('records done and reopened in the history', …)    // historyLog actions ['status_changed', 'reopened']
```
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. History details: `Marked done` / `Marked not done`.
- [ ] **Step 4:** `npm test`, then `npm run build && npm run test:qa -- C3`. Expected: PASS.
- [ ] **Step 5:** Commit `fix: unticking a task restores its previous status (BUG-14)`.

### Task 13: New-task dialog names its day; a day always has a section (BUG-15, BUG-16)

**Files:**
- Modify: `src/components/QuickCaptureModal.tsx` (prop `targetDate: string`, title), `src/App.tsx` (pass `currentDate`), `src/utils/defaultData.ts` (`normalizeSettings`), `src/components/SettingsModal.tsx` (disable removing the last section)
- Test: `src/utils/defaultData.test.ts` (new, or the nearest existing test file)

- [ ] **Step 1: Failing test:** `normalizeSettings({ ...DEFAULT_SETTINGS, defaultHeadings: [] }).defaultHeadings` equals `DEFAULT_SETTINGS.defaultHeadings`.
- [ ] **Step 2:** Implement:
  - Title: `New task · ${formatDay(targetDate, simulatedToday)}`.
  - Settings remove button: `disabled` with `title="Keep at least one section"` when only one section is left.
  - `normalizeSettings` falls back on an empty list.
- [ ] **Step 3:** `npm test`, then `npm run build && npm run test:qa -- C1 && npm run test:qa -- B11`. Expected: PASS.
- [ ] **Step 4:** Commit `fix: new-task dialog shows its day; at least one section always exists (BUG-15, BUG-16)`.

### Task 14: The old-tasks filter can always be left (BUG-17)

**Files:**
- Modify: `src/components/TodayView.tsx:92, 377-400`

- [ ] **Step 1:** Confirm that `npm run test:qa -- C5` FAILS on both `C5-complete` and `C5-hide-warning`.
- [ ] **Step 2:** Add an effect: when `alerts.total` drops to `0` while `attentionOnly` is on, set `attentionOnly` to `false` and toast `No old tasks left. Showing everything.` (tone `info`). Also render the bar whenever `attentionOnly` is on, not only while `alerts.total > 0`. That second change keeps **Show all** reachable even if a future change re-introduces the empty state.
- [ ] **Step 3:** Extend the C5 probe: after clearing, assert that "Fresh task" is visible and the done "Old task" appears in the Done group. Add a case with Undo: undoing the completion brings the old-tasks bar back and the filter stays off.
- [ ] **Step 4:** `npm run build && npm run test:qa -- C5`. Expected: PASS. Repeat on the phone layout: add `mobile: true` variants to C5.
- [ ] **Step 5:** Commit `fix: leaving the old-tasks filter is always possible (BUG-17)`.

### Task 15: Full verification and hand-off

**Files:**
- Modify: `docs/reports/qa-e2e/2026-10-21-qa-report.md` (add a "Status after fixes" column), `docs/releases/` (follow `.ai-configs/workflows/release-handoff.md` if this ships as v1.1.1)

- [ ] **Step 1:** Run `npm run lint && npm test && npm run build && npm run validate:ai && npm run test:e2e && npm run test:sync && npm run test:qa`. Expected: all exit 0, and `test:qa` reports `0 failed`.
- [ ] **Step 2:** Run `node scripts/ux-audit.mjs qa-fixes`. Look at the phone and desktop shots in light and dark mode for Today, Markdown view, History and Notes.
- [ ] **Step 3:** Fill in the report's status column with the commit hash per bug. Record BL-1…BL-4 as remaining backlog.
- [ ] **Step 4:** Commit `docs: QA fixes verified`. Then hand off via superpowers:finishing-a-development-branch.
