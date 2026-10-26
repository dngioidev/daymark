# Cycle 10: backlog, side menu, move to section, zoomable screenshots, guides (design)

Date: 2026-10-26 · Status: draft for approval · Scope: web/desktop, phone-sized web, the Android app, and the GitHub Pages site.

## Why

1. **Ideas have nowhere to wait.** The user gets ideas ("the next version of my old project") with no time to start. Putting one on Today makes it age, raises the delay alert, and drags down the stats, though it is not urgent. They want a place for "someday" tasks that costs nothing until picked into a date.
2. **The top bar wastes height.** On desktop a top bar plus a page title sit above the content, which hurts most on Notes, where vertical room for text matters.
3. **Tasks cannot be re-filed.** A task stays in the section it was created in; moving it to a better category means retyping it.
4. **Site screenshots are small.** Visitors cannot read them.
5. **No guidance.** There is no written explanation of what the app does or how to use it on web and on mobile.

Success: the user parks an idea in two taps and later pulls it into a day without it ever having nagged; Notes shows noticeably more text per screen; a task can be re-filed from its menu; a visitor can enlarge any screenshot; a new user can learn each feature from a Help page in the app or a Guide on the site.

## Goals

- **A. Backlog:** a list of undated tasks with an optional category label, picked into a date on demand.
- **B. Side menu (desktop):** the top bar and page title replaced by a vertical rail, left or right (setting), giving content the full height.
- **C. Move to section:** a task-menu action that moves a task to another section of the same day, or a new one.
- **D. Zoomable screenshots** on the release site.
- **E. Guides:** an in-app Help page and a site Guide, each with web and mobile sections, written once.

## Non-goals

- No priorities, due dates, subtasks, reminders, tags or drag-ordering rules beyond manual order in the backlog. No backlog widget on Android, and no backlog column in the Calendar.
- No change to rollover, aging, statuses, habits, or Today beyond what is stated.
- The phone keeps its bottom tab bar (plus a Backlog entry); no side rail on phones.
- No collapsible/icon-only rail, no per-page rail customisation. Left or right only.
- No video or interactive tutorials; no translations of the guide.
- Moving tasks between days already exists (drag, "Move to day"); it is not changed.

## Anti-goals (failure even if it "works")

- A backlog task shows up in Today, rollover, delay alerts, day counts, streaks or stats before it is picked.
- Picking a task loses its title, description, checklist, tags or history, or creates duplicate copies on the same day when picked twice (double tap or retry after sync). Concurrent picks onto different days retain one same-id copy per picked day, following the normal carry-forward model.
- A task disappears: moved to the backlog or to another section on one device and re-appearing on another, or vanishing from both.
- Older app versions (1.6.0) break or lose backlog data after syncing with a server that has it.
- The rail steals width from tables and the 1800px layout, or covers content, or fails in dark mode, photo backgrounds or custom colours (it must follow the header colours the user already sets).
- The guide describes things that are not in the app, or goes stale because it is a separate hand-copied document in each place.

## A. Backlog

Decided with the user:

- Backlog tasks are **outside every date**: they never appear on Today, Calendar, Week, rollover, delay alerts, day/week counts or stats.
- A backlog task has a **title**, optional description and an optional **category label** (free text). The user sets the label when capturing or editing.
- **Picking into a date:** the user chooses a day. The task becomes a normal task on that day. If that day already has a section whose name equals the label (case-insensitive, trimmed), the task goes there; otherwise a **new section with that name** is created on that day. A task with no label goes into the section the New task sheet uses today when none is chosen.
- Picking is available from the Backlog page (a date choice per task) and from the New task sheet's target choice.

Decided by me (the user did not specify; please check):

- **Capture:** the New task sheet gets a target choice "Date | Backlog" and, for Backlog, a category field with suggestions from existing labels and section names. The Backlog page also has its own add row.
- **Return to backlog:** the task menu gets "Move to backlog" for open (not done) tasks. The task's section name becomes its label. Done tasks cannot be moved. This must make the task disappear from its day and not come back by rollover or sync. Earlier carried copies of that task are closed so rollover does not re-create it (same mechanism spirit as "Done later" in cycle 8; the builder chooses the exact mark, e.g. "Moved to backlog", and records it in the history).
- **Identity (builder-check answer):** a backlog item keeps the **id of the latest copy** of the task it came from, and picking reuses that same id on the chosen day. A repeated local pick (double tap or sync retry) is a no-op. Concurrent picks on different devices onto different days retain both same-id daily copies; rollover deduplicates by id within each day, and completing a later copy closes earlier copies as Done later. Reconciliation only marks backlog items as picked and never edits or tombstones daily documents. When moving a task back to the backlog, its earlier copies are closed with a "Moved to backlog" mark (excluded from counts like "Done later"). Rollover must not re-carry a task whose id is in the backlog.
- **Older clients (1.6.0):** they never receive the backlog. A task moved to the backlog shows to them as removed from its day (the day copy is deleted via the existing deleted-task list), which is the accepted behaviour. If they edit such a task before syncing, the delete wins; nothing is resurrected.
- **Storage:** the Android app runs the same web code, so the backlog lives in the same local store as the other data. No native (Kotlin/Room) storage and no Kotlin change.
- **Backlog page:** a list grouped by category label (unlabelled last), manual order within a group, each row with a pick-date control, edit, and delete (with Undo). Empty state explains the idea. Search includes backlog tasks, marked as "Backlog".
- **Sync:** a new entity (own revision stream, like habits), gated by a client feature flag so 1.6.0 clients neither receive nor can overwrite it. Pick/move operations are idempotent within a day; same-id copies across different days follow normal carry-forward behavior, and reconciliation never edits daily documents; the merge rule when a pick on one device meets an edit on another keeps the task (never loses it). The builder must test two devices picking the same item.
- **Backups and export:** included in the JSON/ZIP backup; ZIP export adds `Backlog.md` (one list per label). Import restores it.
- **Markdown:** the daily Markdown format is unchanged (CLAUDE.md invariant); backlog is its own record, not a daily file.

## B. Side menu (desktop)

Decided with the user (mockup A, "six parts"):

- Desktop replaces the top navbar and the page title above the content with a **vertical rail**, labelled, always open. The **page title above the content is removed**; the rail shows where you are.
- Rail has **six equal-height parts, top to bottom: Title, Today, Calendar, Notes, Backlog, Settings.** The current page is highlighted.
- **Title part:** app name and today's date; it also has room for more later. It holds the **sync status**, a prominent **+ New task** button (the current navbar "New task", Ctrl/⌘ K stays) and a **Search** button (Ctrl/⌘ Shift F and `/` stay).
- Appearance gets a **Menu side: Left | Right** setting (default Left), saved with the other appearance settings and synced like them.
- Phones keep the bottom tab bar and gain a **Backlog** tab (today it holds Today, Calendar, the + button, Notes and Settings; the builder fits Backlog in without crowding it, and Settings keeps its place).

Decided by me:

- Rail width about 168px, fixed. The 1800px content limit applies to the content area to the side of the rail. Below 768px width the phone layout (no rail) applies, as today.
- Between 768px and wider the rail is always shown at the same width. **Notes focus mode hides the rail** along with the other chrome, and leaving focus mode brings it back.
- Other navbar items: the carried-alert count becomes a badge on **Today**; "switch to mobile app" and dev tabs move into Settings; the rail takes the header colours the user already picked in Appearance, in light, dark and photo modes.
- **Notes** gets the full height: no title row, tighter padding above the text, and the editor toolbar kept sticky. Other pages lose the title row only; their own controls (month arrows, filters) stay in the content.
- The status strip behaviours the navbar has today (sync warnings, updating) keep a visible place in the Title part.

## C. Move to section

Decided with the user: the task menu has an option to move a task to another section, including a **new** one, for better categories.

Decided by me:

- Menu item **"Move to section…"** on desktop popover and phone sheet. It lists the day's existing sections plus **"New section…"** (asks for a name; an existing name, case-insensitive, just uses that section).
- It applies to the task's current day only, open or done, and puts the task at the end of the chosen section. Empty sections left behind follow the app's current rule for empty sections. Undo is offered, like "Move to day".
- History records the move. Sync and rollover treat it like an edit of the task, not a delete+create (no duplicates on another device).

## D. Zoomable screenshots (site)

- Clicking (or pressing Enter on) any screenshot opens it **full size** in an overlay with its caption.
- Arrows / swipe move to the previous and next screenshot; Esc, clicking outside, or a close button closes it. Focus is trapped and returned; pinch/zoom works on phones; the image fits the screen.
- Without JavaScript, the screenshot is a plain link to the image file. No third-party library.

## E. Guides

Decided with the user: guidance pages for **web and mobile**, in **both** the app and the site.

Decided by me:

- **One source:** Markdown files in the repo, one per topic, each with a Web part and a Mobile part. A build step turns them into the site Guide and bundles them for the app. No hand-copied second version.
- **Topics:** getting started and install (web/PWA, Android); Today and carrying forward; sections, statuses and moving tasks; Backlog; Habits; Calendar; Notes (editor, pictures, Mermaid, `[[links]]`); search; sync and the server; backups; appearance (including menu side); widgets (Android); shortcuts (web) and gestures (mobile).
- **In the app:** a **Help** page opened from Settings (a tab), works offline, with a web/mobile switch that defaults to the device in use. Text only, no screenshots (keeps the APK small).
- **On the site:** a Guide page in the site navigation with a topic list and the same Web | Mobile switch; it may reuse the existing screenshots (which are zoomable per D).
- The guide is written against the finished features of this cycle, and a test checks that every topic has both parts.

## Constraints

- Tailwind v4 stone palette only (CLAUDE.md); desktop content keeps `max-w-[1800px]`; types from `src/types/daymark.ts`; the daily Markdown comment format and rollover idempotency are untouched.
- Android app and web share the code; any native piece is limited to the new tab and storage of the backlog (no widget).
- Everything works offline; sync follows the existing entity-based `/api/sync` with the feature-flag pattern used for habits, so a 1.6.0 client and a 1.7.0 server keep working together.
- Release 1.7.0 (minor), released the same way as 1.6.0, including APK and an updated site.

## Left to the builder

Data shape and entity names of the backlog; the merge rules (within the anti-goals above); exact UI of the Backlog page and category suggestions; keyboard shortcut for opening Backlog (e.g. `g b`, matching the existing `g` shortcuts); rail visuals within the six-part layout; the build mechanism for the guide; test plan, including QA and UX scenarios for each part and a two-device sync test for backlog pick.

## Risks to plan for first

1. Move-to-backlog and pick-into-date across devices (duplicates or lost tasks).
2. The rail changing layout assumptions in Today, Calendar, Notes (focus mode, full-height editor) and the photo/glass backgrounds.
3. Existing QA/UX selectors that depend on the top navbar.
