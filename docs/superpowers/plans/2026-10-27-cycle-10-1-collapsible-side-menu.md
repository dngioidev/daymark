# Cycle 10.1: Collapsible Side Menu Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small follow-up task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved and completed on 2026-10-27. See the [verification and screenshots](../../releases/cycle-10-1/README.md), including the retained UX startup-timeout/retry evidence. No release performed.

**Goal:** Let people minimize the desktop menu to icons so their content gets more horizontal space, then expand it when they want labels.

**Architecture:** Extend the existing `SideRail` with a controlled collapsed state owned by App. Remember this presentation preference on the current device, separately from synced Appearance settings. Preserve the current left/right placement and Notes focus behavior.

**Tech Stack:** Existing React, TypeScript, Tailwind, lucide-react, Vitest and browser QA; no new dependencies.

**Spec:** The approved design below is an addendum to [Cycle 10's design](../specs/2026-10-26-cycle-10-backlog-side-menu-guides-design.md). It supersedes that design's explicit exclusion of a collapsible/icon-only rail for this follow-up only. The user approved the proposed dimensions and device-local persistence policy before implementation.

## Design and acceptance criteria

- Keep the expanded rail at 168px. Add a 64px icon-only state, reclaiming 104px for the content without overlaying it.
- Put a clearly named toggle in the rail's top part: **Minimize menu** when expanded, **Expand menu** when minimized. Toggle in place without changing the active page or opening Settings.
- Keep the six existing parts and their order: title/actions, Today, Calendar, Notes, Backlog, Settings. Both states use the same navigation callbacks and active-page indication.
- In the minimized top part, show icon buttons for expand, sync status, New task and Search. Hide the written brand, date and shortcut hints; keep full action names and sync status available to assistive technology and on hover/focus.
- Give all navigation icons accessible names and hover/focus tooltips. Do not rely on icon shape, colour or hover alone. Preserve shortcut metadata, visible focus indicators and the Today attention badge without clipping.
- Keep controls at least 24px on desktop; prefer 32px for the compact top actions. Let only the top part scroll at short heights so every action remains reachable.
- Default to expanded on existing and fresh devices. Remember the last choice after reload using a local `daymark_rail_collapsed` preference; blocked/unavailable storage must fall back safely to in-memory state. Do not sync the preference to another device.
- Left/right placement works in either state. Notes focus mode still hides the entire rail; leaving focus restores its previous width and side. Switching pages preserves the choice.
- Keep the phone bottom bar unchanged. No automatic collapse based on width, hover expansion, new shortcut, dependency, task-storage change or release/version bump in this follow-up.

## Global constraints

- Preserve Markdown, task metadata, rollover behavior and sync contracts.
- Retain full-width desktop content (`max-w-[1800px]`) and standard Tailwind palette classes.
- Use existing header colour variables and light/dark contrast treatment.
- Work on the existing cycle branch unless the execution request says otherwise. Do not push, merge or release as part of this plan.

## Task 1: Collapse control, persistence and App integration

**Files:**
- Modify: `src/components/SideRail.tsx`, `src/components/SideRail.test.ts`, `src/App.tsx`, `src/App.search.test.ts`.
- Create: `src/utils/railPreference.ts`, `src/utils/railPreference.test.ts`.

**Interfaces:**
- `SideRailProps`: add required `collapsed: boolean` and `onToggleCollapsed: () => void`; retain `hidden` for Notes focus mode.
- `loadRailCollapsed(): boolean` and `saveRailCollapsed(collapsed: boolean): void`: safely read/write the local preference; missing/invalid data means expanded. App initializes from the loader and saves explicit toggles. No new synced `AppSettings` field.

- [x] **Step 1: Write meaningful regressions.** Test default/invalid/blocked-storage behavior and persistence round-trip. Render both rail states and assert the six parts, named toggle, active destination, sync state, attention badge and named compact actions. In App, exercise toggling, navigation, reload persistence, side changes and hiding/restoring via Notes focus.
- [x] **Step 2: Run the targeted tests and confirm the missing behavior fails.** `npx vitest run src/utils/railPreference.test.ts src/components/SideRail.test.ts src/App.search.test.ts`.
- [x] **Step 3: Implement the controlled state and local persistence.** Use explicit labels, keyboard-operable toggle and tooltips visible on keyboard focus as well as hover. Preserve the current expanded design and keyboard shortcuts.
- [x] **Step 4: Run targeted tests and `npm run lint`; confirm they pass.** Review persistence cleanup against the existing sign-out behavior, which clears `daymark` local keys.
- [x] **Step 5: Commit** `feat: minimize the desktop menu to icons` using the cycle's existing author/trailer convention.

## Task 2: Browser coverage, guidance and hotfix handoff

**Files:**
- Modify: `scripts/helpers/cycle-10-qa.mjs`, `scripts/ux-suite.mjs`, `scripts/capture-screenshots.mjs`, `docs/guide/appearance.md`, `docs/ROADMAP.md`.
- Create: `docs/releases/cycle-10-1/README.md` and captured images under `docs/releases/cycle-10-1/images/`.

- [x] **Step 1: Add browser checks** for both sides at 800px and 1440px, and 480px-high windows. Assert widths of 168px/64px, 104px reclaimed content width, no overlap/overflow and keyboard access to every compact action. Cover light/dark, custom header colours/photo backgrounds and S/M/L text sizes.
- [x] **Step 2: Verify focus and state interactions.** Toggle repeatedly, navigate, open/close Settings, use Notes focus and reload. Confirm tooltip visibility without focus theft, readable attention badges and full sync status names. Confirm phone navigation is unchanged.
- [x] **Step 3: Update the Appearance guide** with minimize/expand instructions and device-local persistence. Capture and visually inspect expanded/minimized desktop views plus a right-side minimized view. Record checks and any limitations in the hotfix handoff.
- [x] **Step 4: Run verification.** `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run test:qa`, `node scripts/ux-suite.mjs`, `npm run test:e2e`, `npm run validate:ai`. Review raw accessibility scans, not just the functional pass count. Run `npm run android:build -- --test` for the shared bundle handoff; no native UI change is intended.
- [x] **Step 5: Review the final diff and commit** `docs: collapsible menu QA and hotfix handoff`. Leave release numbering/publication for a separate request.

## Review focus

1. Short windows: the new toggle must not strand sync/capture/search; owned by Task 2's 480px-high keyboard checks.
2. Hidden labels: every compact action remains named and discoverable without a mouse; owned by Tasks 1 and 2.
3. Focus mode and right-side placement: restoration must retain both width and side; owned by Tasks 1 and 2.
4. Unavailable storage: minimizing still works without breaking startup; owned by Task 1's storage failure tests.
5. Content resizing: reclaim real layout width without losing editor content or causing horizontal scrolling; owned by Task 2's layout and navigation checks.
