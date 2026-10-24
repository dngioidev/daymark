# Cycle 7: readable week and daily habits (design)

Date: 2026-10-24 · Status: draft for approval · Scope: desktop/web, phone-sized web, the Android app and a new Android widget.

## Why

Two everyday frictions:

1. **The week view is too narrow.** Calendar › Week shows seven narrow columns (`grid-cols-7`), so a day's task titles wrap, get clamped to two lines and are cut after six. A week cannot be read at a glance.
2. **Habits are retyped every day.** The user keeps daily habits (water, stretch, reading…) as ordinary tasks and types them in again each morning. Tasks are the wrong tool: they roll over when undone, age, and carry notes. Habits are the same short list every day, reset each morning whether or not they were done yesterday, and the user wants to see streaks and be warned when one has slipped for days.

Not everyone keeps habits, so the feature must stay out of the way until it is used.

Success: the user sets up their habits once, then every day opens Daymark (or looks at the home-screen widget) and ticks them with no typing; the Calendar week shows every task of every day readably, plus which habits were ticked; a habit not ticked for 3 days visibly warns.

## Goals

- **A. Week view as day rows** (layout C from the mockups).
- **B. Daily habits:** a habit list defined once, ticked per day, with streaks, missed-habit warnings and past-day ticking.
- **C. A new Android home-screen widget for habits.**

## Non-goals

- No notes, descriptions, checklists, tags, statuses or aging for habits.
- No schedules (e.g. "Mon/Wed/Fri only"), targets/counts ("8 glasses"), reminders or notifications. Every habit is daily, done or not done.
- No habit statistics screen, charts or heatmap beyond what is listed here.
- Month view, Today's task area, rollover rules and task rows are unchanged, except as stated.
- No iOS widget.

## Anti-goals (failure even if it "works")

- Habits feel like tasks: they roll over, appear in task counts/progress, age, or show up in task search.
- The habits bar nags or takes room for someone who never uses habits.
- A tick is lost: e.g. ticks made on two devices, on the widget, or on a device still running v1.3.0 overwrite each other.
- Streaks or warnings that are plainly wrong (counting days before a habit existed, breaking today's streak before the day is over, using the wrong "today").
- The week view becomes harder to read than before on a phone.

## A. Week view as day rows

Decided with the user (mockup C; options A "chips" and B "sideways-scrolling columns" were rejected):

- Calendar › Week shows the seven days as **full-width rows stacked top to bottom**, in the current week view's order (Sunday first, matching the month grid).
- Each row: on the left the day name and date (e.g. "Wed / Today", "Thu / Oct 22"), plus the task count (done/total) where there are tasks; in the middle **the day's tasks as a list in two columns** (done ones struck through with a tick, open ones with an empty circle); on the right that day's **habit dots** (one dot per habit that existed that day, filled when ticked) and a count such as "3/5".
- **Every task is shown.** No line clamp, no "+N more" cap; a busy day simply makes its row taller (user's explicit choice). Long titles wrap within their column.
- Today's row is highlighted (accent ring/tint, as today's cell is now). The selected day is visibly marked as now.
- On a phone (and narrow widths) the task list drops to **one column**; the habit dots move under the day label or below the tasks so the row stays readable.
- Kept behaviour: clicking a row selects that day and shows its detail panel (tasks, notes and now habits) with "Open this day"; ‹ › move by a week; the Month/Week toggle; desktop drag of a task onto a row today-or-later reschedules it, as cells do now; future days are included; empty days read "Nothing planned".
- The week header range and the "Last 7 days" summary stay as they are.

## B. Daily habits

### Model (behaviour, not storage)

- A **habit** has a name, an order, a **warning threshold in days** (default **3**, changeable per habit, minimum 1), and the date it was added.
- A **tick** means "habit H was done on day D". Each day starts with every habit unticked, regardless of previous days.
- Removing a habit stops it appearing from today onward, but **its ticks on past days stay** and are still shown on those days (by name).
- A habit only exists from the day it was added: days before that are not misses and do not show a dot for it.
- **Past days can be ticked and unticked** (user's choice) — from the day's detail in Calendar and from the opened day. Future days cannot be ticked.
- Renaming a habit keeps its ticks and streak.

### Streak and warning

- **Streak** = number of consecutive days, ending today, on which the habit was ticked — except that an unticked *today* does not break it: if today is unticked the streak counts back from yesterday. A day without a tick breaks the streak; there are no skip/rest days.
- **Missed warning:** count the consecutive unticked days *before today*, going back to the last tick (or to the day the habit was added, if never ticked; the added day itself counts as a missable day). Warn when that count ≥ the habit's threshold. Example with the default 3: last ticked Monday, unticked Tue, Wed and Thu → on Friday the count is 3 and the warning shows ("⚠ 3 days"). Ticking the habit today clears its warning immediately. Ticking a past day re-computes it.
- "Today" is the app's today (`resolveToday`, including the developer date override) everywhere: app, week view, streaks, widget.

### Today: the Habits bar (mockup A)

- A **slim bar at the top of Today**, above the task sections, on desktop, phone-sized web and the Android app.
- **Closed by default.** Closed it shows: a small progress ring, "Habits", "2 of 5", and — when any habit is past its threshold — a warning chip ("⚠ 1 missed 4 days" / "⚠ 2"). Click/tap (or Enter/Space) toggles it; the open/closed choice is remembered per device (as section collapse is today).
- **Open** it drops down a checklist: a checkbox, the habit name, and on the right either the streak ("🔥 12", "–" when 0) or the warning ("⚠ 4 days") for habits past their threshold. Ticking is instant, with no confirmation; unticking is equally instant.
- An **Edit** control in the open bar manages the list: add, rename, reorder, remove, and set each habit's warning days. Remove asks for confirmation and says past ticks are kept.
- With **no habits**, the closed bar reads "Habits · Add a daily habit" in a quieter style and opening it goes straight to adding one. It must not look like an alert.
- Habits never appear in task counts, the progress sidebar, rollover, aging, task search, or the Markdown day editor's task list.
- Keyboard and screen reader: the bar is a disclosure button with expanded state; each habit is a labelled checkbox; streak/warning are readable text.

### Calendar

- Week rows show habit dots per day (section A).
- The selected day's detail panel shows that day's habits as tickable checkboxes (past and today only), alongside its tasks and notes.
- Month view cells are unchanged.

### Sync, storage, backup

- Habit definitions and ticks **sync across devices** with the existing account sync, like the rest of the user's data.
- Ticks made on two devices for different habits or different days must all survive a merge; the same habit/day ticked on one device and unticked on another resolves to the latest change. Definitions edited on two devices merge per habit.
- A device still on **v1.3.0** that syncs must not erase or reset habit data written by v1.4 devices (the cycle-6 `mergeIncomingSettings` problem must not repeat). Whatever entity/storage shape is chosen, the server's entity-key validation and merge must accept it, and the server deploys with the client.
- Habits are included in the ZIP/JSON export and restored by import; they are wiped with the rest of the data on sign-out/wipe.
- Habit data is not written into the daily Markdown task list, and the `<!-- daymark: task_id=… -->` comment format is untouched.

## C. Habits home-screen widget (Android)

- A **new, separate widget** ("Daymark Habits") in the launcher's widget list, next to the existing task widget, which is unchanged.
- Shows today's date, "2 of 5", and today's habits as a checklist with each habit's streak, and the warning marker for habits past their threshold.
- **Ticking from the widget** works like task toggles today: the tick shows immediately on the widget and is queued and applied when Daymark next opens or resumes. Widget ticking is **today only**.
- After midnight the widget must not show yesterday's ticks as today's: a snapshot for an earlier date shows every habit unticked for the new day (streaks/warnings recalculated as far as the snapshot allows), and queued ticks are applied to the date they were made on.
- With no habits it reads "Add habits in Daymark" and opens the app. Tapping the header opens Daymark on Today with the Habits bar open.
- **Per-widget style**, like the task widget (cycle 6): match app or custom background, opacity, text, accent, font, size, corners, density, configured on placement (long-press → Customize) and from Settings › Widget. Task-only options (show done, age, quick add, sections) are hidden for habit widgets; a "show streaks" toggle replaces them.
- Resizes sensibly from 2×2 upward, showing as many habits as fit with "+N more" opening the app (the widget, unlike the week view, is space-bound).

## Constraints

- Stack and repo invariants from `CLAUDE.md`: React 19/TS/Vite/Tailwind v4 with the stone palette only, `max-w-[1800px]` desktop width, types in `src/types/daymark.ts`, rollover idempotency, Markdown comment format preserved.
- Glance 1.1.1 and the existing widget snapshot/queued-action bridge (`DaymarkBridgePlugin`, `WidgetStore`, `useWidgetSync`) are the pattern to extend.
- Light and dark themes, background photo and custom colours (cycle 6) must keep everything readable, including the warning chip and dots (WCAG 4.5:1 for text).
- Touch targets ≥ 44 px on phone; existing shortcuts and dialog/menu guards keep working.
- Version: this ships as **1.4.0**.

## Verification expectations

- Unit tests for streak and warning arithmetic (habit added mid-week, ticked today vs not, past-day backfill, removed habit, threshold edits, date override), merge of habit data (two devices, v1.3.0 payloads), export/import round trip, and week row data.
- Browser e2e (QA/UX suites) covering: week rows show all tasks at desktop and phone widths, drag to a row, the bar closed by default, ticking, editing, warning display, past-day ticking from Calendar, persistence across reload and across two synced devices.
- Android build plus JVM tests for the habits widget model (date rollover, queued ticks).
- Release-doc screenshots for cycle 7.

## Left to the builder

- Storage and sync shape for habits and ticks (new entity keys vs. fields on existing entities), subject to the sync constraints above.
- Exact visuals within the mockups: colours, ring style, spacing, icons (🔥/⚠ may become icons), animation.
- Where the Edit view lives (inline in the bar or a small dialog), and reorder interaction (drag or up/down).
- Week-row layout details for very wide screens (row height, column balance).

## Calls I made (not discussed with the user)

- A habit has a lifetime: added date to removed date. Past days show its dot (ticked or not) within that lifetime, or wherever it has a tick. Days before it was added cannot be ticked, but streak and warning maths must tolerate such a tick arriving by sync or import.
- Re-adding a habit with an old name creates a new habit; the old ticks stay with the removed one.
- Removing a habit on one device while it is edited on another: removal wins (tombstone).
- Widget ticks are queued as explicit "set H done/undone on day D" actions with a timestamp, not toggles, so a stale widget cannot undo a tick made in the app. The widget snapshot carries enough recent tick history (about 30 days) to show streaks and warnings after midnight.
- Habits are not counted in "Last 7 days" or any task total. Future week rows show no habit dots.

- Habits bar sits above the task sections on Today; it is not hideable beyond staying closed.
- Minimum warning threshold is 1 day; removing a habit asks for confirmation.
- Month view gets no habit markers; Calendar day detail is where past days are ticked.
- Widget ticking is today only; habit widget hides task-only style options and adds "show streaks".
- Same tick/untick on two devices: latest change wins.
- Release version 1.4.0.
