# Daymark UX/UI Test Suite

Version 1.0 · 2026-10-21 · Covers Daymark 1.0.0 (web/PWA, Android app)

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
| GL-01 | First launch shows welcome | P412, D1440 | Open app on fresh profile | Welcome dialog with "Start with an empty vault" and "Explore with sample data"; nothing behind it is clickable | A | 1 |
| GL-02 | Start empty | P412 | Tap "Start with an empty vault" | Dialog closes, Today with default empty sections, no demo data | A | 1 |
| GL-03 | Load sample | P412 | Tap "Explore with sample data" | Sample tasks rolled into today with aging alerts; toast shown | A | 1 |
| GL-04 | Welcome not repeated | P412 | Reload after GL-02 | No welcome dialog | A | 1 |
| GL-05 | Real date shown | P412, D1440 | Open Today | Title "Today" and the real long date | A | 1 |
| GL-06 | Light/dark themes | all | Render each screen in both schemes | No unreadable text, no light-on-light or dark-on-dark areas | A+M | 1 |
| GL-07 | Toast behaviour | P412, D1440 | Trigger any toast | Readable, above the bottom nav on phones, disappears in ≤ 5 s, does not block taps | A+M | 2 |
| GL-08 | Loading placeholder | P412 | Throttle and load | "Opening your vault…" instead of a blank page | M | 3 |
| GL-09 | Console clean | all | Visit every screen | No uncaught errors or React warnings in console | A | 1 |

### 4.2 Navigation (NAV)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| NAV-01 | Bottom nav tabs | P412 | Tap Today, History, Notes, Sync | Each tab opens; active tab highlighted; ≥ 44 px targets | A | 1 |
| NAV-02 | Centre + button | P412 | Tap + | Quick Capture opens with title field focused | A | 1 |
| NAV-03 | Header gear | P412 | Tap gear | Settings opens full screen | A | 1 |
| NAV-04 | Header sync pill | P412 | Tap sync status | Opens Sync tab; label matches state (Local only / Synced / Offline / Sync error) | A | 2 |
| NAV-05 | Desktop navbar items | D1440 | Click Today, History, Notes, Sync, Settings | Correct view or dialog; active item highlighted | A | 1 |
| NAV-06 | Logo | D1440 | Click "Daymark" | Goes to Today (or does nothing harmful) | A | 3 |
| NAV-07 | Mobile App View | D1440 | Click "Mobile App View", then "Desktop View" | Switches layout both ways without losing state | A | 2 |
| NAV-08 | Export ZIP (navbar) | D1440 | Click "Export ZIP" | ZIP downloads | A | 2 |
| NAV-09 | Quick Capture (navbar + Ctrl/⌘ K) | D1440 | Click button; press Ctrl K | Quick Capture opens both ways | A | 1 |
| NAV-10 | Today badge | D1440 | Look at "Today" nav item | Badge count equals attention alerts and is explained (tooltip/label) | M | 3 |
| NAV-11 | Deep links | P412 | Open `/?action=capture`, `/?tab=notes` | Capture opens; Notes tab opens | A | 2 |
| NAV-12 | Android Back | AND | Back in dialog, editor, other tab, Today | Closes dialog → leaves editor → Today → minimises | A (native suite) | 1 |

### 4.3 Today view (TD)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| TD-01 | Previous / next day | P412, D1440 | Tap ‹ and › | Date changes; title shows relative label; future and past days editable state clear | A | 1 |
| TD-02 | Today button | P412 | Navigate away, tap Today | Returns to today | A | 1 |
| TD-03 | Notebook / Markdown (and Split on desktop) | P412, D1440 | Switch modes | Mode changes; active segment highlighted; Split hidden on phones | A | 2 |
| TD-04 | Reconcile Rollover (desktop) | D1440 | Click | Toast reports result; no duplicates on repeat | A | 2 |
| TD-05 | Attention banner + filter | P412 | Tap "Filter Attention Tasks", tap again | Only attention/critical tasks shown; toggle back restores all; button state visible | A | 2 |
| TD-06 | Section + Task inline add | P412 | Tap "+ Task" in a section, type, Add | Whole row (input, status, Add Task) fits on screen at 360 px; task added to that section; input focused; Enter also adds; empty title rejected | A | 1 |
| TD-07 | Section + Note editor | P412 | Tap "+ Note", use toolbar (Bold, Italic, Checklist, Bullet, Callout), Save / Cancel | Toolbar inserts Markdown; Save shows notes card; Cancel discards | A | 2 |
| TD-08 | Section notes edit / clear | P412 | Edit existing notes; Clear | Edits saved; Clear asks before deleting text | A | 2 |
| TD-09 | Add section heading | P412 | Tap "Add Section Heading", enter name, Add / Cancel | New section appears; duplicate/empty names rejected | A | 2 |
| TD-10 | Empty sections compact | P412 | View sections with no tasks | One slim row each | A | 3 |
| TD-11 | Rendered notes checkboxes | P412 | Tick a checkbox inside section notes | Toggles and persists | M | 3 |

### 4.4 Task card (TK)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| TK-01 | Complete / reopen | P412 | Tap checkbox twice | Done styling + "Completed on" then back; toast each time | A | 1 |
| TK-02 | Status menu | P412 | Tap status chip, choose each status | Menu fits on screen, items ≥ 44 px, choice applied, menu closes; tapping outside closes | A | 1 |
| TK-03 | Details expand | P412 | Tap Details / Hide | Expands/collapses notes, checklist, actions | A | 2 |
| TK-04 | Edit description | P412 | Edit "Notes / Context" textarea | Saved on change/blur | A | 2 |
| TK-05 | Checklist add / toggle | P412 | Add subtask, tick it | Subtask listed and toggles; empty rejected | A | 2 |
| TK-06 | Inspect audit log | P412 | Tap "Inspect Audit Log" | History drawer opens with entries; closable (X, outside, Back) | A | 2 |
| TK-07 | Snooze alert | P412 | Tap "Snooze Alert for Today", then restore | Alert styling removed / restored; banner count updates | A | 2 |
| TK-08 | Delete (details) | P412 | Tap Delete | Confirmation; cancel keeps task; confirm removes | A | 1 |
| TK-09 | Options menu | P412 | Tap "…" | Menu with Rename, View Full History, Historical Done, Delete; visible on touch devices for every task | A | 1 |
| TK-10 | Rename | P412 | Options → Rename | Inline/dialog rename saves new title; cancel keeps old | A | 1 |
| TK-11 | Quick "Done on <date>" | P412 | Tap "Done on Oct 16" | Task marked done on that date, removed from today; toast | A | 1 |
| TK-12 | Other past date | P412 | Tap "Other past date…", pick preset / date, add note, Record / Cancel | Modal fits screen; presets work; record moves completion; cancel no change | A | 1 |
| TK-13 | Aging badges | P412 | View carried tasks | Amber ≥ 3 days, red ≥ 7 days, text readable in both themes | A | 2 |
| TK-14 | Long titles | P360 | Task with 120-char title | Wraps, no overflow, actions still reachable | A | 2 |

### 4.5 Quick Capture (QC)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| QC-01 | Layout | P412, D1440 | Open | Phone: at top, not covered by keyboard; fields labelled | A | 1 |
| QC-02 | Capture with Enter / button | P412 | Type title, press Enter; again with Capture | Task added to chosen heading with chosen status; dialog closes | A | 1 |
| QC-03 | Empty title | P412 | Capture with empty title | Not added; clear feedback | A | 1 |
| QC-04 | Heading and status selects | P412 | Choose non-default heading/status | Task lands in that section with that status | A | 2 |
| QC-05 | Cancel / X / Esc / backdrop | P412, D1440 | Close each way | Closes without adding | A | 2 |

### 4.6 History (HI)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| HI-01 | Opens on latest note | P412, D1440 | Open History | Latest past day with a note selected and shown | A | 1 |
| HI-02 | Calendar day select | P412 | Tap a day with/without a note | Shows note or a helpful empty state | A | 2 |
| HI-03 | Month navigation | P412 | ‹ › month arrows | Month changes; arrows labelled; ≥ 44 px on phones | A | 2 |
| HI-04 | Recorded notes list | P412 | Tap a list row | Opens that day | A | 2 |
| HI-05 | Reopen from history | P412 | Reopen a done task in a past note | Task back in today; toast | M | 3 |

### 4.7 Notes (NO)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| NO-01 | List and preview | P412, D1440 | Open Notes | Cards readable; pinned first; counts correct | A | 2 |
| NO-02 | Search | P412 | Type a word | Live filtering; empty result message | A | 2 |
| NO-03 | Folder chips | P412 | Tap each chip | Filters; active chip highlighted | A | 2 |
| NO-04 | New note | P412, D1440 | Tap New Note | Editor opens with title focused | A | 1 |
| NO-05 | Edit title / folder / body | P412 | Change each | Saved and shown in list | A | 1 |
| NO-06 | Toolbar | P412, D1440 | Bold, Italic, Checklist, Bullet, Code, Link, H1, H2 | Inserts Markdown at cursor/selection | A | 2 |
| NO-07 | Edit / Preview (phone), Editor / Split / Preview (desktop) | P412, D1440 | Switch | Rendered Markdown readable | A | 2 |
| NO-08 | Pin | D1440 | Pin / unpin | Order and icon update | A | 3 |
| NO-09 | Delete note | P412, D1440 | Delete | Confirmation; cancel keeps note | A | 1 |
| NO-10 | New folder | D1440 | New Folder | Folder created and selectable | A | 3 |
| NO-11 | Back to list | P412 | "‹ Notes" | Returns to list | A | 2 |

### 4.8 Sync and server (SY)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| SY-01 | Form labels and keyboard types | P412 | Open Sync | Labels, URL keyboard, password masked, device name prefilled | A | 2 |
| SY-02 | Unreachable server | P412 | Connect to a dead address | Clear error, form kept | A | 1 |
| SY-03 | Wrong password | P412 | Connect with wrong password | "Wrong username or password." | A | 1 |
| SY-04 | Connect, status, Sync now | P412 | Valid credentials | "Up to date"; header pill "Synced"; Sync now spins then returns | A | 1 |
| SY-05 | Devices, activity, password | D1440 | Server view | Lists devices with Disconnect; activity entries; password form validates | A | 2 |
| SY-06 | Disconnect this device | P412 | Disconnect | Confirmation; local data kept | A | 1 |
| SY-07 | Restore or sample data while connected | AND, P412 | Connected device restores a backup / replaces with sample data | Other devices' notes on the server are NOT deleted (or the user is clearly warned and can choose) | M | 1 |
| SY-08 | Device list hygiene | D1440 | Sign in the same device repeatedly | No duplicate device entries; this device tagged; stale devices identifiable | M | 2 |

### 4.9 Settings (SE)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| SE-01 | Layout and tabs | P412, D1440 | Open; tap each of 6 tabs | Full screen on phone; all tabs visible; active tab clear | A | 1 |
| SE-02 | Close | P412 | X, Done, Back, Esc (desktop) | Closes | A | 1 |
| SE-03 | Download Vault ZIP / JSON | P412 | Tap each | File downloaded / share sheet (AND) | A | 1 |
| SE-04 | Restore JSON / ZIP / invalid file | P412 | Select files | Confirm before replace; success toast; invalid file explained | A | 1 |
| SE-05 | Replace with sample | P412 | Tap Replace | Strong confirmation; cancel keeps data | A | 1 |
| SE-06 | Statuses | D1440 | Change an action, toggle aging, add a status, Save | Applied after Save; Cancel discards; layout fits on phone | A | 2 |
| SE-07 | Aging thresholds | D1440 | Change days, Save | Badges update | A | 2 |
| SE-08 | Headings | D1440 | Add / remove default heading | Applied to new days | A | 3 |
| SE-09 | Developer date override | D1440 | Set date, Save; "Use real date" | Today changes and returns | A | 3 |
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
| AX-06 | Dialogs | P412 | Open each dialog | `role=dialog`, labelled, focus moves in, background inert, focus returns on close | A | 2 |
| AX-07 | Keyboard | D1440 | Tab through Today and dialogs | Visible focus ring, logical order, Esc closes dialogs | A+M | 2 |
| AX-08 | Zoom 200% | D1280 | Browser zoom 200% | Usable without horizontal scroll | M | 3 |

### 4.12 Android app (AND)
| ID | Title | Env | Steps | Expected | Auto | P |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| AN-01 | Launch, splash, icon | AND | Launch | Daymark icon/splash; first render ≤ 3 s on device | A (native suite) | 1 |
| AN-02 | Status bar and safe areas | AND | Every tab | Light status icons on dark header; nothing under status/gesture bar | M | 2 |
| AN-03 | Keyboard | AND | Type in Quick Capture, notes editor, sync form | Field stays visible above keyboard | M | 1 |
| AN-04 | Export share sheet | AND | Download Vault ZIP | Share sheet opens with the ZIP | M | 1 |
| AN-05 | Import file picker | AND | Select File… | System picker; ZIP/JSON restore works | M | 1 |
| AN-06 | Widget | AND | Add, tick task, open app | Covered by `e2e-android-native.mjs` | A | 1 |
| AN-07 | Status bar on light full-screen views | AND | Open Settings | Status bar icons readable (contrast with the area behind them) | M | 2 |
| AN-08 | Cancel share sheet | AND | Download Vault ZIP, then dismiss the share sheet | No error message (cancel is not a failure) | M | 1 |
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
