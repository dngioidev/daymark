# Daymark UX/UI Test Suite

Version 1.1 · 2026-10-21 · Covers Daymark 1.1.0 (web/PWA, Android app). Version 1.0 (Daymark 1.0.0) is in git history; 1.1 updates the steps and expected results to the cycle 5 redesign.

Every visible control and user action in the app is covered by at least one test case. The control inventory was taken from the running app with `scripts/ux-inventory.mjs` (phone 412 px and desktop 1440 px, sample vault).

## 1. Scope
- **In scope**: all screens, menus, dialogs and buttons; text visibility and contrast; font sizes; touch/click target sizes; responsive layout; keyboard and screen-reader basics; destructive-action safety; Android-specific behaviour (Back, widget, share sheet, status bar).
- **Out of scope**: sync protocol correctness and server API (covered by `npm test` and `npm run test:sync`); performance under large vaults; iOS native.

## 2. Environments
| Code | Environment | How |
| :--- | :--- | :--- |
| **P360** | Small Android phone, 360x780, touch | Chrome emulation |
| **P412** | Typical Android phone, 412x915, touch | Chrome emulation |
| **T768** | Tablet portrait, 768x1024, touch | Chrome emulation |
| **D1024 / D1280 / D1440 / D1920** | Laptop/desktop, mouse | Chrome |
| **D320** | Narrow desktop window, 320x700 | Chrome (extreme) |
| **AND** | Android app (Capacitor) on Android 16 emulator | adb + DevTools |
| Themes | Light and dark (`prefers-color-scheme`) | All of the above |

Test data: the built-in sample vault (4 daily notes with carried tasks, 4 notes) on a fresh profile, unless stated.

## 3. Severity and pass criteria
- **Critical**: data loss, crash, feature unusable. **High**: core task hard or confusing, WCAG AA failure on primary content. **Medium**: degraded usability or consistency. **Low**: polish.
- **Thresholds** used by the automated checks:
  - Text contrast ≥ 4.5:1 (≥ 3:1 for text ≥ 18.66 px bold or 24 px), per axe-core `color-contrast`.
  - Body text ≥ 14 px on phones, no readable text < 11 px anywhere.
  - Touch targets ≥ 44x44 px on phones/tablets (WCAG 2.5.5 AAA, Android guideline 48 dp); ≥ 24x24 px on desktop (WCAG 2.5.8 AA).
  - No horizontal page scroll at any tested width.
  - Every icon-only control has an accessible name.

## 4. Test cases

Legend: **A** = automated in `scripts/ux-suite.mjs`, **M** = manual, **P** = priority (1 highest).

### 4.1 Global and first run (GL)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| GL-01 | First launch shows welcome | P412, D1440 | Open app on fresh profile | Welcome dialog with "Start fresh", "Try it with sample data" and "I have a backup to restore"; the app behind it is inert | A | 1 |
| GL-02 | Start empty | P412 | Tap "Start fresh" | Dialog closes; Today shows "Your day starts here" guidance and "Add to" section chips; no demo data | A | 1 |
| GL-03 | Load sample | P412 | Tap "Try it with sample data" | Sample tasks rolled into today; attention chip shown; toast shown | A | 1 |
| GL-04 | Welcome not repeated | P412 | Reload after GL-02 | No welcome dialog | A | 1 |
| GL-05 | Real date shown | P412, D1440 | Open Today | Title "Today" and the real long date; no ISO (YYYY-MM-DD) dates anywhere on Today | A | 1 |
| GL-06 | Light/dark themes | all | Render each screen in both schemes | No unreadable text, no light-on-light or dark-on-dark areas | A+M | 1 |
| GL-07 | Toast behaviour | P412, D1440 | Trigger any toast | Readable, above the bottom nav on phones, gone in ≤ 5 s (6 s with Undo), dismissible, never hidden behind a dialog | A+M | 2 |
| GL-08 | Loading placeholder | P412 | Throttle and load | "Opening your vault…" instead of a blank page | M | 3 |
| GL-09 | Console clean | all | Visit every screen | No uncaught errors or React warnings in console | A | 1 |

### 4.2 Navigation (NAV)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| NAV-01 | Bottom nav tabs | P412 | Tap Today, History, Notes, Settings | Each opens (Settings as a full-screen dialog); active tab highlighted; ≥ 44 px targets | A | 1 |
| NAV-02 | Centre + button | P412 | Tap + | New-task sheet docked at the bottom, title field focused | A | 1 |
| NAV-03 | Settings | P412 | Tap Settings in the bottom bar | Settings opens full screen | A | 1 |
| NAV-04 | Header sync status | P412 | Tap the sync status in the header | Opens Settings → Sync; label matches state (Not synced / Synced / Syncing / Offline / Sync problem); ≥ 44 px tall | A | 2 |
| NAV-05 | Desktop navbar items | D1024, D1440 | Click Today, History, Notes, sync status, Settings, New task | Correct view or dialog; active item highlighted; nothing clipped at 1024 px | A | 1 |
| NAV-06 | Logo | D1440 | Click "Daymark" | Goes to Today (or does nothing harmful) | A | 3 |
| NAV-07 | Phone layout preview (developer) | D1440 | Normal URL, then `/?dev` → phone preview → "Desktop layout" | Preview button hidden for normal users; with `?dev` switches both ways without losing state | A | 3 |
| NAV-08 | Back up now | D1440 | Settings → Backup & restore → Back up now | ZIP downloads; "Last backup on this device: today" shown | A | 2 |
| NAV-09 | New task (navbar + Ctrl/⌘ K) | D1440 | Click "New task"; press Ctrl K | New-task sheet opens both ways | A | 1 |
| NAV-10 | Today badge | D1440 | Look at "Today" nav item | Badge count equals attention alerts and is explained (tooltip/label) | M | 3 |
| NAV-11 | Deep links | P412 | Open `/?action=capture`, `/?tab=notes` | Capture opens; Notes tab opens | A | 2 |
| NAV-12 | Android Back | AND | Back in dialog, editor, other tab, Today | Closes dialog → leaves editor → Today → minimises | A (native suite) | 1 |

### 4.3 Today view (TD)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| TD-01 | Previous / next day | P412, D1440 | Tap ‹ and › | Title reads Yesterday / Today / Tomorrow / "Fri 16 Oct"; arrows ≥ 44 px on phones; "Today" button appears away from today | A | 1 |
| TD-02 | Today button | P412 | Navigate away, tap Today | Returns to today | A | 1 |
| TD-03 | List / Markdown (and Split on desktop) | P412, D1440 | Phone: "…" → Edit as Markdown → Back to list. Desktop: List / Split / Markdown | Mode changes; Markdown hides the `daymark:` task tags; unsaved edits ask before leaving; Split hidden on phones | A | 2 |
| TD-04 | Refresh today's list (desktop) | D1440 | "…" → Refresh today's list | Toast "Today's list is up to date" or "N unfinished tasks moved to today"; no duplicates on repeat | A | 3 |
| TD-05 | Attention chip + filter | P412 | Tap "Show", then "Show all" | One-line chip; only attention/urgent tasks shown; toggle back restores all; ≥ 44 px button | A | 2 |
| TD-06 | Section + Task inline add | P360, P412 | Tap "+ Task" in a section, type, Enter; type again, Add task | Whole form (input, status, Close, Add task) fits at 360 px; tasks added to that section; form stays open for the next one; empty title disabled | A | 1 |
| TD-07 | Section notes editor | P412 | Tap "Note", type, select a word, tap Bold, Save / Cancel | Toolbar wraps the selection (`**word**`); Save shows the notes card; Cancel discards | A | 2 |
| TD-08 | Section notes clear | P412 | Clear (×) on a notes card | In-app confirmation; Cancel keeps text; after Clear, Undo restores | A | 2 |
| TD-09 | New section | P412 | Tap "New section", enter name, Add section | Section appears with its add-task form open; empty names disabled | A | 2 |
| TD-10 | Empty sections | P412 | View a day with empty sections | No empty cards; one "Add to" row with a chip per empty section | A | 3 |
| TD-11 | Rendered notes checkboxes | P412 | Tick a checkbox inside section notes | Toggles and persists | M | 3 |

### 4.4 Task card (TK)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| TK-01 | Complete / reopen | P412 | Tap checkbox; Undo in the toast | Task moves to a collapsed "Done (n)" group; Undo restores it | A | 1 |
| TK-02 | Status menu | P412 | Tap status chip, choose a status; open again and tap outside; open and press Esc | No "Note" or rollover-policy labels; items ≥ 44 px; choice applied; outside tap and Esc close it | A | 1 |
| TK-03 | Task details sheet | P412 | Tap a task title | Sheet with section, status, created date, age, notes, checklist, history; no internal ids or ISO dates; Esc/X/Back close it | A | 2 |
| TK-04 | Edit notes | P412 | Details → Notes, leave the field | Saved on blur; persists after reload | A | 2 |
| TK-05 | Checklist add / toggle / remove | P412 | Details → add item, tick it, remove it | All three work on touch; remove button ≥ 44 px | A | 2 |
| TK-06 | History | P412 | "…" → Details & history | History entries in everyday words (no ISO dates, no `#Section`) | A | 2 |
| TK-07 | Hide warning today | P412 | "…" → Hide warning today, then Show warning again | Warning marker removed / restored; chip count updates | A | 2 |
| TK-08 | Delete | P412 | "…" → Delete; Cancel; Delete; Undo | In-app confirmation; cancel keeps task; Undo restores it | A | 1 |
| TK-09 | Options menu | P412 | Tap "…" | Menu with Mark done on <day>, Mark done on another day…, Rename, Details & history, Hide warning, Delete; one per task, ≥ 44 px | A | 1 |
| TK-10 | Rename | P412 | Options → Rename | Inline/dialog rename saves new title; cancel keeps old | A | 1 |
| TK-11 | Quick "Mark done <day>" | P412 | "…" → Mark done yesterday / on Fri 16 Oct | Task marked done on that day and leaves today; toast with Undo; no ISO date in the label | A | 1 |
| TK-12 | Mark done on another day | P412 | "…" → Mark done on another day…, pick a chip or date, Mark done / Cancel | "When did you finish it?" sheet; chips in everyday dates; Mark done moves completion; Cancel changes nothing | A | 1 |
| TK-13 | Age labels | P412 | View carried tasks | "N days old"; amber marker ≥ 3 days, red ≥ 7 days; readable in both themes | A | 2 |
| TK-14 | Long titles | P360 | Task with 120-char title | Wraps, no overflow, actions still reachable | A | 2 |

### 4.5 Quick Capture (QC)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| QC-01 | Layout | P412, D1440 | Open | Phone: bottom sheet above the keyboard; fields labelled Section / Status; no ISO date or `#` in labels | A | 1 |
| QC-02 | Add with Enter / button | P412 | Type title, press Enter; again with Add task | Task added to the chosen section with the chosen status; sheet closes ("Save & add another" keeps it open on desktop) | A | 1 |
| QC-03 | Empty title | P412 | Open with empty title | Add task disabled | A | 1 |
| QC-04 | Section and status | P412 | Default, then choose another section/status and add; open again | Defaults to "Not started"; remembers the last section and status | A | 2 |
| QC-05 | Cancel / X / Esc / backdrop | P412, D1440 | Close each way | Closes without adding | A | 2 |

### 4.6 History (HI)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| HI-01 | Opens on latest day | P412, D1440 | Open History | Latest past day with a note selected and shown; "Last 7 days" summary | A | 1 |
| HI-02 | Calendar day select | P412 | Tap a day with/without a note | Shows the day, or "Nothing was recorded on <day>"; markers show all / some / none done; future days disabled | A | 2 |
| HI-03 | Month navigation | P412 | ‹ › month arrows | Month changes; arrows labelled; ≥ 44 px on phones | A | 2 |
| HI-04 | Recent days and Open this day | D1440 | Tap a Recent days row; Open this day | Shows that day; "Open this day" shows it in Today | A | 2 |
| HI-05 | Reopen from history | P412 | Reopen a done task in a past note | Task back in today; toast | M | 3 |

### 4.7 Notes (NO)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| NO-01 | List and preview | P412, D1440 | Open Notes | Pinned first, then newest; previews without Markdown symbols; dates as "Tue 13 Oct"; checklist counts | A | 2 |
| NO-02 | Search | P412 | Type a word | Live filtering; empty result message | A | 2 |
| NO-03 | Folder chips | P412 | Tap each chip | Filters; active chip highlighted | A | 2 |
| NO-04 | New note | P412, D1440 | Tap New note | Editor opens with the title selected for typing | A | 1 |
| NO-05 | Edit title / folder / body | P412 | Change each | Saved and shown in list | A | 1 |
| NO-06 | Toolbar | P412, D1440 | Heading, Bold, Italic, Checklist, Code, [[Link]] | Wraps the selection (or inserts a placeholder) and keeps it selected | A | 2 |
| NO-07 | Edit / Read (phone), Edit / Split / Read (desktop) | P412, D1440 | Open a note; switch | Phone opens notes for reading; rendered Markdown readable | A | 2 |
| NO-08 | Pin | D1440 | Pin / unpin | Pinned note moves to the top; filled pin icon | A | 3 |
| NO-09 | Delete note | P412, D1440 | "…" → Delete note; Undo | In-app confirmation; Undo restores | A | 1 |
| NO-10 | New folder | D1440 | New Folder | Folder created and selectable | A | 3 |
| NO-11 | Back to list | P412 | Back arrow or Android Back | Returns to list; ≥ 44 px | A | 2 |

### 4.8 Sync and server (SY)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| SY-01 | Form labels and keyboard types | P412 | Settings → Sync | Labels, URL keyboard, password masked, device name prefilled; server set-up behind "Don't have a server?" | A | 2 |
| SY-02 | Unreachable server | P412 | Connect to a dead address | Clear error, form kept | A | 1 |
| SY-03 | Wrong password | P412 | Connect with wrong password | "Wrong username or password." | A | 1 |
| SY-04 | Connect, status, Sync now | P412 | Valid credentials | "Up to date"; header status "Synced"; Sync now spins then returns | A | 1 |
| SY-05 | Devices, activity, password | D1440 | Settings → Sync while connected | Devices with "This device" tag and Disconnect; activity in plain words ("Sent 9 · received 9"); password form validates | A | 2 |
| SY-06 | Disconnect this device | P412 | Disconnect | In-app confirmation; local data kept | A | 1 |
| SY-07 | Restore while connected | D1440, AND | Device A syncs the sample; device B restores a 1-task backup while connected | Server keeps A's notes (restore merges); sample data is disabled while synced | A | 1 |
| SY-08 | Device list hygiene | P412 | Sign in again from the same install | No duplicate device entries; this device tagged | A | 2 |

### 4.9 Settings (SE)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| SE-01 | Layout and tabs | P412, D1440 | Open; tap each of 6 tabs (Backup & restore, Sync, Statuses, Old-task warnings, Sections, Advanced) | Full screen on phone; tabs are a tablist; active tab clear | A | 1 |
| SE-02 | Close | P412, D1440 | X, Done, Back, Esc, backdrop | Closes; unsaved changes ask first | A | 1 |
| SE-03 | Back up now / technical .json | P412 | Back up now; Advanced → Download .json | File downloaded / share sheet (AND) | A | 1 |
| SE-04 | Restore / invalid file | P412 | Choose a backup file… | In-app confirmation before replacing; success toast; invalid file explained in an in-app dialog | A | 1 |
| SE-05 | Sample data (Advanced) | P412 | Advanced → Replace with sample data… | In-app confirmation naming the consequence; cancel keeps data; disabled while synced | A | 1 |
| SE-06 | Statuses | D1440, P412 | Change "Each morning", toggle "Warn when it gets old", add a status, Save | Applied after Save; Cancel discards; card layout fits on phones; no jargon | A | 2 |
| SE-07 | Old-task warnings | D1440 | Change days, Save | Invalid combination explained inline; markers update | A | 2 |
| SE-08 | Sections | D1440 | Add / remove a default section | Applied to new days; remove buttons labelled | A | 3 |
| SE-09 | Pretend it's another day (Advanced) | D1440 | Tomorrow, Save; "Use real date" | Today changes and returns | A | 3 |
| SE-10 | Add widget (native only) | AND | Tap Add widget | Android pin prompt | A (native suite) | 2 |

### 4.10 Responsive (RS)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| RS-01 | No horizontal scroll | D320, P360, P412, T768, D1024, D1280, D1440, D1920 | Visit each main screen | `scrollWidth ≤ innerWidth` | A | 1 |
| RS-02 | Layout switch at 768 px | T768, P412 | Load at each width | Phone shell < 768; desktop ≥ 768; tablet usable | A+M | 2 |
| RS-03 | Navbar at 1024 | D1024 | View navbar | No clipped/overlapping items | A+M | 2 |
| RS-04 | Wide screens | D1920 | View Today | Content capped at 1800 px, centred | A | 3 |
| RS-05 | Truncated text | all | Scan for clipped labels | Important labels not cut off (ellipsis only where expected) | A | 2 |

### 4.11 Accessibility and readability (AX)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| AX-01 | axe-core scan | P412, D1440 × light/dark × screens | Run axe (WCAG 2 A/AA + best practice) | No critical/serious violations | A | 1 |
| AX-02 | Contrast | same | axe `color-contrast` | All text ≥ AA | A | 1 |
| AX-03 | Font sizes | P412, D1440 | Measure all visible text | No text < 11 px; phone body ≥ 14 px; count of 11–12 px | A | 2 |
| AX-04 | Touch / click targets | P412, D1440 | Measure all controls | Phone ≥ 44 px, desktop ≥ 24 px | A | 1 |
| AX-05 | Icon buttons named | all | Inventory | Every button has an accessible name | A | 1 |
| AX-06 | Dialogs | P412 | Open each dialog | `role=dialog`/`alertdialog`, `aria-modal`, labelled, focus moves in, app behind inert, Esc closes, focus returns | A | 2 |
| AX-07 | Keyboard | D1440 | Tab through Today and dialogs | Visible focus ring, logical order, Esc closes dialogs | A+M | 2 |
| AX-08 | Zoom 200% | D1280 | Browser zoom 200% | Usable without horizontal scroll | M | 3 |

### 4.12 Android app (AND)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| AN-01 | Launch, splash, icon | AND | Launch | Daymark icon/splash; first render ≤ 3 s on device | A (native suite) | 1 |
| AN-02 | Status bar and safe areas | AND | Every tab and full-screen dialog | Light status icons on a dark area everywhere; nothing under status/gesture bar | M | 2 |
| AN-03 | Keyboard | AND | Type in Quick Capture, notes editor, sync form | Field stays visible above keyboard | M | 1 |
| AN-04 | Back up share sheet | AND | Back up now | Share sheet opens with the ZIP | M | 1 |
| AN-05 | Restore file picker | AND | Choose a backup file… | System picker; ZIP/JSON restore works | M | 1 |
| AN-06 | Widget | AND | Add, tick task, tap +, open app | Fills its height with "+N more"; + opens the new-task sheet; ticks applied (`e2e-android-native.mjs`) | A | 1 |
| AN-07 | Status bar on light full-screen views | AND | Open Settings | Status bar icons readable (contrast with the area behind them) | M | 2 |
| AN-08 | Cancel share sheet | AND | Back up now, then dismiss the share sheet | No error message (cancel is not a failure) | M | 1 |
| AN-09 | Keyboard action key | AND | Type a task title | Enter key reads "Done"/"Go" and submits | M | 3 |

### 4.13 Destructive-action safety (DS)
| ID | Title | Expected | Auto | P |
| :--- | :--- | :--- | :---: | :---: |
| DS-01 | Task delete (details and menu) | Confirmation | A | 1 |
| DS-02 | Note delete | Confirmation | A | 1 |
| DS-03 | Section notes Clear | Confirmation or undo | A | 2 |
| DS-04 | Replace with sample data | Confirmation naming the consequence | A | 1 |
| DS-05 | Restore backup over non-empty vault | Confirmation | A | 1 |
| DS-06 | Disconnect device / this device | Confirmation | A | 2 |
| DS-07 | Status/heading deletion in Settings | Confirmation or Cancel available | M | 3 |

## 5. Execution
- Automated: `npm run build && node scripts/ux-suite.mjs` writes `docs/reports/ux-ui/results.json` and screenshots, keyed by test case ID.
- Native: `node scripts/e2e-android-native.mjs` (emulator).
- Manual cases (M) are executed by hand on the emulator and recorded in the report.
- Results and findings: `docs/reports/ux-ui/README.md`.
