# Cycle 21 Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the owner selects that approach. Steps use checkbox syntax for tracking.

**Goal:** Add planned and retrospective events with optional time/duration, mixed daily presentation, a Calendar agenda and in-app advance warnings.

**Architecture:** Persist events independently from tasks as capability-gated `event:<id>` sync entities. Project them into daily sections and Calendar using their original date and section; do not add them to `HeadingSection.items`. Use pure time-zone utilities and event actions, with React state wired through App and existing persistence/sync conventions.

**Tech Stack:** Existing TypeScript, React, Vitest, Intl.DateTimeFormat, IndexedDB, Express, JSZip and Playwright tooling. No dependency changes planned.

**Spec:** [Approved Cycle 21 spec](../specs/2026-11-15-cycle-21-events-design.md), approved 2026-11-15. Implementation has not started. Review this plan before execution.

## Global constraints

- Time and duration are independently optional. Date and title are required.
- Preserve original time and zone as primary; converted device-local time is secondary.
- Duration means positive whole elapsed minutes; end-time entry is another way to calculate that same duration.
- No event completion, aging, overdue, carry-forward, recurrence, task conversion or new OS notification infrastructure.
- Shared advance warning defaults to 15 minutes; `null` means off. Untimed events do not warn.
- Preserve task comments, notes, frontmatter, rollover idempotency and existing task/habit behavior.
- Keep desktop full width (`max-w-[1800px]`), supported stone tokens, keyboard and phone usability.
- No release, deployment, dependency or lockfile changes. Preserve the existing untracked `.claude/` directory.

## Review focus

1. An older client must neither delete nor receive unsupported event entities; an older server must leave local events intact (Task 3).
2. A zone switch, DST transition or end exactly at midnight must preserve instants without spurious calendar days (Tasks 1 and 5).
3. Deletion concurrent with an edit, a move concurrent with a checklist change, or a second-device push during editing must not silently discard edits (Tasks 3 and 4).
4. Missing or damaged event backup data must not erase valid local events or masquerade as an intentional deletion (Task 2).
5. Resume inside/outside the warning window, multiple due events and an edited start must produce useful notices without repeated rerender warnings (Task 6).

## File boundaries and data contract

Add these core types in `src/types/daymark.ts`:

```ts
interface EventTiming {
  localTime: string; // HH:mm on EventItem.date in timeZone
  timeZone: string; // IANA zone
  startInstant: string; // canonical ISO instant; preserves fold selection
}
interface EventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, original calendar placement
  heading: string;
  order: number; // shared numeric placement relative to task.order
  description?: string;
  checklist?: ChecklistItem[];
  timing?: EventTiming;
  durationMinutes?: number;
  createdAt: string;
  updatedAt: string;
}
```

Add optional `AppSettings.eventWarningMinutes?: number | null`; absent means 15 at use time, without normalizing absence into a saved edit. Reuse the existing settings merge path and test that older settings writes preserve the field.

New modules: `src/utils/eventTime.ts` (zone resolution/formatting), `events.ts` (validation/actions/projection/warning eligibility), `eventMarkdown.ts` (event file round trip), `src/sync/eventMerge.ts` (merge), `src/components/events/EventFields.tsx`, `EventEditor.tsx`, `EventCard.tsx`, `CalendarEvents.tsx`, and `src/hooks/useEventWarnings.ts`. Keep these responsibilities separate from task lifecycle logic.

### Task 1: Core event model, time zones and actions

**Files:** core types; create `src/utils/eventTime.ts`, `eventTime.test.ts`, `events.ts`, `events.test.ts`; inspect `src/utils/lifecycleEngine.test.ts`.

**Interfaces:**
- `resolveEventTime(date: string, time: string, zone: string): { kind: 'valid'; instants: string[] } | { kind: 'invalid'; message: string }`. A gap returns no valid occurrence; a fold returns both sorted instants. The editor must select one before saving.
- `eventEndInstant(event: EventItem): string | undefined`.
- `formatEventSchedule(event: EventItem, deviceZone: string): { primary: string; secondary?: string }`.
- `validateEvent(event: unknown): event is EventItem` and `eventsForDate(events: readonly EventItem[], date: string): EventItem[]`.
- `upsertEvent(events: readonly EventItem[], event: EventItem): EventItem[]`, `removeEvent(events: readonly EventItem[], id: string): EventItem[]`.
- `mixedSectionItems(tasks: readonly TaskItem[], events: readonly EventItem[]): ({ kind: 'task'; item: TaskItem } | { kind: 'event'; item: EventItem })[]`, sorted by order with stable ID tie-breaks; no renumbering untouched tasks.

- [ ] Write failing tests: all four event shapes; invalid dates/times/zones/durations; positive safe whole-minute durations; blank title; unique IDs; edit/removal without mutation; mixed order ties; event-only heading.
- [ ] Write time tests: Ho Chi Minh 2026-11-20 15:00 resolves to `2026-11-20T08:00:00.000Z`; London secondary is 08:00 that day. New York 2026-03-08 02:30 is a gap; 2026-11-01 01:30 resolves to 05:30Z and 06:30Z. Include Lord Howe's half-hour transition and Pacific/Apia's skipped 2011-12-30. Two elapsed hours from New York 2026-03-08 01:30 end at 04:30 local.
- [ ] Run `npm test -- src/utils/eventTime.test.ts src/utils/events.test.ts`; observe failure before implementation.
- [ ] Implement using cached Intl formatters with explicit zones and `hourCycle: 'h23'`. Resolve offsets around the requested local date and round-trip every candidate through Intl; reject candidates that do not exactly match. Never parse zone-less local input using the device Date constructor. Handle gaps/folds explicitly and test fractional-hour zones. Validate ISO instants against local components and zone.
- [ ] Use end-exclusive spans for calendar overlap: an event ending exactly at midnight does not occupy the following day. Duration-only events appear only on their selected date. Start-only events have no inferred end. Require finite supported dates/end calculations; surface errors instead of throwing during render.
- [ ] Run targeted tests and `npm run lint`, then checkpoint the task changes on the feature branch.

### Task 2: Local storage and readable event backups

**Files:** `src/utils/vaultStore.ts`, `vaultValidation.ts`, `vaultArchive.ts`, `src/App.tsx`; create `eventMarkdown.ts`, `eventMarkdown.test.ts`; extend `vaultStore.test.ts`, `vaultValidation.test.ts`, `vaultArchive.test.ts` and vault wipe tests.

**Interfaces:** `loadEvents(): EventItem[]`, `saveEvents(events: EventItem[]): void`; `serializeEvent(event: EventItem): string`, `parseEvent(markdown: string): EventItem`; optional `VaultSnapshot.events?: EventItem[]`; `mergeRestoredEvents(current: EventItem[], restored?: unknown): EventItem[]`.

- [ ] Write failing tests for event storage/reload, cross-tab delivery, wipe/reset, malformed input retained for recovery, and old backups without events preserving current events. Explicit events in an imported full backup follow existing replace semantics; missing events never mean delete.
- [ ] Define independent Markdown files `events/<id>.md`: human-readable title, date, zone/time, duration, notes and checkboxes, with versioned `daymark_event` frontmatter metadata for the typed fields and checklist IDs. Use a JSON object as the frontmatter value (valid YAML) and validate it before use. Encode title/notes/checklist text safely; preserve blank lines and arbitrary Markdown in notes. Do not write task metadata comments. Add round-trip tests with multiline notes, code fences, `---`, brackets and checked items.
- [ ] Run the targeted tests to confirm failure, then implement event cache key, shared-key validation/broadcast and store recovery. Initialize empty events without changing existing daily docs.
- [ ] Add events to JSON backups and `.daymark/vault.json`; ZIP also includes readable event files. Snapshot-less ZIP import recognizes event paths before daily/standalone-note parsing; duplicate IDs and malformed event files fail visibly without destructive partial replacement. Old archives lacking events keep local event data. Add events to App restore/wipe/sample-state plumbing.
- [ ] Run relevant storage/archive tests and `npm run lint`; checkpoint. Daily Markdown remains unchanged; new readable event files carry independent records.

### Task 3: Capability-gated sync and conflict safety

**Files:** `src/sync/syncClient.ts`, `protocol.ts`, `merge.ts`, `src/hooks/useSync.ts`, `server/app.ts`, `server/vault.ts`, `src/App.tsx`; create `src/sync/eventMerge.ts`, `eventMerge.test.ts`, `eventSync.test.ts`; extend server sync/vault tests and `src/sync/testkit/devices.ts`.

**Interfaces:** `mergeEvent(base: EventItem | null, ours: EventItem | null, theirs: EventItem | null): MergeResult<EventItem>`; event entity key `event:<id>`; `VaultData.events: EventItem[]`; `SyncFeature` gains `'events'`; `SyncState.eventsSynced?: boolean` follows current backfill flags.

- [ ] Write failing tests: disjoint edits merge; schedule fields (`date`, `timing`, `durationMinutes`) merge atomically; checklist states merge by stable item ID; conflicting notes retain both texts with existing conflict separator; edit beats deletion with a reported conflict; deletion of unchanged copy remains deleted; event move plus notes edit converge to one entity.
- [ ] Write server tests with no `events` feature: event entities excluded from response even on full backfill; attempted event writes/deletes refused; task/settings changes do not alter stored events. Test updated client versus an older-server fixture rejecting event keys: ordinary task sync continues, local events remain pending and a clear update-server notice appears. Add an older-client simulation that pulls/pushes without the feature and never gets an event base to turn into a deletion.
- [ ] Run tests and observe failures, then implement entity validation, per-ID merge and null tombstones, feature filtering, unsupported-server fallback and event backfill from revision zero on upgrade. Do not count unsupported events as successfully synced.
- [ ] Wire event changes into pending-change computation, sync outcome application, edits made during in-flight sync, storage persistence, cross-tab changes and server change broadcasts. Test an event deleted during a pending sync is not resurrected by its response.
- [ ] Test older settings writes preserve `eventWarningMinutes`. Test task-only daily writers and task MCP operations cannot affect independent events. Document that old clients cannot display/export events, while the updated server preserves them; an old export alone cannot back up events.
- [ ] Run event sync tests, existing sync tests, server tests and `npm run lint`; checkpoint.

### Task 4: Event capture, editing and mixed daily rows

**Files:** create the four event editor/card components and tests; modify `src/components/QuickCaptureModal.tsx`, `TodayView.tsx`, `src/App.tsx`; inspect `TaskItemCard.tsx`, `TaskHistoryDrawer.tsx` for presentation reuse without task lifecycle coupling.

**Interfaces:** `EventFields` edits an event draft and exposes validation plus fold selection; `EventEditor` consumes an optional existing event, date and headings and produces a validated `EventItem` through `onSave`; `EventCard` consumes an event plus edit/delete/checklist callbacks. Keep unsaved drafts local and avoid silently replacing them on sync.

- [ ] Write failing UI tests for Task/Event capture selection; all four optional-time shapes; section/date selection; blank title; two equivalent span modes; explicit overnight end-date offer; invalid/fold time correction; zone preview; clearing start retains duration; clearing span retains start; checklist editing.
- [ ] Run targeted tests, then add Event capture using the same quick-capture entry point. Events cannot target Backlog. New mixed row order uses the current maximum order in the section plus one. Keep existing task callbacks unchanged.
- [ ] Render mixed rows through `mixedSectionItems`; event-only sections remain visible even without a daily task document. Reuse section notes without rewriting daily documents merely to project events. Show Event icon/text, original schedule and local subtime, notes and checklist controls; no task status/completion controls.
- [ ] Support edit, delete, move section/date and reorder against task rows without task conversion. Renaming/removing a section must use existing section conventions while moving/preserving its events; never orphan them invisibly. On remote edits while an event editor is dirty, preserve typing and report the change; allow save through the conflict-aware state path, not blind stale replacement.
- [ ] Verify keyboard/touch access and accessible names; run targeted UI tests, lint and build; checkpoint.

### Task 5: Calendar events agenda and device-zone refresh

**Files:** create `src/components/events/CalendarEvents.tsx` and tests; modify `CalendarView.tsx`, `WeekRows.tsx`, `src/utils/calendarGrid.ts`, `calendarGrid.test.ts`, `src/App.tsx`; create `src/hooks/useDeviceTimeZone.ts` and tests.

**Interfaces:** `useDeviceTimeZone(): string` resolves Intl zone on mount, foreground/resume and a 30-second active-page timer; cleans up listeners/timers. `CalendarEvents` consumes all events, selected date, device zone and edit callback. Calendar cell data gains an event count separate from task totals.

- [ ] Write failing tests: selected-day agenda even on task-empty dates; timed-before-unscheduled ordering; midnight-exclusive span; continuation across multiple dates; duration-only label; original-date placement after device-zone change; local subtime includes changed date; overlapping events visible separately.
- [ ] Run tests, implement dedicated Events agenda and month/week indicators without replacing task view or adding an hourly grid. Use `eventsForDate`, not duplicate saved copies. Editing opens the event editor using the original event ID.
- [ ] Re-render schedule labels when the zone hook changes; never mutate stored events for a zone change. Test invalid/unavailable device zone has a readable original-zone fallback.
- [ ] Run calendar/UI tests, lint and build; checkpoint.

### Task 6: Warning settings and in-app notices

**Files:** create `src/hooks/useEventWarnings.ts` and tests; add eligibility helpers/tests in `src/utils/events.ts`; modify `SettingsModal.tsx`, `src/utils/defaultData.ts`, `vaultValidation.ts`, settings tests and `src/App.tsx`.

**Interfaces:** `dueEventWarnings(events: readonly EventItem[], nowMs: number, leadMinutes: number | null): EventItem[]`; `useEventWarnings(events: EventItem[], leadMinutes: number | null, notify: (event: EventItem) => void): void`. Keep real clock injectable in tests; do not use the developer simulated day as a notification clock.

- [ ] Write failing eligibility tests: 15-minute threshold inclusive, start exclusive; untimed/past/off excluded; multiple events; invalid setting rejected. Missing setting uses 15 without persisting defaults.
- [ ] Write hook tests with fake timers: deduplicate by ID/start in session; resume inside window warns; resume after start does not; rerender/zone change/sync refresh does not repeat; edited start can warn; unmount clears work.
- [ ] Run tests, implement a visible in-app upcoming-events notice/queue with dismiss and open-event actions so simultaneous warnings do not replace each other. Only evaluate actively while visible; reevaluate immediately on resume. No OS permissions or background delivery.
- [ ] Add labeled global Events warning setting with Off and positive whole-minute input, separate from old-task warning semantics. Preserve existing settings behavior and absence semantics in sync.
- [ ] Run hook/settings tests, lint and build; checkpoint.

### Task 7: Integration evidence and documentation

**Files:** extend `scripts/e2e-qa-regressions.mjs`, `scripts/e2e-sync.mjs`, `scripts/capture-screenshots.mjs`; update `.ai-configs/project/specification.md`, `codebase-map.md`, `api-and-sync.md`, appropriate `docs/guide/` pages and `docs/ROADMAP.md`; create `docs/releases/cycle-21/README.md` after evidence exists.

- [ ] Add a QA scenario covering event capture, reload, edit, checklist, mixed rows, Calendar continuation, untimed duration and warning settings; add two-device event edit/move/delete convergence scenario. Keep fixtures separate from user vaults.
- [ ] Run `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run validate:ai`, `npm run test:sync`, `npm run test:qa`. Diagnose failures; do not weaken checks or silently classify them as pre-existing.
- [ ] Run `node scripts/ux-audit.mjs cycle-21` and `node scripts/capture-screenshots.mjs cycle-21`; inspect phone/desktop light/dark images, including long titles, cross-zone subtime and event-only days. Record limitations for physical-phone zone changes if no real device is available.
- [ ] Document event Markdown paths, sync feature negotiation, older-client/server behavior, date-only/duration-only semantics and warning delivery limits. Record only executed verification in the release report; no release/version bump/deployment.
- [ ] Review the completed branch against every spec acceptance criterion, preserve unrelated changes, and update the Daymark task with actual outcome and evidence. Mark complete only when implementation and required verification are done.

## Self-review and execution handoff

Coverage: model and time contract → Task 1; persistence/compatibility → Tasks 2–3; capture/notes/checklists/sections → Task 4; Calendar/local subtime → Task 5; warnings/settings → Task 6; evidence/docs → Task 7. Review-focus cases are included in their owning tasks. File names marked create are proposed; modified paths were inspected in the repository.

Recommended execution: native implementation in this session, because the storage, sync and UI tasks share a small set of evolving interfaces. Review this plan before coding, as required by the writing-plans workflow. Workspace isolation choice is deferred until execution; no worktree, application-code change or commit has been made by this planning step.
