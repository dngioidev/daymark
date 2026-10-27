# Daymark UX/UI Test Report

**Cycle 10.1, 2026-10-27:** QA passed 466/466. The final UX run passed 92 checks and had one NAV-06 startup timeout; the [focused rerun](./cycle-10-1-rerun.json) passed that case and the console check. The original timeout is retained in [`results.json`](./results.json). The 48 screen scans and 56 responsive checks have no scan errors or page overflow, and new menu accessible-name findings are resolved. See the [hotfix handoff](../../releases/cycle-10-1/README.md) for screenshots, verification and remaining minor limitations.

**Cycle 10 continuation, 2026-10-27:** the fresh full suite passed 92/92 checks, with 48 light/dark screen scans and 56 responsive checks, zero scan errors, zero page overflow and zero console errors. Current evidence is in [`results.json`](./results.json), [`scans.json`](./scans.json) and the [cycle 10 handoff](../../releases/cycle-10/README.md). The dated findings below describe earlier releases.

The raw scans still report calendar date-cell accessible-name mismatches and a keyboard-focus warning on the server activity log (serious), plus landmark warnings around menus and the note editor (moderate), across 14 screen/theme scans. These are follow-ups recorded in the cycle 10 handoff; passing functional checks do not imply zero axe findings.

Date 2026-10-21 · Daymark 1.0.0 · Suite: [`docs/testing/ux-ui-test-suite.md`](../../testing/ux-ui-test-suite.md) (114 cases) · Full per-case results: [`test-results.md`](./test-results.md)

Product and business review of the same screens (IA, wording, density, prioritised redesign plan): [`business-ux-review.md`](./business-ux-review.md)

> **Update after Cycle 5 (Daymark 1.1.0, same day):** every finding below was fixed. Re-run of the updated suite (v1.1) plus the native Android suite: **109 pass · 1 warn · 0 fail · 4 not run** (was 69 · 25 · 15 · 5). The warning is axe flagging rows partly covered by an open menu, which is expected. No axe critical/serious issues, 0 low-contrast nodes, no text under 12 px, no phone control under 44 px. Per-case results: [`test-results.md`](./test-results.md); what changed: [`docs/releases/cycle-5`](../../releases/cycle-5/README.md). The findings below describe 1.0.0.

**Result on 1.0.0: 69 pass · 25 warn · 15 fail · 5 not run (all priority 3).**
Coverage: every screen, menu, dialog and button (inventory from `scripts/ux-inventory.mjs`). Viewports were 320, 360, 412, 768, 1024, 1280, 1440 and 1920 px, in light and dark mode. Automated scans (axe-core accessibility rules, font sizes, target sizes, overflow, truncation) ran on 46 screen/theme combinations. Android behaviour was checked by hand on an Android 16 emulator; your phone was not touched.

## Critical: fix first
| # | Finding | Evidence | Fix |
| :-- | :-- | :-- | :-- |
| C1 | **Restoring a backup or loading sample data on a synced device deletes everyone's data on the server.** The client treats every note missing from the backup as deleted and syncs that. On the emulator the server went from 4 daily notes + 4 notes to 1 + 0. | [SY-07](./android/SY-07-server-after-restore.png) | Restore and Replace should reset sync bases (treat as a fresh merge), or warn clearly and offer "Restore only on this device (disconnect first)". |
| C2 | **Ctrl/⌘ K does nothing**, although the navbar advertises it. The handler is an empty stub. | NAV-09 | Open Quick Capture in the global key handler. |

## High
| # | Finding | Evidence |
| :-- | :-- | :-- |
| H1 | **Text contrast fails WCAG AA in 692 places.** White on the brand orange (`amber-600`) is 3.19:1 on all primary buttons. In dark mode, white on `amber-500` is 2.13:1. Grey secondary text is `stone-400` (2.58:1) in light mode and `stone-500/600` (2.3–3.9:1) in dark mode. `rose-600` on the attention banner is 4.36:1. Fix: primary buttons `amber-700` with white text, dark-mode `amber-500` buttons with `stone-950` text, light secondary text `stone-500` → `stone-600`, dark secondary text `stone-500` → `stone-400`. | [phone today](./screens/P412-light-today.png) |
| H2 | **Touch targets are too small on phones:** 117 controls are under 44 px. Examples: Details 47x15, ‹ › day arrows 28 px, task "…" menu 24 px, status chips 23 px, status-menu items 28 px, folder chips 23 px, Notes back link 50x16, header sync pill 78x17. | AX-04 |
| H3 | **Text is small:** 1,162 visible text instances are 10–11 px, and phone task metadata, labels and bottom-nav labels are mostly 10–12 px. Suggest a 12 px minimum, 14 px for body text on phones. | AX-03 |
| H4 | **Screen-reader names are missing:** icon buttons ("…", X close, month ‹ ›) have no accessible name, and selects and inputs have no labels (128 + 44 + 40 axe critical nodes). | AX-01, AX-05 |
| H5 | **Settings is hidden at tablet/laptop widths (~768–1100 px):** the navbar scrolls sideways without a visible scrollbar. | [1024 px](./screens/responsive-D1024-today.png) |
| H6 | **Android: dismissing the export share sheet shows "Failed to export vault as zip."** Cancelling is treated as a failure. | [AN-08](./android/AN-08-share-cancel-error.png) |
| H7 | **Android: the status bar is invisible on Settings.** The light status icons sit on a white area. | [AN-07](./android/AN-07-settings-status-bar.png) |
| H9 | **"+ Task" inline add doesn't fit on phones (reported from a real device).** The title box, status select and "Add Task" button sit in one fixed row. On 360–412 px screens the select is cut off and the Add Task button is entirely off-screen (it ends at 429 px), so the task can only be saved with the keyboard's Enter key. The page doesn't scroll sideways (the card clips it), which is why the overflow scan missed it. Fix: stack the row on phones (full-width input, then select + button) and make the input `flex-1 min-w-0`. | [360 px](./screens/TD-06-inline-add-360.png), [412 px](./screens/TD-06-inline-add-412.png) |
| H8 | **Dialogs aren't real dialogs.** Quick Capture and "Other past date" lack `role=dialog`. Background controls stay focusable and Settings doesn't move focus into itself. Esc doesn't close Settings, and tapping the backdrop doesn't close Quick Capture. | AX-06, SE-02, QC-05 |

## Medium
- The section-notes toolbar ignores your selection and appends `**bold text**` at the end (TD-07). The note editor's toolbar works correctly.
- Pinning a note doesn't move it to the top; pinned notes aren't sorted (NO-08).
- The task status menu doesn't close when you tap outside it (TK-02).
- The checklist item delete button only appears on hover, so it's unreachable on touch (TK-05).
- Quick Capture with an empty title does nothing and gives no feedback (QC-03).
- New Note doesn't focus the title field (NO-04).
- Every sign-in adds another device entry: 7 entries incl. duplicates, and this device isn't tagged (SY-08).
- On phones the Statuses settings tab runs past the right edge (the add-status row is clipped) ([SE-06](./screens/SE-06-statuses-phone.png)).
- Errors and confirmations use browser `alert()`/`confirm()`, which are unstyled and say e.g. "Invalid Daymark backup format." (SE-04).
- An empty history day shows the technical text "No daily document exists for 2026-10-03" with no action offered (HI-02).

## Low / polish
- The next day is titled "Oct 21"; "Tomorrow" would be clearer.
- The Today badge "4" isn't explained.
- At 1920 px task rows are very wide.
- The "Waiting / Dependency" chip is truncated on phones.
- The keyboard action key shows "next" instead of "Done".
- The Quick Capture title still shows the ISO date.

## What works well
- **No horizontal overflow** at any width (320–1920 px).
- **Welcome, sample data and empty start** all work.
- **Navigation:** bottom nav, deep links, and Android Back (dialog → editor → Today → minimise).
- **Tasks:** complete/reopen, rename, snooze, historical completion and the audit drawer.
- **Notes:** search, folders and preview.
- **Sync:** connect, error messages and disconnect.
- **Backup:** export (download and share sheet) and restore via the file picker with confirmation.
- **Safety:** every destructive action asks first.
- **Keyboard:** never covers inputs on Android.

## Recommended next cycle (in order)
1. C1 and C2.
2. The contrast token swap (H1) and minimum font sizes (H3), mostly class changes.
3. Target sizes and accessible names (H2, H4).
4. Inline "+ Task" row layout (H9), navbar overflow, Android share-cancel and status-bar fixes (H5–H7).
5. Shared accessible dialog component (H8), then the Medium list.
6. Re-run `npm run build && node scripts/ux-suite.mjs` and `node scripts/ux-report-table.mjs`.

## Reproduce
`npm run build && node scripts/ux-suite.mjs` (about 15 min; writes `results.json`, `scans.json`, `screens/`), then `node scripts/ux-report-table.mjs`. Android evidence is in `android/`.
