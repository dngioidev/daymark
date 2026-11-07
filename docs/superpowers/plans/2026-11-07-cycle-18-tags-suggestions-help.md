# Cycle 18: Tags, Related suggestions and Help (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `#tags` real tags everywhere tags are already read, add a Tags browser, make Related suggestions appear for short English notes with a reason, and replace the cramped Settings Help with a full-size, searchable Help view built from `docs/guide`.

**Architecture:**
- **Tags are read, not stored.** `extractTags(markdown)` reads `#tags` and frontmatter `tags:` from note text. A note's *effective tags* are its stored `note.tags`, then its text tags, deduplicated case-insensitively with the first spelling kept.
  - `note.tags` keeps its meaning of "tags set outside the text": the legacy sample tags, plus the new handwritten tag field.
  - Typed notes never write derived tags back.

  This settles two of the spec's builder's calls: sample tags are kept by treating stored tags as the frontmatter equivalent, and handwritten field tags are stored in `note.tags`. It deviates from the spec's "`note.tags` derived on every save", for these reasons:
  - saving never changes `tags`, so there are zero extra sync writes and no ping-pong;
  - a 1.12 device and this version agree byte for byte;
  - no stored tag disappears.
- **One read-only "knowledge" view of notes.** `knowledgeNotes(notes, pagesFor)` returns copies with effective tags. For handwritten notes it also sets `content` to their text-box text. It is memoized per note object and ink-page array.
  - Search, the Tags section, Graph and Related all read this view.
  - Edits and saves keep using the real `notes`, so these copies are never saved.
- **Related** keeps one scoring pass:
  - a shared tag now admits a candidate on its own;
  - a second, lower floor fills a "Possibly related" group;
  - each suggestion carries `sharedTags` next to `sharedTerms`;
  - Graph calls the scorer with `tagAdmission: false`, so Graph does not change.
- **Help** is a full-screen view (`HelpView`) opened from the rail, the Settings Help item, and `?`.
  - Topics come from the extended `docs/guide/*.md` format, parsed by the shared `parseGuide` (used by the app, the site and the tests).
  - Screenshots are generated into `docs/guide/images/` by `scripts/capture-screenshots.mjs guide`.

**Tech Stack:** React 19, TypeScript, TipTap/ProseMirror decorations, Vitest (jsdom), node:test helpers, Playwright-core e2e scripts.

**Spec:** `docs/superpowers/specs/2026-11-06-cycle-18-tags-suggestions-help-design.md`

## Global Constraints

- **Style and types:**
  - Stone palette only (`stone-50`..`stone-950`); desktop width stays `max-w-[1800px]`.
  - Strict types from `src/types/daymark.ts`.
  - Daily task comments `<!-- daymark: task_id=... -->` and rollover are untouched.
- **Note text and sync:**
  - Note text is never rewritten to add or remove tags. Rich editor chips are decorations only; source bytes are unchanged (the Cycle 15/16 fidelity rules).
  - No sync or format change: no new entity keys, and `StandaloneNote` keeps its shape. Saving a typed note must not change its `tags`.
- **Related:**
  - "Possibly related" appears only in the Related panel, never as Graph edges.
  - It shows only when there are fewer than 5 strong matches, with at most 3 entries.
- **Test data:** never test against the personal vault on port 3000. Use disposable servers with a temp `DATA_DIR` and test passwords, as the existing scripts do.
- **Commits:**
  - Authored as dngioidev.
  - Messages end with the two attribution lines (Claude Opus 5.5 co-author and the session URL); add the Codex co-author line for Codex work.
- **Performance:** the Graph/Related tests (`graphPerformance.ts`, `graphSuggestions.test.ts`) stay within their current budgets.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each one's test is added to the task named on its line:

1. **The rich editor escapes a line-leading `#`.** It saves `#project` typed at the start of a line as `\#project`, which must still count as a tag. Pinned in Task 4 (audit fixture) and Task 1 (`\#tag` counts).
2. **Things that are not tags.** A hex colour or anchor such as `[x](#intro)`, `[[Note#Heading]]`, `&#123;`, an `## H2` heading and a `<!-- daymark: ... -->` comment must not produce tags. Task 1.
3. **A handwritten note open in Related.** Link is not shown (only Open and Not related), and typed notes can still link to it. Task 5.
4. **Choosing a nested parent tag.** `#project` in the Tags section must list notes tagged `#project/daymark` too, and must not match `#projects`. Task 3.
5. **Editing a typed note to add `#x`.** The saved note keeps `tags` byte-identical, so sync sends only the content change. Task 2.

---

### Task 1: Tag extraction

**Files:**
- Create: `src/utils/markdownMask.ts`. Move `maskCode` here from `src/utils/noteRelated.ts` (re-import it there) and add `maskNonText`.
- Create: `src/utils/noteTags.ts`, `src/utils/noteTags.test.ts`

**Interfaces:**
- Produces:
  - `maskCode(markdown: string): string`, the same as today.
  - `maskNonText(markdown: string): string`. It applies `maskCode`, then blanks with spaces:
    - URLs;
    - the `(...)` target of `[..](..)`, and the whole `[..](..)` / `![..](..)` link;
    - `[[...]]`;
    - HTML comments.

    Offsets are kept.
  - `extractTags(markdown: string): string[]`. Display spellings without `#`: frontmatter tags first, then body tags in order of first appearance, deduplicated by `tagKey`.
  - `tagKey(tag: string): string`, which is `tag.normalize('NFC').toLocaleLowerCase()`.
  - `mergeTags(...lists: string[][]): string[]`, deduplicated by `tagKey` with the first spelling kept.
  - `parseTagField(input: string): string[]`. It splits on whitespace and commas, drops a leading `#`, and keeps only valid tags.
  - `hasTag(tags: string[], filter: string): boolean`. It is true when some tag's key equals `tagKey(filter)` or starts with `tagKey(filter) + '/'`.

- [ ] **Step 1: Write the failing tests** in `noteTags.test.ts`:
  ```ts
  expect(extractTags('Plan #project and #Project/daymark then #project')).toEqual(['project', 'Project/daymark']);
  expect(extractTags('#Sync first, then #sync')).toEqual(['Sync']);            // first spelling wins
  expect(extractTags('\\#project at line start')).toEqual(['project']);        // rich-editor escape
  expect(extractTags('# Title\n## Sub\n#123 #1a')).toEqual([]);                 // headings, digits first
  expect(extractTags('`#code` and\n```\n#fenced\n```\n')).toEqual([]);
  expect(extractTags('https://x.dev/#frag www.y.com/#a [see](#intro) [#text](https://u.dev) [[Note#Heading]] &#123; <!-- #c -->')).toEqual([]);
  expect(extractTags('a#b mid-word, end #trail- #ok/')).toEqual(['trail', 'ok']); // needs boundary; trailing -,/ trimmed
  expect(extractTags('#lập-trình')).toEqual(['lập-trình']);                     // unicode letters
  expect(extractTags('---\ntags: [alpha, Beta]\n---\nbody #beta #gamma')).toEqual(['alpha', 'Beta', 'gamma']);
  expect(extractTags('---\ntags:\n  - one\n  - two/three\n---\n')).toEqual(['one', 'two/three']);
  expect(extractTags('---\ntitle: x\n---\n# heading')).toEqual([]);
  expect(mergeTags(['Java'], ['java', 'sql'])).toEqual(['Java', 'sql']);
  expect(parseTagField('#a, b  c/d #1x')).toEqual(['a', 'b', 'c/d']);
  expect(hasTag(['project/daymark'], 'Project')).toBe(true);
  expect(hasTag(['projects'], 'project')).toBe(false);
  ```
- [ ] **Step 2:** Run `npx vitest run src/utils/noteTags.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - **Tag pattern:** `(?<![\p{L}\p{N}_&/#])\\?#(\p{L}[\p{L}\p{N}_\-/]*)` with the `u` flag, run over `maskNonText(body)`. Trim trailing `-` and `/`.
  - **Frontmatter:** use `matchFrontmatter`. Read `tags:` as either an inline `[a, b]` / `a, b` value or `- item` lines. Quotes are stripped, and invalid entries are dropped with the same rule as the body. Mask the frontmatter block out of the body scan.
- [ ] **Step 4:** Run the test file and `npx vitest run src/utils/noteRelated.test.ts`. Expected: PASS, with nothing changed by the `maskCode` move.
- [ ] **Step 5:** Commit `feat(tags): extract #tags and frontmatter tags from note text`.

### Task 2: Knowledge notes and the `#tag` search filter

**Files:**
- Create: `src/utils/knowledgeNotes.ts`, `src/utils/knowledgeNotes.test.ts`
- Modify:
  - `src/utils/noteRelated.ts` (`buildNoteIndex`: remove the `kind === 'handwritten'` blanking; mask tag spans out of body tokens);
  - `src/utils/noteTree.ts` (`searchText`, `buildNoteTreeRows`);
  - `src/components/StandaloneNotesView.tsx`.
- Test: `src/utils/noteTree.test.ts`, `src/components/StandaloneNotesView.test.ts`

**Interfaces:**
- Consumes: `extractTags`, `mergeTags`, `hasTag` (Task 1); `visibleTextBoxes` (`src/ink/inkText.ts`).
- Produces:
  - `handwrittenText(pages: InkPage[]): string`. Visible text-box text in page order, then by anchor y and x, joined with `\n\n`.
  - `effectiveTags(note: StandaloneNote, text?: string): string[]`, which is `mergeTags(note.tags, extractTags(text ?? note.content))`.
  - `knowledgeNotes(notes: StandaloneNote[], pagesFor: (id: string) => InkPage[]): StandaloneNote[]`. It returns new objects with `tags` set to the effective tags. Handwritten notes get `content` set to `handwrittenText`. Results are memoized in a `WeakMap` keyed by note, holding the last pages array and its result. An unchanged note returns the same object.
  - `buildNoteTreeRows`: when `query.trim()` matches `^#\S+$`, rows are only notes where `hasTag(note.tags, query.slice(1))` holds, with no snippet. Other queries behave as today.

- [ ] **Step 1: Write the failing tests.**
  - `knowledgeNotes.test.ts`:
    - a typed note `{ tags: ['Java'], content: '#java #sql' }` gets `tags` `['Java','sql']`;
    - a handwritten note whose two pages hold text boxes `'#ideas one'` and `'two'` gets `content` `'#ideas one\n\ntwo'` and `tags` `['ideas']`;
    - a removed text box is ignored;
    - calling twice with the same inputs returns the identical array elements (`toBe`);
    - the input notes are not mutated (deep-equal to a `structuredClone` taken before).
  - `noteTree.test.ts`:
    - query `#project` returns notes tagged `project` and `project/daymark` but not `projects`;
    - `matchCount` counts them;
    - query `project` keeps today's substring behaviour.
  - `StandaloneNotesView.test.ts`:
    - typing `#urgent` into a typed note saves new `content` while `tags` stays `[]` (Review Focus 5);
    - searching `#urgent` in the tree lists that note.
- [ ] **Step 2:** Run those three files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `StandaloneNotesView`, compute `const known = useMemo(() => knowledgeNotes(notes, inkPagesForNote), [notes, inkPagesForNote])`.
  - Pass `known` to:
    - `useRelatedNotes`;
    - the `graphIndex` `buildNoteIndex`;
    - `GraphView`'s `notes`;
    - `NoteNavigation` / `buildNoteTreeRows`.
  - Keep `notes` for every edit path.
  - In `noteTree.searchText`, drop the handwritten blanking, because knowledge content is now the text-box text.
- [ ] **Step 4:** Run the three files plus `npx vitest run src/utils/noteRelated.test.ts src/utils/graphSuggestions.test.ts src/utils/graphData.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tags): derive effective tags and handwritten text for search, graph and related`.

### Task 3: Tags section, Graph tag filter, handwritten tag field

**Files:**
- Create: `src/components/notes/TagList.tsx`, `src/components/notes/TagList.test.ts`, `src/components/notes/TagFieldDialog.tsx`
- Modify:
  - `src/utils/noteTags.ts` (add `buildTagRows`);
  - `src/components/notes/NoteNavigation.tsx` (render `TagList` below the tree; prop `tagRows`, `activeTag`, `onSelectTag`);
  - `src/components/StandaloneNotesView.tsx` (a "Tags…" item in the **More note actions** menu, for handwritten notes only; `revealTags` handling);
  - `src/components/notes/graph/GraphView.tsx` (tag list from `known`, using `hasTag` in the filter);
  - `src/utils/graphData.ts`:
    - `:31` uses `hasTag(note.tags, options.tag)` instead of `includes`;
    - `:47` keys tag hubs by `tagKey(tag)`.

**Interfaces:**
- Consumes: `knowledgeNotes` output (Task 2), `hasTag`, `parseTagField`, `tagKey`.
- Produces:
  - `buildTagRows(notes: StandaloneNote[]): { tag: string; name: string; depth: number; count: number }[]`.
    - Rows are sorted by path with a locale collator.
    - Parents are implied by children.
    - `count` is the number of distinct notes with that tag or a descendant.
    - `depth` is the number of `/`.
  - `StandaloneNotesView` prop `reveal?: { target: 'tags' | 'graph'; seq: number }`, used by Task 7. `tags` expands and scrolls to the Tags section and focuses its first row; `graph` switches the view to Graph.
  - `TagFieldDialog({ note, onSave(tags: string[]), onClose })`. It shows one text input labelled "Tags" and saves `parseTagField(value)` into `note.tags`.

- [ ] **Step 1: Write the failing tests.**
  - `buildTagRows` with tags `project/daymark` ×2, `project` ×1 (a different note) and `sync` returns:
    ```ts
    [{tag:'project',name:'project',depth:0,count:3},{tag:'project/daymark',name:'daymark',depth:1,count:2},{tag:'sync',name:'sync',depth:0,count:1}]
    ```
  - `TagList`: a region labelled "Tags" lists buttons such as `project 3`. Clicking one calls `onSelectTag('project')`, and the active one has `aria-pressed="true"`.
  - In `StandaloneNotesView`:
    - choosing a tag sets the search box to `#project` and filters the tree;
    - choosing it again clears the search;
    - for a handwritten note, More note actions → Tags… → typing `#plan, ideas` → Save stores `tags: ['plan','ideas']`, and the Tags section shows `plan`;
    - the menu item is absent for typed notes.
  - **Graph tag view** (`graphData.test.ts`, `StandaloneNotesView.graph.test.ts`, `GraphView` tests):
    - the Tag select lists the effective tags (stored, `#text` and handwritten text-box tags), deduplicated by `tagKey` and sorted;
    - choosing `project` keeps the notes tagged `project` or `project/daymark` and hides `projects`;
    - **tag edges:** two notes whose *text* holds `#sync` and `#Sync` get exactly one `kind: 'tag'` edge (tag hubs are keyed by `tagKey`, not the raw string);
    - three notes sharing a tag get 2 tag edges (the spanning hub), and the edges stay within the filtered nodes;
    - a link between the same pair outranks the tag edge (`priority`);
    - `project` and `project/daymark` are different tags for edges, so they get no edge between them;
    - a handwritten note with a `#sync` text box gets a tag edge to a typed `#sync` note;
    - removing `#sync` from one note's text removes the edge on the next build;
    - Graph's node search matches derived tags, and the legend still reads "Faint: tags";
    - Graph shows no "Possibly related" edges: `buildGraph` with suggestions on gets only `suggestRelated(..., { tagAdmission: false })` edges, so tag-sharing pairs stay tag lines, not dashed suggestions.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Selecting a tag drives the existing search query (`#tag`), so filtering is Task 2's code path. The Tags section collapses with a disclosure button and is hidden while the tree is minimized.
- [ ] **Step 4:** Run `npx vitest run src/components/notes src/components/StandaloneNotesView*.test.ts src/utils/graphData.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tags): Tags section, tag filter, graph tag filter and handwritten tag field`.

### Task 4: Tag chips in the rich editor, plus audit fixtures

**Files:**
- Create: `src/components/notes/tagChips.ts`, `src/components/notes/tagChips.test.ts`
- Modify:
  - `src/components/notes/editorExtensions.ts` (register the plugin);
  - `src/components/notes/RichNoteEditor.tsx` (prop `onOpenTag?(tag: string)`);
  - `src/components/StandaloneNotesView.tsx` (`onOpenTag` sets the query to `#tag`);
  - `src/components/notes/richNoteEditor.css` (`.dm-tag` chip: `rounded-full`, stone-200/stone-700 background).
- Fixtures: `fixtures/notes/rendering/cases.json` plus a new `tags.md`

**Interfaces:**
- Consumes: the Task 1 tag pattern. Export it from `noteTags.ts` as `TAG_PATTERN_SOURCE: string` so the editor and the extractor share one rule.
- Produces: a ProseMirror plugin that adds inline decorations `class="dm-tag" data-tag="<tag>"` over tags in text nodes, skipping code blocks and text with the `code` or `link` mark. Clicking a decoration calls `onOpenTag(tag)`.

- [ ] **Step 1: Write the failing tests.**
  - `tagChips.test.ts`: mount `RichNoteEditor` with `'Plan #project and `#code`'`:
    - exactly one `.dm-tag` exists, with `data-tag="project"`;
    - clicking it calls `onOpenTag('project')`;
    - typing a character elsewhere leaves the emitted Markdown free of chip markup.
  - Audit case `tags-inline`, file `tags.md`, containing:
    - `#project`, `#project/daymark` and a line-leading `#todo`;
    - a heading, inline code with `#code`, a URL with `#frag`, and `[[Note#Heading]]`.

    Expected: notes `native`, `visibleText` including `#project`, elements `[{ selector: '.dm-tag', count: 3 }]`, fidelity `verbatim`.
  - Add a case to `src/markdown-audit/editor.audit.ts`: after an edit, `extractTags(output)` equals `['project', 'project/daymark', 'todo']` (Review Focus 1).
- [ ] **Step 2:** Run `npx vitest run src/components/notes/tagChips.test.ts` and `npm exec -- vitest run --config vitest.markdown-audit.config.ts`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement** the decoration plugin. Use the same plugin-registration pattern as `penHighlight.ts`. Rebuild decorations only on `docChanged`.
- [ ] **Step 4:** Run both commands again. Expected: PASS, and the audit still reports 0 failures.
- [ ] **Step 5:** Commit `feat(tags): tag chips in the rich editor, tag audit fixtures`.

### Task 5: Related suggestions that appear

**Files:**
- Modify:
  - `src/utils/noteRelated.ts`;
  - `src/utils/graphSuggestions.ts:27` (pass `tagAdmission: false`);
  - `src/hooks/useRelatedNotes.ts`;
  - `src/components/notes/RelatedPanel.tsx`, `RelatedSheet.tsx`;
  - `src/components/StandaloneNotesView.tsx` (pass `canLink={activeNote.kind !== 'handwritten'}`).
- Modify fixtures: `src/utils/fixtures/relatedNotes.ts`.
- Test: `src/utils/noteRelated.test.ts`, `src/hooks/useRelatedNotes.test.ts`, `src/components/notes/RelatedPanel.test.ts`

**Interfaces:**
- Consumes: knowledge notes (Task 2), so `note.tags` already holds the effective tags.
- Produces:
  - `RelatedSuggestion` gains `sharedTags: string[]`: display spellings from the source note, sorted by `tagKey`.
  - `IndexedNote.tags` becomes `ReadonlyMap<string, string>` (tag key to display spelling), and the index gains `tagPostings: ReadonlyMap<string, readonly string[]>`.
  - `suggestRelated(index, noteId, opts?: { dismissed?; limit?; tagAdmission?: boolean })` keeps its signature. `tagAdmission` defaults to `true`; when true, notes sharing a tag key are candidates even with no shared term. Graph passes `false`.
  - `relatedGroups(index, noteId, opts?: { dismissed? }): { strong: RelatedSuggestion[]; possible: RelatedSuggestion[] }`.
    - `strong` is `suggestRelated(..., { limit: 5 })`.
    - `possible` is filled only when `strong.length < 5`. It holds at most 3 entries not in `strong`, with `POSSIBLE_SCORE <= score < MIN_SCORE` and at least 2 shared meaningful terms.
  - `useRelatedNotes` returns `possible: RelatedNoteSuggestion[]` alongside `suggestions`.
  - `RelatedContents` gets `possible` and `canLink: boolean` props.
- **Scoring:**
  - A shared tag adds `TAG_BONUS = 0.30` (equal to `MIN_SCORE`), so a shared tag alone admits a candidate.
  - `FIELD_WEIGHT.tags` is removed. Tag spans are masked from body tokens, so tags count once and nested tags are not split into `sharedTerms`.
  - `POSSIBLE_SCORE` is tuned by the implementer to pass the fixtures below. Start at `0.12`.
  - Record the chosen value and the fixture margins in the comment next to the constant, as today.

- [ ] **Step 1: Write the failing tests.**
  - **Fixture changes.** In `relatedNotes.ts`:
    - move `tag-only` out of `adversarialIds`;
    - add `strongTagPairs = [{ a: 'java', b: 'tag-only', tags: ['java'] }]`;
    - add three short English pairs that share exactly 2 meaningful words and no tag:

    ```ts
    note('sync-a', 'Weekend thoughts', 'The sync conflict showed again on the tablet.'),
    note('sync-b', 'Bug list', 'Conflict after sync, phone lost an edit.'),
    note('trip-a', 'Ideas', 'Book train tickets before the holiday.'),
    note('trip-b', 'Todo', 'Holiday packing list, train at nine.'),
    ```
    together with `possiblePairs = [{ a: 'sync-a', b: 'sync-b', terms: ['conflict','sync'] }, { a: 'trip-a', b: 'trip-b', terms: ['holiday','train'] }]`.
  - **`noteRelated.test.ts` tests:**
    - every `strongTagPairs` entry is in `strong`, with `sharedTags` equal to `['java']`;
    - every `possiblePairs` entry is in `possible` (not `strong`), with `sharedTerms` including its `terms`;
    - every pair in `unrelatedGroups` is in neither group, and the remaining adversarial ids are in neither group;
    - `possible.length <= 3`, and `possible` is empty when `strong.length === 5`;
    - `suggestRelated(index, 'java', { tagAdmission: false })` does not contain `tag-only`;
    - a note tagged `#project/daymark` paired with one tagged `#project/daymark` gets `sharedTags` `['project/daymark']`, and `sharedTerms` contains neither `project` nor `daymark`;
    - a handwritten knowledge note whose content is `'sync conflict tablet'` appears in `possible` or `strong` for `sync-a`.
  - **`RelatedPanel.test.ts` tests:**
    - a "Possibly related" heading appears below the Suggested list when `possible` is non-empty;
    - the reason reads `shares: sync, conflict, #daymark` (terms first, then `#`-prefixed tags);
    - with `canLink={false}`, no Link button is rendered (only the title and Not related), and the empty-state text is unchanged (Review Focus 3).
- [ ] **Step 2:** Run those files. Expected: FAIL.
- [ ] **Step 3: Implement.** Tag admission seeds the candidate loop from `tagPostings` of the source's tag keys (`count` may be 0). The early-skip bound uses the new `TAG_BONUS`. "Possibly related" items use the same Link, Not related and Open actions.
- [ ] **Step 4:** Run `npx vitest run src/utils src/hooks src/components/notes src/components/StandaloneNotesView.related.test.ts src/components/StandaloneNotesView.graph.test.ts`. Expected: PASS. The graph performance tests stay inside their budgets, and the graph tests are unchanged.
- [ ] **Step 5:** Commit `feat(related): shared tags admit suggestions, possibly related group with reasons`.

### Task 6: Extended guide format and the rewritten topics

**Files:**
- Modify:
  - `scripts/helpers/guide-format.mjs`;
  - `scripts/helpers/guide.mjs` (site render: ordered lists, images, Web | Tablet | Phone switch);
  - `scripts/build-site.mjs` (copy `docs/guide/images` to `_site/guide-images`);
  - `site/` `guide.js` (three-way switch, if the file holds the toggle);
  - `scripts/helpers/guide.test.mjs`;
  - `scripts/helpers/build-android.test.mjs` if it names a removed topic.
- Rewrite/create in `docs/guide/`:
  - **Start here:** `first-5-minutes.md` (new), `whats-new.md` (new).
  - **Features:**
    - `today.md`, `sections.md`, `backlog.md`, `calendar.md`, `habits.md`, `search.md`;
    - `folders-and-pinning.md` (renamed from `notes.md`), `tags.md` (new), `linking-notes.md` (new), `related-and-graph.md` (new), `handwriting.md`, `full-screen.md` (new);
    - `widgets.md`, `appearance.md`, `sync.md`, `backups.md`, `getting-started.md` (retitled "Install the app"), `shortcuts.md`.

**Interfaces:**
- Produces: `parseGuide(raw, slug)` returns
  ```ts
  { slug, title, order, group: 'start' | 'features', summary: string, show?: ShowMeTarget, related: string[],
    web: string, tablet: string, phone: string }
  ```
  - `tablet` falls back to `phone` when the `## Tablet` section is absent.
  - Sections are `## Web`, optional `## Tablet`, and `## Phone`.
  - It throws on a missing title, order, group, summary or Web/Phone section, on an unknown `show`, or on `summary` over 160 characters.
- Also exports `SHOW_ME_TARGETS` (a plain array, shared with the app):
  ```js
  ['today', 'quick-capture', 'calendar', 'backlog', 'notes', 'notes-tags', 'notes-graph', 'search', 'settings-appearance', 'settings-sync', 'settings-storage', 'settings-widget']
  ```
- **Screenshot syntax:** a Markdown image line on its own, with alt text and the path `images/<name>.png`, inside a section. A sibling `<name>-dark.png` is optional.
- `shortcuts.md` Web lists every shortcut that `ShortcutHelp.tsx` lists today, in a Markdown table, before that dialog is removed in Task 7.

- [ ] **Step 1: Write the failing tests** in `guide.test.mjs`:
  - **Parser:**
    - new-format fixtures parse to the shape above;
    - a missing `## Tablet` copies Phone;
    - a missing `summary` or an unknown `show` throws, naming the slug.
  - **Shipped guide:**
    - there are 20 topics, with group `start` holding exactly `first-5-minutes` then `whats-new` (lowest orders);
    - every `related` slug exists;
    - every section has 25–220 words and contains a numbered step (`/^1\. /m`);
    - every referenced image file exists in `docs/guide/images` (until Task 8 adds them, this assertion is `skip`ped with a `TODO(task 8)` comment, removed in Task 8);
    - `tags.md` mentions `#`, "Tags section" and `#project/daymark`;
    - `handwriting.md` keeps the Cycle 17 phrases already asserted;
    - `shortcuts.md` Web contains `Ctrl/⌘ K`, `g n`, `?` and `Ctrl/⌘ .`.
  - **Site build:** `guide.html` has `data-platform="tablet"` and `data-platform="phone"`, renders `<ol>`, and links every topic.
- [ ] **Step 2:** Run `npm run test:helpers`. Expected: FAIL.
- [ ] **Step 3: Implement** the parser, the site render and the content.
  - **Content rules:** a one-line summary; short numbered steps per platform; Tablet sections only where pen or layout differs (handwriting, full-screen, related-and-graph, first-5-minutes); 1–3 related slugs.
  - **What's new** lists Cycle 17 (full screen, S Pen button, select, text boxes, shapes) and Cycle 18 (tags, Related reasons, Help) under "Next release". The owner picks the version number at release.
- [ ] **Step 4:** Run `npm run test:helpers && npm run build:site`. Expected: PASS.
- [ ] **Step 5:** Commit `docs(guide): split topics, steps, tablet sections and Show me targets`.

### Task 7: Help view, search, Show me and `?`

**Files:**
- Create: `src/components/help/HelpView.tsx`, `src/components/help/HelpView.test.ts`, `src/utils/guideSearch.ts`, `src/utils/guideSearch.test.ts`
- Modify:
  - `src/utils/guideData.ts` (new fields; `import.meta.glob('../../docs/guide/images/*.png', { query: '?url', import: 'default', eager: true })`, exported as `GUIDE_IMAGES: Record<string, string>` keyed by file name);
  - `src/App.tsx` (state `helpTopic: string | null`; `openHelp(slug = 'first-5-minutes')`; `?` calls `openHelp('shortcuts')`; `showMe(target)`);
  - `src/components/SideRail.tsx` (a Help button `aria-label="Help"` with the lucide `CircleHelp` icon, between Search and Settings; prop `onOpenHelp`);
  - `src/components/SettingsModal.tsx` (the Help menu item calls `onOpenHelp` and closes Settings instead of rendering `HelpTab`);
  - `src/App.search.test.ts`.
- Delete: `src/components/ShortcutHelp.tsx`, `src/components/settings/HelpTab.tsx`, and `HelpTab.test.ts`. Port its still-relevant assertions into `HelpView.test.ts`.

**Interfaces:**
- Consumes: `GUIDE_TOPICS`, `SHOW_ME_TARGETS` (Task 6); `StandaloneNotesView`'s `reveal` prop (Task 3).
- Produces:
  - `searchGuide(topics: GuideTopic[], query: string): GuideTopic[]`.
    - Lowercased word-prefix matching over the title (weight 3), summary (2) and all three platform sections (1).
    - Every query word must match.
    - Synonyms expand a query word: `{ link: ['linking','links','connect'], eraser: ['erase','s pen'], tag: ['tags','#'], backup: ['backups','restore'] }`.
    - Ordered by score, then `order`.
  - `HelpView({ topic, appMode, onTopicChange, onClose, onShowMe })`:
    - a full-screen `role="dialog"` `aria-label="Help"` with the content inside `max-w-[1800px]`;
    - a search box labelled "Search help";
    - a group labelled "Help platform" with Web, Tablet and Phone buttons. The default is Phone when `appMode === 'mobile-app'` and the width is under 768, Tablet for `mobile-app` or a coarse pointer at 768 or wider, and Web otherwise;
    - a nav labelled "Help topics", grouped under the headings "Start here" and "Features";
    - an article with the title, summary and section Markdown via `MarkdownPreview`. Images resolve through `GUIDE_IMAGES`; the `-dark` variant shows under `dark:` classes;
    - a **Show me** button when `show` is set, and related-topic links.
  - Below 768 px, Help shows the topic list first and the article replaces it, with a Back button.
  - Esc and Close leave Help.
  - `showMe(target)` in `App` closes Help, then:
    - goes to the tab (`goToTab`);
    - or opens Quick capture or Search;
    - or opens Settings at the matching tab (`settings-storage` → `'storage'`, and so on);
    - or, for `notes-tags` / `notes-graph`, goes to Notes and bumps `reveal`.

- [ ] **Step 1: Write the failing tests.**
  - `guideSearch.test.ts`, over the shipped topics:
    - `tags` puts `tags` first;
    - `link notes` returns `linking-notes` in the top 2;
    - `eraser` returns `handwriting`;
    - `sync` returns `sync` first;
    - `zzzz` returns `[]`.
  - `HelpView.test.ts`:
    - typing `tags` in "Search help" narrows the topic list to include Tags;
    - Show me on Tags calls `onShowMe('notes-tags')`;
    - a related link changes the topic;
    - the platform switch shows Tablet text, falling back to Phone;
    - an image renders with an `alt`.
  - `App.search.test.ts`:
    - replace the `ShortcutHelp` assertions: pressing `?` renders the Help dialog with the Shortcuts article, and Esc closes it;
    - the rail Help button opens Help at First 5 minutes;
    - Settings → Help opens Help and closes Settings;
    - Show me on Tags lands on Notes with the Tags region visible.
- [ ] **Step 2:** Run those files. Expected: FAIL.
- [ ] **Step 3: Implement.** The `?` handler keeps the existing `shortcutFor` guards. `isDialogOpen()` must count Help as a dialog so other shortcuts stay inert while it is open.
- [ ] **Step 4:** Run `npm run lint && npx vitest run src/components/help src/utils/guideSearch.test.ts src/App.search.test.ts src/components/SideRail.test.ts src/components/settings`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(help): full-size searchable Help with Show me; ? opens Help`.

### Task 8: Guide screenshots, e2e and release docs

**Files:**
- Modify:
  - `scripts/capture-screenshots.mjs` (add `guide`, which writes to `docs/guide/images/` instead of `docs/releases/<cycle>/images`, and `cycle-18`);
  - `scripts/e2e-android-pwa.mjs` (the Cycle 18 checks);
  - `scripts/helpers/guide.test.mjs` (un-skip the image assertion).
- Create: the `docs/guide/images/*.png` files referenced by the guide, and `docs/releases/cycle-18/README.md` plus its images.
- Modify: `docs/ROADMAP.md`. Mark Cycle 18 shipped there, with named connections still deferred.

**Interfaces:**
- Consumes: everything above.
- **Guide shots** (light, plus `-dark` where the topic is visual):
  - `first-task` (Today with a task added);
  - `tags` (Notes with the Tags section and a `#project` filter);
  - `related` (the Related panel with Suggested and Possibly related, and reasons);
  - `linking` (the `[[` suggestion menu);
  - `graph` (Graph with the tag filter);
  - `handwriting-rail` (reuse `cycle17FullScreen`).

  The sample vault gains three notes sharing `#project/daymark` and two short notes that produce a Possibly related entry.
- **Release shots `cycle-18`:**
  - `tags-section`, `tag-chips`, `related-reasons`;
  - `help-desktop`, `help-desktop-dark`, `help-search`;
  - `help-phone`, `help-tablet`.

- [ ] **Step 1: Write the failing e2e checks** in `e2e-android-pwa.mjs`, run on a disposable server:
  - type `#project` into two new notes; the Tags section lists `project 2`;
  - choosing it filters the tree to those two notes;
  - Graph's Tag select contains `project`, and choosing it draws a tag line between the two notes;
  - one of the notes shows the other under Related;
  - `?` opens Help at Shortcuts;
  - Help search `tags` lists Tags;
  - Show me opens Notes with the Tags region.
- [ ] **Step 2:** Run `npm run build && npm run test:e2e`. Expected: the new checks PASS. Fix any regression before going on.
- [ ] **Step 3:** Run `node scripts/capture-screenshots.mjs guide` and `node scripts/capture-screenshots.mjs cycle-18`. Open every image and check it. Un-skip the image test.
- [ ] **Step 4: Full verification.** Run:
  - `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run build:site`;
  - `npm run test:e2e`, `npm run test:sync`;
  - the Markdown audit (`npm exec -- vitest run --config vitest.markdown-audit.config.ts`, 0 failures);
  - `npm run validate:ai`.

  Write `docs/releases/cycle-18/README.md` in the Cycle 17 format: what shipped, screenshots, verification table and known gaps. The known gaps include:
  - sample tags on typed notes cannot be removed from the UI;
  - preview chips are not shown, because Notes has no separate preview surface;
  - named connections are deferred.
- [ ] **Step 5:** Commit `docs: Cycle 18 guide screenshots, e2e and release notes`.
