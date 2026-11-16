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

Timed events keep the time zone in which they were scheduled. Daymark shows that original-zone time first and the device's current local time second. End times and durations use elapsed time, including overnight spans and daylight-saving changes. If a clock time is repeated or skipped when the clocks change, choose the displayed occurrence or correct the time.

Events appear beside open tasks in Today and in a separate Calendar agenda. An event has no completion or overdue state, aging or carry-forward; its checklist items can be checked independently. In **Settings → Event warnings**, advance warnings default to 15 minutes; choose another positive number of minutes or **Off**. Warnings appear only while Daymark is open in the foreground. They do not use operating-system notifications.

## Phone
1. Tap **Today**, then the plus button. Choose **Event** in the capture form.
2. Enter its date and title; set a start, duration or end time only when useful. A date-only commitment is fine too.
3. Open the event to edit notes or checklist items. Its menu can move or delete it.

Events also appear in the selected day's Calendar agenda, including date-only commitments without a set time. Original-zone times remain primary when you travel; the second time follows the device's current zone. Advance warnings are in-app only and require Daymark to be open in the foreground.

## Backups
Full ZIP backups store events as readable Markdown files under `Daymark/events/<event-id>.md`. Their versioned frontmatter keeps the typed record and stable IDs; the visible title, date, section, order, time, duration, notes and checklist are readable and can be edited before importing. JSON and the ZIP snapshot also preserve events.
