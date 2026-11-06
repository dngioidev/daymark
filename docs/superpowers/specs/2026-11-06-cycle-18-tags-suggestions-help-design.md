# Cycle 18 — Tags, Related suggestions and Help (design)

Status: draft for owner review · 2026-11-06 · follows Cycle 17 (`2026-11-06-cycle-17-pen-writing-fullscreen-design.md`)

## Why

- **Tags don't work.** `StandaloneNote.tags` exists and is read by Search (`noteTree.ts`), the Graph tag filter (`graphData.ts`, `GraphFilters.tsx`) and Related scoring (`noteRelated.ts`). However, nothing ever writes it:
  - new notes start with `tags: []`;
  - typing `#project` does nothing;
  - there is no tag control;
  - Markdown-only import sets `[]`.

  Only the built-in sample notes have tags. The owner tried to use tags in Cycle 14 and could not.
- **The owner never sees Related suggestions.** Their notes are in English. The scorer (TF-IDF cosine, `MIN_SCORE = 0.30`, words of 3+ letters, stop words removed, terms in >80% of notes dropped) rarely clears the bar for short brainstorm notes, and missing tags remove one of its bonuses. Graph shows suggestions only when its toggle is on.
- **Help on desktop is not useful.** It lives inside the Settings dialog (`settings/HelpTab.tsx`): about 760 px wide, with three cramped columns (Settings menu, topic list, article) that scroll separately.
  - Each topic in `docs/guide/*.md` is 3–4 dense paragraphs per platform, with no steps, pictures, search or way to jump to the feature.
  - `?` opens a separate keyboard-shortcuts dialog (`ShortcutHelp.tsx`).
  - Help has two jobs for the owner: getting **a new person started**, and **looking up a feature** (their real example: tags and note connections).

## Goals

1. `#tags` in note text become real tags everywhere the app already reads tags. Tags also get a place to browse them.
2. Related suggestions appear for ordinary English notes and explain themselves.
3. Help becomes a full-size, searchable page with short steps, screenshots and "Show me", and covers the Cycle 17 pen tools and the new tags.

## Non-goals

- **Named connections** (`Depends on: [[Note]]` with labelled Graph lines). The owner hesitated, so they are deferred until tags have been used for a while.
- A guided overlay tour with arrows on the live UI.
- Tag rename/merge tools, tag colors, and nested-tag tree management beyond what's listed below.
- Changing how `[[links]]` work.

## Anti-goals

- **Rewriting note text behind the user's back.** Tags are read from the text and never inserted into it automatically.
- **Suggestion spam.** "Possibly related" must stay short and clearly secondary to strong matches.
- **A Help page that goes stale.** Steps and screenshots must come from the same canonical `docs/guide` source and the release screenshot tooling, not hand-pasted images.

## Design

### 1. Tags

- **Syntax:**
  - A tag is `#` followed by a letter, then letters, digits, `_`, `-` or `/`. Examples: `#project`, `#project/daymark`.
  - These do **not** count: `#` inside inline code, fenced code, a URL, or a link; Markdown headings (`# Title`, `## x`); and `#123`.
  - Tags are case-insensitive for matching, and the first spelling is used for display.
- **Frontmatter:** `tags: [a, b]` or a `tags:` list at the top of a typed note also counts. It uses the shared `matchFrontmatter` from Cycle 16.
- **Handwritten notes:** `#tags` written in **text boxes** (Cycle 17) count. A handwritten note also gets a tag field in its more-actions menu for tags without a text box. *Builder's call:* where that field's tags are stored, as long as they sync and are backed up.
- **Source of truth:**
  - `note.tags` is **derived from the note's text** on every save; it is never edited separately. Existing notes get it on load or migration.
  - The sample notes' stored tags are kept by also writing them as `#tags`, or by treating stored tags as the frontmatter equivalent. *Builder's call*, as long as no existing tag disappears.
  - Because tags live in the text, Markdown export/import and sync keep them with no format change.
- **Showing tags:**
  - In the rich editor and in preview, a tag renders as a small chip. Clicking it opens the tag's note list.
  - A raw `#tag` in Markdown mode stays plain text.
  - The note's source bytes are unchanged, consistent with the Cycle 15/16 fidelity rules. Add audit fixtures for tags to the Cycle 15 corpus.
- **Browsing:**
  - A **Tags** section under the folder tree in Notes lists every tag with a count. Nested tags are indented by `/`.
  - Choosing a tag filters the notes list. Search accepts `#tag` as an exact tag filter.
  - The Graph tag filter lists the real tags.
- **Related and Graph:** shared tags feed the existing tag signals (see 2).

### 2. Related suggestions that appear

- **Strong matches:** the existing scoring and `MIN_SCORE`, plus a shared tag that **admits a candidate on its own**. Today a candidate must first pass the body, vocabulary and shared-term gates in `suggestRelated` (`noteRelated.ts` around lines 215 and 241), so a bigger `TAG_BONUS` alone is not enough. Two notes sharing a tag are then suggested even when their wording differs. *Builder's call:* exact weights. Prove them with fixture tests in `src/utils/fixtures/relatedNotes.ts`.
- **Possibly related:**
  - When there are fewer than 5 strong matches, the Related panel shows a second, clearly secondary group of up to 3 weaker matches above a lower floor. *Builder's call:* the floor, tuned so that typical short English notes with 2+ shared meaningful words appear.
  - Each suggestion shows **why**: "shares: sync, conflict, #daymark". `sharedTerms` holds normalized words only, so shared tags must be tracked separately by their tag identity. Nested tags must not be split into words.
  - "Possibly related" appears **only in the Related panel**, not as Graph edges (designer's call).
- **Handwritten notes** take part in suggestions through their text-box text and tags.
  - They can **appear as** suggestions for typed notes, and Link adds the `[[link]]` to the typed note.
  - When a **handwritten** note is open, its suggestions are shown with Open only, without Link, because a handwritten note has no text to hold a link (designer's call).
- **Graph:** no change. Suggestions are already on by default and drawn as dashed lines (`GraphView.tsx`).
- The existing "Link" / "Not related" / "Restore" behaviour is unchanged.

### 3. Help as its own page

- **Where:** a full-size **Help** view, not a Settings tab.
  - On desktop it opens from a Help button in the sidebar. The Settings "Help" tab becomes a link to it.
  - `?` opens Help at the Keyboard shortcuts topic, so there is **one** help. The separate `ShortcutHelp` dialog is removed or becomes that topic.
  - Phone and tablet get the same topics as a full-screen list.
- **Layout (desktop):**
  - A search box across the top.
  - A Web | Tablet | Phone switch. Today there is Web | Mobile. "Tablet" is new because pen features differ.
  - On the left, the topic list, grouped as **Start here** (First 5 minutes, What's new) and **Features**.
  - On the right, a readable article column. Owner saw and approved the mockup.
- **Topics:** split the big ones. Notes becomes:
  - Folders and pinning;
  - Tags;
  - Linking notes;
  - Related and Graph;
  - Handwriting and pen (Cycle 17 tools: rail, S Pen button, select, text boxes, shapes);
  - Full screen.

  Add **First 5 minutes** for a new person (Today → add a task → finish it → Notes → install/backups) and **What's new in 1.12/1.13**.
- **Each topic:**
  - a one-line summary;
  - short numbered steps;
  - screenshots of the real screen, light/dark aware, generated by `scripts/capture-screenshots.mjs` or similar, never hand-made;
  - a **Show me** button that opens the feature, e.g. Tags opens Notes with the Tags section;
  - links to related topics.
- **Search:** searches across topic titles, summaries and steps, with sensible matches for "tags", "link notes", "eraser", "sync".
- **Source:** `docs/guide/*.md` stays canonical (`parseGuide` in `scripts/helpers/guide-format.mjs`). Extend its format as needed: summary, steps, platform sections including tablet, screenshot references, Show-me target. The GitHub Pages site build (`npm run build:site`) must keep working from the same files.

## Constraints

- **Repo invariants:** stone palette, desktop `max-w-[1800px]`, strict types from `src/types/daymark.ts`, untouched daily task comments and rollover.
- **Sync compatibility:** because tags derive from text, a 1.12 device and a 1.13 device must agree on note content. Derived `tags` must not cause sync conflicts or ping-pong writes.
- **Performance:** tag extraction runs on every save. Keep the existing Graph and Related performance tests (`graphPerformance.ts`) within budget.

## Verification the owner expects

- **Unit tests:**
  - tag extraction (code/URL/heading exclusions, nested, frontmatter, case);
  - derived-tags migration;
  - suggestion fixtures, both strong and "possibly related", with reasons;
  - the guide parser for the extended format.
- **Cycle 15 rendering audit:** extended with tag fixtures, still 0 failures.
- **Browser e2e:**
  - type `#project` in two notes, then see the Tags section, the filter, the Graph filter and a Related suggestion;
  - Help search finds "tags";
  - Show me navigates;
  - `?` opens Help.
- Release screenshots under `docs/releases/cycle-18/`.

## Left to the builder

- Exact tag-bonus weight, the "possibly related" floor and count.
- Guide format details and how screenshots are referenced.
- Where the handwritten tag field stores its tags.
- The Help sidebar icon and its position.
