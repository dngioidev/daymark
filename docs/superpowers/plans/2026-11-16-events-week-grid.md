# Events Week Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a separate Teams-style Events week calendar using the current device timezone, preserving the existing task week view.

**Architecture:** Pure helpers project stored event instants into device-local days, construct a DST-aware shared axis and calculate overlap lanes. A dedicated `EventWeekGrid` renders that model; `CalendarView` exposes it as a third view and retains the existing task renderers. Existing event editor callbacks and storage remain unchanged.

**Tech Stack:** Existing React, TypeScript, Tailwind, Intl, Vitest and Playwright; no new dependencies.

**Spec:** [Approved Events week design](../specs/2026-11-16-events-week-grid-design.md).

**Status:** owner approved this plan on 2026-11-16; implementation started with the existing single Luna worker and main-agent review.

## Global Constraints

- One reused Luna implementation worker; main performs reviews and independent verification. No additional agents.
- Work only in `C:/Users/Admin/.codex/worktrees/6a4a/daymark`, branch `cycle-21-events`. Pass this absolute workdir on every command; the original D: checkout contains unrelated work.
- Grid placement uses the device's current timezone. Original time/zone remains the primary event label. Views never rewrite stored instants, dates or durations.
- Date-only and duration-only events retain their selected date in a **No set time** strip. Start-only events show **No duration** without an invented booked span.
- Existing Month and task Week behavior remains intact. Do not modify `WeekRows.tsx`, task lifecycle, persistence, sync or warnings.
- No drag/create/resize interactions, dependency/version/lockfile changes, merge, push, release or deployment.
- Derive event types from `src/types/daymark.ts`; pure temporal and overlap calculations belong in `src/utils`.
- Use supported palette tokens and full-width desktop layout. Phone days scroll horizontally at readable widths with sticky day/time context.

## Review Focus

1. An event whose original date is Saturday but device-local date is Sunday must enter the correct device-local week (Task 1).
2. On a fall-back week, non-transition days must not paint booked time into the extra repeated-hour band (Tasks 1–2).
3. Short/start-only event callouts may be taller than their actual spans; keep their true time marker and prevent visual overlap or false duration (Tasks 1–2).
4. Skipped dates, midnight transitions and half-hour changes must not be mistaken for fixed 24-hour days (Task 1).
5. Phone horizontal scrolling, sticky intersections and opening any continuation segment must keep the correct event/editor reachable (Tasks 2–3).

## DST Axis Decision

Use one wall-clock axis shared across the seven columns. A normal axis covers 00:00–24:00. Spring-forward gaps stay visible in the affected day as hatched **Clock skips forward** intervals; no event fills a nonexistent interval. Other days can use those normal clock rows.

For a repeated clock interval, insert a second labeled occurrence band after its first occurrence, before later clock times. Both occurrences are available only in the affected day; the added band is unavailable/hatched in days where the clock did not repeat. Labels show first/repeated occurrence and the applicable UTC offset. Half-hour folds insert 30 minutes, not a whole hour. When several fold intervals overlap within a week, combine their clock ranges into a shared band and preserve the per-day occurrence mappings; unsupported mapping must fall back to an explicit readable schedule rather than silently collapsing events.

Split visual segments at device-local day boundaries, clock discontinuities and axis-only unavailable bands. Thus a normal-day event crossing an inserted fold band has linked pieces on either side, without painting the intervening unavailable time. Segments retain one event ID and exact source instants. Geometry is derived from actual valid constant-offset intervals, not by treating every date as 86,400 elapsed seconds.

Examples pinned by tests:

- New York 2026-03-08: 01:30–03:30 is 60 elapsed minutes; draw two 30-minute pieces around the missing 02:00–03:00 band.
- New York 2026-11-01: first 01:30 to second 01:30 is 60 elapsed minutes across two labeled occurrences; the axis contains 1,500 minute units.
- A normal day in that fall-back week, 01:30–02:30: two 30-minute pieces separated by the unavailable repeated-hour band.
- Lord Howe 2026-04-05 inserts a 30-minute repeat. Apia 2011-12-30 is an unavailable date, not a fabricated ordinary day.

The projection helper may expose narrowly scoped existing `eventTime.ts` formatting/offset primitives to avoid duplicate Intl logic. Cache bounded timezone-only day/axis data by date/zone; projected event models must reflect every event edit/delete. Do not perform expensive timezone resolution during JSX rendering.

## Task 1: Device-zone projection, axis and overlap model

**Files:** create `src/utils/eventWeekProjection.ts`, `eventWeekProjection.test.ts`, `eventWeekLayout.ts`, `eventWeekLayout.test.ts`; narrowly extend `eventTime.ts` only if reusable primitives are required.

**Interfaces:**
- `buildEventWeek(events: readonly EventItem[], anchor: string, deviceZone: string): EventWeekModel`.
- `EventWeekModel`: `zone`, seven Sunday-first `days`, shared `axis` bands, `totalMinutes`, projected `segments`, and untimed entries by date. `fallbackEvents: { event: EventItem; reason: string }[]` preserves whole source events that cannot be plotted exactly; optional `fallbackReason` explains an unsupported/invalid week and the grid renders a readable schedule instead of throwing.
- `EventWeekSegment`: stable `key`, source `event`, `date`, exact clipped `startInstant`/optional `endInstant`, `topMinutes`, `spanMinutes`, `startOnly`, `continuesBefore`, `continuesAfter`, and local schedule/offset label.
- Axis bands expose stable key, wall-clock range, occurrence index, minute-coordinate range, label and per-day availability. Day models expose their date and unavailable intervals.
- `layoutEventWeekSegments(segments: readonly EventWeekSegment[], minimumCalloutMinutes: number): PositionedEventWeekSegment[]` adds `lane`, `laneCount` and `calloutMinutes`; it never changes `spanMinutes` or source data. Segments collide by displayed rectangle for callout placement; actual time remains represented separately.

- [x] Write failing projection tests: cross-zone Saturday/Sunday shift; start-only; both untimed shapes; overnight and multi-day continuation; end exactly at midnight; no source mutation; invalid-zone safe fallback; all DST examples above and a midnight-gap date.
- [x] Run `node node_modules/vitest/vitest.mjs run src/utils/eventWeekProjection.test.ts --maxWorkers=2` and record the expected missing-module/behavior failure.
- [x] Implement the projection/axis model. Reuse calendar/date and event validation helpers. Return UTC with an explicit fallback zone when the supplied device zone is invalid; never lose the original schedule label.
- [x] Write failing layout tests for identical starts, nested/transitive overlaps, end-exclusive adjacency, independent overlap groups and crowded short/start-only callouts; then implement deterministic lane assignment and lane reuse. Use event ID plus segment start as tie-breakers.
- [x] Run both new test files and existing `eventTime.test.ts`, `events.test.ts`, `calendarGrid.test.ts`, plus lint. Main reviews DST geometry, exact source instants and bounded work before the domain checkpoint commit.

## Task 2: Dedicated Events week grid component

**Files:** create `src/components/events/EventWeekGrid.tsx` and `EventWeekGrid.test.tsx`; optionally extract a focused block component if needed.

**Interface:** `EventWeekGrid({ events, anchor, deviceZone, onEdit })`, where events are readonly `EventItem[]`, anchor is a date string, deviceZone is an IANA zone and `onEdit(event: EventItem): void` opens the existing editor. Consume Task 1 models through memoization.

- [x] Write failing component tests for seven day headings, explicit device zone, original-zone primary label/local secondary text, unscheduled strip, start-only **No duration**, overlapping buttons, unavailable DST bands and editing the correct source event from a continuation.
- [x] Implement a bounded, keyboard-scrollable viewport with shared column sizing, sticky day headings and a sticky time gutter. Use 1 CSS pixel per axis minute. Minimum callout height is 44px; render the true duration separately as an exact-span indicator so a small event never implies a 44-minute reservation.
- [x] Use a minimum day width of 160px; widen all columns when needed so each overlap lane is at least 72px. Horizontal scrolling is allowed within the full-width view on both narrow desktops and phones. Truncate compact labels with full accessible names and existing editor access.
- [x] Render **No set time** entries as ordinary labeled buttons above the timeline, including duration when present; use a bounded scrollable strip when crowded. Never fill a whole day's timeline for these events.
- [x] Initially scroll the timeline toward 08:00 on view/week changes. Re-render on device-zone changes while retaining editor identity and source data; do not reset scroll on unrelated event edits. Show an explicit readable fallback schedule if an axis cannot be represented safely.
- [x] Run new component tests plus existing `CalendarEvents.test.ts`, `EventEditor.test.ts` and lint. Main reviews desktop/phone layout semantics before checkpoint.

## Task 3: Calendar integration, browser evidence and documentation

**Files:** modify `src/components/CalendarView.tsx` and its tests; add focused mobile coverage in `src/components/mobile/MobileAppShell.events.test.tsx`; extend `scripts/e2e-qa-regressions.mjs`, `scripts/capture-screenshots.mjs` and `scripts/helpers/cycle-21-events.mjs`/tests; update `docs/guide/calendar.md`, `docs/guide/events.md`, `docs/ROADMAP.md` and `docs/releases/cycle-21/README.md`.

**Interface:** extend Calendar's view union to `'month' | 'week' | 'events-week'`. Continue using the existing `events`, `deviceZone` and `onEditEvent` props already wired through desktop and mobile.

- [x] Write failing integration tests: **Events week** is independently selectable; Month/task Week still render their existing content; Events week renders no task-week rows or selected-day task panel; previous/next move seven days; Today returns to device-local today; changing deviceZone repositions events without a save callback.
- [x] Add the third view control and a dedicated full-width rendering branch. Keep existing Month and Week strings/behavior. Reuse `weekAnchor`, selected-date following and date helpers; show the event week range, Today control and device timezone. Hide task-only summary/recent-day/selected-day panels only in this new branch.
- [x] Add `C21-EventWeek` real-browser checks on desktop and phone for navigation, cross-zone date placement, overlaps, untimed entries, horizontal scroll/sticky geometry and opening/editing the correct event. Use existing disposable-port guards and DOM plus visible-app/Synced readiness, not `networkidle` in the new scenario.
- [x] Capture four new feature images (desktop/phone light/dark) with overlaps and untimed entries; inspect every image and actual theme/viewport. Keep all fixtures disposable and existing screenshot sets intact.
- [x] Run focused tests, lint, build, helper/config checks and full bounded unit suite. Run the new browser scenario, relevant existing Calendar/mobile cases and PWA; compare any broad QA failures with committed `docs/releases/cycle-21/qa-comparison.json`, retaining raw timeouts and focused retries separately. Do not change tests to hide failures.
- [x] Main performs the whole-branch review against the approved design, updates Daymark task/spec/plan outcomes and records exact verification. Commit the completed follow-up; do not merge, push or deploy.

## Self-review and handoff

Coverage: device-zone/date/DST contract is Task 1; visual blocks, unscheduled events and phone usability are Task 2; separate Calendar navigation, existing-task preservation, editor wiring and real-browser evidence are Task 3. Interfaces consistently use `EventItem` and one immutable source event per segment. No storage or backend work is needed.

Execution method is already chosen: one reused Luna worker with main-agent review. Owner design and plan approvals are recorded. Execute the tasks continuously without further routine approval prompts.


## Execution rulings

Task 1 review confirmed that minute-only occurrence maps cannot represent every historical second-level clock change. Such events must retain their whole source record in the explicit readable fallback. Coverage checks must not use an approximate minute-map boundary as proof that no time was lost. UTC civil-date stepping avoids host-zone skipped-date errors. These are safety refinements within the approved fallback/timezone contract, not new scope.


## Verified execution outcome - 2026-11-16

Task 1 checkpoint `05ff363`; Task 2 checkpoint `618e877`. Task 3 is implemented with main review and independent verification. C21 browser checks passed 35/35, including 19 dedicated Events week assertions; existing Calendar/habit checks passed 17/17; PWA e2e passed. All 45 helper checks, lint, production/site builds and 81 AI config checks passed. Four feature screenshots and 34 general audit images were captured and reviewed. The final full-unit result and completed Daymark handoff are recorded in the Cycle 21 release report. No merge, push or deployment.
