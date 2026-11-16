# Events week grid

Date: 2026-11-16
Status: approved by the owner on 2026-11-16; implementation planning in progress.

## Intent and confirmed requirements

Provide a separate Teams-style calendar week view for events, so scheduled time and overlapping commitments can be understood spatially. Keep the existing task week view intact.

The owner confirmed that the new grid uses the device's current timezone. Existing event requirements remain: original time/zone stays primary in event labels, time and duration are independently optional, and events have notes/checklists/sections without task completion or overdue behavior.

## Approach

Add **Events week** as a distinct Calendar view alongside the existing **Month** and **Week** controls. Use a dedicated event time-grid component; do not add event blocks to `WeekRows` or redesign the task week view.

Alternatives considered:

- Adding event rows to the task week was explicitly rejected by the owner.
- A separate top-level Events screen would duplicate Calendar navigation; a distinct Calendar view keeps the requested separation within the existing calendar.

The choice of a separate Calendar view and device timezone comes from the owner. The detailed interaction defaults below are builder proposals.

## Layout and interaction

- Seven day columns with an hourly vertical timeline, following the existing Calendar week-start convention.
- Previous/next week and Today navigation; show the visible date range and current device timezone explicitly.
- Timed events with durations appear as blocks spanning their occupied times. Concurrent events share horizontal space rather than covering each other. Very short events retain a minimum readable/clickable height without implying a longer saved duration.
- Original date/time and original IANA zone remain the primary event text. Device-local time is secondary and determines grid placement. Compact blocks may show abbreviated text; opening the event shows the complete schedule and existing editor.
- Clicking an event opens its existing editor with notes, checklist and section. Editing continues through the existing conflict-aware event state path.
- Start-only events appear as a start marker with an explicit **No duration** label, not an invented occupied span.
- Date-only and duration-only events appear in a clearly labeled **No set time** strip above each day's timeline. Duration-only entries show their commitment duration without blocking a time slot. They retain their selected date; they are not all-day occupancy.
- On phones, retain readable day widths and horizontal scrolling, with sticky day headings and time context. Do not compress seven columns into unreadable cards. Desktop keeps its existing full-width layout.

```text
Calendar     Month | Week | Events week
< Previous        Nov 16–22        Today        Next >
Device timezone: Asia/Ho_Chi_Minh

                  Sun         Mon          Tue        ...
No set time       [Event]     [45 min]      [Event]
08:00             |           |            |
09:00             |           [Meeting]    |
09:30             |           [original    |
10:00             |            time/zone]  [Event A][Event B]
```

## Timezone, spans and daylight-saving behavior

- Project stored start/end instants into the current device zone. Do not use `eventsForDate` directly for timed grid placement: that helper intentionally uses original-zone dates for the existing agenda.
- A device-zone change refreshes day placement and geometry without changing stored events, their original labels or warning instants. An event can appear on a different grid day from its original date; display that distinction.
- Split overnight/multi-day events into linked visual segments at device-local day boundaries. Keep one stored ID and edit the same event from any segment. End instants are exclusive, including exact midnight.
- Derive local day boundaries from the actual timezone, not a fixed 24-hour millisecond interval.
- DST gaps and repeated times must be visibly distinguished with offset/occurrence information. Do not silently collapse repeated-hour events, fabricate nonexistent local times, or change elapsed duration to fit a nominal 24-hour grid. The implementation plan must define the exact repeated/skipped-hour axis rendering before coding it.
- Minimum visual block height and DST rendering must not alter the saved start or duration. Show actual duration in event details.

## Architecture and scope

Reuse `EventItem`, existing editor/callbacks and `useDeviceTimeZone`. Put device-zone projection, day segmentation and overlap layout in pure `src/utils` helpers with derived view-model types. Presentation belongs in a new events component; the existing task-week renderer remains unchanged.

No storage schema, sync protocol, reminder setting, event lifecycle or dependency changes are needed. Drag-to-create, drag-to-move, resize, external calendar integration, recurrence and a new top-level Events module are outside this first view implementation.

## Acceptance and verification

1. Events week is a separate reachable view on desktop and phone; existing Month/task Week behavior and task counts remain intact.
2. Start/end positions, positive elapsed duration, overlapping groups, short events, start-only markers and unscheduled entries render correctly.
3. Test cross-zone date shifts, device-zone refresh, overnight segments, midnight-exclusive ends, multi-day spans and DST gaps/folds. A view change must not mutate event storage.
4. Every segment opens the correct event editor; checklist edits and remote conflict protection continue to work.
5. Verify keyboard access, readable minimum targets, scrolling and sticky headers; capture desktop/phone light/dark views with overlaps and untimed events.
6. Run affected tests, lint/build, existing Calendar/mobile regressions and a real-browser Events week scenario. Record actual results and baseline failures separately.

## Approval and execution

This adds the hourly-grid scope that the original Cycle 21 spec explicitly deferred. No product code has been changed for this view. After approval, write an implementation plan that resolves the DST axis detail and execute with one reused Luna worker under main-agent review, consistent with the owner's earlier constraint.


## Implementation outcome - 2026-11-16

The approved separate Events week mode is implemented. Browser checks verified device-zone placement, preserved original schedules/dates, overlap rectangles, short/start-only markers, editor save, week navigation, existing Month/task Week preservation and phone scrolling. A device-zone switch was emulated on the same page and verified not to rewrite stored events. DST/domain tests cover gaps, repeats, half-hour changes and skipped dates. Historical second-level transitions use a whole-event readable fallback where exact plotting is unsupported. See the [verification report](../../releases/cycle-21/README.md#events-week-follow-up-verification). Native Android timezone switching remains untested; no release is included.
