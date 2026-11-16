---
title: Events
order: 23
group: features
summary: Keep one-time appointments and commitments alongside daily tasks.
show: today
related: today, calendar, sync, backups
---
## Web
1. In **Today**, open **New task** and choose **Event**. Events can be placed in any section and share the section's order with tasks.
2. Add a date and title. Time and duration are independent and optional. With neither set, Daymark records a date-only event (it does not treat the event as all-day occupancy). A duration without a start appears as **No set time**.
3. Add notes and checklist items as needed. Save, then use the event menu to edit, move or delete it. Checklist changes save immediately.

Timed events keep their original time zone, with device-local time shown second. End times use elapsed time across midnight and daylight-saving changes. If a local time repeats or is skipped, choose an occurrence or correct it.

Events appear beside tasks in Today, the selected-day Calendar agenda, and **Events week**. The grid uses the device zone but keeps the original time and date visible; view or zone changes never edit events. Date-only and duration-only entries stay in **No set time**. Events have no completion, overdue, aging or carry-forward state, but checklist items can be checked. **Settings → Event warnings** defaults to 15 minutes; choose more minutes or **Off**. Warnings appear only in the foreground; there are no operating-system notifications.

## Phone
1. Tap **Today**, then the plus button. Choose **Event** in the capture form.
2. Enter its date and title; set a start, duration or end time only when useful. A date-only commitment is fine too.
3. Open the event to edit notes or checklist items. Its menu can move or delete it.

Events also appear in the selected day's Calendar agenda, including date-only commitments without a set time. Original-zone times remain primary when you travel; the second time follows the device's current zone. Advance warnings are in-app only and require Daymark to be open in the foreground.

## Backups
Full ZIP backups store events as readable Markdown files under `Daymark/events/<event-id>.md`. Their versioned frontmatter keeps the typed record and stable IDs; the visible title, date, section, order, time, duration, notes and checklist are readable and can be edited before importing. JSON and the ZIP snapshot also preserve events.
