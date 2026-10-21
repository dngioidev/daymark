# UX/UI test results

Run 2026-10-21 against Daymark 1.1.0 (production build, sample vault). Automated: `scripts/ux-suite.mjs` (functional cases and scans); native/manual: Android 16 emulator (`docs/reports/ux-ui/manual-results.json`). Suite: [`docs/testing/ux-ui-test-suite.md`](../../testing/ux-ui-test-suite.md).

**114 test cases: 109 pass · 1 warn · 0 fail · 4 not run**

#### Global and first run (GL)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| GL-01 | First launch shows welcome | 1 | ✅ pass |  |
| GL-02 | Start empty | 1 | ✅ pass |  |
| GL-03 | Load sample | 1 | ✅ pass |  |
| GL-04 | Welcome not repeated | 1 | ✅ pass |  |
| GL-05 | Real date shown | 1 | ✅ pass |  |
| GL-06 | Light/dark themes | 1 | ✅ pass | Low-contrast nodes: light 0, dark 0 |
| GL-07 | Toast behaviour | 2 | ✅ pass | visible ~4 s, above nav, dismissible |
| GL-08 | Loading placeholder | 3 | — not run | Loading placeholder not re-checked (unchanged since 1.0.0) |
| GL-09 | Console clean | 1 | ✅ pass |  |

#### Navigation (NAV)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| NAV-01 | Bottom nav tabs | 1 | ✅ pass |  |
| NAV-02 | Centre + button | 1 | ✅ pass |  |
| NAV-03 | Settings | 1 | ✅ pass |  |
| NAV-04 | Header sync status | 2 | ✅ pass |  |
| NAV-05 | Desktop navbar items | 1 | ✅ pass |  |
| NAV-06 | Logo | 3 | ✅ pass |  |
| NAV-07 | Phone layout preview (developer) | 3 | ✅ pass |  |
| NAV-08 | Back up now | 2 | ✅ pass |  |
| NAV-09 | New task (navbar + Ctrl/⌘ K) | 1 | ✅ pass |  |
| NAV-10 | Today badge | 3 | ✅ pass | Badge has a tooltip and accessible name: "4 tasks need attention" |
| NAV-11 | Deep links | 2 | ✅ pass |  |
| NAV-12 | Android Back | 1 | ✅ pass | Native suite: Back closes Settings, Notes tab -> Today, Today -> minimise |

#### Today view (TD)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| TD-01 | Previous / next day | 1 | ✅ pass |  |
| TD-02 | Today button | 1 | ✅ pass |  |
| TD-03 | List / Markdown (and Split on desktop) | 2 | ✅ pass |  |
| TD-04 | Refresh today's list (desktop) | 3 | ✅ pass |  |
| TD-05 | Attention chip + filter | 2 | ✅ pass |  |
| TD-06 | Section + Task inline add | 1 | ✅ pass |  |
| TD-07 | Section notes editor | 2 | ✅ pass |  |
| TD-08 | Section notes clear | 2 | ✅ pass |  |
| TD-09 | New section | 2 | ✅ pass |  |
| TD-10 | Empty sections | 3 | ✅ pass |  |
| TD-11 | Rendered notes checkboxes | 3 | — not run | Unchanged since 1.0.0 |

#### Task card (TK)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| TK-01 | Complete / reopen | 1 | ✅ pass |  |
| TK-02 | Status menu | 1 | ✅ pass |  |
| TK-03 | Task details sheet | 2 | ✅ pass |  |
| TK-04 | Edit notes | 2 | ✅ pass |  |
| TK-05 | Checklist add / toggle / remove | 2 | ✅ pass |  |
| TK-06 | History | 2 | ✅ pass |  |
| TK-07 | Hide warning today | 2 | ✅ pass |  |
| TK-08 | Delete | 1 | ✅ pass |  |
| TK-09 | Options menu | 1 | ✅ pass |  |
| TK-10 | Rename | 1 | ✅ pass |  |
| TK-11 | Quick "Mark done <day>" | 1 | ✅ pass |  |
| TK-12 | Mark done on another day | 1 | ✅ pass |  |
| TK-13 | Age labels | 2 | ✅ pass |  |
| TK-14 | Long titles | 2 | ✅ pass |  |

#### Quick Capture (QC)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| QC-01 | Layout | 1 | ✅ pass |  |
| QC-02 | Add with Enter / button | 1 | ✅ pass |  |
| QC-03 | Empty title | 1 | ✅ pass |  |
| QC-04 | Section and status | 2 | ✅ pass |  |
| QC-05 | Cancel / X / Esc / backdrop | 2 | ✅ pass |  |

#### History (HI)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| HI-01 | Opens on latest day | 1 | ✅ pass |  |
| HI-02 | Calendar day select | 2 | ✅ pass |  |
| HI-03 | Month navigation | 2 | ✅ pass |  |
| HI-04 | Recent days and Open this day | 2 | ✅ pass |  |
| HI-05 | Reopen from history | 3 | — not run | Unchanged since 1.0.0 |

#### Notes (NO)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| NO-01 | List and preview | 2 | ✅ pass |  |
| NO-02 | Search | 2 | ✅ pass |  |
| NO-03 | Folder chips | 2 | ✅ pass |  |
| NO-04 | New note | 1 | ✅ pass |  |
| NO-05 | Edit title / folder / body | 1 | ✅ pass |  |
| NO-06 | Toolbar | 2 | ✅ pass |  |
| NO-07 | Edit / Read (phone), Edit / Split / Read (desktop) | 2 | ✅ pass |  |
| NO-08 | Pin | 3 | ✅ pass |  |
| NO-09 | Delete note | 1 | ✅ pass |  |
| NO-10 | New folder | 3 | ✅ pass |  |
| NO-11 | Back to list | 2 | ✅ pass |  |

#### Sync and server (SY)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| SY-01 | Form labels and keyboard types | 2 | ✅ pass |  |
| SY-02 | Unreachable server | 1 | ✅ pass |  |
| SY-03 | Wrong password | 1 | ✅ pass |  |
| SY-04 | Connect, status, Sync now | 1 | ✅ pass |  |
| SY-05 | Devices, activity, password | 2 | ✅ pass |  |
| SY-06 | Disconnect this device | 1 | ✅ pass |  |
| SY-07 | Restore while connected | 1 | ✅ pass |  |
| SY-08 | Device list hygiene | 2 | ✅ pass |  |

#### Settings (SE)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| SE-01 | Layout and tabs | 1 | ✅ pass |  |
| SE-02 | Close | 1 | ✅ pass |  |
| SE-03 | Back up now / technical .json | 1 | ✅ pass |  |
| SE-04 | Restore / invalid file | 1 | ✅ pass |  |
| SE-05 | Sample data (Advanced) | 1 | ✅ pass |  |
| SE-06 | Statuses | 2 | ✅ pass |  |
| SE-07 | Old-task warnings | 2 | ✅ pass |  |
| SE-08 | Sections | 3 | ✅ pass |  |
| SE-09 | Pretend it's another day (Advanced) | 3 | ✅ pass |  |
| SE-10 | Add widget (native only) | 2 | ✅ pass | Native suite (Add widget -> Android pin prompt) |

#### Responsive (RS)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| RS-01 | No horizontal scroll | 1 | ✅ pass | No horizontal scroll on 48 screen/width combinations (320-1920 px) |
| RS-02 | Layout switch at 768 px | 2 | ✅ pass | Phone shell below 768 px, desktop from 768 px |
| RS-03 | Navbar at 1024 | 2 | ✅ pass | NAV-05 |
| RS-04 | Wide screens | 3 | ✅ pass | Content 1800 px wide at 1920 (cap 1800); task list capped at 56 rem with a side panel |
| RS-05 | Truncated text | 2 | ✅ pass | Ellipsis on: Architecture Decision: Canonical Markdown & Task I |

#### Accessibility and readability (AX)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| AX-01 | axe-core scan | 1 | ⚠️ warn | No critical/serious violations; minor/moderate: target-size (minor (covered by open menu)) |
| AX-02 | Contrast | 1 | ✅ pass | 0 low-contrast text nodes across 44 screen/theme scans |
| AX-03 | Font sizes | 2 | ✅ pass | No visible text below 12 px |
| AX-04 | Touch / click targets | 1 | ✅ pass | Phone controls < 44 px: none; desktop < 24 px: none |
| AX-05 | Icon buttons named | 1 | ✅ pass | Every button has a name and every field a label |
| AX-06 | Dialogs | 2 | ✅ pass |  |
| AX-07 | Keyboard | 2 | ✅ pass |  |
| AX-08 | Zoom 200% | 3 | — not run | Zoom 200% not re-checked |

#### Android app (AND)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| AN-01 | Launch, splash, icon | 1 | ✅ pass | Native suite |
| AN-02 | Status bar and safe areas | 2 | ✅ pass | Emulator: dark header on every tab; Settings has a dark strip behind the status icons |
| AN-03 | Keyboard | 1 | ✅ pass | New-task bottom sheet and note editor stay above the keyboard (emulator) |
| AN-04 | Back up share sheet | 1 | ✅ pass | Back up now opens the share sheet (emulator) |
| AN-05 | Restore file picker | 1 | ✅ pass | Choose a backup file opens the system picker (emulator, unchanged flow) |
| AN-06 | Widget | 1 | ✅ pass | Native suite: widget added, tick applied, + opens the new-task sheet, "N left · N done" header |
| AN-07 | Status bar on light full-screen views | 2 | ✅ pass | Same as AN-02 |
| AN-08 | Cancel share sheet | 1 | ✅ pass | Dismissing the share sheet after Back up now shows no error (emulator) |
| AN-09 | Keyboard action key | 3 | ✅ pass | Task, checklist and sheet fields use enterkeyhint=done |

#### Destructive-action safety (DS)

| ID | Test case | P | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| DS-01 | Task delete (details and menu) | 1 | ✅ pass | TK-08 |
| DS-02 | Note delete | 1 | ✅ pass | NO-09 |
| DS-03 | Section notes Clear | 2 | ✅ pass | TD-08 |
| DS-04 | Replace with sample data | 1 | ✅ pass | SE-05 |
| DS-05 | Restore backup over non-empty vault | 1 | ✅ pass | SE-04 |
| DS-06 | Disconnect device / this device | 2 | ✅ pass | SY-06 |
| DS-07 | Status/heading deletion in Settings | 3 | ✅ pass | Status and section removal happen in a draft; Cancel discards and closing with changes asks first |
