# Cycle 5: UX redesign from the real-phone review (v1.1.0)

Date: 2026-10-21 · Branch: `cycle-5-ux-redesign` (from `cycle-4-ux-polish-v1`) · Version 1.1.0

Inputs: the [UX/UI test report](../../reports/ux-ui/README.md) (114-case suite run on 1.0.0) and the [business review of every screen](../../reports/ux-ui/business-ux-review.md). Everything in the review's five waves is done; the re-run results are under "How it was verified".

## What shipped

**Wave 0: safety**
- **Restore or sample data on a synced device no longer wipes the server.** Replacing the vault resets the sync bookkeeping, so the next sync is a merge: the backup is added and nothing on other devices is deleted. Restore says so before you confirm. Sample data is disabled while synced. A server test reproduces the old data loss and now passes.
- **Ctrl/⌘ K** opens the new-task sheet from anywhere.
- The **"+ Task" row fits on phones**: the field is full width; status, Close and Add task wrap below it. The row stays open for the next task.
- **Closing the Android share sheet** after Back up is no longer reported as "Failed to export".
- **Status bar on full-screen dialogs** (Settings): a dark strip sits behind the light status icons.
- **No duplicate devices:** each install sends a stable id, so signing in again reuses its entry.

**Wave 1: words, dates, type, colour**
- One date vocabulary everywhere: Today / Yesterday / Tomorrow, otherwise "Fri 16 Oct". ISO dates stay in Markdown and file names only. The "Yesterday (Yesterday)" bug is gone.
- Plain language replaces the engineering terms. For example:
  - "6 days old" instead of "Carried forward · 6 days";
  - "Mark done on…" instead of five different names for the same action;
  - "Back up now", "Each morning: Move to today", "Warn when it gets old", "Old-task warnings";
  - Sync activity reads "Sent 9 · received 9 · merged 4 edits".
- Monospace only for code and Markdown. Accessible colours: primary buttons in amber-700 with white text (amber-500 with dark text in dark mode), darker status chips, and grey text at 600 instead of 400. Visible keyboard focus ring everywhere.
- "Note" is no longer offered as a task status. "Waiting / Dependency" is now "Waiting". New tasks default to "Not started", and the new-task sheet remembers your last section and status.

**Wave 2: Today**
- **Compact task rows:** checkbox, title, and one line with status, age, checklist count and a notes icon. The whole sample day now fits on one phone screen (it used to show 2 tasks).
- **Tapping a title opens the task details sheet**, which has notes, the checklist (touch-sized remove buttons), history in plain words, Mark done on…, Reopen and Delete.
- The "…" menu holds Mark done yesterday / on Fri 16 Oct, Mark done on another day…, Rename, Details & history, Hide warning today and Delete.
- **One-line attention chip** ("4 tasks need attention · 3 over 7 days old · Show") replaces the 220 px banner.
- **Collapsed sections:**
  - finished tasks collapse into "Done (n)" per section;
  - empty sections become one "Add to: Meetings · Ideas" row;
  - first-day guidance explains that unfinished tasks move to tomorrow.
- **Header:** one header row (‹ Today ›, long date); a "Today" button appears when you're on another day.
- **Desktop:**
  - the list is capped at a readable width;
  - a "Today at a glance" panel (open / done / old counts, finished list) fills the right-hand side at 1280 px and wider.
- **The new-task sheet is a bottom sheet on phones:**
  - Section and Status are labelled;
  - notes are optional;
  - "Save & add another" is available on desktop;
  - Add task stays disabled until there's a title.

**Wave 3: structure**
- Phone bottom bar: **Today · History · + · Notes · Settings**. Sync moved into Settings; the header sync status opens it.
- Desktop header: Today (badge explained), History, Notes, sync status, Settings and **New task**. The phone preview and "Export ZIP" buttons are gone (the preview remains a `?dev` tool). Nothing is clipped at 1024 px.
- **Server set-up is behind "Don't have a server? How to set one up"**, so phone users no longer see Docker YAML.
- **The Markdown view hides the `daymark:` task tags** and restores them on save. Ticking `[x]` marks a task done, and history and snoozes are kept. Unsaved edits ask before you leave.
- **Settings** has these tabs: Backup & restore (Back up now with "last backup" age, Choose a backup file…, Add widget), Sync, Statuses (cards that fit phones), Old-task warnings (inline validation), Sections, and Advanced (technical .json backup, sample data, pretend-it's-another-day).
- **Every dialog is a real dialog:**
  - `role=dialog` with focus moved in and trapped;
  - Esc and tapping the backdrop close it;
  - the app behind it is inert;
  - focus returns to the opener.
- `alert()`/`confirm()` are replaced by in-app dialogs. Toasts sit above the bottom bar, can be dismissed, and offer **Undo** for done, delete, clear and mark done.

**Wave 4: review value**
- **History:**
  - the month follows the selected day (it used to be fixed to October 2026);
  - day markers show all / some / none done, and future days are disabled;
  - a "Last 7 days: N done · M still open" summary, Recent days, and Open this day;
  - "Done this day" for tasks still open today;
  - "Nothing was recorded on Sat 3 Oct" for empty days.
- **Notes:**
  - one responsive screen for phone and desktop;
  - pinned notes first, then newest;
  - previews without Markdown symbols, with checklist counts and everyday dates;
  - New note focuses the title;
  - on phones a note opens for reading;
  - the formatting toolbar wraps the selection;
  - Delete lives in a "…" menu, with Undo.
- **Android widget:**
  - a **+ button opens the app straight into the new-task sheet**;
  - the widget fills its height and shows "+N more" when tasks don't fit (it used to show 3 of 4);
  - the header reads "Today · 3 left · 1 done";
  - tapping a title opens the app.
- **Sync dashboard:** devices show their platform and a "This device" tag; activity and dates are in everyday words.

## Screenshots
| Screen | Image |
| :--- | :--- |
| Phone: Today, whole day on one screen | ![Phone today](./images/phone-today.png) |
| Phone: Today (dark) | ![Phone today dark](./images/phone-today-dark.png) |
| Phone: task menu with "Mark done on Fri Oct 16" | ![Task menu](./images/phone-task-menu.png) |
| Phone: status menu (no "Note", no policy jargon) | ![Status menu](./images/phone-status-menu.png) |
| Phone: task details sheet | ![Task details](./images/phone-task-details.png) |
| Phone: "When did you finish it?" | ![Mark done](./images/phone-mark-done.png) |
| Phone: new-task bottom sheet | ![New task](./images/phone-new-task.png) |
| Phone: "+ Task" row fits (H9) | ![Inline add](./images/phone-inline-add.png) |
| Phone: Markdown without task tags | ![Markdown](./images/phone-markdown.png) |
| Phone: History with completion markers | ![History](./images/phone-history.png) |
| Phone: Notes, pinned first, plain previews | ![Notes](./images/phone-notes.png) |
| Phone: note opens for reading | ![Note](./images/phone-note.png) |
| Phone: Settings, Back up now | ![Settings](./images/phone-settings.png) |
| Phone: Statuses as cards | ![Statuses](./images/phone-settings-statuses.png) |
| Phone: Sync in Settings, server set-up behind a link | ![Sync](./images/phone-sync.png) |
| Desktop: Today with "at a glance" panel | ![Desktop today](./images/desktop-today-light.png) |
| Desktop: Today (dark) | ![Desktop today dark](./images/desktop-today-dark.png) |
| Desktop: Split (list + Markdown) | ![Split](./images/desktop-split.png) |
| Desktop: History | ![Desktop history](./images/desktop-history.png) |
| Desktop: Notes | ![Desktop notes](./images/desktop-notes.png) |
| Desktop: Settings | ![Desktop settings](./images/desktop-settings.png) |
| Desktop: New task (Ctrl K) | ![Desktop new task](./images/desktop-new-task.png) |
| Laptop 1024 px: nothing clipped | ![1024](./images/desktop-1024.png) |
| Android app (emulator): Today | ![Native today](./images/native-2-today-sample.png) |
| Android widget with + and "+N more" | ![Widget](./images/native-5-widget-home.png) |
| Widget + opens the new-task sheet | ![Widget plus](./images/native-9-widget-plus-new-task.png) |
| Android app synced | ![Native synced](./images/native-8-synced-with-server.png) |

## How it was verified
- `npm run lint`, `npm test` (70 tests plus one Linux-only test skipped on Windows; new: date, notes, Markdown-tag, restore-while-synced and device-dedupe tests), `npm run build`, `npm run validate:ai`: pass.
- **UX/UI suite** (`node scripts/ux-suite.mjs`, rewritten for the new UI; suite doc v1.1): all 80 automated cases pass. Scans on 44 screen/theme combinations found:
  - no axe critical or serious issues;
  - 0 low-contrast text nodes (692 on 1.0.0);
  - no text below 12 px (1,162 instances on 1.0.0);
  - no phone control below 44 px (117 on 1.0.0);
  - no unnamed buttons or unlabelled fields;
  - no horizontal scroll from 320 to 1920 px.
- **Overall: 114 cases, 109 pass, 1 warn, 0 fail, 4 not run** ([results](../../reports/ux-ui/test-results.md)). The warning is axe flagging rows partly covered by an open menu. The 4 cases not run are unchanged manual priority-3 checks.
- `npm run test:e2e` (PWA, offline) and `npm run test:sync` (two devices + restart) pass with updated selectors.
- `node scripts/e2e-android-native.mjs cycle-5` passes all 22 checks on the Android 16 emulator, including the new "widget + opens the new-task sheet" check.
- Checked by hand on the emulator: status bar on Settings, closing the share sheet after Back up now (no error), keyboard over sheets.
- Debug APK built with Kotlin unit tests (`npm run android:build -- --test`): versionName 1.1.0 / versionCode 110.

## Known gaps
- **Not installed on your phone yet:** it wasn't connected during this cycle. Run the command under "Install" below.
- **Not re-checked:** zoom 200% (AX-08), the loading placeholder (GL-08), rendered-notes checkboxes (TD-11) and reopen from history (HI-05). These areas didn't change, but nobody tested them this cycle.
- **Merged restore:** restoring on a synced device now merges instead of replacing. A true "make every device match this backup" needs an explicit server reset, which isn't built.
- **Device names:** the Android app still names itself "Android phone"; you can rename it when connecting. Model names need a device-info plugin.
- **Fonts:** Google Fonts load from the network, so offline first runs fall back to system fonts.
- **Release signing** for the APK is still open (see ROADMAP follow-ups).

## Install
```bash
adb -s <your-phone-serial> install --user 0 -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```
`-r` keeps your data. After updating, add the widget again from Settings if you want the new + button. Existing widgets update on their own.
