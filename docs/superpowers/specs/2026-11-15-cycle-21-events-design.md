# Cycle 21: Events with optional time and duration

Date: 2026-11-15 · Status: approved by the owner on 2026-11-15; implementation planning started.
Follows Cycle 20. Tracking task: `task-1794741962916-m7v3` under **My task** in Daymark.

## Purpose

Record planned occasions and things that already happened, without treating them as unfinished work. Events belong to daily sections alongside tasks, with their own recognizable style. Calendar gives events a dedicated area so scheduled time and time commitments are easier to understand.

## Confirmed requirements

- An event has a title, date, section, optional notes and a checklist, like a task.
- Start time and duration are independently optional: date only, date plus duration, date plus start time, and date plus start time and duration are all valid.
- When a start time exists, enter the span by either end time or duration; Daymark calculates the equivalent value.
- Spans may cross midnight. Time-zone handling must preserve the event's actual moment.
- Original time and original time zone remain the primary display. When the device zone differs, show the local equivalent underneath, with its date if different. React to device time-zone changes.
- Events have no completion state, overdue warning, aging or carry-forward. Individual checklist entries may be checked without completing the event.
- Mix events and tasks in daily sections. Give Calendar a dedicated events area.
- Timed events receive an in-app advance warning. One shared setting defaults to 15 minutes before, with an off option.
- Reuse device notifications only if already implemented. Inspection found no usable implementation, so this cycle adds no background notification infrastructure.

## Approaches and implementation recommendation

**Recommended builder choice: a dedicated event domain model with a shared daily presentation.** Reuse task-like notes, checklist controls and section interactions, while keeping event lifecycle independent. Extend the core types in `src/types/daymark.ts`; derive event logic from those types. Shared presentation does not require pretending an event is an incomplete task.

**Alternative: add an event kind to the task model.** This reduces initial UI changes but requires every completion, aging, rollover, history, summary and widget consumer to distinguish events correctly. It risks events appearing as unfinished work. The dedicated model is preferred for this reason. The owner has selected mixed presentation, not a specific storage implementation; this recommendation remains a builder choice for review.

## Capture and editing

Offer Task/Event as the item type during capture. Event fields: title, date, section, optional notes, checklist, optional start time and time zone, and optional duration. With a start time, offer **End time** and **Duration** as two input modes for the same span.

Builder decisions for this draft:

- Date is required and defaults to the day being edited. Title cannot be blank.
- Missing duration means unknown, not zero or all-day occupancy. A date-only event displays **Date only**; do not imply it occupies an entire day.
- Duration is a positive elapsed number of minutes, entered using hours/minutes. Without a start time it expresses effort/time commitment only; it has no calculated end or notification instant.
- End-time entry includes an end date, initially the start date. If an earlier end clock time is entered, offer the next day explicitly and show the resulting full date before saving. Never silently produce a negative span. Permit longer spans using an explicit end date or duration.
- Removing the start time removes its scheduled instant and warning eligibility but may retain the duration. The editor must show this result before save. Removing duration retains a start-only event.
- Existing events can be edited, moved to another section/date and deleted using established app interaction and sync deletion conventions. These operations do not create task history or carried copies.
- Converting existing tasks to events, or events to tasks, is outside this cycle.

## Time-zone contract

For a timed event retain the original local date/time, an IANA zone identifier, resolved start instant and, when a span exists, its elapsed duration. Do not retain independently editable end/duration values that can disagree. Derive end instant from start plus elapsed duration; derive displayed end values from that instant in the original zone.

Default the zone to the device zone at capture, show it in the editor and allow selection of another zone. A device-zone change never rewrites the saved event. Changing an event's zone in the editor interprets its entered original clock time in the newly selected zone; preview both the zone and resulting instant before save.

For daylight-saving transitions, reject nonexistent local times with an explanation. For ambiguous times, require selection of the earlier/later occurrence, showing offsets. End-time input resolves the end instant in the same way; require it to be later than the start instant. Duration always means elapsed time, including across daylight-saving transitions.

Primary display example:

```text
15:00–16:00 · Asia/Ho_Chi_Minh · 1 hour
Your local time: 09:00–10:00 · Europe/London
Client meeting
Discuss launch plan
☑ Prepare demo   ☐ Gather feedback
```

Include both dates for cross-midnight spans. Date-only and duration-only events have no time-zone conversion and keep their selected calendar date.

## Daily UI

Reuse section placement and mixed item ordering; do not automatically collect events above tasks. Show a recognizable calendar/clock icon and event label or equivalent accessible text. Show date/time or duration prominently, followed by title, notes and checklist using existing disclosure patterns. Do not show the task completion checkbox or task status selector on an event. Color alone must not identify the item type.

Keep existing desktop full-width layout (`max-w-[1800px]`) and phone usability. Use supported stone palette tokens. Details and editing remain accessible by keyboard and touch.

## Calendar UI

Builder proposal: retain the current calendar navigation and task view, adding a clearly labeled **Events** agenda for the selected date. This cycle does not require a new drag-and-drop hourly grid.

```text
Selected date: November 20
Events
  09:00–10:00 · Meeting · 1 hour
  23:00–Nov 21 01:00 · Maintenance · 2 hours
  No set time · Car repair · 2 hours
Tasks
  [existing selected-day task presentation]
```

Timed events sort by original start instant, followed by unscheduled events in saved order. Include events that overlap the selected day in their original zone and mark continuation rows; show local equivalents as secondary text. A start-only event belongs to its original start date. Date-only and duration-only events belong solely to their selected date. Do not duplicate stored events to render continuation rows. Changing the device zone does not move an event's primary calendar placement.

Show an event count/indicator on relevant calendar dates, separate from task completion counts. Duration-only events contribute a labeled unscheduled commitment, not a blocked time slot. Preserve overlaps visibly; do not add overlapping durations into a misleading occupied-hours total.

## Upcoming warnings

Use an accessible in-app notice for events with a resolved start instant when `start - lead <= now < start`. Re-evaluate on foreground/resume, relevant settings/event changes and timer updates while the app is active. Opening the app inside the warning window may warn; opening after the start does not produce an overdue notice. Date-only and duration-only events never warn.

Builder choice: deduplicate by event ID and start instant during an app session, so re-renders, sync refreshes and zone changes do not repeat the same warning. Editing the scheduled instant creates a new warning opportunity. Dismissal affects the notice only. No delivery guarantee while closed, background scheduling, OS permission prompt or retrospective warning backlog.

Persist the shared lead-time setting through the existing settings path. Validate a positive whole-minute value or off; do not add per-event warning settings this cycle.

## Persistence, compatibility and integration constraints

- Inspect Markdown parsing/serialization, vault persistence, backup/import, sync merge and tombstones before choosing the exact representation. This spec defines behavior, not an unverified wire format.
- Events remain readable in Markdown exports. Preserve existing frontmatter, notes, checklists and machine task comments unchanged. Never represent an event as an incomplete task merely for serialization convenience.
- Stable IDs support editing, moves, checklist changes, sync and deletion without duplication or resurrection. Rendering an event across calendar dates must not create multiple saved entities.
- Establish older-client preservation behavior before implementation. Test an event-bearing document passing through an older task-only writer; if it drops event data, the implementation plan must address that explicitly before shipping. Do not claim unknown fields are preserved without evidence.
- Existing task rollover stays idempotent and events never enter carry-forward, task completion counts, task aging or habit streaks.
- Audit shared UI consumers and server-side task tools so they do not accidentally mutate or count events as tasks. New MCP event CRUD tools and Android widget event presentation are outside this cycle; compatible data preservation remains required.
- Use current layers: pure time/domain utilities in `src/utils/`, core types in `src/types/daymark.ts`, presentation in components and existing app state flow. No new dependencies assumed.

## Non-goals

Recurrence, external calendar synchronization, invitations, attendees, travel-time calculations, background/OS notification delivery, a new hourly calendar grid, event completion/cancellation workflow, and task/event conversion. No release number or deployment is authorized by this specification.

## Acceptance and verification

1. Save and reopen all four shapes: date-only, duration-only, start-only and start plus span. Preserve notes, checklist states, section and ordering.
2. End-time and duration modes produce the same span; positive-duration validation, explicit cross-midnight dates and longer spans work.
3. Test daylight-saving gaps and overlaps, elapsed duration across transitions, original-zone display and device-local equivalents with differing dates. Changing the device zone preserves saved instants and primary placement.
4. Calendar shows a dedicated events agenda, cross-date continuation without duplicate entities, and separate event/task counts. Mixed daily rows remain visually and accessibly distinguishable.
5. Warnings obey the shared setting, warn once per session/scheduled start, re-evaluate on resume and never warn untimed or already-started events. Test using an injected clock.
6. No event rollover, completion, overdue or aging behavior. Existing task/habit behavior remains intact; test rollover idempotency explicitly.
7. Round-trip Markdown/export/import and two-device sync edits, moves, deletion and concurrent changes. Verify older-client preservation with fixtures or an actual older writer.
8. Run relevant targeted tests, `npm run lint`, `npm test`, `npm run build`, `npm run validate:ai`, relevant sync/QA checks and desktop/phone visual verification. Capture Cycle 21 screenshots once the UI exists.

## Builder responsibilities and status

Before coding, produce the implementation plan with exact schema/Markdown representation, older-client compatibility strategy, calendar component changes, warning/settings persistence and a tested time-zone resolution approach. Escalate a compatibility limitation or dependency need rather than weakening data preservation. This draft's implementation choices may be refined during planning without changing confirmed product behavior.

This document records the spec only. No application implementation, runtime verification, release or deployment has happened in this cycle.


## Execution outcome (2026-11-16)

Implemented and verified on `cycle-21-events` using one reused Luna worker with main-agent supervision. The preceding draft/status paragraphs are the approved design record. Desktop and phone events, optional timing, original-zone/local display, Calendar agenda, readable backups, capability-gated sync and foreground warnings are implemented. See the [Cycle 21 verification report](../../releases/cycle-21/README.md) for results and baseline QA limitations. Physical-device zone switching remains unverified; no merge, release or deployment was performed.
