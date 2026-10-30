# Cycle 13: Cross-Device Sync Verification and Alert Counting Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove with tests that every synced data type survives multi-device edits without loss (fixing what fails), and add per-alert "counting days" (weekday / weekend / all week) for task aging and habit warnings.

**Architecture:** Merge stays three-way (`base`, `ours`, `theirs`) in `src/sync/merge.ts`, shared by the server and the client; no wire-format change. Settings, habits and backlog items gain per-field merging using the base that already travels with every change. A small in-process multi-device test harness drives the real Express server so every scenario, and a seeded randomized convergence test, run against production merge code. Alert counting days is a pure date helper plus two optional synced settings fields; ages stay computed from dates.

**Tech Stack:** TypeScript, React 19, Vitest (`--maxWorkers=2`), Express sync server (`server/`), Playwright e2e scripts in `scripts/`.

**Spec:** `docs/superpowers/specs/2026-10-30-cycle-13-cross-device-sync-and-alert-days-design.md`

## Global Constraints

- Old versions must keep syncing without data loss: a device on 1.9.1 or earlier syncs correctly with updated devices in both directions. New synced fields are optional, an old device pushing its copy back must not erase them, and missing alert-day settings mean `all`.
- Defaults: both alert choices default to **all week** (today's behaviour). Values: `'all' | 'weekdays' | 'weekend'`. Weekday = Monday to Friday; weekend = Saturday and Sunday.
- The two choices are separate: one for task aging, one for habit warnings.
- Age = number of counted days after the carry date, up to and including today. Off days still show alerts; they just do not add age.
- Habits: only counted days add to "missed days"; an uncounted day neither adds a miss nor breaks a run of misses. Streaks are unchanged.
- Age stays computed from dates; no stored data changes for the alert part.
- Deletes never beat edits, except removing a habit, which keeps beating an edit of that habit (existing behaviour, reported as a conflict).
- Background photos stay device-only; no photo sync is built.
- No new sync protocol or server rewrite.
- Follow `CLAUDE.md` invariants: stone palette tokens, types from `src/types/daymark.ts`, `max-w-[1800px]` desktop width, rollover idempotency in `src/utils/lifecycleEngine.ts`.
- Vitest runs one heavy suite at a time with `--maxWorkers=2`.
- Commits authored as `dngioidev <172118255+dngioidev@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, no Claude-Session line. No push, release or deploy without an explicit owner request.
- Work on branch `cycle-13-sync-audit` created from `main` (at 1.9.1).

## Review Focus

1. An old device (one that strips unknown settings fields) pushes its settings back: the updated device's `alertDays` must survive. Pinned in Task 2.
2. A garbage or missing alert-days value (hand-edited, imported, or from an old device) behaves as `all`, never throws. Pinned in Task 3.
3. Weekday computation is timezone-safe: `2026-11-02` is a Monday on devices at UTC-10 and UTC+13, across a DST change. Pinned in Task 3.
4. A note that references a picture that has not arrived yet shows a placeholder, not an error, and fills in after the picture syncs. Pinned in Task 10.
5. A device with a clock a year ahead cannot win every conflict forever. Pinned in Task 7.

## File Structure

- `src/sync/testkit/devices.ts` (create): in-process multi-device harness; test-only, no production imports of it.
- `src/sync/merge.ts` (modify): per-field settings/habit/backlog merge, clock clamp parameter.
- `src/sync/clock.ts` (create): `MAX_FUTURE_SKEW_MS`, `clampedTime`.
- `src/utils/alertDays.ts` (create): counting-days helpers.
- `src/utils/lifecycleEngine.ts`, `src/utils/habits.ts` (modify): counting-days aware age and missed days.
- `src/types/daymark.ts` (modify): `CountingDays`, `AlertDaysSettings`, `AppSettings.alertDays?`.
- `src/utils/defaultData.ts` (modify): default and normalization.
- `src/components/SettingsModal.tsx` (modify): two choices next to the aging thresholds.
- `server/app.ts` (modify only if Task 7 needs it): pass receive time into merge.
- Tests next to code; scenario tests in `src/sync/audit/*.test.ts`.

---

### Task 1: Multi-device test harness

**Files:**
- Create: `src/sync/testkit/devices.ts`
- Test: `src/sync/testkit/devices.test.ts`

**Interfaces:**
- Produces:
  - `startSyncRig(): Promise<{ device(name: string, opts?: { legacy?: boolean }): Device; restartServer(): Promise<void>; stop(): Promise<void> }>`
  - `interface Device { name: string; vault: VaultData; edit(change: (v: VaultData) => VaultData): void; sync(opts?: { dropResponse?: boolean }): Promise<SyncOutcome>; online: boolean; }`
  - `legacy: true` makes the device behave like 1.9.1 for new optional fields: before pushing it deletes `settings.alertDays` from the settings entity, and after receiving it keeps its own copy without that key.
  - `sync()` while `online === false` rejects without touching state; `dropResponse: true` performs the request but discards the response (simulates a connection lost after the server stored the change, so the next sync resends).
- Consumes: `createApp`, `FileStore`, `loadConfig` as in `server/app.test.ts`; `syncOnce`, `applySyncOutcome`, `SyncState`, `VaultData` from `src/sync/syncClient.ts`; `signIn` or a direct login `POST /api/auth/login` for the access token.

- [ ] **Step 1: Write the failing test** in `devices.test.ts`: `two devices converge on a new task`: rig with devices `a`, `b`; `a.edit` adds a task to `doc:2026-10-24`; `await a.sync(); await b.sync();` expect `b.vault.docs` to contain the task. Second test `dropResponse resend does not duplicate`: `a.sync({dropResponse:true})` then `a.sync()`; a fresh device `c` sees the task exactly once. Third test `legacy device strips alertDays only on the wire`: a legacy device's pushed settings entity has no `alertDays`.
- [ ] **Step 2: Run** `npx vitest run src/sync/testkit --maxWorkers=2`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the harness** in `devices.ts`. Start a real server on port 0 in a temp dir (copy the `start`/`stop` pattern from `server/app.test.ts`); each `Device` owns a `VaultData` (start from the default vault used in `syncClient.test.ts`) and a `SyncState`; `sync` runs `syncOnce` then `applySyncOutcome` and stores the new state.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** `test: multi-device sync harness`.

---

### Task 2: Settings merge per field, tolerant of old devices

**Files:**
- Modify: `src/sync/merge.ts` (`mergeSettings`)
- Test: `src/sync/merge.test.ts`, `src/sync/audit/settings.test.ts`

**Interfaces:**
- Consumes: `startSyncRig` (Task 1).
- Produces: `mergeSettings(base, ours, theirs)` with the same signature, now field by field.

Rules: compare top-level keys three-way; for keys whose values are plain objects (`agingThresholds`, `appearance`, `alertDays`, and `appearance.light/dark`), recurse; arrays (`statuses`, `defaultHeadings`) and scalars are leaves. A key absent on a side means "no opinion" (that side keeps the other's value), never a deletion. A field changed on both sides to different values takes the incoming value and adds a conflict message naming the field. With `base === null`, keep the existing behaviour (server copy wins, existing message).

- [ ] **Step 1: Write the failing tests** in `merge.test.ts`:
  - `settings: different fields changed on two devices both survive`: base theme light; ours sets `agingThresholds.criticalDays: 9`; theirs sets `appearance.theme: 'dark'`; result has both, `conflicts` empty.
  - `settings: same field changed on both takes incoming and reports it`.
  - `settings: a key missing on the incoming side is not a deletion`: ours has `alertDays: {tasks:'weekdays',habits:'all'}`, base has it, theirs lacks the key; result keeps `alertDays` unchanged.
  - `settings: nested agingThresholds subfields merge independently`.
  
  In `audit/settings.test.ts` (rig): `legacy device pushes back without erasing alertDays`: updated device `a` sets `alertDays`, syncs; legacy device `l` syncs (receives), changes `agingThresholds.attentionDays`, syncs; `a` syncs; `a.vault.settings.alertDays` still set and `attentionDays` updated; a third device `c` sees both.
- [ ] **Step 2: Run** `npx vitest run src/sync/merge.test.ts src/sync/audit/settings.test.ts --maxWorkers=2`. Expected: FAIL (whole-object conflict today).
- [ ] **Step 3: Implement** the recursive three-way merge in `mergeSettings`; keep `pick3` for leaves.
- [ ] **Step 4: Run the same tests, then the full `src/sync` folder.** Expected: PASS.
- [ ] **Step 5: Commit** `fix: settings merge per field, old devices never erase newer fields`.

---

### Task 3: Counting-days helpers, settings field and defaults

**Files:**
- Create: `src/utils/alertDays.ts`, `src/utils/alertDays.test.ts`
- Modify: `src/types/daymark.ts`, `src/utils/defaultData.ts`

**Interfaces:**
- Produces:
  - `type CountingDays = 'all' | 'weekdays' | 'weekend'` and `interface AlertDaysSettings { tasks: CountingDays; habits: CountingDays }` in `src/types/daymark.ts`; `AppSettings.alertDays?: AlertDaysSettings`.
  - `normalizeCountingDays(value: unknown): CountingDays` (anything unrecognized, including `undefined`, returns `'all'`).
  - `resolveAlertDays(settings: Pick<AppSettings, 'alertDays'>): AlertDaysSettings` (always both fields, normalized).
  - `isCountedDay(date: string, mode: CountingDays): boolean` (date is `YYYY-MM-DD`; weekday derived from the year, month and day numbers via UTC, never from a local-time `Date` parse).
  - `countCountedDays(from: string, to: string, mode: CountingDays): number`: counted days `d` with `from < d <= to`; returns 0 when `to <= from`.

- [ ] **Step 1: Write the failing tests** in `alertDays.test.ts`:
  - `all` equals the plain day difference: `countCountedDays('2026-10-23','2026-10-30','all') === 7`.
  - `weekdays`: Friday `2026-10-30` to Monday `2026-11-02` is 1; Saturday `2026-10-31` to Monday is 1; Saturday to Sunday is 0; Monday to the next Monday is 5.
  - `weekend`: Friday to Monday is 2; Monday to Friday is 0.
  - `isCountedDay('2026-11-02','weekdays') === true` and `isCountedDay('2026-11-01','weekdays') === false`; `'2026-11-01'` is a counted day for `weekend`.
  - DST: `countCountedDays('2026-03-07','2026-03-10','all') === 3` and `'2026-10-31'` to `'2026-11-03'` (US and EU change dates) equals the calendar difference.
  - Garbage: `normalizeCountingDays('weekdays')` kept; `normalizeCountingDays('Mon-Fri')`, `null`, `42`, `undefined` all return `'all'`; `resolveAlertDays({})` returns `{ tasks: 'all', habits: 'all' }`; `resolveAlertDays({ alertDays: { tasks: 'x' as never, habits: 'weekend' } })` returns `{ tasks: 'all', habits: 'weekend' }`.
- [ ] **Step 2: Run** `npx vitest run src/utils/alertDays.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `alertDays.ts` and the types. In `defaultData.ts`, `normalizeSettings` normalizes `alertDays` only when present (an absent field stays absent so old data is not rewritten), and `DEFAULT_SETTINGS` does not need to set it.
- [ ] **Step 4: Run** `npx vitest run src/utils/alertDays.test.ts`, then again as `TZ=Pacific/Honolulu npx vitest run src/utils/alertDays.test.ts` and `TZ=Pacific/Auckland npx vitest run src/utils/alertDays.test.ts` (set the variable the way your shell requires), then the existing `defaultData` tests with `--maxWorkers=2`. Expected: PASS in every timezone.
- [ ] **Step 5: Commit** `feat: alert counting-days helpers and settings field`.

---

### Task 4: Apply counting days to task aging and habit warnings

**Files:**
- Modify: `src/utils/lifecycleEngine.ts`, `src/utils/habits.ts`, and every caller `tsc` reports (`TodayView.tsx`, `TaskItemCard.tsx`, `TaskHistoryDrawer.tsx`, `App.tsx`, `MobileCodeHub.tsx`, `MobileWidgetSimulator.tsx`, habit components)
- Test: `src/utils/lifecycleEngine.test.ts`, `src/utils/habits.test.ts`

**Interfaces:**
- Consumes: `countCountedDays`, `isCountedDay`, `CountingDays` (Task 3).
- Produces:
  - `calculateTaskAge(task: TaskItem, currentDateStr: string, mode: CountingDays = 'all'): number`
  - `getAgingSeverity(task, currentDateStr, thresholds, statuses, mode: CountingDays = 'all')`
  - `missedDays(data: HabitData, habit: Habit, today: string, mode: CountingDays = 'all'): number` and `mode` threaded through `habitsForDay` and the warnings function in `habits.ts`.

- [ ] **Step 1: Write the failing tests**:
  - `lifecycleEngine.test.ts`: task created Friday `2026-10-30`, `weekdays`: age on Monday `2026-11-02` is 1; with `all` it is 3. Created Saturday with `weekdays`: 0 on Sunday, 1 on Monday. `weekend` created Friday: Monday is 2. Default mode leaves every existing test unchanged. A task old enough to be `critical` under `all` is `attention` or `normal` under a mode that counts fewer days (pick numbers with thresholds 3 and 7).
  - `habits.test.ts`: habit added `2026-10-19`, no ticks, today Monday `2026-11-02` (the 14 days 19 Oct to 1 Nov are all missed): `all` gives 14, `weekdays` gives 10, `weekend` gives 4, and the weekend days under `weekdays` are skipped without breaking the run; a tick on a Saturday under `weekdays` still stops the run (a tick is a tick); streak results identical for all modes; `warning` flips on the right morning for `warnAfterDays: 3`.
- [ ] **Step 2: Run** both test files with `--maxWorkers=2`. Expected: FAIL (extra argument ignored, ages wrong).
- [ ] **Step 3: Implement** the optional `mode` parameters and make every caller pass `resolveAlertDays(settings).tasks` or `.habits`. Run `npm run lint` and fix every remaining caller.
- [ ] **Step 4: Run** `npm run lint` and `npx vitest run src/utils src/components/TodayView.test.ts --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: task aging and habit warnings count only chosen days`.

---

### Task 5: Settings UI, guide and old-device alert test

**Files:**
- Modify: `src/components/SettingsModal.tsx` (next to the aging thresholds, around the `criticalDays` row), `docs/guide/` page that documents alerts or aging, `site/` guide text if it quotes aging
- Test: `src/components/settings/SettingsModal.test.ts`, `src/sync/audit/alertDays.test.ts`

**Interfaces:**
- Consumes: `resolveAlertDays`, `AlertDaysSettings`, `CountingDays`.
- Produces: two labelled choice groups, "Task aging counts" and "Habit warnings count", each with the three options "Weekdays (Mon to Fri)", "Weekends (Sat and Sun)", "All week" (accessible radio group, 44px targets like the neighbouring controls, stone palette tokens only).

- [ ] **Step 1: Write the failing tests**: `SettingsModal.test.ts`: both groups render with "All week" selected for settings without `alertDays`; choosing "Weekdays (Mon to Fri)" for tasks only changes `alertDays.tasks` and leaves `habits` at `all`; `audit/alertDays.test.ts` (rig): `alertDays` set on one device reaches another; `legacy device syncing does not reset the choice` (as Task 2 but through the full UI-less path); and `an old-format device that never had alertDays still shows all week`.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** the settings UI (a small subcomponent in `src/components/settings/` if `SettingsModal.tsx` is already large) and update the guide text.
- [ ] **Step 4: Run** `npm run lint`, the two test files, and the existing settings tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: choose weekday, weekend or all-week counting for alerts`.

---

### Task 6: Habits and backlog items merge per field

**Files:**
- Modify: `src/sync/merge.ts` (`mergeHabitList`, `mergeBacklog`)
- Test: `src/sync/merge.test.ts`, `src/sync/habitMerge.test.ts`, `src/sync/audit/habitsBacklog.test.ts`

**Interfaces:**
- Consumes: Task 1 harness. Produces the same signatures, field-merged items.

Rules: when both sides changed the same item and `pick3` reports a conflict, merge each field three-way against the base item (absent field = no opinion); fields changed on both sides to different values take the value from the item with the newer clamped `updatedAt` (incoming on a tie), reported as one conflict naming the item. Backlog `historyLog` keeps using `mergeBacklogHistory`. Removing a habit (`removedOn`) keeps winning, reported.

- [ ] **Step 1: Write the failing tests**: habit renamed on A and `warnAfterDays` changed on B: both survive, no conflict; same field on both: newer wins and a conflict is reported; habit removed on A and renamed on B: removal wins and a conflict is reported; backlog item title edited on A and note edited on B: both survive; backlog item picked on one device and edited on another: pick and edit both present; two devices add different items offline: both present; same checks through the rig for a third device joining later.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** a small shared `mergeFields<T>(base, mine, incoming, newerWins)` helper in `merge.ts` and use it in both functions.
- [ ] **Step 4: Run** `npx vitest run src/sync --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `fix: habits and backlog items merge per field`.

---

### Task 7: Clock-skew protection

**Files:**
- Create: `src/sync/clock.ts`, `src/sync/clock.test.ts`
- Modify: `src/sync/merge.ts` (`timestamp` use sites), `server/app.ts` (only if the client cannot do it alone), `src/sync/syncClient.ts` (pass `now`)

**Interfaces:**
- Produces: `MAX_FUTURE_SKEW_MS = 5 * 60 * 1000`; `clampedTime(value: string, now: number): number` returning `min(Date.parse(value), now + MAX_FUTURE_SKEW_MS)`, or `-Infinity` for unparsable values; `mergeEntity(key, base, ours, theirs, now: number = Date.now())`, with `now` passed to the habit, backlog, habit-day, note-meta and note merges; the server calls it with the receive time.

- [ ] **Step 1: Write the failing tests**: `clampedTime` caps a timestamp a year ahead at `now + 5 min`, leaves past values alone, handles garbage; merge test `a device with a clock a year ahead does not win a backlog conflict made later on a correct clock`: edit A stamped a year ahead, edit B stamped now+1 minute: B wins; two edits both within the skew window keep the existing "newer wins, incoming on tie"; the same for habit ticks and folder tombstones.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** `clock.ts`, thread `now` through the merge functions, and have `server/app.ts` call `mergeEntity` with `Date.now()`.
- [ ] **Step 4: Run** `npx vitest run src/sync server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `fix: sync conflict winners ignore far-future device clocks`.

---

### Task 8: Notes and daily-document scenarios

**Files:**
- Test: `src/sync/audit/notes.test.ts`, `src/sync/audit/docs.test.ts`
- Modify: `src/sync/merge.ts`, `src/utils/noteFolders.ts` or the folder utilities, only where a scenario fails

**Interfaces:**
- Consumes: Task 1 harness.

Each scenario below is a test; a failing one is fixed in this task and the fix is described in the commit message. Fixes must never discard an edit.

- [ ] **Step 1: Write the scenario tests**: note deleted on A while B edits its text: edit survives; note deleted on A while B edits only metadata (folder or tag): note survives; note edited on both: server copy plus a conflict copy, both contents present; note edited offline on A for several syncs of B, then A syncs: nothing lost; folder renamed on A while B moves a note into it: the note ends up in the renamed folder or in a visible conflict location, not lost or in a ghost folder; note moved to a folder on A while B deletes that folder: note and folder both reachable; task completed on A while B edits its title: both preserved; task deleted on A while B edits it: task survives; same task reordered on two devices: no task lost or duplicated; a day document first created on both devices: both devices' tasks present once each.
- [ ] **Step 2: Run** `npx vitest run src/sync/audit --maxWorkers=2`. Expected: failures list the real losses; record each in the ledger.
- [ ] **Step 3: Fix** each failing scenario with the smallest merge change; add the failing case to `merge.test.ts` first for any fix.
- [ ] **Step 4: Run** `npx vitest run src/sync --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `test: note and daily-document sync scenarios` and, if needed, a separate `fix:` commit per bug.

---

### Task 9: Server and sync-round scenarios, old-format device

**Files:**
- Test: `src/sync/audit/rounds.test.ts`
- Modify: `server/app.ts`, `src/sync/syncClient.ts`, only where a scenario fails

**Interfaces:**
- Consumes: Task 1 harness (`dropResponse`, `online`, `restartServer`, `legacy`).

- [ ] **Step 1: Write the scenario tests**: two devices call `sync()` at the same moment (`Promise.all`) after editing the same task and different tasks: no loss, both converge after one more round; a response lost after the server stored the change, then retried: no duplicate, no loss; a device offline across several rounds of another device then syncing: everything merged; a third device joining while a conflict is pending receives the merged result; server restart between rounds loses nothing; a legacy device and an updated device edit different data types in both directions and converge with nothing erased; a sync with 5000+ changes is refused cleanly and a retry in smaller sets works (use `MAX_CHANGES_PER_SYNC` from `protocol.ts`).
- [ ] **Step 2: Run** `npx vitest run src/sync/audit/rounds.test.ts --maxWorkers=2`. Expected: failures list the real losses.
- [ ] **Step 3: Fix** each failing scenario minimally; write the failing test first at the lowest level that reproduces it.
- [ ] **Step 4: Run** `npx vitest run src/sync server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `test: sync round scenarios` plus `fix:` commits as needed.

---

### Task 10: Note pictures sync without loss

**Files:**
- Test: `src/utils/noteAssets.test.ts`, `src/sync/audit/pictures.test.ts` (server routes via the rig with a fake `authFetch` to the rig base URL), `server/app.test.ts` for server-side cases
- Modify: `src/utils/noteAssets.ts`, `server/assets.ts`, the note editor insert path, only where a scenario fails

**Interfaces:**
- Consumes: `syncNoteAssets(notes, authFetch, active)`, `assetRef`, `parseAssetRefs`, `storeAsset`, `getAssetUrl`, `hasAsset`; the harness base URL.

- [ ] **Step 1: Write the scenario tests**: upload interrupted (first PUT fails with a network error or 500), then succeeds on the next round, and the second device downloads it with identical bytes; a note that arrives on device B before its picture: B shows a placeholder, no error, and after the next asset round the picture resolves; a picture missing on the server (404): the owning device re-uploads it from its local copy; a damaged server file or metadata file is ignored and does not hide healthy pictures; a picture over 1.5 MB: the editor refuses the insert with a visible message and the note text has no dangling `daymark-asset:` reference, and the server rejects direct oversized PUTs with 413; deleting a note keeps its picture files and breaks nothing; a third device joining later receives notes and all their pictures; backup then restore keeps references resolving (extend `vaultAssetBackups.test.ts`).
- [ ] **Step 2: Run** the listed files with `--maxWorkers=2`. Expected: failures list real gaps.
- [ ] **Step 3: Fix** each failing scenario minimally.
- [ ] **Step 4: Run** `npx vitest run src/utils src/sync server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `test: note picture sync scenarios` plus `fix:` commits as needed.

---

### Task 11: Background photo fallback on other devices

**Files:**
- Test: `src/components/settings/BackgroundPhotoSection.test.ts` or `src/hooks/useBackgroundPhoto.test.ts`, `src/sync/audit/backgroundPhoto.test.ts`
- Modify: `src/hooks/useBackgroundPhoto.ts` only if the fallback is broken

- [ ] **Step 1: Write the tests**: synced background settings arrive on a device that has no photo file: no error thrown, no console error, a plain background (the appearance fallback) is shown, and the Settings section tells the user the photo is on another device; the photo file never appears in any synced entity (assert on the entities `toEntities` returns).
- [ ] **Step 2: Run** the files. Expected: PASS or a real fallback bug.
- [ ] **Step 3: Fix** only if a test fails; do not add photo sync.
- [ ] **Step 4: Run** `npx vitest run src/hooks src/components/settings src/sync/audit --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `test: background photo stays device-only with a clean fallback`.

---

### Task 12: Seeded randomized convergence test

**Files:**
- Create: `src/sync/audit/convergence.test.ts`, `src/sync/testkit/randomEdits.ts`
- Modify: `src/sync/merge.ts` and friends, only where it finds a loss

**Interfaces:**
- Produces: `randomEdit(rng: () => number, device: Device, ledger: EditLedger): void` and `class EditLedger` recording each edit's entity, field and value; `seededRng(seed: number): () => number`.
- Oracle: an edit survives if its value is in the final state, or in a conflict copy or conflict text the user is shown, or it was legitimately overwritten by a later edit to the same field on another device (reported as a conflict), or it is a habit edit beaten by that habit's removal. Deletes never beat edits except that habit rule.

- [ ] **Step 1: Write the test**: for seeds 1 to 25, three devices (one `legacy`), 60 random operations each drawn from: add, edit and delete a task; toggle done; edit note text; move a note between folders; add and rename a folder; edit settings fields; add, edit and remove a habit and tick days; add, edit and pick a backlog item; go offline or online; sync. At the end every device is online, sync until no device has pending changes (cap 6 rounds), then assert: all three vaults are equal after normalizing order; no ledger edit is lost per the oracle; failure output prints the seed and the operation log so it replays.
- [ ] **Step 2: Run** `npx vitest run src/sync/audit/convergence.test.ts --maxWorkers=2`. Expected: initial failures show real divergence or loss; each distinct failure becomes a minimal unit test in `merge.test.ts` first.
- [ ] **Step 3: Fix** each failure; keep the seed list fixed in the file.
- [ ] **Step 4: Run** the file for all 25 seeds plus `npx vitest run src/sync --maxWorkers=2`. Expected: PASS, and run time under 60 seconds.
- [ ] **Step 5: Commit** `test: seeded convergence test for three devices` plus `fix:` commits.

---

### Task 13: Browser e2e, docs and release prep

**Files:**
- Modify: `scripts/e2e-sync.mjs`, `scripts/e2e-qa-regressions.mjs` (only if selectors change), `docs/releases/cycle-13/README.md` (create), `docs/guide/` pages, `site/index.html`, version files for the release step only when the owner asks

- [ ] **Step 1: Add e2e checks** to `e2e-sync.mjs`: two browsers change different settings while offline and both changes survive after reconnect; weekday counting set on one browser shows on the other and a carried task's "days old" in the attention bar follows it; "Task aging counts" and "Habit warnings count" default to "All week" on a fresh device.
- [ ] **Step 2: Run** `npm run build`, then `node scripts/e2e-sync.mjs`. Expected: all checks pass.
- [ ] **Step 3: Write** `docs/releases/cycle-13/README.md`: what was audited, every loss found and fixed, scenarios now covered, the alert-days feature, and the compatibility statement for old versions.
- [ ] **Step 4: Run** the full verification: `npm run lint`, `npx vitest run --maxWorkers=2`, `npm run test:helpers`, `npm run test:sync`, `npm run test:qa`, `npm run validate:ai`. Expected: all green.
- [ ] **Step 5: Commit** `docs: cycle 13 release notes and e2e coverage`. Stop here; releasing is a separate owner request.
