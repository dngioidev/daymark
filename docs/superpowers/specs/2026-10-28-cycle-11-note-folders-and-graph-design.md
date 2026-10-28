# Cycle 11: nested note folders, related-note suggestions and a knowledge graph (design)

Date: 2026-10-28 · Status: draft for approval · Scope: Notes on web/desktop, phone-sized web and the Android app (graph is desktop only), plus the guide pages.

## Why

The user keeps learning notes over time (e.g. "I learned about Java today", and weeks later another note about Java). Those notes should connect, but nothing connects them unless the user remembers to type a `[[link]]`. Notes also sit in flat one-word folders, so a growing vault cannot be organised like Obsidian's folder tree.

Success: after writing the second Java note, Daymark offers the first one as a related note, one click links them, and a graph of the vault shows the cluster, filterable by folder. Notes live in a real folder hierarchy.

## Goals

- **A. Nested folders** like Obsidian: a folder tree, folders inside folders, empty folders, moving and renaming.
- **B. Related panel:** beside the open note, suggestions of related notes with the shared words, plus the notes that already link to or from it. Works on desktop and on phones.
- **C. Knowledge graph (desktop only):** all notes as dots joined by links; suggestions shown as dashed lines; filter by the folder hierarchy.

## Non-goals

- No AI, embeddings, cloud calls or telemetry: suggestions are computed on the device from the user's own text.
- No graph on phones (the Related panel is the phone experience).
- No automatic writing of links: nothing changes in a note unless the user presses Link.
- No whiteboard/canvas, timelines, or graph of tasks, habits or daily notes (standalone Notes only).
- No multi-vault, plugins, or Obsidian import/export changes beyond folder paths in the ZIP.

## Anti-goals (failure even if it "works")

- Suggestions are noise: common words ("the", "and", "note"), or everything related to everything.
- The graph is an unreadable hairball at a few hundred notes, or janks while moving.
- A note is rewritten, reformatted or loses content when a link is added; unedited notes are rewritten at all.
- Folder rename/move loses or duplicates notes, or two devices end up with notes in different folders for the same path after sync.
- A 1.7.0 client breaks or loses data when syncing with a 1.8.0 server or a device using folder paths.
- Dismissed suggestions come back, or suggestions keep appearing for notes already linked.

## A. Nested folders

Decided with the user: folders stay as a hierarchy like Obsidian.

Decided by me (please check):

- A folder is a **path** of names separated by `/` (e.g. `Tech/Java`). A note's existing `folder` string becomes its path, so existing flat folders are just top-level folders and nothing needs migrating. An empty path is the top level (shown as "Notes"). Names are trimmed; `/` cannot appear in a name; names compare case-insensitively when checking for an existing folder.
- Notes sidebar becomes a **tree**: expandable folders with note counts, notes under their folder, a "New folder" action (inside the selected folder), and rename/delete for folders. The existing search, tag and template behaviour stays.
- **Empty folders exist** (a folder can be created before any note is in it); they are stored as a synced list of folder paths.
- **Moving:** a note moves to another folder from its folder field (a tree picker) or by drag and drop on desktop; a whole folder moves the same way. **Renaming a folder** rewrites the path prefix of every note under it. **Deleting a folder** asks first and, if it has notes, moves them to its parent folder (never deletes notes).
- Old clients (1.7.0 and earlier) show a path like `Tech/Java` as one flat folder name; they keep working and never lose the note.
- Folders appear in the ZIP export as real directories under `Notes/`.

## B. Related panel

Decided with the user: a "Related" panel beside the note with Link and Not related per suggestion; Link writes the link into the note; phone gets the panel.

- For the open note the panel shows: **Linked** (notes it links to and notes that link to it), and **Suggested** (up to 5 notes that look related), each suggestion showing the shared words (e.g. "shares: Java, stream").
- **Link** adds `- [[Other note]]` under a `## Related` heading at the end of the note (heading created if missing; nothing duplicated if already linked; the note's other content untouched). The other note shows the connection as a backlink. **Not related** hides that pair permanently (both directions) until the user restores it from a "Hidden suggestions" list in the panel.
- **Desktop:** a collapsible side panel in Notes next to the editor. **Phone:** a "Related" section reachable from the note (button or sheet), with the same actions and 44px targets.
- Suggestions update shortly after the user stops typing and never block typing.

Decided by me:

- **How relatedness is computed:** on-device text similarity (TF-IDF style) over each note's title (weighted higher), body text and tags, plus a bonus for shared tags and for sharing a link target. Tokens are Unicode-aware (works for English and Vietnamese, ignores accents when comparing), lowercase, short words and very common words dropped (a small stop-word list plus frequency across the vault). A suggestion needs a minimum score and at least two shared meaningful terms, or one shared title term. Already-linked and dismissed pairs are excluded. The scoring is deterministic and unit-tested; tuning numbers are the builder's.
- Dismissed pairs sync between devices (stored with the folder list as a small synced record).

## C. Knowledge graph (desktop)

Decided with the user: a whole-vault graph like Obsidian, with a filter by the folder hierarchy, and suggested connections shown so they can be accepted or dismissed.

- Opened from Notes with a **List | Graph** switch (the six-part side menu is unchanged).
- Each note is a dot (size by number of connections); **solid lines** = `[[links]]`, **lighter lines** = shared tags, **dashed lines** = suggestions. Click a dot to open that note; hover highlights its neighbours; click a dashed line to Link or dismiss it.
- **Folder filter:** the same folder tree with checkboxes (checking a folder includes its subfolders); only checked folders' notes are drawn, and connections to hidden notes are dropped. Also: tag filter, search that highlights, a toggle to hide orphans, a toggle for suggestions and for tag lines, and "Local graph" (the open note and its neighbours up to 2 steps).
- Pan and zoom; layout is force-directed and settles quickly; it stays smooth with at least 1,000 notes (the builder may cap drawn labels by zoom level). Colours follow the app theme in light, dark and photo modes and meet contrast rules; every dot is also reachable by keyboard through a list view of the same data.
- Reduced-motion users get a static layout.

## Constraints

- Notes stay plain Markdown (CLAUDE.md invariants, daily Markdown format untouched); an unedited note is never re-serialised (existing cycle 9 rule).
- Tailwind v4 stone palette only; desktop content keeps `max-w-[1800px]`; types in `src/types/daymark.ts`.
- Local-first and offline; no new network calls.
- Sync uses the existing entity pattern with a feature flag (like habits and backlog) for the new records so older clients are unaffected; note entities themselves keep their current shape.
- Release 1.8.0 (minor), same release process as 1.7.0 (APK, server, site, guide pages updated for folders, Related and the graph).

## Calls made after the builder check (mine; please check)

- **Rename/move sync:** a folder rename or move is a bulk edit of each affected note's `folder` (per-note last write wins; not one atomic operation) plus the same change to the synced empty-folder list. The tree is built from the notes' paths plus that list. If another device adds a note to the old path meanwhile, that note keeps the old path and the old folder reappears with just that note; nothing is lost.
- **Old clients and the flag:** the feature flag gates only the two new records (folder list, dismissed pairs). The tree UI works from path strings alone. A 1.7.0 client keeps notes and paths intact; it just shows a path as one flat name.
- **Phones:** the notes list shows the folder tree as expandable 44px rows, with new folder, rename, delete and a "Move to folder" picker; drag and drop is desktop only. The graph is desktop only.
- **Collisions:** moving or renaming a folder onto an existing path (case-insensitive) merges the two, after a confirmation when both hold notes. Note titles need not be unique. In the ZIP export, case-only differences collapse into the first spelling so case-insensitive file systems don't break.
- **Link writes:** Link goes through the editor's normal edit path when the note is open (one undoable step, saved by the usual autosave, never conflicting with unsaved text) and through a plain Markdown append when it is not. Only then is the note considered edited.
- **Scoring inputs:** a bonus for notes that link to the same third note, and a bonus when one note's title appears in the other's text (an "unlinked mention").
- **Graph default scope:** up to 300 notes it opens on the whole vault; above 300 it opens on the folder currently selected in the Notes list with orphans hidden. Labels show by zoom level.

## Left to the builder

Storage/entity names for the folder list and dismissed pairs; the graph rendering library or a hand-written canvas/SVG (must meet the performance and accessibility goals above, and bundle size growth must be reported); exact scoring weights and thresholds; tree and graph visuals; the keyboard model; the test plan, including a two-device sync test for folder rename and dismissed suggestions and a 1,000-note performance check.

## Risks to plan for first

1. Folder rename/move interacting with note sync (many note entities change at once; two devices renaming the same folder).
2. Suggestion quality on real notes (noise or silence); a small labelled fixture of related and unrelated notes should drive the scoring.
3. Graph performance and readability, and keeping the Notes page layout (rail, focus mode, editor toolbar) intact.
