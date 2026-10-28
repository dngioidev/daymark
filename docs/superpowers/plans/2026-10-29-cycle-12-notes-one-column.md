# Cycle 12: One-Column Notes Navigation and Reclaimed Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Daymark 1.9.0 Notes navigation: one column (search, New note / New folder / List|Graph switch, then a folder tree with notes inside), a 5-part side menu with Settings as a small button in the Title part, and no header row above the Notes panes.

**Architecture:** A pure tree-model module turns notes, folder metadata, search text and expansion state into a flat list of visible rows (folders, notes, headings, snippets). One `NoteNavigation` component renders those rows as an accessible, keyboard-driven, windowed tree and replaces both the cycle 11 folder tree and the notes list in `StandaloneNotesView`. The existing folder operations, drawers, minimised strip, phone layout, Related panel and graph are reused; only their entry points change.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (stone palette), vitest, Playwright QA scripts. No new dependencies (windowing is hand-written).

**Spec:** `docs/superpowers/specs/2026-10-29-cycle-12-notes-one-column-navigation-design.md` (includes the approved mockup, "Calls made after the builder check" and "Additions after the user's feedback"). Mockups: `.superpowers/brainstorm/10842-1793208436/content/notes-one-column.html` and `rail-and-switch.html`.

## Global Constraints

- Tailwind v4 stone palette only; desktop content keeps `max-w-[1800px]`; types from `src/types/daymark.ts`.
- Notes stay plain Markdown; an unedited note is never re-serialised; building or rendering the tree never saves anything.
- No change to data, sync, storage, backups, the editor, the Related panel logic or the graph logic. All folder operations (new, rename, move, delete, merge, Undo guards, drag and drop) keep their current behaviour and confirmations.
- Existing tests that assert the two-pane layout or the six-part rail are rewritten for the new layout, never weakened; behaviour tests are kept.
- Phone rows are at least 44px; no drags start from rows on touch; no graph below 768px.
- Verification commands (run one heavy suite at a time on this memory-limited Windows machine): `npm.cmd run lint`, `npx.cmd vitest run --maxWorkers=2`, `npm.cmd run test:helpers`, `npm.cmd run build`, `npm.cmd run test:qa`, `node scripts/ux-suite.mjs`, `npm.cmd run test:sync`, `npm.cmd run test:e2e`, `npm.cmd run validate:ai`, `npm.cmd run android:build -- --test`.
- Release is out of scope for this plan (1.9.0 is cut in a separate request). Commits are made by the controller (implementer sandboxes cannot write `.git`), authored `dngioidev <172118255+dngioidev@users.noreply.github.com>` with trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and no Claude-Session line. Implementer: Codex CLI (model gpt-6.1-sol) when available, otherwise a Claude Sonnet agent (the user approved this fallback in cycle 11); reviewers are Claude.

## Review Focus

1. **A note must never become harder to find:** the open note stays visible (dimmed) during a search that excludes it; deep folders auto-expand to the open note; keyboard users reach every row.
2. **Folder operations do not regress:** rename/move/delete/merge/Undo and drag and drop work from the new tree (including dropping on the top-level strip), and nothing is saved by rendering.
3. **Large vaults:** 1,000+ notes and deep folders stay smooth (windowing), with correct keyboard focus, `aria-setsize/posinset` and "N notes match" announcements.
4. **New note / folder placement:** lands in the current folder (last clicked folder or open note's folder), templates with their own folder keep it, top level when nothing is open.
5. **Chrome changes do not strand features:** Settings stays reachable on every page in both rail states and on phones, and Graph stays reachable (switch in the navigation column, and in the graph toolbar while in Graph mode) at every desktop width.

---

### Task 1: Side menu with five parts and a Settings button in the Title part

**Files:**
- Modify: `src/components/SideRail.tsx` (+ `SideRail.test.ts`), `src/components/Navbar.tsx` only if it still re-exports rail types, `src/App.tsx` (only if props change)
- Modify: selectors/tests referencing the sixth rail part or `data-rail-part="settings"` in `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`, `scripts/capture-screenshots.mjs`, `scripts/e2e-android-pwa.mjs`, and docs that say "six parts" (`docs/guide/*.md`, `README.md`, `.ai-configs/project/*`, `site/index.html`)

**Interfaces:**
- Produces: `SideRail` renders exactly five parts (Title, Today, Calendar, Notes, Backlog) as equal-height grid rows (`grid-template-rows: repeat(5, 1fr)`; check how the current grid is defined); the Title part shows the app name, date label, sync status, **+ New task** and a row of two small icon buttons: **Search** and **Settings** (`aria-label="Settings"`, tooltip "Settings", `data-rail-part="settings"` may be kept on the button for selectors); `onOpenSettings` unchanged. In the minimised rail the Title part keeps Settings and Search as icon buttons with tooltips (no clipping at 64px width). `aria-current` still only on page parts.
- Consumes: existing `RailButton`, `onOpenSettings`, `onOpenSearch`, collapsed/side props.

- [ ] **Step 1: Failing tests:** `SideRail` renders five parts in order and no "Settings" part; the Title part contains buttons named "Settings" and "Search" that call their handlers; minimised and right-side variants keep both buttons with accessible names; focus order is Title buttons then pages; the Settings button is not `aria-current`.
- [ ] **Step 2: Run `npx.cmd vitest run src/components/SideRail.test.ts`; expect FAIL.**
- [ ] **Step 3: Implement** the five-part rail and the Title-part buttons; update every selector and doc string listed above (search for `rail-part`, "six", `getByRole('button', { name: 'Settings' })` assumptions, rail height maths in QA).
- [ ] **Step 4: Run `npm.cmd run lint`, `npx.cmd vitest run --maxWorkers=2`, `npm.cmd run build`, then the rail-related QA (`npm.cmd run test:qa -- C10` and the cycle 10.1 minimise scenarios) once; expect PASS.**
- [ ] **Step 5: Hand back for the controller's commit** (`feat: five-part side menu with a Settings button in the title`).

### Task 2: Notes tree model (pure logic)

**Files:**
- Create: `src/utils/noteTree.ts`, `src/utils/noteTree.test.ts`

**Interfaces:**
- Produces:
  - `NoteTreeRow` discriminated union: `{ kind: 'pinned-heading' } | { kind: 'folder'; path: string; name: string; depth: number; expanded: boolean; ownNotes: number; totalNotes: number } | { kind: 'note'; noteId: string; title: string; depth: number; pinned: boolean; dimmed?: boolean; snippet?: { before: string; match: string; after: string }; titleMatch?: [number, number][]; group: 'pinned' | 'tree' } | { kind: 'status'; text: string }`
  - `buildNoteTreeRows(input: { notes: StandaloneNote[]; meta: NoteMeta; expanded: ReadonlySet<string> /* lowercase folder paths */; query: string; openNoteId?: string }): { rows: NoteTreeRow[]; matchCount: number }`
    - Without a query: Pinned group (heading + pinned notes A–Z, depth 0) when any pinned note exists; then top-level folders A–Z (via `buildFolderTree`, so empty meta folders appear), each followed, when expanded, by its subfolders then its notes (A–Z, case-insensitive, numeric-aware, fixed-locale collator), then unfiled notes (folder `''`) A–Z at depth 0 with no heading; pinned notes also appear in their folder with `pinned: true`; empty vault returns a single status row "No notes yet. Create a note."
    - With a non-blank query: matching is exactly the existing search (title, body, tags, case-insensitive substring of the trimmed query); the Pinned group is omitted; only folders that contain matches (and their ancestors) remain, all expanded; matching notes show `titleMatch` ranges and, when only the body matched, a `snippet` around the first body match (about 60 characters each side, whitespace-collapsed, ellipses implied by the UI); the open note, if it does not match, is included `dimmed` at its place with its ancestors expanded and is NOT counted in `matchCount`; no matches returns a single status row `No notes match “<query>”`.
  - `ancestorPaths(folder: string): string[]` (lowercase keys for expansion), `defaultExpanded(notes, openNoteId): Set<string>` (top level plus the path to the open note), `visibleRowKey(row): string` (stable React key: `folder:<lc path>`, `note:<id>`, `note:<id>:pinned`), `noteTooltip(note, today?: string): string` ("Last edited Today"/date using `formatNoteDate`).
- Consumes: `buildFolderTree`, `normalizeFolderPath`, `NoteMeta` from `src/utils/noteFolders.ts`; `formatNoteDate` from `src/utils/notes.ts`.

- [ ] **Step 1: Write failing tests:** ordering (subfolders before notes; A–Z numeric-aware: `Note 2` before `Note 10`; case-insensitive; accents); Pinned group present/absent and notes appear twice (group + folder) with one count in folder totals; unfiled notes at the end without heading; empty folders from meta shown; collapsed folders hide children but keep counts; empty vault status; search: title/body/tag matches, ancestors expanded, non-matching siblings hidden, `matchCount` counts each note once even if pinned, Pinned group omitted, snippet only for body-only matches, `titleMatch` ranges, dimmed open note included but not counted, nothing matches → status row, blank query behaves as no query; determinism and no input mutation; performance: 1,000 notes in 50 folders builds under 100 ms.
- [ ] **Step 2: Run `npx.cmd vitest run src/utils/noteTree.test.ts`; expect FAIL.**
- [ ] **Step 3: Implement** `noteTree.ts` per the interfaces (pure, immutable, uses a fixed `Intl.Collator('en', { numeric: true, sensitivity: 'base' })`).
- [ ] **Step 4: Run the test and `npm.cmd run lint`; expect PASS.**
- [ ] **Step 5: Hand back for the controller's commit** (`feat: notes tree model with in-place search`).

### Task 3: NoteNavigation column and Notes view integration (desktop)

**Files:**
- Create: `src/components/notes/NoteNavigation.tsx` (+ `NoteNavigation.test.ts`), `src/components/notes/useTreeWindow.ts` (+ test) for windowing
- Modify: `src/components/StandaloneNotesView.tsx` (+ its tests), `src/components/notes/NoteFolderTree.tsx` (kept only for the graph/strip pieces still using it, or removed with its tests if unused), `src/utils/notesPanes.ts` (expansion preference), `src/App.tsx` only for props

**Interfaces:**
- Produces: `NoteNavigation` props `{ notes; meta; openNoteId?: string; currentFolder: string; expanded: ReadonlySet<string>; onExpandedChange(next: Set<string>): void; query: string; onQueryChange(q: string): void; onOpenNote(id: string): void; onSelectFolder(path: string): void; onNewNote(): void; templates menu props as in the existing New note split button; onNewFolder(): void; onFolderAction(action: 'new' | 'rename' | 'move' | 'delete', path: string): void; onDropNote?(noteId: string, folderPath: string): void; onDropFolder?(path: string, newParentPath: string): void; dragEnabled: boolean; compact?: boolean /* phone */; viewSwitch?: React.ReactNode /* slot for the List | Graph switch, Task 4 */ }`. Column order: search box (with a clear button and `N notes match` polite status), button row (**＋ New note ▾**, **New folder**, then `viewSwitch`), then a `role="tree"` with `treeitem` rows (`aria-level`, `aria-expanded` on folders, `aria-selected` on the open note, `aria-setsize/posinset`, accessible names such as "Java, folder, 3 notes" and the note title, pinned notes with "pinned"), roving tabindex, keys: Up/Down, Right (expand or step in), Left (collapse or parent), Enter/Space (open note or toggle folder), Home/End; folder rows keep the ⋯ menu with the existing actions; note rows show only the title (highlighted match, snippet line when present, `title` tooltip from `noteTooltip`, dimmed styling for the dimmed open note, small pin icon); desktop-only drag sources for note and folder rows with drop targets on folder rows and a slim "Move to top level" strip that appears only while a drag is active; no drags on touch; windowing through `useTreeWindow` once the visible rows exceed 400 (fixed row height 32px desktop / 44px compact, overscan 10, keyboard navigation and scroll-into-view work across the window); the open note is scrolled into view when it changes by any route.
- `StandaloneNotesView`: the list pane and the separate tree pane are replaced by one column (about `w-72` wide); `currentFolder` state changes when a folder row is clicked or any note is opened (becomes that note's folder); New note creates in `currentFolder` (templates with their own folder keep it); New folder creates inside `currentFolder`; opening a note from a link, Related, graph, search or creation expands its ancestors; expansion state is stored per device by a new pref in `notesPanes.ts` (safe when storage fails, existing prefs unchanged); empty states "No notes yet. Create a note." and "No notes match “…”" come from the tree model rows; the old filter chips, "All notes" and "Notes (top level)" rows and `selectedFolder` filtering logic are removed (the graph's default scope that used the selected folder now uses `currentFolder`). Rendering the tree never saves.
- Consumes: Task 2 `buildNoteTreeRows` etc.; existing folder operation handlers and dialogs from cycle 11.

- [ ] **Step 1: Write failing tests:** `NoteNavigation` static renders (order search → buttons → tree; roles/levels/expanded/selected; note rows show only the title; pinned group and pin icon; search status and highlight; dimmed open note; empty states); keyboard model through the component's key handler (including Home/End and focus restore after expand/collapse); drag handlers present only when `dragEnabled`; top-level strip only while dragging; `useTreeWindow` computes the window, keeps the focused row mounted and scrolls to an index; `StandaloneNotesView`: opening a note sets the current folder, New note lands in it, template folder wins, New folder inside current folder, opening from a wiki link expands ancestors, search keeps the open note reachable, no save on render (spy), pinned note moves to the Pinned group when pinned.
- [ ] **Step 2: Run the focused files; expect FAIL.**
- [ ] **Step 3: Implement** the component, hook and integration; delete dead code (list pane, chips, `selectedFolder` filtering) and update tests that asserted them.
- [ ] **Step 4: Add QA scenarios** to `scripts/e2e-qa-regressions.mjs` (desktop 1440): column order and widths (editor wider than before), nested expand/collapse, open a note, search filters in place with the dimmed open note and "N notes match", keyboard-only walk, create note in the current folder, new folder inside it, drag a note to a folder and to the top-level strip, rename a parent keeps notes, performance with a generated 1,000-note vault (open, expand all, type in search, each under a stated budget).
- [ ] **Step 5: Run `npm.cmd run lint`, `npx.cmd vitest run --maxWorkers=2`, `npm.cmd run build`, `npm.cmd run test:qa` once; expect PASS (update stale cycle 11 folder-tree selectors without weakening intent).**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: one-column Notes navigation with the notes inside the tree`).

### Task 4: Responsive column, header removal and the List | Graph switch

**Files:**
- Modify: `src/components/StandaloneNotesView.tsx`, `src/components/notes/NoteNavigation.tsx`, `src/components/notes/graph/GraphView.tsx` (toolbar), `src/utils/notesPanes.ts`, the minimised-strip/drawer code from cycle 11 (reuse, retarget at the new column), plus tests for each; `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`

**Interfaces:**
- Produces: (a) **Header row removed** on desktop: the `<header aria-label="Notes view">` row is replaced by a visually hidden `h1` ("Notes"); panes start at the top. (b) `ViewSwitch` component (`src/components/notes/ViewSwitch.tsx`): small segmented `role="radiogroup"` with radios "List" and "Graph" (arrow keys, announced state), used in the navigation column's button row (the `viewSwitch` slot) and as the first control of the graph toolbar; hidden below 768px and in the phone shell. (c) **Minimised strip** (existing Minimize/Expand control): thin strip with Search (expands the column and focuses the search box), New note (creates in `currentFolder` with the default template), New folder (opens the new-folder dialog), and up to 8 top-level folder icons then "+N" (click expands the column with that folder current), all with accessible names and tooltips; the notes list is no longer shown beside the strip (it no longer exists). (d) **Narrow windows (800-1100px):** the column opens as a drawer from a "Notes" button in the editor header (replaces the "Folders" button), keeps search text and expansion while mounted, closes on opening a note or Escape, focus returns to the button. (e) **Phone (<768px):** the column is the Notes screen (same order, 44px rows, ⋯ menu per folder, no drag, no ViewSwitch), tapping a note opens the editor, Back returns to the column and restores scroll position; the note header's folder line ("Tech / Java ▾") still moves the note. (f) the Related panel overlay/strip rules from cycle 11 and `MIN_EDITOR_WIDTH` maths in `src/utils/notesPanes.ts` are updated for the single `w-72` column (and the 5-part rail width unchanged); the editor must get at least `MIN_EDITOR_WIDTH` at 1280px with defaults.
- Consumes: Task 3 `NoteNavigation` and `viewSwitch` slot; Task 1 rail.

- [ ] **Step 1: Write failing tests:** `ViewSwitch` (radiogroup roles, arrow keys, calls `onChange`, hidden below 768px); `StandaloneNotesView`: no header row (visually hidden `h1` exists), switch present in the navigation column and in the graph toolbar, switching keeps the open note; strip buttons and names and their effects; drawer opens from "Notes" at 900px, keeps state, closes on note open and Escape with focus return; phone render shows column then editor with Back; `notesEditorWidth`/layout tests updated (editor >= 480 at 1280, 1366, 1440 with defaults; Related overlay rules unchanged in behaviour).
- [ ] **Step 2: Run the focused files; expect FAIL.**
- [ ] **Step 3: Implement** the switch, header removal, strip, drawer, phone behaviour and the width maths.
- [ ] **Step 4: Add QA/UX scenarios** at 1440/1280/1100/900/390px: switch present and working in both modes (keyboard too), no extra header row (the first pane top within 12px of the page top), strip actions, drawer behaviour, phone flow with 44px rows, axe on the column/strip/drawer/switch in light and dark; update or fix stale selectors in `scripts/ux-suite.mjs` (NAV-*, NO-*) without weakening intent.
- [ ] **Step 5: Run `npm.cmd run lint`, `npx.cmd vitest run --maxWorkers=2`, `npm.cmd run build`, `npm.cmd run test:qa` once and `node scripts/ux-suite.mjs` once; expect PASS.**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: responsive Notes column, no header row, List | Graph switch in the column`).

### Task 5: Guides, screenshots, docs and final verification

**Files:**
- Modify: `docs/guide/notes.md`, `docs/guide/appearance.md`, `docs/guide/shortcuts.md` (tree keys), `README.md`, `docs/README.md`, `.ai-configs/project/*`, `site/index.html`, `scripts/capture-screenshots.mjs`
- Create: `docs/releases/cycle-12/README.md`, `docs/releases/cycle-12/images/*`

- [ ] **Step 1: Update the guide topics** (Web and Mobile parts both; the guide tests, including the per-part word cap, must still pass) for the one-column navigation, searching in place, the Settings button in the Title part, the List | Graph switch, the minimised strip, the drawer, and the phone flow; update the site and READMEs.
- [ ] **Step 2: Capture cycle-12 screenshots** with `node scripts/capture-screenshots.mjs cycle-12` from disposable sample vaults (wide desktop with the one column and Related, search filtered in place, minimised strip, narrow drawer, Graph mode toolbar with the switch, the five-part rail with the ⚙ button, phone column); open every image with the Read tool, check it shows what you claim, and reference only images you inspected.
- [ ] **Step 3: Write `docs/releases/cycle-12/README.md`** in the style of `docs/releases/cycle-11/README.md` with real verification numbers from your own runs. No version bump or release.
- [ ] **Step 4: Full verification (one at a time):** lint, helpers, `npx.cmd vitest run --maxWorkers=2`, build, `npm.cmd run build:site`, `npm.cmd run validate:ai`, QA, UX, sync e2e, PWA e2e, `npm.cmd run android:build -- --test`; record counts, fix failures rather than weakening checks, restore generated `docs/reports/ux-ui` artifacts byte-for-byte unless deliberately refreshed (say which).
- [ ] **Step 5: Hand back for the controller's commit** (`docs: cycle 12 guides, screenshots and release notes`).

---

## Self-review

- **Spec coverage:** one column and its order (Tasks 2–3), notes inside the tree, search in place, pinned, current folder, drag and drop, keyboard, windowing (Tasks 2–3); strip/drawer/phone and the switch and header removal (Task 4); 5-part rail with Settings button (Task 1); guides/screenshots/docs (Task 5).
- **Types consistent:** `NoteTreeRow`, `buildNoteTreeRows`, `defaultExpanded`, `ancestorPaths`, `noteTooltip`, `NoteNavigation` props, `viewSwitch` slot, `useTreeWindow` are named identically wherever used.
- **Order:** 1 (independent) → 2 (pure) → 3 (needs 2) → 4 (needs 3 and 1) → 5.
