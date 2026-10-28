# Cycle 11: Nested Note Folders, Related Notes and Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Daymark 1.8.0 notes organisation: nested folders with a tree, a Related panel with on-device suggestions that write `[[links]]` into notes, and a desktop knowledge graph filtered by the folder hierarchy.

**Architecture:** A folder is a `/`-separated path stored in each note's existing `folder` string; empty folders and dismissed suggestions live in one new synced record (`notemeta`, feature-flagged like habits and backlog). A pure engine tokenises notes and scores relatedness on the device. The graph is a lazy-loaded canvas view fed by pure graph-building and layout modules. Panes (tree, Related, graph panels) minimise and become drawers on narrow windows; phones get the tree as expandable rows and Related as a bottom sheet.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (stone palette), TipTap 3 (existing editor), vitest, node:test helpers, Express sync server, Playwright QA scripts. Graph: canvas 2D with either a small dependency (e.g. `d3-force`) or a hand-written layout; the choice is the builder's but must be lazy-loaded and its size reported.

**Spec:** `docs/superpowers/specs/2026-10-28-cycle-11-note-folders-and-graph-design.md` (includes the approved mockup decisions and the "Calls made after the builder check").

## Global Constraints

- Tailwind v4 stone palette only (`stone-50`..`stone-950`); desktop content keeps `max-w-[1800px]`.
- Types come from `src/types/daymark.ts`; notes stay plain Markdown; an unedited note is never re-serialised (cycle 9 rule); the daily Markdown format is untouched.
- Local-first, offline, no new network calls, no AI/cloud similarity.
- 1.7.0 clients keep working against a 1.8.0 server: the feature flag gates only the new `notemeta` record; note entities keep their shape; a path like `Tech/Java` shows as one flat folder name on old clients.
- All touch targets on phones are at least 44px; the phone layout (below 768px) has no graph.
- Verification commands: `npm.cmd run lint`, `npx.cmd vitest run --maxWorkers=2`, `npm.cmd run test:helpers`, `npm.cmd run build`, `npm.cmd run test:qa`, UX suite (`scripts/ux-suite.mjs`), `npm.cmd run test:sync` (after a build), `npm.cmd run test:e2e`, `npm.cmd run validate:ai`, `npm.cmd run android:build -- --test`.
- Release is out of scope for this plan (1.8.0 is cut in a separate request). Commits are made by the controller; the implementer's sandbox cannot write `.git`. All commits: author `dngioidev <172118255+dngioidev@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, no Claude-Session line.

## Review Focus

1. **Folder rename/move/delete must never lose or duplicate a note**, including onto an existing path (case-insensitive merge), into its own descendant (refused), and deleting a folder that has notes (notes move to the parent). Pinned in Task 1.
2. **Suggestion noise:** common words, one-word coincidences, already-linked and dismissed pairs, notes with empty bodies, and non-English text (Vietnamese with accents). Pinned by a labelled fixture in Task 5.
3. **Link writing must not corrupt or reformat a note:** link already present, existing `## Related` section with other content, a note ending without a newline, a note open in the editor mid-edit. Pinned in Tasks 5 and 6.
4. **Graph at scale:** 1,000 notes lay out within a time budget, the filter on a parent folder includes subfolders, hidden notes drop their edges, and the keyboard list view covers every visible dot. Pinned in Task 7.
5. **Sync:** two devices renaming the same folder, a dismissal on one device appearing on the other, old-server fallback, damaged-storage safeguard (never pushed as deletion). Pinned in Tasks 2 and 3.

---

### Task 1: Folder path model and operations (pure logic)

**Files:**
- Modify: `src/types/daymark.ts` (add `NoteFolder`, `DismissedPair`, `NoteMeta`, `EMPTY_NOTE_META`)
- Create: `src/utils/noteFolders.ts`, `src/utils/noteFolders.test.ts`

**Interfaces:**
- Types: `NoteFolder { path: string; updatedAt: string; removed?: boolean }`; `DismissedPair { key: string; at: string; restored?: boolean }` (`key` is the two note ids sorted and joined by `|`); `NoteMeta { folders: NoteFolder[]; dismissed: DismissedPair[] }`.
- Produces in `noteFolders.ts`:
  - `normalizeFolderPath(input: string): string` (split on `/`, trim each part, drop empties, rejoin; `''` = top level)
  - `FolderNode { path: string; name: string; ownCount: number; totalCount: number; children: FolderNode[] }` and `buildFolderTree(notes: StandaloneNote[], meta: NoteMeta): FolderNode[]` (ancestors of every note path plus live meta folders; siblings sorted case-insensitively; first-seen spelling of a path wins; `removed` folders omitted unless a note still lives there)
  - `createFolder(meta, path, nowIso): NoteMeta`
  - `renameFolder(notes, meta, fromPath, toPath, nowIso): { notes: StandaloneNote[]; meta: NoteMeta } | null` (rewrites the path prefix of every note and meta folder under `fromPath`; target existing case-insensitively = merge; `null` if `toPath` is inside `fromPath` or equal ignoring case and spelling)
  - `moveFolder(notes, meta, path, newParentPath, nowIso)` (same result type; implemented via `renameFolder`)
  - `deleteFolder(notes, meta, path, nowIso)` (notes under it move to the parent; the folder and descendants are marked `removed`)
  - `moveNote(notes, noteId, folderPath, nowIso): StandaloneNote[]` (sets `folder` and `updatedAt` on that note only)
  - `exportFolderPath(notes: StandaloneNote[]): Map<string, string>` (note id → directory path for the ZIP, case-only differences collapsed to the first spelling, characters illegal in file names replaced)
  - `folderMatches(note: StandaloneNote, selectedPath: string): boolean` (note is in the path or any subfolder)

- [ ] **Step 1: Write failing tests:** normalisation cases (`" Tech / Java "`, `"//a//b/"`, `""`); tree from flat legacy folders (`General`, `Work`) keeps them top-level with counts; nested counts roll up; empty meta folder appears; rename `Tech` to `Dev` rewrites `Tech/Java/x` notes and meta folders; rename onto an existing `dev` merges without duplicating notes; rename into own descendant returns null; move folder under another; delete folder moves notes to parent and marks `removed`; delete top-level folder moves notes to top level (`''`); `moveNote` touches only that note; `exportFolderPath` collapses `Tech` and `tech` and replaces `:` `?` `*`; `folderMatches` includes subfolders, excludes `Techno`.
- [ ] **Step 2: Run `npx.cmd vitest run src/utils/noteFolders.test.ts`; expect FAIL.**
- [ ] **Step 3: Implement** types and functions above (immutable; deterministic `nowIso` passed in).
- [ ] **Step 4: Run the test plus `npm.cmd run lint`; expect PASS.**
- [ ] **Step 5: Hand back for the controller's commit** (`feat: nested note folder model`).

### Task 2: NoteMeta storage, validation, backups and export

**Files:**
- Modify: `src/utils/vaultStore.ts`, `src/utils/vaultValidation.ts`, `src/utils/vaultArchive.ts` (+ their tests)

**Interfaces:**
- Produces: `isNoteFolder`, `isDismissedPair`, `isNoteMeta` in `vaultValidation.ts`; `KEYS.NOTE_META = 'notemeta'` (legacy local name `daymark_notemeta_v1`); `loadNoteMeta(): NoteMeta`, `saveNoteMeta(meta: NoteMeta): void`; `SharedKey` gains `'notemeta'` with cross-tab refresh; vault reset clears it; JSON/ZIP backups include `notemeta` and restore it through `mergeRestoredNoteMeta(current, restored?)` (missing/invalid keeps current; explicit empty replaces); the ZIP export writes notes into directories from `exportFolderPath` (so `Notes/Tech/Java/<title>.md`). Damaged stored data is kept as-is, never overwritten by an empty save, and not pushed (mirror `loadBacklog`/`uneditedRecoveredBacklog`).
- Consumes: Task 1 types.

- [ ] **Step 1: Failing tests** mirroring the backlog storage tests (validation accept/reject; empty load; damaged storage kept and not saved; peer refresh; reset/wipe; JSON round trip; old backup keeps current; ZIP has nested directories and case-collapsed names).
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement. Step 4: Run `npx.cmd vitest run src/utils` and lint; expect PASS.**
- [ ] **Step 5: Hand back for the controller's commit** (`feat: store, back up and export note folders`).

### Task 3: NoteMeta sync (client, server, feature flag, fallback)

**Files:**
- Modify: `src/sync/merge.ts`, `src/sync/protocol.ts`, `src/sync/syncClient.ts`, `src/hooks/useSync.ts`, `server/app.ts`, `src/App.tsx` (wiring only) (+ tests); `scripts/e2e-sync.mjs`

**Interfaces:**
- Produces: `mergeNoteMeta(base, ours, theirs): MergeResult<NoteMeta>` (folders merged by path case-insensitively, newest `updatedAt` wins, a `removed` folder stays removed only if its record is newer; dismissed pairs merged by `key`, newest `at`/`restored` wins; missing items are retained; whole-entity delete honoured only when the other side is unchanged); `isNoteMetaEntityKey(key) => key === 'notemeta'`; `VaultData.notemeta: NoteMeta`; `SyncState.notemetaSynced?: boolean`; request `features: ['habits','backlog','notemeta']`; the server returns/accepts `notemeta` only when the feature is present; the client falls back (session-only) on `Invalid entity key`, extending the existing `unsupported` set so habits and backlog behaviour is unchanged; first sync after upgrade uses `sinceRev: 0` until `notemetaSynced`; damaged-storage recovery drops only the `notemeta` base and sets `notemetaSynced=false`, and never pushes the entity while it is in the "unedited recovered" set.
- Consumes: Tasks 1–2.

- [ ] **Step 1: Failing tests:** merge cases (both add folders; rename on both sides settles on the newest; dismissal on one device reaches the other; restore wins over older dismissal); client entity round trip and change collection; 1.6/1.7-style server rejecting `notemeta` → retry without it, other entities intact; server never returns `notemeta` without the feature; damaged recovery resets bookkeeping.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement.**
- [ ] **Step 4: Extend `scripts/e2e-sync.mjs`:** device A creates `Tech/Java` and an empty folder and dismisses a suggestion pair; device B shows them; both rename the same folder differently, sync, and end identical with no note lost.
- [ ] **Step 5: Run `npx.cmd vitest run`, `npm.cmd run build`, `npm.cmd run test:sync`; expect PASS.**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: sync note folders and dismissed suggestions`).

### Task 4: Folder tree UI, folder operations and responsive panes

**Files:**
- Create: `src/components/notes/NoteFolderTree.tsx` (desktop tree and phone rows), `src/components/notes/FolderDialogs.tsx` (New / Rename / Move / Delete), `src/components/notes/FolderPicker.tsx`, `src/utils/notesPanes.ts` (+ tests for each)
- Modify: `src/components/StandaloneNotesView.tsx`, `src/App.tsx` (notes meta state and handlers), `src/types/daymark.ts` (pane preference types if needed)

**Interfaces:**
- Produces: `NoteFolderTree` props `{ tree: FolderNode[]; selectedPath: string | 'all'; onSelect(path: string | 'all'): void; onFolderAction(action: 'new' | 'rename' | 'move' | 'delete', path: string): void; onDropNote?(noteId: string, path: string): void; onDropFolder?(path: string, newParentPath: string): void; compact?: boolean; minimized?: boolean }`; `FolderPicker` props `{ tree; value: string; onChange(path: string): void }` (replaces the note header "Folder" `<select>`; shows "Tech / Java ▾"); `notesPanes.ts`: `loadPanePrefs(): { tree: 'open' | 'min'; related: 'open' | 'min' }`, `savePanePrefs(prefs)`, `paneMode(width: number): 'full' | 'compactRelated' | 'drawers'` (`>=1280` full, `>=1100` compactRelated = Related starts minimized, `>=800` drawers; the tree is never hidden at >=1100). Both prefs are per device and safe when storage fails (mirror `railPreference`).
- Behaviour: tree rows expand/collapse with counts; selecting a folder filters the list (subfolders included via `folderMatches`); the filter chips are replaced by the tree; new notes are created in the selected folder; drag a note or folder onto a folder on desktop (keyboard-accessible Move dialog is the non-drag path); phone: rows are at least 44px, a ⋯ menu per folder uses the existing `Menu` sheet; Delete asks for confirmation and says where notes go; Rename/Move onto an existing path asks for confirmation to merge; all operations go through Task 1 functions, call `onUpdateNotes` once, and offer Undo via the existing toast pattern. `createFolder` in `StandaloneNotesView` (currently creates an "overview" note) becomes a real empty folder. Tree minimise button collapses it to a thin strip of folder icons (tooltips and accessible names); drawers at narrow widths open from a "Folders" button in the editor header and close on selection/Escape with focus returned.

- [ ] **Step 1: Failing tests:** `paneMode` thresholds; pane prefs persistence and storage-failure safety; `NoteFolderTree` static render (nested rows, counts, selected state, minimised strip with accessible names, compact rows); `FolderDialogs` messages for merge/delete; `StandaloneNotesView` renders the tree instead of chips, selecting a parent includes subfolder notes, the header shows the folder picker, `New folder` creates an empty folder without a note.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement** components and wire into `StandaloneNotesView` (keep search, tags, templates, pinned ordering).
- [ ] **Step 4: Add QA scenarios** (`scripts/e2e-qa-regressions.mjs`): create nested folders, move a note by the picker and by drag, rename a parent and see children follow, delete a folder with notes, merge on collision; widths 1440, 1200, 900 and 390 (no overlap, tree reachable, drawers work, 44px rows on phone); persisted minimise survives reload.
- [ ] **Step 5: Run `npx.cmd vitest run`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:qa`; expect PASS.**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: folder tree, folder operations and responsive notes panes`).

### Task 5: Relatedness engine (pure)

**Files:**
- Create: `src/utils/noteRelated.ts`, `src/utils/noteRelated.test.ts`, `src/utils/fixtures/relatedNotes.ts` (labelled fixture)

**Interfaces:**
- Produces:
  - `extractWikiTargets(markdown: string): string[]` (titles from `[[Title]]`, `[[Title|alias]]`, `[[Title#heading]]`; ignores code blocks)
  - `tokenize(text: string): string[]` (Unicode-aware, lowercase, accent-insensitive via NFD stripping, drops tokens shorter than 3 chars, digits-only tokens and a small English stop-word list)
  - `NoteIndex` and `buildNoteIndex(notes: StandaloneNote[]): NoteIndex` (per-note term weights from title ×3, tags ×2, body ×1; IDF across the vault; resolved link graph by case-insensitive title; backlinks)
  - `linksOf(index: NoteIndex, noteId: string): { outgoing: string[]; incoming: string[] }`
  - `RelatedSuggestion { noteId: string; score: number; sharedTerms: string[] }`
  - `suggestRelated(index: NoteIndex, noteId: string, opts?: { dismissed?: Set<string>; limit?: number /* default 5 */ }): RelatedSuggestion[]` (cosine-style score plus bonuses for shared tags, a common link target, and one note's title appearing in the other's text; excludes the note itself, already-linked pairs in either direction and dismissed `pairKey`s; needs at least two shared meaningful terms or one shared title term; sorted by score then title)
  - `pairKey(a: string, b: string): string` (sorted ids joined by `|`)
  - `addRelatedLink(markdown: string, title: string): string` (appends `- [[Title]]` under the last `## Related` heading, creating it at the end if missing; no-op if already linked in that section; keeps every other byte; ensures a single trailing newline)
- Numeric weights/thresholds are the builder's, tuned against the fixture.

- [ ] **Step 1: Failing tests:** `extractWikiTargets` forms; `tokenize` accents (`"Lập trình Java"` → includes `lap`, `trinh`, `java`), stop words, short tokens; fixture of about 20 notes (Java basics, Java 21 news, Streams, SQL indexes, Joins, cooking, travel; some Vietnamese) with labelled pairs: related pairs appear in each other's top 5 with sensible `sharedTerms`, unrelated pairs never appear, an empty-body note yields none, linked pairs and dismissed pairs are excluded; `addRelatedLink` cases (no section, existing section with other items, already present, no trailing newline, a `## Related` heading earlier plus a different later section, CRLF); `suggestRelated` is deterministic.
- [ ] **Step 2: Run `npx.cmd vitest run src/utils/noteRelated.test.ts`; expect FAIL. Step 3: Implement. Step 4: Run with lint; expect PASS. Also record a timing for `buildNoteIndex` on 1,000 generated notes (must be under 1 s in the test environment).**
- [ ] **Step 5: Hand back for the controller's commit** (`feat: on-device related note suggestions`).

### Task 6: Related panel, Link/Not related and phone sheet

**Files:**
- Create: `src/components/notes/RelatedPanel.tsx`, `src/components/notes/RelatedSheet.tsx` (phone), `src/hooks/useRelatedNotes.ts` (+ tests)
- Modify: `src/components/StandaloneNotesView.tsx`, `src/components/notes/RichNoteEditor.tsx` (handle method), `src/App.tsx` (dismissal handlers using `NoteMeta`)

**Interfaces:**
- Produces: `RichNoteEditorHandle.appendRelatedLink(title: string): void` (applies `addRelatedLink` semantics through one editor transaction so it is a single Undo step and flows through the normal autosave; when the note is not open the caller uses `addRelatedLink` on the Markdown directly and updates the note via `updateActive`-style save); `useRelatedNotes(notes, noteId, dismissed): { suggestions: RelatedSuggestion[]; linked: { outgoing: StandaloneNote[]; incoming: StandaloneNote[] }; hidden: ... }` (index rebuilt in an idle callback / debounced about 800 ms after edits, never blocking typing); `RelatedPanel` props `{ suggestions; linked; hidden; onLink(noteId: string): void; onDismiss(noteId: string): void; onRestore(noteId: string): void; onOpen(noteId: string): void; minimized: boolean; onToggleMinimized(): void }` (desktop side panel; minimised strip shows a badge with the suggestion count; drawer mode from `paneMode`); `RelatedSheet` is the phone bottom sheet opened from a "Related · N" button in the note header, using the existing `Dialog` sheet variant, 44px targets.
- Behaviour: **Link** adds the link to the open note only (the other note shows it under Linked as an incoming link); a linked suggestion disappears from Suggested; **Not related** stores a `DismissedPair` through `saveNoteMeta` (syncs); the panel's "Hidden suggestions" list restores a pair (`restored: true`); an unedited note is never rewritten merely by opening the panel; Link on a note currently in Markdown view edits the textarea content.

- [ ] **Step 1: Failing tests:** `useRelatedNotes` returns suggestions and updates after the debounce, excludes dismissed/linked; `RelatedPanel` static render (suggestion with shared terms and both buttons, linked list, hidden list, minimised badge); `RelatedSheet` render; editor handle test: after `appendRelatedLink` the Markdown ends with the `## Related` list and one Undo step removes it; opening a note and the panel does not call `onChange`.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement** panel, sheet, hook, handle method and wiring (desktop pane in `StandaloneNotesView`, drawer under 1100px, sheet on phones).
- [ ] **Step 4: Add QA scenarios:** write two Java notes, see the suggestion with shared words, Link writes the line into the note, the other note lists the backlink, Not related hides it and a reload keeps it hidden, restore brings it back; phone sheet at 390px; panel minimise state persists.
- [ ] **Step 5: Run `npx.cmd vitest run`, lint, build, `npm.cmd run test:qa`; expect PASS.**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: related notes panel with link and dismiss`).

### Task 7: Knowledge graph (desktop)

**Files:**
- Create: `src/utils/graphData.ts`, `src/utils/graphLayout.ts`, `src/components/notes/graph/GraphView.tsx`, `GraphFilters.tsx`, `GraphDetail.tsx`, `GraphList.tsx` (+ tests for each)
- Modify: `src/components/StandaloneNotesView.tsx` (List | Graph switch, lazy import of `GraphView`), `package.json` (only if a layout library is chosen)

**Interfaces:**
- Produces in `graphData.ts`:
  - `GraphNode { id: string; title: string; folder: string; tags: string[]; degree: number }`, `GraphEdge { a: string; b: string; kind: 'link' | 'tag' | 'suggested'; terms?: string[] }`
  - `GraphOptions { folderPaths: string[] | null /* null = all */; tag?: string; showTags: boolean; showSuggestions: boolean; showOrphans: boolean; local?: { noteId: string; depth: number }; query?: string }`
  - `buildGraph(notes: StandaloneNote[], index: NoteIndex, dismissed: Set<string>, options: GraphOptions): { nodes: GraphNode[]; edges: GraphEdge[]; matches: Set<string> }` (folder filter uses `folderMatches` so a parent includes subfolders; edges to hidden notes are dropped; `tag` edges only between notes sharing a tag, capped per tag to avoid hairballs (builder chooses the cap, e.g. connect each tag's notes to a hub); `suggested` edges from `suggestRelated` for each visible note, deduplicated per pair; orphans (degree 0) removed unless `showOrphans`; `local` keeps the note and neighbours up to `depth`)
  - `defaultGraphScope(noteCount: number, selectedFolder: string | 'all'): { folderPaths: string[] | null; showOrphans: boolean }` (<=300 notes: whole vault; above: the selected folder and orphans hidden)
- `graphLayout.ts`: `createLayout(nodes: GraphNode[], edges: GraphEdge[], seed?: number)` returning `{ positions: Map<string, {x: number; y: number}>; step(alpha?: number): number /* energy */; settle(maxTicks?: number): void }`, deterministic for a seed, using Barnes-Hut or a grid to stay near O(n log n); 1,000 nodes settle within the test time budget.
- `GraphView` props `{ notes; index; dismissed; folderTree: FolderNode[]; selectedFolder: string | 'all'; activeNoteId?: string; onOpenNote(id: string): void; onLink(fromId: string, toId: string): void; onDismiss(a: string, b: string): void }`: canvas 2D drawing with pan (drag), zoom (wheel/pinch buttons), hover highlighting of neighbours, click a dot to select it (detail panel) and a button/double-click to open; click a dashed line to Link or dismiss; labels thinned by zoom level; theme colours from CSS variables in light/dark/photo modes; selected dot large amber; solid links, faint tag lines, dashed amber suggestions; `prefers-reduced-motion` renders a settled static layout. `GraphFilters` (left panel): folder tree with tri-state checkboxes (parent includes subfolders), tag select, toggles (Suggestions, Tag lines, Orphans), Whole vault | Local (2 steps), search box (matches highlight); `GraphDetail` (right panel): selected note, Open note, its suggestions with Link / Not related, its linked notes; both panels minimise (reuse pane prefs). `GraphList` is the accessible alternative: a keyboard-navigable list of the same visible nodes with their connections, reachable by a "List view" toggle and always in the DOM for screen readers.
- Phone/compact: the List | Graph switch is hidden below 768px.

- [ ] **Step 1: Failing tests:** `buildGraph` (folder parent includes subfolders; edges to hidden notes dropped; orphans toggle; tag edges toggle; suggestions toggle excludes dismissed; local depth 1 and 2; query matches); `defaultGraphScope` at 300 and 301; `createLayout` determinism for a seed, no NaN, connected nodes end closer than unconnected on a fixture, and 1,000 nodes / 2,000 edges settle within the time budget (state the budget in the test and keep it generous for CI); static renders of `GraphFilters`, `GraphDetail`, `GraphList`; `GraphView` mounts with a stubbed canvas context without throwing and exposes the List view.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement** modules and lazy-load `GraphView` (its chunk must not enter the main bundle; record the chunk size).
- [ ] **Step 4: Add QA scenarios:** switch to Graph, filter to one folder (subfolders included), a suggested dashed edge accepted writes the link and turns solid, dismissal hides it, Local view, panels minimise, 1,000-note vault stays responsive (frame budget or interaction time check), keyboard path through the List view, dark mode and a photo background readable; the switch is absent at 390px.
- [ ] **Step 5: Run `npx.cmd vitest run`, lint, build, `npm.cmd run test:qa`, UX suite; expect PASS.**
- [ ] **Step 6: Hand back for the controller's commit** (`feat: knowledge graph with folder filter`).

### Task 8: Guides, regression coverage, screenshots and docs

**Files:**
- Modify: `docs/guide/*.md` (Notes topic gains folders, Related, Graph; Shortcuts and gestures; Sync/Backups mention folders), `scripts/e2e-qa-regressions.mjs`, `scripts/ux-suite.mjs`, `scripts/capture-screenshots.mjs`, `README.md`, `docs/README.md`, `.ai-configs/project/*` (module map), `site/index.html` (feature cards and screenshots)
- Create: `docs/releases/cycle-11/README.md`, `docs/releases/cycle-11/images/*`

- [ ] **Step 1: Update the guide topics** (Web and Mobile parts both) for nested folders, the Related panel (Link / Not related), the graph and its filter, and minimising panes; the guide test (every topic has both parts) must still pass.
- [ ] **Step 2: Fill coverage gaps** in QA/UX: ZIP export of nested folders opens with the same directories; the Help tab shows the new text; no-JS/keyboard paths; axe checks on the tree, Related panel and graph panels in light and dark.
- [ ] **Step 3: Capture cycle-11 screenshots** from disposable sample vaults (expanded three-pane Notes, minimised panes, narrow drawers, graph with folder filter, Related panel, phone folder list and Related sheet) and write the release README using only captured images; update the website feature cards.
- [ ] **Step 4: Update docs and run `npm.cmd run validate:ai`.**
- [ ] **Step 5: Full verification:** lint, full unit suite, helpers, build, QA, UX, sync e2e, PWA e2e, `npm.cmd run android:build -- --test`; all must pass; record counts in the release README. No release is cut here.
- [ ] **Step 6: Hand back for the controller's commit** (`docs: cycle 11 QA, screenshots and release notes`).

---

## Self-review

- **Spec coverage:** A nested folders (Tasks 1–4), B Related panel (Tasks 5–6), C graph (Task 7), UI decisions from mockups (Tasks 4, 6, 7), sync/flag/old clients (Tasks 2–3), guides/screenshots/docs (Task 8).
- **Types consistent:** `NoteFolder`, `DismissedPair`, `NoteMeta`, `FolderNode`, `NoteIndex`, `RelatedSuggestion`, `GraphNode/GraphEdge/GraphOptions`, `pairKey`, `folderMatches`, `paneMode` are named identically wherever used.
- **Order:** 1 → 2 → 3 (data) → 4 (tree and panes; defines `paneMode` and pane prefs used by 6 and 7) → 5 (engine) → 6 (panel) → 7 (graph needs 1, 4, 5, 6) → 8.
