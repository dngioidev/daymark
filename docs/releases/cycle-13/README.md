# Cycle 13: Cross-device sync audit and alert counting days

Date: 2026-10-30 · Branch: `cycle-13-sync-audit` · Tag: none

This is an implementation and QA handoff for the next release. No release, version bump, push or deployment is included. The app version is still 1.9.1.

## What was audited

Every kind of data that syncs between devices was tested by simulating two or three devices (laptop, phone, a late-joining third device) that edit, go offline, reconnect and sync in different orders:

- Daily documents and tasks (including moving a task, merging a day, finishing a task on one device while another carries it forward).
- Standalone notes and their folders (rename against move, delete against edit, long offline edits).
- Settings.
- Habits and habit ticks.
- The backlog (capture, pick, undo, delete).
- Pictures inside notes (failed uploads, notes that arrive before their picture, damaged files, third device joining later).
- A seeded random test: three devices make random edits and sync in random order, and afterwards every device must be identical and no edit that should survive may be missing. 25 fixed seeds pass.

## Real problems found and fixed

| Problem | What it meant for you |
| :--- | :--- |
| Settings were overwritten as one block. | Changing one setting on the phone while the laptop changed another could silently undo the laptop's change. Settings now merge setting by setting. |
| Habits and backlog items were merged as whole items. | Editing the name of a habit on one device and its details on another kept only one edit. They now merge field by field, and a field you cleared stays cleared. |
| A device with a wrong clock far in the future won every conflict. | One mis-set phone could overwrite good changes from your other devices. Timestamps far in the future are no longer trusted. |
| A far-future day stamp defeated a backlog undo. | Undoing a backlog pick could be silently reversed by a device with a bad clock. |
| More than 5000 pending changes got a device permanently stuck. | A device that had been offline for a long time could never sync again. It now sends its changes in batches, limited both by count and by size (about 8 MB per request, so a large pile of notes stays well under the server's 25 MB limit). A single change bigger than that is sent on its own. |
| A damaged picture on the server was never repaired. | A broken picture stayed broken for every device. The server now notices damaged files and the next upload repairs them. The picture check also reuses earlier results, so it no longer re-reads every file on each poll. |
| Merging a day renumbered task order. | The renumbering looked like fresh edits and could stop a deletion on another device from taking effect. Merging no longer invents order changes. |
| Picking the same backlog item on two devices dropped its history. | The two copies of the task lost part of their history. Duplicate picks now keep it. |

Nothing found by the audit is left unfixed.

## Scenarios now covered by tests

Settings changed on two devices at once; habit and backlog field edits and clears; wrong-clock devices; backlog undo; a long backlog of pending changes; interrupted and retried uploads; damaged and missing server pictures; folder rename against move; note delete against edit; two devices syncing together; a lost response and retry; a late third device; old-version devices; the seeded three-device random test; and the browser two-device test below.

The browser test (`npm run test:sync`) now also checks, using the real Settings screen on a laptop and a phone: both counting groups default to "All week"; two devices change different settings while offline and both changes survive; weekday counting chosen on one device is used on the other and changes a carried task from "7 days old" to "5 days old".

## New: choose which days count for alerts

Settings, Old-task warnings, has two new choices: **Task aging counts** and **Habit warnings count**. Each can be Weekdays (Mon to Fri), Weekends (Sat and Sun) or All week (the default). Warnings stay visible on days that do not count; only the age stops growing. Changing the choice updates existing ages straight away, and it syncs between your devices. The Android widget follows the same choice.

| Screen | Image |
| :--- | :--- |
| Settings, Old-task warnings: the two counting groups, both on All week | ![Alert counting days](./images/alert-days-settings.png) |
| Settings, Appearance, on a device with no photos: the background image section and its hint | ![Background photo section](./images/background-photo-settings.png) |

## Compatibility with older versions

Devices on 1.9.1 or earlier keep syncing with updated devices in both directions without losing data. The new alert-day setting is optional, an older device ignores it, and when an older device syncs back it does not erase or reset what an updated device wrote. A device without the setting counts all week. Choosing one counting group stores only that group, so two devices that change the two groups while offline keep both choices after they sync. This is covered by tests that sync an old-format device against an updated one.

## Known limitations

- Background photos stay on the device where you chose them. They are not synced or backed up. A device with no photos shows a short hint to add the photo there too, and falls back to no photo without errors. The hint cannot tell whether you chose a photo elsewhere, so a device with no photos and None selected always shows it.
- A lost server response while a note is in a text conflict can, rarely, create a second conflict copy.

## Checks

Numbers are from full runs on this branch, one suite at a time.

| Check | Observed result |
| :--- | :--- |
| `npm run lint` | Clean |
| Vitest (`--maxWorkers=2`) | 145 files, 1,751 passed, 1 skipped |
| `npm run test:helpers` | 23 of 23 passed |
| `npm run build` | Built |
| `npm run test:sync` | 44 checks passed (one early timing flake seen in 1 of 6 runs) |
| `npm run test:qa` | 822 checks, 0 failed (first run had 1 timing failure and a crash cascade; the rerun was clean) |
| `npm run validate:ai` | All checks passed, 0 failures |
