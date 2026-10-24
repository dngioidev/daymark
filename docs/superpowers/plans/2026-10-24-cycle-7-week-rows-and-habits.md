# Cycle 7: Week Rows and Daily Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Calendar › Week becomes full-width day rows that show every task.
- Users define daily habits once, then tick them per day on Today, in the Calendar, and on a new Android "Daymark Habits" widget, with streaks and missed-habit warnings.

**Architecture:**
- **Data:** habits are a new vault collection, `HabitData`, stored under its own IndexedDB `kv` key `habits`. It holds a definition list plus per-day tick maps. Ticks are explicit `{ done, at }` records that merge last-writer-wins per habit and day.
- **Sync:** the data travels as two new sync entity kinds, `habits` and `habitday:<date>`.
  - The server only sends these entities to clients that declare the `habits` feature, so a v1.3.0 client never sees them and never deletes them.
  - All streak, warning and editing maths are pure functions in `src/utils/habits.ts`.
- **UI:**
  - `HabitsBar` renders through a slot at the top of `TodayView`.
  - The Calendar gets a `WeekRows` component and a habit checklist in the day detail.
- **Widget:** the Android widget is a second Glance receiver. It has its own snapshot and an explicit-set action queue, and computes streaks after midnight in a pure Kotlin model.

**Tech Stack:**
- Web: React 19, TypeScript, Vite, Tailwind v4, Vitest (node env; components are tested with `renderToStaticMarkup` or pure helpers).
- Sync: Express.
- Browser suites: Playwright scripts.
- Android: Capacitor 8 with Glance 1.1.1 in Kotlin; JVM tests run with `npm run android:build -- --test`.

**Spec:** `docs/superpowers/specs/2026-10-24-cycle-7-week-rows-and-habits-design.md`. Read it in full; its "Calls I made" section settles lifetime, re-add, removal-vs-edit and widget-tick rules.

## Global Constraints

- **Tailwind and layout:** use only real Tailwind v4 classes and the stone palette (`stone-50`…`stone-950`). Desktop content keeps `max-w-[1800px]`.
- **Types:** they live in `src/types/daymark.ts`.
- **Invariants:** the Markdown task comment format `<!-- daymark: task_id=<id> status=<status> created=<date> ... -->` is unchanged, and rollover stays idempotent.
- **Habits are not tasks.** They never enter `DailyDocument`, Markdown day files, task counts, "Last 7 days", the progress sidebar, rollover, aging or search.
- **"Today":** always the app's resolved today, i.e. the `today` already computed in `App.tsx` via `resolveToday` (it honours the developer date override). Never call `new Date()` for the date.
- **Habit fields:**
  - warning threshold default **3**, minimum **1**, maximum **365**;
  - habit names are trimmed, 1–80 characters, and duplicates are allowed;
  - a new habit's `addedOn` is today.
- **Dialogs:** use `src/components/ui/Dialog.tsx` and `confirmDialog`/`showToast` from `ui/feedback`. No `alert()` or `confirm()`.
- **Accessibility:**
  - touch targets are ≥ 44 px on phone;
  - text contrast is 4.5:1 in light, dark and on a background photo;
  - the bar is a disclosure button with `aria-expanded`;
  - each habit is a labelled checkbox.
- **Shortcuts:** existing shortcuts and their dialog/menu guards keep working.
- **Commits:** author `dngioidev <172118255+dngioidev@users.noreply.github.com>`, ending with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Version:** the version bump to 1.4.0 is not part of this plan; it happens at release.

## Review Focus

1. **Midnight with the app open.** Today's bar must switch to the new day with nothing ticked, while yesterday keeps its ticks. Covered by a Task 1 test (`habitsForDay` by date) and the Task 8 e2e H6 (date override changes the day).
2. **A v1.3.0 device syncing** must never receive or delete habit entities. Covered by a Task 3 server test, `old client never sees or deletes habits`.
3. **A new client talking to an old server** (one that rejects unknown keys) must still sync tasks and notes. Covered by a Task 3 client test, `retries without habit keys on Invalid entity key`.
4. **A widget tick queued yesterday, applied today**, must land on yesterday, not today. Covered by a Task 6 test (`applyWidgetAction` uses the action date) and the Task 7 Kotlin test `queued tick from yesterday rolls into streak`.
5. **Restoring an older backup without habits** must keep the current habits rather than wiping them. Covered by a Task 2 test, `import without habits keeps current habits`.

---

### Task 1: Habit model and pure logic

**Files:**
- Modify: `src/types/daymark.ts` (add the types below)
- Create: `src/utils/habits.ts`
- Test: `src/utils/habits.test.ts`

**Interfaces:**
- Produces (types, `daymark.ts`):
  ```ts
  export interface Habit { id: string; name: string; order: number; warnAfterDays: number; addedOn: string; removedOn?: string; updatedAt: string }
  export interface HabitTick { done: boolean; at: string }            // at = ISO timestamp of the change
  export interface HabitDay { date: string; ticks: Record<string, HabitTick> }
  export interface HabitData { habits: Habit[]; days: HabitDay[] }    // days sorted by date, only days with ≥1 tick record
  export interface HabitDayItem { habit: Habit; done: boolean; canTick: boolean; streak: number; missedDays: number; warning: boolean }
  ```
- Produces (`habits.ts`):
  - `EMPTY_HABITS: HabitData`
  - `DEFAULT_WARN_AFTER_DAYS = 3`
  - `isDoneOn(data, habitId, date): boolean`
  - `habitsForDay(data, date, today): HabitDayItem[]`: lifetime habits (`addedOn ≤ date` and (`!removedOn` or `date < removedOn`)), plus any habit with a tick record `done: true` on that date. Sorted by `order`. `canTick = date ≤ today && date ≥ habit.addedOn && (!removedOn || date < removedOn)`.
  - `setTick(data, habitId, date, done, today, at): HabitData`: returns `data` unchanged (same reference) when `!canTick`. Otherwise writes `{done, at}` and drops days left with no records.
  - `streak(data, habit, today): number`
  - `missedDays(data, habit, today): number`
  - `daySummary(data, date, today): { done: number; total: number; warnings: { habit: Habit; days: number }[] }`: `total`/`done` count lifetime habits only; warnings only when `date === today`.
  - `addHabit(data, name, today, at, id = newHabitId()): HabitData`: `order` = max + 1.
  - `renameHabit(data, id, name, at)`, `setWarnAfter(data, id, days, at)` (clamped 1..365, non-integers rounded), `moveHabit(data, id, delta: -1 | 1, at)` (swaps `order` with the neighbour among active habits), `removeHabit(data, id, today, at)` (sets `removedOn = today`).
  - Every edit sets `updatedAt = at`. Invalid names (empty after trim, > 80 chars) return `data` unchanged.
  - `activeHabits(data, today): Habit[]`: not removed, sorted.
  - `newHabitId(): string`, in the format `habit-${Date.now()}-${random6}`.

- [ ] **Step 1: Write failing tests** in `src/utils/habits.test.ts`. Use `today = '2026-10-21'` (Wed) and a habit `h1` added `'2026-10-12'`.
  - `streak counts back from today when ticked`: ticks on 10-19, 10-20 and 10-21 → `3`.
  - `unticked today does not break streak`: ticks on 10-19 and 10-20 only → `2`.
  - `gap breaks streak`: ticks on 10-17 and 10-20 → `1`.
  - `missedDays counts unticked days before today back to last tick`: last tick 10-17 → `3` (18, 19, 20). `daySummary(...).warnings` has `{days: 3}` for the default threshold.
  - `never ticked counts from addedOn inclusive`: habit added 10-19, no ticks → `missedDays === 2` and no warning at threshold 3.
  - `added today has no misses`: → `0`.
  - `ticking today clears warning`.
  - `setTick rejects future and pre-addedOn dates`: returns the same reference for `'2026-10-22'` and `'2026-10-11'`.
  - `backfill past day changes streak`: tick 10-18, 10-19, 10-20 and 10-21 except 10-19, then `setTick(...,'2026-10-19',true)` → streak `4`.
  - `removed habit keeps past ticks but leaves today`: remove on 10-21 → `habitsForDay(data,'2026-10-21',today)` lacks it; `habitsForDay(data,'2026-10-20',today)` shows it with `canTick: true`. A day after removal with a tick still lists it, with `canTick: false`.
  - `day before addedOn shows no dot`: `habitsForDay(data,'2026-10-11',today)` is `[]`.
  - `pre-addedOn tick from sync does not crash streak/missed`.
  - `untick writes explicit false record`.
  - `setWarnAfter clamps`: 0 → 1, 999 → 365.
  - `addHabit trims and rejects empty/81 chars`.
  - `moveHabit swaps order`.
  - `rename keeps ticks`.
  - `habitsForDay is per date`: a tick on 10-20 does not show as done on 10-21 (Review Focus 1).

- [ ] **Step 2: Run** `npx vitest run src/utils/habits.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement the types and `src/utils/habits.ts`.** Do the date arithmetic with `getPreviousDate`/`getNextDate` from `lifecycleEngine.ts`. Pin these two definitions:
  - **streak:** start at today if `isDoneOn(today)`, else yesterday. Count consecutive done days backwards.
  - **missed:** walk back from yesterday while not done and `date ≥ addedOn`, counting. Stop at the first done day. A habit with `addedOn ≥ today` gives 0.

- [ ] **Step 4: Run** `npx vitest run src/utils/habits.test.ts && npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: habit model with streaks and missed warnings`.

### Task 2: Local storage, tabs, backup and restore

**Files:**
- Modify: `src/utils/vaultStore.ts`, `src/utils/vaultValidation.ts`, `src/utils/vaultArchive.ts`, `src/App.tsx` (state plus import/export calls only)
- Test: `src/utils/vaultStore.test.ts`, `src/utils/vaultArchive.test.ts`, `src/utils/vaultValidation.test.ts`

**Interfaces:**
- Consumes: `HabitData`, `EMPTY_HABITS` (Task 1).
- Produces:
  - `isHabitData(v): v is HabitData` (vaultValidation). It checks each habit's `id`, `name`, `addedOn` and `order`, and each day's `date` and tick `{done: boolean, at: string}`.
  - `loadHabits(): HabitData`: `EMPTY_HABITS` when missing or invalid.
  - `saveHabits(data: HabitData): void`, under kv key `KEYS.HABITS = 'habits'`. It is broadcast on the existing channel like `notes`, and `SharedKey` gains `'habits'`. `parseVaultMessage` accepts `habits` only when `isHabitData`.
  - `VaultSnapshot.habits?: HabitData`. `buildVaultZip(docs, notes, settings, habits?)` writes `habits` into `vault.json`, and `importVaultFromZip` returns it when it is valid.
  - `exportVaultAsJson` and `exportVaultAsZip` take a `habits` argument. The JSON bundle gains `habits`.
  - `resetVaultToSeedData()` also resets habits to `EMPTY_HABITS`. `wipeLocalVault` already deletes the database; verify the habits key is gone in the test.
  - `App.tsx` holds `const [habits, setHabits] = useState<HabitData>(loadHabits)`, saved in an effect and refreshed on the external `habits` message.
  - **Ruling:** on restore, a backup without `habits` keeps the current habits; a backup with `habits` replaces them.

- [ ] **Step 1: Write failing tests:**
  - `loadHabits returns EMPTY_HABITS when absent or damaged`
  - `saveHabits round-trips and broadcasts`, following the existing broadcast tests' pattern
  - `parseVaultMessage accepts valid habits and rejects junk`
  - `zip export/import round-trips habits`
  - `import without habits keeps current habits`. Test it at the App-level helper: extract `mergeRestoredHabits(current, restored?: HabitData): HabitData` into `vaultArchive.ts` and test that.
  - `JSON export contains habits`

- [ ] **Step 2: Run** `npx vitest run src/utils`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement**, including the App wiring: the restore path calls `setHabits(mergeRestoredHabits(habits, snapshot.habits))`, the export calls pass `habits`, and seed reset sets `EMPTY_HABITS`.

- [ ] **Step 4: Run** `npm run lint && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: store, share and back up habits`.

### Task 3: Sync habits safely

**Files:**
- Modify: `src/sync/merge.ts`, `src/sync/protocol.ts`, `src/sync/syncClient.ts`, `src/hooks/useSync.ts`, `server/app.ts`, `src/App.tsx` (pass `habits` into the sync vault)
- Test: `src/sync/merge.test.ts`, `server/app.test.ts`, `src/sync/syncClient.test.ts` (create it if absent; follow `authClient.test.ts` for fetch fakes)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `mergeHabitList(base, ours, theirs): MergeResult<{ habits: Habit[] }>`:
    - The merge runs per habit id.
    - If only one side changed, take that side.
    - If both changed and either side has `removedOn`, take the removed one; removal wins.
    - Otherwise take `theirs`.
    - A habit missing from one side is never dropped.
    - A null side means "take the other side".
  - `mergeHabitDay(base, ours, theirs): MergeResult<HabitDay>`:
    - The merge runs per habit id: take the record with the later `at`; on a tie, `theirs` wins.
    - The base is ignored, so ticks are a CRDT-like LWW map.
    - If both sides are null the result is null; otherwise there is never a deletion.
  - `mergeEntity` dispatches `habits` and `habitday:`. `isValidEntityKey` accepts `habits` and `/^habitday:\d{4}-\d{2}-\d{2}$/`.
  - `EntityKey` doc comment is updated.
  - `SyncRequest.features?: string[]`; the client always sends `['habits']`.
  - `VaultData.habits: HabitData`:
    - `toEntities` emits `habits` → `{ habits }` and one `habitday:<date>` per day.
    - `fromEntities(map, localSettings)` rebuilds `HabitData`, with days sorted. A missing `habits` entity gives `[]`.
  - **Server `runSync`:**
    - `validValue` checks the new kinds; `habitday` must have `date === key.slice(9)`.
    - When `!body.features?.includes('habits')`, response entities exclude `habits` and `habitday:*` keys.
    - Server stats are unchanged.
  - **Client fallback:**
    - When `syncOnce` gets a 400 whose error starts with `Invalid entity key` or `Invalid value for habit`, it retries once with the habit keys removed from `changes`.
    - It then returns normally, with `habitsUnsupported: true` on the outcome.
    - `useSync` remembers this for the session and skips habit keys afterwards. No error is shown.

- [ ] **Step 1: Write failing tests:**
  - **merge:**
    - `two devices tick different habits on same day keep both`
    - `same habit later at wins`
    - `untick later beats tick`
    - `removal beats rename`
    - `habit added on each device keeps both`
  - **server:**
    - `old client never sees or deletes habits`. A new client pushes habits, then an old client (no `features`) syncs from rev 0: no habit keys come back. The old client then pushes a doc change, and the habits are still stored. Then a new client syncing from rev 0 gets them.
    - `habitday value with mismatched date is rejected 400`
  - **client:**
    - `toEntities/fromEntities round-trip habits`
    - `retries without habit keys on Invalid entity key`. The fake server returns 400 `Invalid entity key in sync request.` when the body has habit keys and 200 otherwise. Assert two calls, a doc pushed, and `habitsUnsupported`.

- [ ] **Step 2: Run** `npx vitest run src/sync server`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Keep `mergeIncomingSettings` behaviour untouched.

- [ ] **Step 4: Run** `npm run lint && npm test && npm run build && npm run test:sync`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: sync habits without exposing them to older clients`.

### Task 4: Habits bar on Today (desktop, phone web, Android app)

**Files:**
- Create: `src/components/habits/HabitsBar.tsx`, `src/components/habits/HabitChecklist.tsx`, `src/components/habits/HabitEditor.tsx`, `src/utils/habitsOpen.ts`
- Modify: `src/components/TodayView.tsx` (add the prop `habitsSlot?: React.ReactNode`, rendered after `{header}` and before the attention bar, in all editor modes), `src/components/mobile/MobileAppShell.tsx` (pass the slot through), `src/App.tsx`
- Test: `src/components/habits/HabitsBar.test.ts`, `src/utils/habitsOpen.test.ts`

**Interfaces:**
- Consumes: Task 1 functions and `habits`/`setHabits` from Task 2.
- Produces:
  - `HabitChecklist({ items: HabitDayItem[]; onToggle(habitId: string, done: boolean): void; showStreaks?: boolean })`:
    - one row per item: a checkbox (disabled when `!canTick`), the name, and on the right `🔥 {streak}`, or `–` when 0, or the warning `⚠ {missedDays} days` when `warning`;
    - the checkbox's accessible name is the habit name;
    - shared with the Calendar (Task 5).
  - `HabitsBar({ data; date; today; onChange(next: HabitData): void; compact?: boolean; openSignal?: number })`:
    - Closed bar contents:
      - a progress ring (an SVG circle; the stroke shows `done/total`);
      - `Habits`, then `{done} of {total}`;
      - a warning chip `⚠ {n} missed {days} days` when exactly one habit warns, or `⚠ {n}` when more;
      - a chevron.
    - With no active habits it reads `Habits · Add a daily habit` in muted text, and opening it opens the editor straight to adding.
    - When opened it shows the `HabitChecklist` for `date` and an `Edit` button.
    - Ticks call `onChange(setTick(data, id, date, done, today, new Date().toISOString()))`. The ISO timestamp is the change time, not the date.
    - When `openSignal` changes, the bar opens.
    - When `date !== today`, the bar label adds the short date (e.g. `Habits · Tue 20 Oct`) via `formatDay`.
  - `HabitEditor({ isOpen; onClose; data; today; onChange; startAdding?: boolean })`:
    - a `Dialog` with an add field (Enter adds);
    - per active habit: a name input (saves on blur/Enter), ↑/↓ buttons, a "Warn after N days" number input (1..365), and a Remove button;
    - Remove uses `confirmDialog` with the copy `Remove "{name}"? Its ticks on past days are kept.`
  - `loadHabitsOpen(): Promise<boolean>` and `saveHabitsOpen(open: boolean): Promise<void>`:
    - they use kv key `ui:habitsOpen`, with a localStorage fallback `daymark_ui_habits_open`, mirroring `collapsedSections.ts`;
    - the default is `false`.
  - `App.tsx` passes `habitsSlot={<HabitsBar data={habits} date={currentDoc.date} today={today} onChange={setHabits} openSignal={habitsOpenSignal} compact? />}`. `habitsOpenSignal` is a counter state; Task 6 increments it.

- [ ] **Step 1: Write failing tests:**
  - **closed by default:** the static markup has `aria-expanded="false"` and contains `2 of 5`, plus the warning chip text for one warning.
  - **empty state:** it shows `Add a daily habit` and no warning chip.
  - **open state:** call the exported pure helper `barLabel(summary, date, today)` and render `HabitChecklist` with items (one warning, one streak of 12) → `🔥 12` and `⚠ 4 days`; a `canTick: false` row renders a disabled checkbox.
  - **storage:** `habitsOpen defaults false and round-trips`.

- [ ] **Step 2: Run** `npx vitest run src/components/habits src/utils/habitsOpen.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement and wire it into desktop, `MobileAppShell` (phone web and the Android app) and every `TodayView` editor mode.** Use the existing card styles (`bg-white dark:bg-stone-900` with stone borders, as in `TodayView`'s glance cards). The bar has `min-h-11`, and checklist rows have `min-h-11`.

- [ ] **Step 4: Run** `npm run lint && npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: habits bar on Today`.

### Task 5: Calendar week rows and habits in day detail

**Files:**
- Create: `src/components/WeekRows.tsx`
- Modify: `src/types/daymark.ts` (`CalendarCell` gains `items: { title: string; done: boolean }[]`), `src/utils/calendarGrid.ts`, `src/components/CalendarView.tsx`, `src/components/mobile/MobileAppShell.tsx`, `src/App.tsx`
- Test: `src/utils/calendarGrid.test.ts`, `src/components/CalendarView.test.ts`

**Interfaces:**
- Consumes: `HabitChecklist`, `habitsForDay`, `daySummary` (Tasks 1 and 4).
- Produces:
  - `CalendarView` gains the props `habits: HabitData` and `onHabitsChange(next: HabitData): void`.
  - `WeekRows({ cells: CalendarCell[]; selectedDate; today; habits: HabitData; onSelectDate; dropProps(date): React.HTMLAttributes<HTMLElement> })`:
    - **Row structure:** one row per cell, in `weekCells` order (Sunday first). Each row is a `<button data-date>`-equivalent element: a `role="button"` div is acceptable, but keyboard Enter/Space must select.
    - **Left:** the weekday and `formatDay` date, plus `done/total` when `total > 0`.
    - **Middle:** every task, with no cap and no clamp, in `columns-1 md:columns-2`. Done tasks get a check and `line-through`; open tasks get a circle. `Nothing planned` when empty.
    - **Right:** for non-future days, one dot per `habitsForDay` item (filled `bg-emerald-600` when done, `bg-stone-300 dark:bg-stone-600` otherwise) and `{done}/{total}` when there are habits.
    - **Habit dots on phone:** below `md` they sit under the day label.
    - **Highlights:** today uses the existing `ring-2 ring-accent`; the selected row uses the existing selected styling.
  - `dropProps(date)` is extracted from the current cell `onDragOver`/`onDrop` code and reused by both month cells and rows.
  - Week mode no longer renders the 7-column grid or the weekday header.
  - The day detail panel adds a `Habits` subsection with `HabitChecklist` for the selected date, but only when that date ≤ today and `habitsForDay` is non-empty. Toggles call `onHabitsChange(setTick(...))`.

- [ ] **Step 1: Write failing tests:**
  - `weekCells items carry every task with done flag`, with 9 tasks → `items.length === 9`.
  - `week view renders rows with all tasks`: static markup of `CalendarView` in week mode (initial view prop `initialView?: 'month' | 'week'` added for tests and deep links) containing all 9 titles and no `line-clamp`/`+N more`.
  - `future row has no habit dots`.
  - `past day detail shows habit checkboxes`.

- [ ] **Step 2: Run** `npx vitest run src/utils/calendarGrid.test.ts src/components/CalendarView.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** and wire `habits`/`setHabits` into both `CalendarView` call sites.

- [ ] **Step 4: Run** `npm run lint && npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: readable week rows and habits in Calendar`.

### Task 6: Habit widget bridge (web side) and widget settings

**Files:**
- Create: `src/utils/habitWidgetSnapshot.ts`
- Modify: `src/native/daymarkBridge.ts`, `src/hooks/useWidgetSync.ts`, `src/types/daymark.ts` (`WidgetStyle.show.streaks: boolean`), `src/utils/widgetStyle.ts`, `src/components/settings/WidgetTab.tsx`, `src/components/settings/WidgetPreview.tsx`, `src/App.tsx`
- Test: `src/utils/habitWidgetSnapshot.test.ts`, `src/utils/widgetStyle.test.ts`, `src/hooks/useWidgetSync` helpers (pure `applyWidgetAction`)

**Interfaces:**
- Consumes: Task 1 functions; `habits`, `setHabits` and `habitsOpenSignal` from Tasks 2 and 4.
- Produces:
  - `HabitWidgetSnapshot`:
    ```ts
    { date: string; updatedAt: string; habits: { id: string; name: string; doneToday: boolean; streakBefore: number; lastDoneBefore: string | null; addedOn: string; warnAfterDays: number }[] }
    ```
    - `streakBefore` is the streak ending at `date − 1`.
    - `lastDoneBefore` is the last done date strictly before `date`.
    - The list holds active habits only, in order, with a maximum of 30.
  - `buildHabitWidgetSnapshot(data: HabitData, today: string): HabitWidgetSnapshot`
  - `WidgetAction` gains:
    - `{ type: 'habit'; habitId: string; date: string; done: boolean; at: string }`;
    - `{ type: 'habits' }` (open Today with the bar open).
  - `WidgetList.widgets[i]` gains `kind: 'tasks' | 'habits'`; a missing kind parses as `'tasks'`.
  - Bridge additions: `setHabitSnapshot(snapshot)` and `pinHabitsWidget()`.
  - `applyWidgetAction(habits, action, today): HabitData` (pure, exported from `src/utils/habitWidgetSnapshot.ts`) calls `setTick(habits, habitId, action.date, done, today, action.at)`. The action's own date is used, never today (Review Focus 4).
  - `useWidgetSync` takes extra parameters `habits: HabitData`, `onHabitsChange(next)` and `onOpenHabits()`. Habit actions are applied in queue order through a functional update, before snapshots are pushed. The hook pushes the habit snapshot, debounced 300 ms, whenever `habits` or `today` change.
  - `DEFAULT_WIDGET_STYLE.show.streaks = true`, and `parseWidgetStyle` reads it.
  - `WidgetTab`:
    - It labels each widget `Tasks widget N` or `Habits widget N`.
    - For habits widgets it hides the done/age/quick-add/sections toggles and shows `Show streaks`.
    - The add button becomes two: `Add tasks widget` and `Add habits widget`.
  - `WidgetPreview` gets a habits variant.

- [ ] **Step 1: Write failing tests:**
  - `snapshot streakBefore/lastDoneBefore`, with ticks on 10-18, 10-19 and 10-20 and today 10-21 not ticked → `streakBefore 3`, `lastDoneBefore '2026-10-20'`, `doneToday false`.
  - `snapshot excludes removed habits`.
  - `applyWidgetAction uses the action date`: an action dated 10-20 applied with today 10-21 ticks 10-20.
  - `older widget action loses to newer app tick`: the app untick has a later `at`, so the result stays unticked.
  - `parseWidgetStyle defaults streaks true`.

- [ ] **Step 2: Run** `npx vitest run src/utils src/hooks`. Expected: FAIL.

- [ ] **Step 3: Implement.** On a `habits` action, the app switches to Today (desktop and mobile), sets the current date to today and increments `habitsOpenSignal`.

- [ ] **Step 4: Run** `npm run lint && npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat: habit widget bridge and widget settings`.

### Task 7: Android "Daymark Habits" Glance widget

**Files:**
- Create: `mobile/android/app/src/main/java/app/daymark/notes/HabitWidgetModel.kt`, `.../DaymarkHabitsGlanceWidget.kt` (the widget plus `DaymarkHabitsWidgetReceiver` and `ToggleHabitActionCallback`), `mobile/android/app/src/main/res/xml/daymark_habits_widget_info.xml`, `mobile/android/app/src/test/java/app/daymark/notes/HabitWidgetModelTest.kt`
- Modify: `WidgetStore.kt` (habit snapshot key `habit_snapshot`, habit action queue `habit_actions` of JSON objects; a widget's kind is whichever receiver owns its id), `DaymarkBridgePlugin.kt` (`setHabitSnapshot`, `pinHabitsWidget`; `consumeActions` emits habit actions and `habits` open requests; `listWidgets`/`setWidgetStyle` cover both receivers and return `kind`; refresh both widgets on style and colour changes), `WidgetStyle.kt` (`show.streaks`, default true), `MainActivity.java` (`ACTION_HABITS = "habits"` forwarded like capture), `AndroidManifest.xml` (second receiver labelled `@string/habits_widget_name`), `res/values/strings.xml` (`habits_widget_name` = `Daymark Habits`), `WidgetStyleTest.kt`

**Interfaces:**
- Consumes: the snapshot JSON and action JSON shapes from Task 6, verbatim.
- Produces:
  - Kotlin `HabitWidgetModel.view(snapshot: HabitSnapshot, queued: List<HabitAction>, today: LocalDate): HabitWidgetView`. The view has `rows: List<HabitRow(id, name, done, streak, missedDays, warning)>`, plus `done` and `total`.
    - Algorithm: start from the snapshot's state for `snapshot.date`, where `done` = `doneToday` with the queued actions for that date applied (the last action per habit and date wins). Step forward day by day to `today`.
    - For each completed day D before today: `streak = doneD ? streak + 1 : 0` and `lastDone = doneD ? D : lastDone`. Here `doneD` comes from the queued actions for D, or from the snapshot when D is the snapshot date; otherwise it is false.
    - Today's `done` comes from the queued actions for today, or from the snapshot when today is the snapshot date.
    - `streak` shown = `done ? streakBefore + 1 : streakBefore`.
    - `missedDays` = unticked days from `max(lastDone + 1, addedOn)` to `today − 1`, inclusive.
    - `warning` = `missedDays ≥ warnAfterDays`.
    - A snapshot dated after today (clock change) is shown as-is for its date's ticks.
  - `HabitWidgetModel.layout(rows, style, heightDp)` follows `WidgetModel.layout`'s budget rules and returns the rows shown plus a hidden count.
  - Widget UI:
    - **Header:** "Habits", today's short date, and `done of total`. Tapping it opens the app with `ACTION_HABITS`.
    - **Rows:** a checkbox and the name, then the streak `🔥N` when `style.show.streaks`, or `⚠ Nd` in the accent/red colour when warning.
    - **Overflow:** `+N more` opens the app.
    - **Empty:** `Add habits in Daymark`, which opens the app.
    - **Small widths (< 180 dp):** a big `done/total` and "habits".
  - Tapping a checkbox queues `{habitId, date: today, done: !row.done, at: Instant.now()}` and refreshes the habit widgets.
  - Per-widget style is the same as the task widget, using `WidgetStore.style(context, id)`.
  - `daymark_habits_widget_info.xml`: copy `daymark_widget_info.xml` (same configure activity, `configuration_optional|reconfigurable`) with its own `initialLayout`/description and a min size of 2×2.

- [ ] **Step 1: Write failing JVM tests** in `HabitWidgetModelTest.kt`:
  - `same day snapshot applies queued tick`
  - `after midnight shows unticked with streak carried`: snapshot 10-20 with `doneToday = true` and `streakBefore = 2`; today 10-21 → `done false`, `streak 3`.
  - `after midnight not done yesterday resets streak`
  - `queued tick from yesterday rolls into streak`: snapshot 10-20 with `doneToday = false`, a queued action for 10-20 with `done = true`, and today 10-21 → `streak 1` (from `streakBefore 0`).
  - `missed days and warning at threshold 3`
  - `last action per habit and date wins`
  - `layout hides overflow`

  In `WidgetStyleTest.kt`, add `streaks defaults true`.

- [ ] **Step 2: Run** `npm run android:build -- --test`. Expected: FAIL (classes missing).

- [ ] **Step 3: Implement.** Mirror `DaymarkGlanceWidget.kt`: the version-keyed `remember`, `refreshAll`, and `onDeleted` → `removeStyle`.

- [ ] **Step 4: Run** `npm run android:build -- --test`. Expected: BUILD SUCCESSFUL, with all JVM tests passing (the existing WidgetModelTest and WidgetStyleTest included).

- [ ] **Step 5: Commit** with the message `feat: Daymark Habits home-screen widget`.

### Task 8: Browser coverage

**Files:**
- Modify: `scripts/helpers/*` (the `seedVault` option `habits`, written to kv `habits`), `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`, `scripts/e2e-sync.mjs`, `scripts/capture-screenshots.mjs` (`cycle-7` set)

**Interfaces:**
- Consumes: the UI from Tasks 4–6.
- Produces: new QA scenarios H1–H8 and new UX checks.

- [ ] **Step 1: Add QA scenarios** to `e2e-qa-regressions.mjs`, following the existing `run('D1', …)`/`check()` style:
  - **H1 — bar closed by default:** at desktop 1440 and phone 390, the bar has `aria-expanded=false` and the empty state reads `Add a daily habit`.
  - **H2 — add and tick:** add two habits through Edit, tick one, reload. It is still ticked, the kv `habits` record has a tick for TODAY, and the bar shows `1 of 2`.
  - **H3 — warning:** seed a habit added Y5 that was never ticked. The closed bar shows the warning chip, and ticking today removes it.
  - **H4 — past-day backfill:** in Calendar, select Y1 and tick the habit in the day detail. The streak shown on Today increases.
  - **H5 — week rows:** seed 9 tasks on one day. In week view, all 9 titles are visible (no `+N more`); the row width is ≥ 90% of the calendar card at 1440; at 390 the row's task list is a single column (the two titles' `x` offsets are equal).
  - **H6 — day change:** set the developer date override to tomorrow. The bar shows `0 of N` and yesterday keeps its tick in Calendar.
  - **H7 — drag to a week row:** at desktop, drag a task onto a future row; it moves (reuse the existing drag-test helper).
  - **H8 — removal keeps history:** remove a habit (confirm). It is gone from Today, but Calendar Y1 still shows its tick.

- [ ] **Step 2: Add a two-device check** to `e2e-sync.mjs`: device A ticks habit X and device B ticks habit Y on the same day. After both sync, each device shows both ticks.

- [ ] **Step 3: Update `ux-suite.mjs` selectors** for the week view (rows replace the 7-column grid). Add LAY checks for the habits bar at 390, 1440 and 1920 in light and dark.

- [ ] **Step 4: Run** `npm run build && npm run test:qa && node scripts/ux-suite.mjs && npm run test:sync && npm run test:e2e`. Expected: every check passes (0 failed).

- [ ] **Step 5: Commit** with the message `test: cycle 7 browser coverage`.

### Task 9: Docs and release notes

**Files:**
- Modify: `README.md` (features: habits, the habits widget, week rows), `.ai-configs/project/codebase-map.md` (a "Cycle 7 Modules" table listing the new files), `.ai-configs/project/specification.md` (habits section: model, sync entity keys, feature gating)
- Create: `docs/releases/cycle-7/README.md` plus images from `node scripts/capture-screenshots.mjs cycle-7`

**Interfaces:**
- Consumes: everything above.
- Produces: user-facing release notes in plain language, with no process language (no "SDD", "ruling" or "task N").

- [ ] **Step 1: Capture the screenshots:**
  - week rows (desktop and phone);
  - the habits bar, closed and open;
  - the habit editor;
  - the warning chip;
  - Calendar day habits.

- [ ] **Step 2: Write the docs.** The release notes must mention two things:
  - habits sync only between devices on 1.4.0 or later, and older apps are unaffected;
  - the new widget is under the widget list as "Daymark Habits".

- [ ] **Step 3: Run** `npm run validate:ai`. Expected: PASS.

- [ ] **Step 4: Commit** with the message `docs: cycle 7 release notes`.
