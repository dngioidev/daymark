# Cycle 21: One-time event tracking

Date: 2026-11-15
Status: discovery consolidated into the [design spec](./2026-11-15-cycle-21-events-design.md). This historical record includes earlier questions superseded by that spec. No implementation or release yet.
Follows Cycle 20 (released; see the roadmap).

## Owner request

Daymark has no event tracking for something that is not continuous and happens at a certain time. Create a Daymark task and start the next feature cycle.

Tracking task: `task-1794741962916-m7v3`, **Daymark Cycle 21 — Track one-time events**, created through MCP under **My task**, in progress.

## Confirmed owner decisions

- 2026-11-15: Events support a date with an optional time, covering both date-only occasions and timed appointments.
- 2026-11-15: Events cover both planned occasions and records of things that already happened.
- 2026-11-15: Timed events show an upcoming warning with a configurable lead time (for example, 15 minutes before). Events have no overdue behavior or completion state.
- 2026-11-15: Reuse device notifications only if already implemented; otherwise in-app warnings suffice. Repository inspection found no implemented event/device notification delivery in `src`, `public` or `mobile`. The Android build has a generic push-related message, and a midnight alarm refreshes widgets; neither provides event notifications. No new background notification infrastructure is planned for this cycle.

## Initial proposal (remaining behavior not approved)
 
Additional owner decisions (2026-11-15):
- Use one shared warning lead-time setting for timed events, defaulting to 15 minutes, with an off option (owner accepted the recommendation).
- Events have notes, checklists and section membership like tasks.
- Events need their own recognizable presentation so they are easy to distinguish from tasks in the UI.
- Interpretation to confirm in design: individual checklist entries can be checked, while the event itself has no completion state.
- Events mix with tasks inside each section and feel like another item type, with distinct styling rather than a separate events-above-tasks group.
- Calendar needs a dedicated place for events to make their time commitment easier to see. Exact calendar layout and duration support remain open.
- Timed events support two ways to enter their time span: end time or duration. The two inputs describe the same span (for example, start 15:00 plus end 16:00 or duration 1 hour). This supersedes the earlier open question about duration support.
- Events can cross midnight (for example, 23:00 to 01:00 the next day). The owner explicitly requires time-zone issues to be handled; exact time-zone semantics remain to be confirmed.
- Time-zone display decision: preserve the originally entered time as the primary display, together with its original time zone. When the device zone differs (including after a phone zone switch), show the equivalent device-local time as secondary information, including any date difference. Do not replace the primary display with device-local time. The event still represents the same actual moment for warnings and conversion; this does not make it a floating local-time event.
- Time and duration are independently optional. Supported examples: date only; date plus duration without a start time; date plus start time without an end/duration; date plus start time with an optional end time or duration. The owner explicitly confirmed duration-only events (for example, Car repair, 2 hours, with no scheduled hour). Do not require a time span or a start time when saving an event. Upcoming warnings apply only when a start time exists. A duration-only event has no scheduled instant to convert between time zones.

An event records a one-time occurrence on a particular date, with optional time. It remains associated with its scheduled date instead of becoming an aging, carried task. Example: a dentist appointment on November 20 at 15:00. Date-only events could cover occasions without a fixed hour.

## Existing architecture

- `src/types/daymark.ts` defines tasks, daily heading sections, calendar cells and habits; it currently has no event model.
- Tasks have statuses, completion history and carry-forward semantics. Habits track daily ticks. Neither should acquire changed behavior as an incidental consequence of events.
- Daily Markdown, export/import, local persistence and optional sync must preserve event data and existing notes. Older-client round trips require explicit investigation before choosing a representation.

## Approaches to discuss

1. Add a dedicated event model integrated with daily pages and Calendar. Recommended for clear event semantics; requires explicit storage and sync compatibility design.
2. Extend tasks with an event kind. Reuses task UI but risks accidental task aging, completion and rollover behavior, and requires auditing every task consumer.

These are options, not a settled implementation design.

## Open product decisions

- Date with optional time is confirmed; duration and time-zone behavior remain open.
- Both planned and retrospective events are confirmed. Past events remain records, without overdue or completion behavior.
- End time and duration input and cross-midnight spans are confirmed. Validation and representation must keep end time and duration consistent, including date changes and time-zone transitions.
- Upcoming warnings will appear while Daymark is open; new device/background notifications are out of scope. One shared setting defaults to 15 minutes before, with an off option.
- Daily sections mix events with tasks. Calendar provides a dedicated events area; confirm its layout and whether events need duration to represent occupied time.
- Set explicit boundaries for recurrence, external calendar integration, Android widgets and MCP event tools; none is promised by this kickoff. Upcoming warnings are in scope, with delivery behavior still to be decided.
- Timed events retain their original zone and actual moments. Original time and zone stay primary; device-local equivalents are secondary when zones differ. React to device time-zone changes. Date-only events retain their calendar dates. Investigate daylight-saving gaps/overlaps and define duration semantics before implementation.

## Cycle checklist

- [x] Inspect the current cycle, architectural context and core types.
- [x] Create the owner's feature-development task through Daymark MCP.
- [x] Open Cycle 21 discovery and add it to the roadmap.
- [ ] Resolve product decisions with the owner and compare approaches.
- [ ] Produce the reviewed design and implementation plan.
- [ ] Implement the agreed scope with relevant regression coverage.
- [ ] Verify Markdown round trips, sync compatibility, and task rollover idempotency.
- [ ] Run required checks, capture UI evidence, and record the cycle outcome.

## Planned verification after implementation

Targeted event and persistence tests first, then lint, tests, build and AI-config validation. Include sync scenarios and desktop/phone visual checks when those surfaces change. No feature checks or release evidence are claimed by this discovery record.
