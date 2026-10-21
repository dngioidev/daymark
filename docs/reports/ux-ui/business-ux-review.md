# Daymark: Business & UX Review of the Product Screens

Date 2026-10-21 · Daymark 1.0.0 · Reviewer role: business analyst / product UX.
Companion to the technical audit in [`README.md`](./README.md) (test IDs C1–C2 and H1–H9 refer to it).

**Screens reviewed (≈110 screenshots):**
- Phone, 412 px, light and dark: every screen and dialog (`screens/P412-*`).
- Desktop, 1440 px, light and dark (`screens/D1440-*`).
- Responsive widths 320–1920 px (`screens/responsive-*`).
- The Android app on an emulator (`android/*`).
- The home-screen widget and the release-doc images (`docs/releases/cycle-*/images`).

---

## 1. Executive summary

Daymark's promise is simple: *"a daily notebook that carries unfinished tasks forward."* The daily loop that has to feel effortless is:

**capture → see today's list → work → tick done → unfinished items roll to tomorrow.**

The engine behind that loop is solid: carry-forward, history, sync and backup all work. The screens, however, are built around how the engine works, not around the daily task. They show the audit trail, the rollover rules, the Markdown storage and the server set-up as prominently as the task list. For the target user (an individual professional using an Android phone first) this costs three things:

1. **Too little of the day fits on screen.** On a phone, chrome takes about 40 % of the first screen:
   - the header;
   - the date control and the "Today" title;
   - the Notebook/Markdown switch;
   - the attention banner;
   - the section header.

   Each carried-forward task card is about 380 px tall, so **only 2 tasks are visible without scrolling**. A daily planner should show 5–7.
2. **The language is the engineers' language.** Examples users see:
   - *Carried forward*, *Reconcile Rollover*, *Correct Historical Completion*, *canonical completion date*;
   - *Lifecycle history & audit trail*, *Participates in Aging*, *Daily Lifecycle Action*;
   - *JSON Snapshot Backup*, *Local-First Vault & Portability*, `task-101`, `Path: Daily/2026/…`.

   Every one of these is a moment where the user has to stop and think.
3. **Inconsistency erodes trust:**
   - Dates appear in five formats on one screen.
   - One feature has five names.
   - Three type families are mixed.
   - The same settings are reachable from two places.
   - A visible copy bug, "Yesterday (Yesterday)", appears in a dialog.

The good news: most of this is **copy, formatting and layout**. The data model doesn't need to change. A focused redesign of the Today screen, plus a language and format pass, would change how the product feels more than any new feature.

**Top 10 changes, in order of business value:**

| # | Change | Why it matters | Effort |
| :-: | :-- | :-- | :-: |
| 1 | Compact task cards on Today (one line per task, details on tap) | 2 → 6+ tasks per screen; this is the core screen | M |
| 2 | Plain-language pass using the glossary in §4 | Removes jargon from every screen; cheap | S |
| 3 | One date format system (relative + short, locale-aware) | Fixes 5 formats and the "Yesterday (Yesterday)" bug | S |
| 4 | Merge the 5 "done on an earlier day" entry points into one "Mark done on…" | One concept, one name, less clutter on every card | S |
| 5 | Shrink the attention banner to a one-line chip | Gives ~150 px back on every Today visit | S |
| 6 | Restrict monospace to code and Markdown | Makes the app look like a consumer product, not a dev tool | S |
| 7 | Fix the navigation: Sync out of the bottom bar, dev buttons out of the desktop header | Primary slots go to daily use | M |
| 8 | Hide server set-up (Docker/YAML) behind "Set up a server" help | Consumers shouldn't see YAML on a phone | S |
| 9 | Protect the Markdown view (hide or lock the `daymark:` comments) | Prevents users from silently breaking task identity | M |
| 10 | Make the widget actionable: quick-add button, "+N more", section name | The widget is the Android differentiator | M |

The critical data-safety items from the technical audit stay ahead of all of these:
- **C1:** restore while synced wipes the server.
- **C2:** Ctrl/⌘ K doesn't work.
- **H9:** the "+ Task" row is cut off on phones.

---

## 2. Who the screens should serve

| | Primary persona: "Daily operator" | Secondary: "Self-hoster" |
| :-- | :-- | :-- |
| Who | Professional who plans the day on an Android phone and reviews it on a laptop | Technical user who runs the sync server |
| Visits | 10–30 short visits a day: capture, tick, glance | Rare: set up once, check occasionally |
| Needs | Speed, a short clear list, trust nothing is lost | Exact status, devices, logs |
| Today the UI favours | ✗ | ✓ |

**Principle for every fix below:** keep the daily path frictionless for the operator. Move the self-hoster and audit detail one tap deeper; don't delete it.

**Suggested success metrics** (measurable from the test harness or analytics, if they are ever added):
- **Time to capture a task:** under 5 s from the app icon, and under 3 s from the widget.
- **Tasks visible on Today without scrolling at 412 px:** at least 5 (today: 2).
- **Taps to mark a carried task done on an earlier day:** 2 (today: 2–4, depending on the entry point).
- **Jargon terms on primary screens:** 0 (today: 20+, see §4).
- **Accessibility:** zero axe critical issues (today: 3 rules, 212 nodes; see README).

---

## 3. Findings by theme

Priority: **P1** = do in the next cycle, **P2** = the cycle after, **P3** = polish.
Effort: **S** = hours, **M** = about one AI session, **L** = several.

### 3.1 Today screen: density and hierarchy (P1)
Evidence: [`P412-light-today`](./screens/P412-light-today.png), [`AN-02-today`](./android/AN-02-today.png), [`D1440-light-today`](./screens/D1440-light-today.png), [`responsive-D320-today`](./screens/responsive-D320-today.png).

| Observation | Impact | Recommendation | Effort |
| :-- | :-- | :-- | :-: |
| The first task starts at y ≈ 730 of 1830 px on a phone. Above it are the header, the date pager, a large "Today" title, the Notebook/Markdown switch, a divider, the attention banner and the section header. | The list, the reason for the screen, starts below the fold on small phones (320 px shows one task) | Merge the date pager and title into one row ("‹ Today · Tue 20 Oct ›"). Move the Notebook/Markdown switch into the overflow menu on phones. Remove the divider. | M |
| Each carried task card has 5 rows: status chip; title; "Carried forward · 6 days"; "From 2026-10-16 · Details"; "Finished earlier? Done on Oct 16 / Other past date…". | 2 tasks per screen, and the backdating shortcut repeated on every card adds visual noise | **Compact card:** checkbox, title, then one meta line ("Blocked · 7 days old"). Move the backdating shortcut into the card's "…" menu and the details sheet. See the mock-up below. | M |
| The status chip sits *above* the title | The eye lands on the status, not the task | Put the title first; status as a small coloured chip at the end of the meta line | S |
| The attention banner (≈220 px) shows on every visit | Permanent chrome; "pending review" isn't explained | Collapse it to a one-line chip ("⚠ 4 need attention ›") that filters when tapped. Show the full card only on the first visit of the day. Rename "pending review" to "getting old". | S |
| Empty sections (Meetings, Ideas, Attention · "0 tasks") each take a full card | Noise on desktop and phone | Collapse empty sections into one row ("+ Add to Meetings · Ideas · Attention") or hide them until used | S |
| Desktop: rows stretch 1,350 px; "…" sits ~1,200 px from the title; text is 11–13 px | Hard to scan; looks unfinished on large screens | Cap the task column at ~880 px. Use the right side for a "Day notes / Up next" column or the split preview. Raise body text to 14–15 px. | M |
| Desktop header shows the date 3 times: the header chip `2026-10-20`, "Today (2026-10-20)" and "Tuesday, October 20, 2026" | Redundant | Keep one: "Today · Tuesday 20 October" | S |
| Done tasks stay in place, struck through, with stray separators ("· From 2026-10-16 ·") | Clutter grows through the day | Move done tasks to a collapsible "Done today (3)" group at the bottom of each section; fix the dangling separators | S |

Proposed compact card (phone):
```
┌───────────────────────────────────────────┐
│ ☐  Investigate build pipeline failure   … │
│    In progress · 6 days old ⚠             │
├───────────────────────────────────────────┤
│ ☐  Prepare QA test scenarios for offline  │
│    sync                                 … │
│    Blocked · 7 days old ⛔                │
└───────────────────────────────────────────┘
tap the row → details sheet (notes, checklist, history, "Mark done on…")
```

### 3.2 Language: engineers' terms on user screens (P1, S)
Twenty-plus internal terms appear on primary screens; the full replacement list is in §4. The biggest offenders:
- **Today:**
  - "Reconcile Rollover" (desktop header);
  - "Carried forward";
  - "Inspect Audit Log";
  - "Snooze Alert for Today" (it wraps onto two lines on phones).
- **Task details:**
  - `task-101`;
  - "Originally Created … (Wednesday, October 14, 2026)";
  - "Carry-Forward Age: 6 calendar days";
  - "LIFECYCLE HISTORY & AUDIT TRAIL".
- **Mark done on an earlier day:**
  - "Correct Historical Completion";
  - "Select Effective Completion Date";
  - "Records … as the canonical completion date".
- **History:**
  - "Browse past daily records, completion events, and historical task preservation";
  - "Historical Archive";
  - "Path: Daily/2026/10-October/2026-10-16.md".
- **Settings:**
  - "Local-First Vault & Portability";
  - "JSON Snapshot Backup … disaster recovery and cross-device migration";
  - "Task Statuses and Rollover Lifecycle Rules";
  - "Daily Lifecycle Action";
  - "Participates in Aging";
  - a tab called "Developer".
- **Sync:**
  - "Pushed 9 change(s), received 9; 4 conflict(s) resolved".

**Recommendation:** use the glossary in §4. Keep exact technical values (file paths, IDs) in an "Advanced" disclosure.

### 3.3 One feature, five names: completing a task on an earlier day (P1, S)
The same action appears as:
1. "Finished earlier? **Done on Oct 16**" on the card;
2. "**Other past date…**" on the card;
3. "**Historical Done…**" in the task menu;
4. "**Correct Historical Completion**" in the details sheet and the dialog title;
5. "**Record Done on Oct 16**" on the confirm button.

The dialog also offers "**Yesterday (Yesterday)**", a copy bug at `src/components/HistoricalCompletionModal.tsx:95`.

**Recommendation:**
- Use one name everywhere: **"Mark done on…"**.
- Put it in one place on the card (the "…" menu) and one place in the details sheet.
- Dialog title: "When did you finish it?". Chips: "Yesterday", "Sat 18 Oct", "Fri 16 Oct (when it was carried)". Then a date picker. Confirm button: "Mark done".
- Replace the four-bullet "What happens next" box with one line: *"It will show as done on Fri 16 Oct and disappear from today."*

### 3.4 Dates and times: five formats (P1, S)
These all appear side by side:
- `2026-10-16` (ISO);
- `Oct 16`;
- `10/16/2026` (US, in Notes and the date input);
- `Tuesday, October 20, 2026`;
- `10/20/2026, 10:00:27 PM` (Sync).

The History list shows two formats in the same row ("2026-10-16 Oct 16"), and the History header repeats it ("Viewing: 2026-10-16 (Oct 16)").

**Recommendation:** add one `formatDay()` helper and use it everywhere.
- Relative wording within ±6 days: Today, Yesterday, Tomorrow, Sat.
- Otherwise `Fri 16 Oct`, plus the year only when it differs.
- Device locale throughout; seconds hidden.
- ISO only inside Markdown and file names.

This also covers the earlier polish item of showing "Tomorrow" instead of "Oct 21".

### 3.5 Visual language and typography (P1, S–M)

| Observation | Recommendation |
| :-- | :-- |
| Monospace is used for ordinary UI: "Local only", "3 tasks", "Carried forward · 6 days", "From …", History rows, "Press Enter to capture", "4 days before today" | Use the UI font for all UI text. Keep monospace for code blocks, the Markdown editor and file paths. |
| Three emphasis colours compete on one card: amber border, orange "carried forward", amber "Done on" button. Red is used for both "critical" and "blocked". | Colour should say one thing. Border = attention level; chip = status; buttons neutral. Use red only for overdue/critical. |
| Primary actions vary: orange (Capture, Connect), black (Download Vault ZIP, Done, Change password, Add Status), red (Replace) | One primary style (brand) and one secondary. Black only for dark-mode surfaces. Red only for destructive confirmations. |
| Phone note editor and Markdown mode use large monospace for prose | Use a proportional font for prose in the editor and keep monospace only for code fences. Open notes in **Preview** by default on phones; editing is the second step. |
| Contrast, minimum text size and touch targets fail widely (H1–H3) | Already planned; do it together with this pass so the design changes only once |

### 3.6 Task status model (P1, S)
Evidence: [`P412-light-task-status-menu`](./screens/P412-light-task-status-menu.png), [`D1440-light-settings-statuses`](./screens/D1440-light-settings-statuses.png).
- **"Note" is listed as a task status.** A note isn't a task state; it confuses the mental model.
- Every status in the change-status menu shows its rollover policy ("Keep", "Carry-Forward", "Archive"). That is a setting, not a choice the user is making.
- **"Waiting / Dependency"** is truncated on phones and is two concepts in one label.
- **Quick Capture defaults to "In progress".** Most captured items haven't started. This inflates "in progress" and the aging alerts.
- The Statuses table has an empty **"Action"** column on desktop and cuts off columns on phones (SE-06).

**Recommendation:**
- **Statuses:** Not started · In progress · Blocked · Waiting · Done, with Archived hidden in a "More" option.
- **Menu:** remove the policy hints from the status menu.
- **Quick Capture default:** "Not started", or the last status used.
- **Phone statuses settings:** render as a card list (name, "Each morning: carry to today / keep / archive", "Warn when it gets old" toggle).

### 3.7 Navigation and information architecture (P2, M)

| Observation | Recommendation |
| :-- | :-- |
| **Sync** takes one of four bottom-nav slots, yet it is configured once and rarely revisited. It also exists as a Settings tab. | Bottom nav: **Today · History · (+) · Notes · Settings** (Settings out of the header). The header status pill ("Synced ●") opens a Sync sheet. Keep a single Sync page, inside Settings. |
| Desktop header carries "Mobile App View" (a developer/demo toggle) and "Export ZIP" (also in Settings) next to the nav | Remove "Mobile App View" from production (or move it to Settings → Developer). Keep Export in Settings, with a reminder elsewhere (see §3.10). |
| Today badge "4" in the desktop nav is unexplained | Tooltip and label: "4 tasks need attention", or drop the badge since the banner already says it |
| "Notebook / Split / Markdown" is a primary toggle on Today | It's a power-user view. Phone: overflow menu. Desktop: keep, but smaller and on the right. |
| Navbar hides Settings at 768–1100 px (H5) | Fixed by the header clean-up above (fewer items) |

### 3.8 Developer content on user screens (P1, S)
- **The Sync page shows a Docker command and a full `docker-compose` YAML** on phone and desktop. On a phone it scrolls sideways inside a black block. Most phone users will never run a server.
  - **Recommendation:** replace it with a one-line link, "Don't have a server? How to set one up ›", which opens the README or a help sheet. Show the YAML only on desktop, behind a disclosure.
- **Markdown mode exposes the `<!-- daymark: task_id=… -->` comments** and lets the user edit them freely. "Apply Changes to Notebook" sits *above* the editor, before the user scrolls to their edit.
  - **Recommendation:** fold the metadata comments (show a small 🔒 chip per task, or hide them and re-attach on save). Use a sticky Apply/Cancel bar at the bottom. Warn on leaving with unapplied changes.
- **The Settings "Developer" tab, "Replace with sample data" and the format paths in Export** are developer tools.
  - **Recommendation:** move them under a collapsed "Advanced" section at the end of Backup. "Replace with sample data" becomes a text link inside "Advanced", never a red primary button.

### 3.9 Quick Capture (P1, S)
Evidence: [`P412-light-quick-capture`](./screens/P412-light-quick-capture.png), [`D1440-light-quick-capture`](./screens/D1440-light-quick-capture.png).
- On phones it is a **top-anchored dialog**, far from the thumb that just tapped the (+) at the bottom.
  - **Recommendation:** a bottom sheet anchored above the keyboard, holding title, Section and Status. Notes stay collapsed ("+ add details").
- **Labels and title:**
  - "Notebook Heading" with values like "#Work" leaks Markdown syntax. Use "Section", with values "Work", "Meetings".
  - The title "Quick Capture · Today (2026-10-20)" becomes "New task · Today".
- **Feedback:** an empty title gives no feedback (QC-03). Disable "Capture" until there's text, and keep the sheet open with a "Saved ✓ · add another" option for batch entry.
- **Shortcut:** Ctrl/⌘ K doesn't work (C2).

### 3.10 Backup and trust (P2, S–M)
- Settings offers **three backup concepts**: Vault ZIP, JSON snapshot and restore. Nothing says which one to use.
  - **Recommendation:**
    - One primary "Back up now", which creates the ZIP (readable, portable). The JSON option moves to Advanced.
    - Show "Last backup: 12 days ago" on the Backup tab.
    - A gentle reminder after 14 days without a backup, for local-only users.
- **Restore says "This replaces the current vault"**, but when synced it also replaces the server (C1). The copy must say what will happen to other devices; this lands with the C1 fix.
- **Share-sheet cancel shows "Failed to export"** (H6), which undermines trust in backups.

### 3.11 History (P2, M)
Evidence: [`P412-light-history`](./screens/P412-light-history.png), [`D1440-light-history`](./screens/D1440-light-history.png).
- **Calendar:**
  - It marks days with a single dot, giving no sense of how much was done.
  - Future days (21–31) look the same as past days.
  - **Recommendation:** colour-intensity dots by completion (0/4 vs 4/4). Grey out future days, or let them open "Plan for that day" if that's intended.
- **Records list:** "Recorded daily notes" duplicates the calendar.
  - **Recommendation:** turn the list into a **weekly summary** ("This week: 6 done, 4 carried"). That is the review value of History.
- **Past-day view:**
  - Checkboxes look tappable but are read-only, and the "Historical Archive" lock label is subtle.
  - **Recommendation:** show past tasks as plain status icons, plus one action per carried task, "Mark done on this day".
- **Empty day:** shows "No daily document exists for 2026-10-03". Use: "Nothing was recorded on Sat 3 Oct."

### 3.12 Notes (P2, S–M)
Evidence: [`P412-light-notes`](./screens/P412-light-notes.png), [`D1440-light-notes`](./screens/D1440-light-notes.png). The desktop three-pane Notes screen is the strongest screen in the product.
- **List previews show raw Markdown** (`- [ ]`, `*…*`, `- [x]`). Strip the syntax in previews and show a checklist count ("2/5 ☑") instead.
- **The pin icon has no effect on order** (NO-08), and the list has no sort control. Pin first, then sort by "last edited".
- **Phone editor:**
  - The title doesn't look editable.
  - The delete icon floats alone in the top-right with no confirmation context.
  - **Recommendation:** make the title an obvious input. Put Delete in a "…" menu with Pin, Move to folder and Export.
- **Two kinds of notes:** the section "Note" on Today and the Notes tab are both called notes. Rename the Today one "Day note", or explain the difference once.

### 3.13 Sync page (connected) (P2, S)
Evidence: [`SY-05-server-view`](./screens/SY-05-server-view.png).
- **Device list:** duplicate "Windows browser" entries, with no way to tell them apart (SY-08).
  - Default device names should include the model or OS ("Pixel 9 · Android"), and be editable.
  - Repeated sign-ins should reuse the same device.
- **Activity log:**
  - Reword "Pushed 9 change(s), received 9; 4 conflict(s) resolved" as "Sent 9 · received 9 · merged 4 edits".
  - Group log lines per sync, not per request.
- **Desktop layout:** the page uses about a third of the width.
  - **Recommendation:** a two-column layout (status and devices | activity), or a centred single column at ~720 px.

### 3.14 Feedback and toasts (P2, S)
- **Toasts cover content:**
  - On phones the toast sits over the last visible card and stays on through several screens.
  - With a dialog open it is still visible behind the dimmed backdrop.
- **Recommendation:**
  - Show toasts for about 3 s, just above the bottom nav, and swipe to dismiss.
  - Never show a toast behind a modal.
  - Add "Undo" to task-done, delete and move toasts. Undo is the strongest trust feature a task app can offer.
- **Errors and confirmations** use browser `alert()`/`confirm()` (SE-04). Replace them with in-app dialogs in the app's own voice.

### 3.15 Android home-screen widget (P2, M)
Evidence: [`native-5-widget-home`](../../releases/cycle-4/images/native-5-widget-home.png).
- **Count mismatch:** the widget shows **3 tasks under "0/4 done"**, with half the widget empty. It hard-codes `take(3)` at `DaymarkGlanceWidget.kt:139`.
  - **Recommendation:** fill the available height (size-aware) and show "+1 more" when tasks are cut.
- **Quick add:** there is no capture button. A **"+" on the widget** that opens Quick Capture directly is the single highest-value Android feature for the persona.
- **Context:** age badges ("+6d") have no section context, and a tap on a title should open that task.

### 3.16 Onboarding (P3, S)
- The welcome dialog is clear and well prioritised: an empty vault is recommended, and sample data is optional.
- **Missing:** the product's key idea (unfinished tasks roll forward each morning) is never explained. A new user only discovers it the next day, through jargon like "Carried forward".
- **Recommendation:**
  - Add one sentence and an illustration to the empty Today state: "Anything you don't finish moves to tomorrow automatically."
  - Add a one-time tip the first morning tasks roll over.

---

## 4. Glossary: replace on screen

| Current label | Proposed |
| :-- | :-- |
| Carried forward · 6 days | 6 days old (or "from Fri 16 Oct") |
| From 2026-10-16 | (merge into the line above) |
| Reconcile Rollover | Refresh today's list (Advanced; hide from the header) |
| Filter Attention Tasks | Show tasks needing attention |
| 2 critical (≥7 days) · 2 pending review (≥3 days) | 2 over a week old · 2 over 3 days old |
| Finished earlier? Done on Oct 16 / Other past date… / Historical Done… / Correct Historical Completion / Record Done on … | **Mark done on…** / **Mark done** |
| Select Effective Completion Date | When did you finish it? |
| canonical completion date | (remove) |
| Inspect Audit Log / View Full History | History |
| Snooze Alert for Today | Hide warning today |
| Lifecycle History & Audit Trail | History |
| task-101 · Section #Work | Work |
| Originally Created / Carried From / Carry-Forward Age | Created Wed 14 Oct · In your list for 6 days |
| Notebook / Markdown | List / Markdown (phone: in overflow) |
| Direct Markdown Editor (2026-10-20.md) | Edit as Markdown |
| Apply Changes to Notebook | Save |
| Notebook Heading, #Work | Section, Work |
| Initial Status | Status |
| Daily History & Calendar | History |
| Browse past daily records, completion events, and historical task preservation | (remove) |
| Historical Archive · Path: Daily/… | Past day (path under "Advanced") |
| Recorded daily notes | Days |
| Standalone Markdown Notes | Notes |
| Unrestricted Markdown documents organized in folder hierarchies | (remove) |
| Local-First Vault & Portability | Backup & restore |
| Export Full Vault (.zip) / Download Vault ZIP | Back up now |
| JSON Snapshot Backup | (Advanced) Technical backup (.json) |
| Task Statuses and Rollover Lifecycle Rules | Statuses |
| Daily Lifecycle Action: Keep in current note / Carry forward / Archive | Each morning: Leave on that day / Move to today / Archive |
| Participates in Aging / Track Aging | Warn when it gets old |
| Aging alerts | Old-task warnings |
| Developer | Advanced |
| Pushed 9 change(s), received 9; 4 conflict(s) resolved | Sent 9 · received 9 · merged 4 edits |
| Local only | Not synced |

---

## 5. Recommended delivery plan

The plan is sized like the roadmap cycles: one AI session is about one Claude Pro 5-hour window. Each wave ends with:
- a full run of `scripts/ux-suite.mjs`;
- new screenshots;
- an APK update on the phone.

| Wave | Content | Includes audit items | Size |
| :-- | :-- | :-- | :-: |
| **0: Safety** | C1 restore/sample-data wipes the server, C2 Ctrl/⌘ K, H9 "+ Task" row, H6 share-cancel error, H7 status bar | C1, C2, H6, H7, H9 | 1 session |
| **1: Words, dates, type** | Glossary (§4), `formatDay()` everywhere, monospace restricted, colour roles, "Yesterday (Yesterday)", contrast and min text size | H1, H3, low-priority items | 1 session |
| **2: Today redesign** | Compact card, merged header, attention chip, collapsed empty sections, "Done today" group, single "Mark done on…", status model clean-up, Quick Capture bottom sheet, touch targets | H2, H4, TK/QC mediums | 1–2 sessions |
| **3: Structure** | Bottom nav and header clean-up, Sync into Settings, server-setup help link, protected Markdown view, Settings "Advanced", backup simplification and reminder, in-app dialogs and toasts with Undo, accessible dialogs | H5, H8, SE mediums | 1–2 sessions |
| **4: Review value** | History weekly summary and completion-coloured calendar, Notes preview/pin/sort/menu, Sync device naming and log, widget quick-add and "+N more" | NO, HI, SY mediums | 1–2 sessions |

Waves 1 and 2 give the biggest visible change for the effort. Together they turn the first impression from "developer tool" into "daily planner" without touching storage or sync.
