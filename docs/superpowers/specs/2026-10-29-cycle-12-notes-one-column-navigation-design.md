# Cycle 12: one-column Notes navigation (design)

Date: 2026-10-29 · Status: draft for approval · Scope: Notes on desktop, narrow windows and phones. No data, sync or editor changes.

## Why

Since cycle 11, Notes has two navigation panes side by side: a folder tree and, next to it, a separate list of notes with snippets and folder labels. The user finds it not clean: two columns say the same thing twice, eat width from the editor, and make it unclear where a note "lives". They want Obsidian's model: **one column**, in this order: **search notes**, **create note**, **folder hierarchy**, with the **notes shown inside the hierarchy by their title**.

Success: the user finds and opens any note by walking one tree (or by searching it), creates a note or folder from the top of that same column, and the editor has noticeably more room.

## Approved look

Mockup approved by the user ("yess it good, need to be like this"): `.superpowers/brainstorm/10842-1793208436/content/notes-one-column.html` (desktop column; filtered-in-place search; narrow drawer and minimised strip; phone full-screen column).

## Goals

- **A.** Replace the folder-tree pane **and** the notes-list pane with one navigation column: search box, **＋ New note ▾** (templates menu) and **New folder** buttons, then a tree of folders and notes.
- **B.** Notes appear in the tree as rows showing only their title, nested under their folder; clicking a note opens it; clicking a folder expands or collapses it.
- **C.** Search filters the tree in place.
- **D.** Works at every width: wide desktop, minimised strip, narrow-window drawer, phone full-screen column.
- **E.** Reclaim wasted space in the chrome: the side menu keeps **5 parts** (Title, Today, Calendar, Notes, Backlog) with **Settings as a small ⚙ button in the Title part**; the Notes page loses its header row, and the **List | Graph switch moves into the navigation column** (and into the graph toolbar while in Graph mode).

## Non-goals

- No change to the editor, Related panel, graph, folder operations' rules, sync, storage, backups or guides' structure (guide text is updated to match).
- No sort options, multi-select, tag browser, or "recent notes" view. No bulk actions.
- No change to what a folder or note is, or to how the graph's own folder filter looks.

## Anti-goals (failure even if it "works")

- A note becomes harder to find than before (open note hidden by a search, no way to see its folder, huge folders unusable).
- The tree janks or the page freezes with 1,000+ notes (it must stay smooth).
- Folder operations (rename, move, delete, merge, Undo, drag and drop) regress or lose notes.
- Keyboard and screen-reader users lose access that the old list gave them.
- Phone rows get smaller than 44px or accidental drags move notes on touch.

## Behaviour (decided by the user's mockup, with my calls marked)

**The column, top to bottom:** search box; one row with **＋ New note ▾** (the existing split button: New note plus the templates menu) and **New folder**; then the tree.

**Tree rows.** Folder row: chevron, folder icon, name, note count, ⋯ menu (New folder inside, Rename, Move, Delete — exactly the existing actions). Note row: title only (an untitled note shows "Untitled"), indented under its folder. The open note's row is highlighted. Hover, long-press or focus shows the note's last-edited date (tooltip/title); the old snippet, folder label and checklist progress are no longer shown in the row.

My calls (please check):
- **Order inside a folder:** subfolders first, then notes, each A–Z (case-insensitive, numeric-aware, fixed locale). Notes without a folder are listed at the bottom under a quiet "Notes without a folder" heading.
- **Pinned:** pinned notes get a "Pinned" group at the very top of the tree (flat list of titles) **and** stay in their folder with a small pin icon. Unpinning removes them from the group.
- **Where a new note or folder goes:** into the **current folder**: the folder most recently clicked, defaulting to the open note's folder, defaulting to the top level. The current folder is shown with a subtle highlight; templates that name a folder still use that folder. This replaces "All notes" / "Notes (top level)" rows: the tree itself is "all notes".
- **Opening:** clicking a note opens it in the editor and expands the path to it; opening a note from elsewhere (link, Related, graph, search result, a new note) expands and scrolls the tree to it.
- **Search:** typing filters the tree in place: only folders that contain matches and the matching notes remain, all expanded; the match text in titles is highlighted; a note that matched only in its body shows a one-line snippet after the title; a status line says "N notes match" (polite live region); clearing the search restores the previous expansion. The search covers title, body and tags as today. The open note stays reachable: if it doesn't match it is shown dimmed at its place so it never disappears under the user.
- **Expansion state** (which folders are open) is remembered per device; the first run expands the path to the open note and the top level only.
- **Drag and drop (desktop):** a note row can be dropped on a folder row to move it; folder rows keep their existing drag behaviour; every drag has the existing non-drag path (Move dialog / "Move to folder"). Touch devices never start drags from rows.
- **Keyboard:** the column is one tree widget: Up/Down move, Right expands or enters a folder, Left collapses or goes to the parent, Enter opens a note or toggles a folder, Home/End jump; Tab leaves the tree. Names and roles for assistive tech: treeitem, level, expanded state, "N notes" in folder names.
- **Large vaults:** render only the visible window of rows once the visible tree has more than 400 rows (virtualised), keeping keyboard navigation and "N notes match" announcements correct.

**Widths** (the cycle 11 pane rules still apply to the rail, editor minimum width and Related panel):
- Wide: the column is about 288px, one column; the editor takes the width of the old tree plus list panes.
- **Minimised** (the existing Minimize/Expand control): a thin strip with icons for Search, New note, New folder and a few folder icons.
- Narrow windows (800–1100px): the column opens as a drawer from a "Notes" button in the editor header (replacing the "Folders" button); it closes on selecting a note, and Escape closes it, focus returns to the button.
- **Phone (<768px):** the column is the Notes screen (same order, 44px rows, ⋯ menu per folder); tapping a note opens it full screen; Back returns to the column; the folder line in the note header still moves it.

**Graph:** the List | Graph switch stays in the note header; the graph filter keeps its own folder tree.

## Additions after the user's feedback (approved direction; my picks marked)

- **Side menu:** 5 equal parts: Title, Today, Calendar, Notes, Backlog. The Title part gains a small **⚙ Settings** button next to Search (below the date and sync status; keeps the accessible name "Settings" and opens the same Settings dialog). The old sixth "Settings" part is removed. Applies to the rail in both its expanded and minimised forms (minimised: the ⚙ icon stays reachable). Phones are unchanged (bottom bar already has Settings).
- **No root row, no root heading:** the tree has no "Notes", "All notes" or "Notes (top level)" row and no "Notes without a folder" heading. Top-level folders are the first level; notes that have no folder are listed directly after the top-level folders, with no label, like Obsidian. While a drag is active a slim "Move to top level" drop strip appears at the bottom of the tree (the non-drag Move paths still cover it).
- **Notes page header removed:** the row above the panes that held the page title and the List | Graph switch is gone on desktop; the navigation column, editor and Related panel start at the top of the page. (The page still has an `h1` for assistive tech, visually hidden.)
- **List | Graph switch (my pick, option A of the mockup):** a small segmented switch in the navigation column's button row, next to New note and New folder, always visible (also when Related is minimised). In Graph mode the navigation column is replaced by the graph filters, so the same segmented switch sits first in the graph toolbar to return to List. Not shown on phones or below 768px (no graph there). Keyboard: both switches are a labelled radio group (arrow keys), the state is announced.

## Constraints

- Notes stay plain Markdown; unedited notes are never re-serialised; building or rendering the tree never saves anything.
- Stone palette only; desktop content keeps `max-w-[1800px]`; types from `src/types/daymark.ts`.
- All existing folder operations, Undo guards, drawers and QA/UX behaviours must keep working; existing tests that assert the two-pane layout are updated to the one column, not weakened.
- Release 1.9.0 (minor), same release process as 1.8.0.

## Calls made after the builder check (mine; please check)

- **Current folder:** it changes when you click a folder row or open a note by any route (tree, link, Related, graph, search, new note); it becomes that folder / that note's folder. New note and New folder land in the current folder; with nothing opened yet they go to the top level.
- **Drag and drop targets:** a note can be dropped on a folder row, or on the "Notes without a folder" heading (which is the top-level drop zone, shown even when empty while a drag is active); not on the "Pinned" group. The non-drag paths (Move to folder picker, folder Move dialog) cover every destination including the top level.
- **Minimised strip and drawer:** the strip's Search icon expands the column and focuses the search box; its New note icon creates a note in the current folder with the default template; New folder opens the new-folder dialog; folder icons are the top-level folders (at most 8, then "+N") and open the expanded column with that folder current. The narrow-window drawer keeps its search text and expanded folders while the Notes page stays mounted, and closes on selecting a note or Escape.
- **Search details:** matching is exactly the existing search (title, body and tags, case-insensitive); only highlighting and snippets are new. A body-only match shows one snippet around its first match (about 60 characters each side). The dimmed open note keeps its ancestors expanded and is not counted in "N notes match".
- **Pinned and counts:** the Pinned group is hidden while searching (matches show in the tree with their pin icon); a pinned note is counted once in folder counts and once in "N notes match"; the Pinned group is A–Z (there is no pin time).
- **Empty states kept:** "No notes yet. Create a note." when the vault is empty, and "No notes match “…”" when a search finds nothing. Tests that assert the two-pane layout are rewritten for one column; behaviour tests (folder operations, Undo, pinning, search, wiki links, focus mode, Related and graph integration) are kept. Note order changes from "pinned then most recently edited" to A–Z inside folders on purpose.

## Left to the builder

The pure tree-model module and its row types; virtualisation technique; exact tooltip/long-press mechanics; where the expansion state is stored (per-device preference like the pane prefs); test plan, including QA at 1440/1280/1100/900/390px, keyboard-only paths, a 1,000-note performance check, and axe in light and dark.

## Risks to plan for first

1. Replacing two panes touches `StandaloneNotesView.tsx` (already large), `NoteFolderTree.tsx` and many QA/UX selectors; extract the list/tree logic instead of growing the view further.
2. Behaviour that lived only in the old list: pinned ordering, checklist badge, keyboard access, "no notes match" empty state, the Folders drawer; each must have a deliberate home or be consciously dropped (checklist badge and snippets are dropped except body-match snippets in search).
3. Virtualised rows vs. keyboard navigation and screen readers.
