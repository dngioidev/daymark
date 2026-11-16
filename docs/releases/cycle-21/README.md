# Cycle 21: One-time events

Date: 2026-11-16 · Branch: `cycle-21-events` · Tag: none

**Status: implemented and verified on the feature branch.** No version bump, release, merge, push or deployment is recorded here.

## What changed

- Capture planned or past events with a required title/date, notes, stable checklist items and section placement. Start time and duration are independently optional; enter a timed span using end date/time or elapsed duration.
- Mix distinct event rows with daily tasks on desktop and phone. Events have no completion, overdue, aging or rollover state; their checklist items remain checkable.
- Calendar has a separate Events agenda and counts, including original-zone overnight continuation without duplicate entities.
- Preserve original local time and IANA zone as primary. A differing device zone appears underneath, including its date when needed; foreground/resume checks refresh the device zone without rewriting events. DST gaps are rejected and repeated times require an explicit occurrence.
- Foreground in-app warnings default to 15 minutes, with a shared positive whole-minute setting or Off. Session deduplication uses event ID and scheduled start.
- Persist and back up events independently; readable Markdown exports use `Daymark/events/<event-id>.md`. Per-ID sync is capability gated, with atomic schedule merges, per-ID checklist merges, preserved concurrent notes and deletion protection.

## Implementation decisions

### Events week follow-up (2026-11-16)

The Calendar now has a separate device-zone Events week grid for timed spans, date-only and duration-only entries, overlaps and cross-zone dates. The existing Month and task Week views remain separate. Desktop/phone verification passed: 35 Cycle 21 browser checks (including 19 Events week checks), 17 existing Calendar/habit checks, and PWA e2e. Four new feature screenshots and 34 fresh general audit images were captured and reviewed. Final unit totals are recorded in the follow-up verification below.

A separate `EventItem` model keeps events out of task status, rollover, aging, task totals and widget actions. Existing notes and machine task comments retain their format. Older task-only clients do not receive event entities and cannot remove them on a current server; older servers leave local events pending while supported sync continues. Event sync requires both an updated client and server.

Desktop and mobile share event callbacks. Inline checklist updates merge the rendered base against the latest live state, preserving a sync update that arrives before the click. Calendar keeps event-only dates selected. The warning queue uses the actual mobile navigation mode to avoid covering the bottom bar.

One Luna implementation agent was reused throughout; the main agent reviewed changes and independently ran final verification. No additional implementation/review agents were started for this execution.

## Verification

| Check | Observed result |
| :--- | :--- |
| `npm run lint` | Passed after correcting new test fixture types. |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | 215 files passed; 2,644 tests passed, 1 skipped. Direct invocation bounds workers because npm argument forwarding was ineffective in this PowerShell environment. |
| `npm run test:helpers` | 44 passed on the final helper run. |
| `npm run build` | Passed; existing native config-loader and large-chunk warnings remain. No dependency, lockfile or version changes. |
| `npm run build:site` | Passed; required by guide/browser helpers. |
| `node scripts/e2e-sync.mjs` | Passed all 61 checks, including phone offline event create/edit/reload, reconnect, laptop receipt, date move, deletion convergence and server restart. |
| Full browser QA | Final full run: 766 passed / 825 and 59 failed. These are the 58 exact baseline failures plus a B13 navigation timeout before its rollover assertion. The unchanged B13 focused rerun passed. Consolidated coverage: 767 passed / 825, with exactly the 58 baseline failures; all 16 desktop/phone C21 checks passed. [Exact comparison](./qa-comparison.json). |
| `npm run test:e2e` | Passed all checks on the final build, including offline/PWA and Help/tag paths. |
| UI audit, screenshots, `npm run validate:ai` | 34 general audit images and 20 feature images captured and visually reviewed in phone/desktop light/dark; AI validation passed (81/81). |

The first full unit run exposed incomplete browser lifecycle stubs in `App.search.test.ts`; the stubs were corrected and the full suite rerun successfully. Phone screenshot/sync verification exposed missing mobile view wiring, which was fixed with App, mobile shell and real checkbox regressions. A stale checklist callback overwriting remote title/notes was reproduced red and fixed through the shared merge path.

An early QA attempt reached a stale server on its default port. Disposable test servers now refuse occupied ports and accept explicit test ports; no event validation was weakened. An initial UI audit and a later capture attempt stopped at `networkidle`; they now wait for the visible app and Synced status while retaining all screen actions. Visual inspection also caught the audit fixture overriding dark mode; the script now selects and verifies the actual theme, and all dark audit images were recaptured. The final QA B13 startup timeout also passed on a focused retry; its underlying cause was not proven. The earlier PWA startup timeout was transient: an unmodified-main baseline and unchanged feature rerun passed; its cause was not proven.

## Screenshots

Captured with `node scripts/capture-screenshots.mjs cycle-21`: desktop 1440×900 and Android browser 412×915 at DPR 2. Every image was reviewed. The phone Calendar continuation is centered above fixed navigation and capture checks its geometry. General audit images are under `audit/`; the audit explicitly selects and verifies each theme.

| View | Light | Dark |
| :--- | :--- | :--- |
| Mixed daily rows (desktop) | ![Mixed daily rows, light](./images/events-mixed-desktop.png) | ![Mixed daily rows, dark](./images/events-mixed-desktop-dark.png) |
| Mixed daily rows (android) | ![Mixed daily rows, light](./images/events-mixed-android.png) | ![Mixed daily rows, dark](./images/events-mixed-android-dark.png) |
| Event editor (desktop) | ![Event editor, light](./images/event-editor-desktop.png) | ![Event editor, dark](./images/event-editor-desktop-dark.png) |
| Event editor (android) | ![Event editor, light](./images/event-editor-android.png) | ![Event editor, dark](./images/event-editor-android-dark.png) |
| Calendar continuation (desktop) | ![Calendar continuation, light](./images/events-calendar-desktop.png) | ![Calendar continuation, dark](./images/events-calendar-desktop-dark.png) |
| Calendar continuation (android) | ![Calendar continuation, light](./images/events-calendar-android.png) | ![Calendar continuation, dark](./images/events-calendar-android-dark.png) |
| Warning settings (desktop) | ![Warning settings, light](./images/event-warning-settings-desktop.png) | ![Warning settings, dark](./images/event-warning-settings-desktop-dark.png) |
| Warning settings (android) | ![Warning settings, light](./images/event-warning-settings-android.png) | ![Warning settings, dark](./images/event-warning-settings-android-dark.png) |
| Warning queue (desktop) | ![Warning queue, light](./images/event-warning-queue-desktop.png) | ![Warning queue, dark](./images/event-warning-queue-desktop-dark.png) |
| Warning queue (android) | ![Warning queue, light](./images/event-warning-queue-android.png) | ![Warning queue, dark](./images/event-warning-queue-android-dark.png) |

## Known limitations and follow-up

- Warnings require Daymark to be open and in the foreground. No OS/background notification delivery, recurrence, external calendar sync, task conversion or event MCP CRUD was added.
- Physical Android device time-zone switching and native Android/widget testing were not run. Automated zone/resume tests and browser phone checks cover the implemented paths.
- Existing QA baseline failures remain open; this cycle does not repair unrelated Settings, tooltip, rail and tree-accessibility issues.
- Mixed saved ordering is supported; explicit daily reorder controls are deferred, matching the existing daily task UI.
- Merge/release/deployment remain separate work.

## Usage versus estimate

| Metric | Estimate | Actual |
| :--- | :--- | :--- |
| Sessions | Not recorded | Exact session count unavailable; one reused Luna implementation worker with main supervision. |
| Tokens | Not recorded | Runtime total unavailable; no estimate substituted for usage. |
| Pro windows | Not applicable to this execution | Unavailable. |

## References

[Events guide](../../guide/events.md) · [Calendar guide](../../guide/calendar.md) · [Sync guide](../../guide/sync.md) · [Approved design](../../superpowers/specs/2026-11-15-cycle-21-events-design.md) · [Implementation plan](../../superpowers/plans/2026-11-15-cycle-21-events.md) · [Roadmap](../../ROADMAP.md)


## Daymark handoff

Implementation checkpoint: `02fb472`. Tracking task `task-1794741962916-m7v3` is done under the existing Daymark heading. The verified outcome was appended to both **Daymark Cycle 21 - Events specification** and **Daymark Cycle 21 - Events implementation plan**, preserving their existing contents. The connector exposes checklist text updates but no per-item completion operation, so the existing checklist records were preserved and all six verified milestones are recorded in the task description.


## Events week follow-up verification

Approved design: [Events week grid](../../superpowers/specs/2026-11-16-events-week-grid-design.md). Approved plan: [implementation](../../superpowers/plans/2026-11-16-events-week-grid.md). One reused Luna worker implemented the follow-up; the main agent reviewed and independently verified it.

- Device-local seven-day timeline with overlap lanes, sticky day headings/time gutter, and a separate No set time strip. Month and the existing task Week renderer retain their behavior.
- Original schedule remains primary; shifted original dates are visible near the start of compact labels, with full schedules in accessible names and the existing editor. Short events keep a 44px target with a separate exact-duration marker; start-only events explicitly show No duration.
- DST gaps/repeats and half-hour transitions have explicit axis geometry. Historical second-level transitions that cannot be plotted exactly retain the whole event in a readable fallback; no source time is silently discarded.
- Browser verification: `C21` 35/35; `H` 17/17; PWA e2e passed. The 19 Events week checks cover actual overlap rectangles, minimum targets/exact spans, 23:59 access, editor save, navigation, task Week/Month preservation, device-zone refresh without storage mutation, and phone scrolling/sticky geometry.
- Lint, production build, site build, all 45 helper checks and AI configuration validation passed. Final bounded full unit run: 218 files passed, 2,685 tests passed and one skipped (206.04 seconds). Exact browser run records are retained in [events-week-verification.json](./events-week-verification.json).
- First targeted browser run retained 10 passes and two failures (timezone alias expectation and duplicated task-title selector); the next retained 13 passes and a conflicting CDP timezone-override failure. The corrected deterministic scenario passed 19/19 and again within the complete C21 35/35 run. These were corrected test harness issues, not hidden baseline failures.
- The broad 825-check QA suite and sync suite were not repeated for this view-only follow-up. Their earlier evidence and exact known failures above remain historical, not newly claimed results. Native Android/device timezone switching was not run; browser emulation verifies the refresh path.
- Fresh general audit: [34 images](./audit-events-week/), desktop 1440x900 and phone 412x915 at DPR 2, both themes. Four feature images were recaptured after review corrected intrinsic column expansion and truncated original-date placement. All 38 fresh images were reviewed.
- No drag creation, moving or resizing, recurrence, background notifications, release, merge or deployment is included. Narrow overlap labels truncate; full labels remain available accessibly and through the event editor.

| Events week | Light | Dark |
| :--- | :--- | :--- |
| Desktop | ![Events week desktop light](./images/events-week-desktop.png) | ![Events week desktop dark](./images/events-week-desktop-dark.png) |
| Phone | ![Events week phone light](./images/events-week-android.png) | ![Events week phone dark](./images/events-week-android-dark.png) |
