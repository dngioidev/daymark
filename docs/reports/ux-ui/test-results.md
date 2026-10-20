# UX/UI test results

Run 2026-10-21 against Daymark 1.0.0 (production build, sample vault). Automated: `scripts/ux-suite.mjs`; native/manual: Android 16 emulator. Suite: [`docs/testing/ux-ui-test-suite.md`](../../testing/ux-ui-test-suite.md).

**114 test cases: 70 pass · 25 warn · 14 fail · 5 not run**

#### Global and first run (GL)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| GL-01 | First launch shows welcome | 1 | ⚠️ warn | 24 controls behind the dialog are still keyboard-focusable (background not inert) |
| GL-02 | Start empty | 1 | ✅ pass |  |
| GL-03 | Load sample | 1 | ✅ pass |  |
| GL-04 | Welcome not repeated | 1 | ✅ pass |  |
| GL-05 | Real date shown | 1 | ✅ pass |  |
| GL-06 | Light/dark themes | 1 | ⚠️ warn | Both themes readable overall; contrast failures in both (see AX-02) |
| GL-07 | Toast behaviour | 2 | ✅ pass | visible ~4 s, above nav |
| GL-08 | Loading placeholder | 3 | — not run |  |
| GL-09 | Console clean | 1 | ✅ pass |  |

#### Navigation (NAV)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| NAV-01 | Bottom nav tabs | 1 | ✅ pass |  |
| NAV-02 | Centre + button | 1 | ✅ pass |  |
| NAV-03 | Header gear | 1 | ✅ pass |  |
| NAV-04 | Header sync pill | 2 | ⚠️ warn | pill target 78x17 px |
| NAV-05 | Desktop navbar items | 1 | ✅ pass |  |
| NAV-06 | Logo | 3 | ✅ pass |  |
| NAV-07 | Mobile App View | 2 | ✅ pass |  |
| NAV-08 | Export ZIP (navbar) | 2 | ✅ pass |  |
| NAV-09 | Quick Capture (navbar + Ctrl/⌘ K) | 1 | ❌ fail | Ctrl K did not open |
| NAV-10 | Today badge | 3 | ⚠️ warn | Badge "4" on Today has no label or tooltip explaining it |
| NAV-11 | Deep links | 2 | ✅ pass |  |
| NAV-12 | Android Back | 1 | ✅ pass | Native suite: dialog → editor → Today → minimise |

#### Today view (TD)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| TD-01 | Previous / next day | 1 | ⚠️ warn | next day is titled "Oct 21" (no "Tomorrow" label); day arrows are 28/28 px wide (< 44) |
| TD-02 | Today button | 1 | ✅ pass |  |
| TD-03 | Notebook / Markdown (and Split on desktop) | 2 | ✅ pass |  |
| TD-04 | Reconcile Rollover (desktop) | 2 | ✅ pass |  |
| TD-05 | Attention banner + filter | 2 | ✅ pass | all 4, filtered 4; toggle label "Show All Sections" |
| TD-06 | Section + Task inline add | 1 | ✅ pass |  |
| TD-07 | Section + Note editor | 2 | ❌ fail | bold toolbar produced "hello**bold text**" |
| TD-08 | Section notes edit / clear | 2 | ✅ pass | Code review: Clear asks for confirmation (no notes in today's sample to clear) |
| TD-09 | Add section heading | 2 | ✅ pass |  |
| TD-10 | Empty sections compact | 3 | ✅ pass |  |
| TD-11 | Rendered notes checkboxes | 3 | — not run |  |

#### Task card (TK)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| TK-01 | Complete / reopen | 1 | ✅ pass |  |
| TK-02 | Status menu | 1 | ⚠️ warn | menu items 28 px tall; tapping outside does not close the menu |
| TK-03 | Details expand | 2 | ⚠️ warn | "Details" target 33x15 px |
| TK-04 | Edit description | 2 | ✅ pass |  |
| TK-05 | Checklist add / toggle | 2 | ⚠️ warn | subtask delete button is invisible until mouse hover (unreachable on touch) |
| TK-06 | Inspect audit log | 2 | ⚠️ warn | drawer close button has no accessible name |
| TK-07 | Snooze alert | 2 | ✅ pass |  |
| TK-08 | Delete (details) | 1 | ✅ pass |  |
| TK-09 | Options menu | 1 | ⚠️ warn | "…" button has no accessible name; "…" target 24 px |
| TK-10 | Rename | 1 | ✅ pass |  |
| TK-11 | Quick "Done on <date>" | 1 | ✅ pass |  |
| TK-12 | Other past date | 1 | ✅ pass |  |
| TK-13 | Aging badges | 2 | ✅ pass |  |
| TK-14 | Long titles | 2 | ✅ pass |  |

#### Quick Capture (QC)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| QC-01 | Layout | 1 | ⚠️ warn | 4 fields without an accessible label; close (X) button has no accessible name |
| QC-02 | Capture with Enter / button | 1 | ✅ pass |  |
| QC-03 | Empty title | 1 | ⚠️ warn | nothing happens and no message explains why |
| QC-04 | Heading and status selects | 2 | ✅ pass |  |
| QC-05 | Cancel / X / Esc / backdrop | 2 | ⚠️ warn | tapping the backdrop does not close |

#### History (HI)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| HI-01 | Opens on latest note | 1 | ✅ pass |  |
| HI-02 | Calendar day select | 2 | ⚠️ warn | empty day says "No daily document exists for 2026-10-03" (technical wording, no action offered) |
| HI-03 | Month navigation | 2 | ⚠️ warn | month arrows have no accessible name; month arrows 24 px wide |
| HI-04 | Recorded notes list | 2 | ✅ pass |  |
| HI-05 | Reopen from history | 3 | — not run |  |

#### Notes (NO)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| NO-01 | List and preview | 2 | ✅ pass |  |
| NO-02 | Search | 2 | ✅ pass |  |
| NO-03 | Folder chips | 2 | ⚠️ warn | folder chips 23 px tall |
| NO-04 | New note | 1 | ⚠️ warn | focus on BODY, not the title |
| NO-05 | Edit title / folder / body | 1 | ✅ pass |  |
| NO-06 | Toolbar | 2 | ✅ pass |  |
| NO-07 | Edit / Preview (phone), Editor / Split / Preview (desktop) | 2 | ✅ pass |  |
| NO-08 | Pin | 3 | ❌ fail | pinned note not moved to the top |
| NO-09 | Delete note | 1 | ✅ pass |  |
| NO-10 | New folder | 3 | ✅ pass |  |
| NO-11 | Back to list | 2 | ⚠️ warn | back link 50x16 px |

#### Sync and server (SY)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| SY-01 | Form labels and keyboard types | 2 | ✅ pass |  |
| SY-02 | Unreachable server | 1 | ✅ pass |  |
| SY-03 | Wrong password | 1 | ✅ pass |  |
| SY-04 | Connect, status, Sync now | 1 | ✅ pass |  |
| SY-05 | Devices, activity, password | 2 | ✅ pass |  |
| SY-06 | Disconnect this device | 1 | ✅ pass |  |
| SY-07 | Restore or sample data while connected | 1 | ❌ fail | Restoring a 1-task backup on a synced emulator reduced the server from 4 daily notes + 4 notes to 1 + 0 |
| SY-08 | Device list hygiene | 2 | ❌ fail | Every sign-in adds a device; 7 devices incl. duplicates; this device not tagged in the list |

#### Settings (SE)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| SE-01 | Layout and tabs | 1 | ✅ pass |  |
| SE-02 | Close | 1 | ⚠️ warn | Esc does not close Settings |
| SE-03 | Download Vault ZIP / JSON | 1 | ✅ pass |  |
| SE-04 | Restore JSON / ZIP / invalid file | 1 | ⚠️ warn | messages use browser alert()/confirm() ("Invalid Daymark backup format.") |
| SE-05 | Replace with sample | 1 | ✅ pass |  |
| SE-06 | Statuses | 2 | ⚠️ warn | Statuses tab content runs past the right edge on phones (add-status row clipped) |
| SE-07 | Aging thresholds | 2 | ✅ pass |  |
| SE-08 | Headings | 3 | ✅ pass |  |
| SE-09 | Developer date override | 3 | ✅ pass |  |
| SE-10 | Add widget (native only) | 2 | ✅ pass | Native suite |

#### Responsive (RS)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| RS-01 | No horizontal scroll | 1 | ✅ pass | No horizontal scroll on 6 screens x 8 widths (320-1920) |
| RS-02 | Layout switch at 768 px | 2 | ✅ pass | Phone shell below 768 px, desktop from 768 px |
| RS-03 | Navbar at 1024 | 2 | ❌ fail | At 1024 px the navbar clips "Settings" (hidden horizontal scroll) |
| RS-04 | Wide screens | 3 | ⚠️ warn | Capped at 1800 px, but task rows stretch so actions sit ~1,600 px from titles |
| RS-05 | Truncated text | 2 | ⚠️ warn | Status chip "Waiting / Dependency" truncated on phones; long note titles ellipsed in desktop list |

#### Accessibility and readability (AX)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| AX-01 | axe-core scan | 1 | ❌ fail | axe: button-name (128 nodes), select-name (44), label (40) critical; contrast, target-size, scrollable-region serious |
| AX-02 | Contrast | 1 | ❌ fail | 692 low-contrast text nodes across 46 screen/theme scans |
| AX-03 | Font sizes | 2 | ❌ fail | 1,162 visible text instances at 10-11 px; phone task text mostly 11-12 px |
| AX-04 | Touch / click targets | 1 | ❌ fail | 117 distinct phone controls below 44 px; 11 desktop controls below 24 px |
| AX-05 | Icon buttons named | 1 | ❌ fail | Unnamed icon buttons: "…" (task menu), X (close), month ‹ › |
| AX-06 | Dialogs | 2 | ⚠️ warn | Quick Capture: no role=dialog; Quick Capture: background not inert; Settings: focus not moved into dialog; Settings: background not inert; Other past date: no role=dialog; Other past date: focus not moved into dialog; Other past date: background not inert |
| AX-07 | Keyboard | 2 | ✅ pass |  |
| AX-08 | Zoom 200% | 3 | — not run |  |

#### Android app (AND)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| AN-01 | Launch, splash, icon | 1 | ✅ pass | Native suite |
| AN-02 | Status bar and safe areas | 2 | ❌ fail | Today and tabs fine; Settings draws white behind light status-bar icons (invisible) |
| AN-03 | Keyboard | 1 | ✅ pass | Quick Capture and note editor stay above the keyboard |
| AN-04 | Export share sheet | 1 | ✅ pass | Share sheet opens with the ZIP |
| AN-05 | Import file picker | 1 | ✅ pass | System picker → confirmation → restored |
| AN-06 | Widget | 1 | ✅ pass | Native suite (widget add, tick, apply) |
| AN-07 | Status bar on light full-screen views | 2 | ❌ fail | Same as AN-02 |
| AN-08 | Cancel share sheet | 1 | ❌ fail | Dismissing the share sheet shows "Failed to export vault as zip." |
| AN-09 | Keyboard action key | 3 | ⚠️ warn | Keyboard shows "next" (→/) instead of Done/Go |

#### Destructive-action safety (DS)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| DS-01 | Task delete (details and menu) | 1 | ✅ pass | TK-08 |
| DS-02 | Note delete | 1 | ✅ pass | NO-09 |
| DS-03 | Section notes Clear | 2 | ✅ pass | TD-08 |
| DS-04 | Replace with sample data | 1 | ✅ pass | SE-05 |
| DS-05 | Restore backup over non-empty vault | 1 | ✅ pass | SE-04 |
| DS-06 | Disconnect device / this device | 2 | ✅ pass | SY-06 |
| DS-07 | Status/heading deletion in Settings | 3 | — not run |  |
