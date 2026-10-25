# Cycle 9: Menus That Fit and a Rich Notes Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every popup menu fits on screen (bottom sheet on phones, flipping popover on desktop), and the Notes tab gets a Notion-style rich editor over Markdown with tables, pictures (shrunk and synced), Mermaid diagrams, styled paste/copy and `[[link]]` autocomplete.

**Architecture:** `Menu` renders through a portal: below 768 px as a bottom sheet, otherwise as a popover positioned by a pure placement function. The Notes editor is TipTap 3 with `@tiptap/markdown`, custom nodes (callout, Mermaid, raw Markdown, wiki link) and a lazy-loaded bundle; the note's `content` stays Markdown and is only re-serialised after a real edit. Pictures are content-addressed (`sha256` id), stored device-side in IndexedDB outside the in-memory cache, uploaded/downloaded through new authenticated `/api/assets/:id` endpoints (never through `/api/sync`), and referenced in Markdown as `![alt] (daymark-asset:<id>.<ext>)`.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Vitest; TipTap 3.32 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-table`, `-task-list`, `-image`, `-code-block-lowlight`, `@tiptap/suggestion`), `lowlight` 3, `mermaid` 12; Express sync server; Playwright browser suites; Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-10-25-cycle-9-menus-and-rich-notes-design.md` (binding; its "Calls I made" settle storage, sync, fidelity, breakpoint and paste rules).

## Global Constraints

- Tailwind v4 real classes, stone palette only; desktop `max-w-[1800px]`; types in `src/types/daymark.ts`; daily Markdown task comment format and rollover untouched.
- Today's day notes (section notes in `TodayView`) are NOT changed; the rich editor is used only in `StandaloneNotesView`.
- Note storage stays `StandaloneNote.content: string` (Markdown). Unedited notes must stay byte-identical; anything the editor can't represent is kept verbatim in a raw-Markdown block.
- Heavy code (TipTap, lowlight, mermaid) is imported dynamically from the Notes view; `npm run build` main chunk must not grow by more than 30 kB gzip versus main (check the Vite output).
- Pictures: longest side ≤ **1600** px, quality **0.8**, WebP (JPEG fallback when WebP encoding is unavailable), target ≤ **400 KB**; GIF → still image. Online `https://` images stay links. Never auto-delete pictures.
- Sanitise all pasted/converted HTML with DOMPurify before parsing; Mermaid runs with `securityLevel: 'strict'`.
- Bottom sheet below **768 px** viewport width; popover from 768 px. Touch targets ≥ 44 px; WCAG 4.5:1 text in light, dark and photo modes.
- Commits authored `dngioidev <172118255+dngioidev@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Version bump to 1.6.0 happens at release, not here.

## Review Focus

1. **A picture pasted while offline, then the note syncs before the picture uploads** → the other device shows "Picture not synced yet" and fills in after the upload; nothing is lost. Test in Task 2 (`pending upload retried and note renders placeholder`).
2. **Opening an old note full of unusual Markdown and closing it without typing** → content byte-identical (no sync change pushed). Test in Task 3 (`unedited note is not re-serialised`).
3. **Last task on a phone opens its menu** → every item reachable, nothing under the tab bar. Test in Task 1 (QA E6).
4. **Pasting a ChatGPT answer with a table and code block** → table and fenced code with language survive into Markdown. Test in Task 6 (fixture tests).
5. **A 12 MP photo pasted** → stored ≤ 1600 px and ≤ ~400 KB. Test in Task 2/4 (`encodeNotePicture limits`).

---

### Task 1: Menus that always fit

**Files:**
- Create: `src/utils/menuPlacement.ts`, `src/utils/menuPlacement.test.ts`
- Modify: `src/components/ui/Menu.tsx`, `src/index.css` (remove the `.dm-glass .dm-card:has([role="menu"])` rule), `scripts/e2e-qa-regressions.mjs` (new E6), any `Menu` callers needing a sheet heading (`TaskItemCard.tsx` passes `sheetTitle={task.title}`)

**Interfaces:**
- Produces `placeMenu(anchor: {top:number;bottom:number;left:number;right:number}, menu: {width:number;height:number}, viewport: {width:number;height:number}, align: 'left'|'right', gap = 4, margin = 8): { top: number; left: number; maxHeight: number; placement: 'below'|'above' }` — below if it fits, else above if more room above, else the larger side with `maxHeight` = available space; left clamped into `[margin, viewport.width - menu.width - margin]`.
- `Menu` gains optional `sheetTitle?: string`; renders via `createPortal` to `document.body`. Width < 768 → bottom sheet (fixed, bottom-0, above the tab bar via `pb-[env(safe-area-inset-bottom)]`, rounded top, backdrop `bg-black/40`, heading = `sheetTitle ?? heading ?? ''`, items `min-h-12`, closes on backdrop click, Esc, swipe-down ≥ 60 px, and Android Back via `useBackHandler`). Width ≥ 768 → fixed popover at `placeMenu(...)`, recomputed on scroll/resize, `overflow-y-auto` with `maxHeight`. z-index above dialogs' backdrop? No: menus use `z-[70]` (above sticky bars z-30/40, below toasts z-[80] if any — check `feedback.tsx` and keep toasts on top). Existing behaviour kept: outside-click close (portal content counts as inside), arrow keys, focus first item, focus returns to trigger, `isMenuOpen()` counter.

- [ ] **Step 1: failing tests** `menuPlacement.test.ts`: `places below when it fits`; `flips above near the bottom` (anchor bottom 880 of 900, menu 300 → placement above, top = anchor.top - 300 - 4); `clamps maxHeight when neither side fits` (viewport 400, menu 600 → maxHeight ≤ 392 - gap); `clamps horizontally` (right-aligned anchor at x=20 → left ≥ 8).
- [ ] **Step 2:** `npx vitest run src/utils/menuPlacement.test.ts` → FAIL.
- [ ] **Step 3: implement** `placeMenu` and the portal/sheet `Menu`; remove the cycle-8 CSS rule; keep E1 passing.
- [ ] **Step 4: QA E6** in `e2e-qa-regressions.mjs`: phone 390×844 with 12 tasks, scroll to the last task, open its "…" → `role="menu"` box fully inside the viewport and above the tab bar's top edge, every menuitem's centre hit-tests to the menu; Esc closes and focus returns to the "…" button. Desktop 1440×900: last task near the window bottom → menu bottom ≤ 900 and fully hit-testable. E1 still passes.
- [ ] **Step 5:** `npm run lint && npm test`; controller runs `npm run build && npm run test:qa -- E`.
- [ ] **Step 6: commit** `fix: menus open as a bottom sheet on phones and flip to fit on desktop`

### Task 2: Picture storage, shrinking and sync endpoints

**Files:**
- Create: `src/utils/noteAssets.ts` (+ `.test.ts`), `src/utils/notePicture.ts` (+ `.test.ts`), `server/assets.ts` (+ tests in `server/app.test.ts`)
- Modify: `src/utils/vaultStore.ts` (exclude `noteAsset:` keys from `readAll`, like `bgPhoto:`), `server/app.ts` (mount routes), `src/hooks/useSync.ts` (upload pending / fetch missing after each sync round), `src/types/daymark.ts`

**Interfaces:**
- Types: `interface NoteAssetMeta { id: string; mime: 'image/webp'|'image/jpeg'|'image/png'; width: number; height: number; bytes: number; createdAt: string }`. `id` = lowercase hex sha-256 of the bytes.
- `notePicture.ts`: `encodeNotePicture(file: Blob): Promise<{ blob: Blob; width: number; height: number; mime }>` — reuse `encodeImage` from `photoEncoder.ts` with max edge **1600** and quality **0.8**, WebP with JPEG fallback; if the result > 400 KB, re-encode once at quality 0.65.
- `noteAssets.ts` (device storage, IndexedDB `kv`): `putAsset(blob, meta): Promise<string /*id*/>` (computes sha-256 via `crypto.subtle`, stores `noteAsset:<id>` = Blob and `noteAssetMeta:<id>` = meta, appends id to `noteAssetPending` list), `getAssetUrl(id): Promise<string | null>` (object URL, cached per id), `hasAsset(id)`, `listAssets(): Promise<NoteAssetMeta[]>`, `deleteAsset(id)`, `pendingUploads(): Promise<string[]>`, `markUploaded(id)`, `assetRef(id, mime) => \`daymark-asset:${id}.${ext}\``, `parseAssetRefs(markdown): string[]` (ids from `daymark-asset:` URLs).
- Server `server/assets.ts`: `PUT /api/assets/:id` (auth, JSON `{ mime, data: base64 }`, ≤ 1.5 MB, id must equal sha-256 of decoded bytes, mime in the allowed set, stored at `DATA_DIR/assets/<id>` + `<id>.json` meta, idempotent), `GET /api/assets/:id` (auth, returns bytes with `Content-Type`, 404 if missing), `DELETE /api/assets/:id` (auth), `GET /api/assets` (auth, list of metas, for usage and cleanup). Old clients never call these, so no gating is needed.
- `useSync`: after a successful round, upload every pending id (stop on network error, retry next round), then for every `daymark-asset:` id referenced by any note and missing locally, `GET` and store it (bounded concurrency 3). Native refresh-token auth works like sync.

- [ ] **Step 1: failing tests**: `encodeNotePicture limits` (a 4000×3000 canvas-like stub → ≤1600 longest edge; mime webp or jpeg; the encoder is injectable so tests run in node); `putAsset dedupes by content hash`; `parseAssetRefs finds ids`; server `PUT rejects mismatched hash`, `PUT then GET returns the bytes`, `requires auth`, `rejects >1.5MB`; useSync `pending upload retried and note renders placeholder` (upload fails once, succeeds next round; missing asset fetched).
- [ ] **Step 2–4:** implement; `npm run lint && npm test`.
- [ ] **Step 5: commit** `feat: store note pictures small and sync them by content hash`

### Task 3: Rich editor core in Notes

**Files:**
- Create: `src/components/notes/RichNoteEditor.tsx` (lazy-loaded default export), `src/components/notes/editorExtensions.ts`, `src/components/notes/rawMarkdownNode.ts`, `src/components/notes/EditorToolbar.tsx`, `src/utils/noteMarkdown.ts` (+ `.test.ts`)
- Modify: `src/components/StandaloneNotesView.tsx` (replace Edit/Split/Preview with the rich editor + a **Markdown** toggle that shows the existing textarea), `package.json` (add the TipTap packages listed in Tech Stack, `lowlight`, `mermaid`)

**Interfaces:**
- `RichNoteEditor({ noteId: string; markdown: string; onChange(markdown: string): void; onOpenLink(title: string): void; notes: { id: string; title: string }[]; onCreateNote(title: string): string /*id*/ })`. Keyed by `noteId`. Calls `onChange` only after a user edit (transaction with `docChanged` and not from `setContent`), serialising via `@tiptap/markdown`.
- `noteMarkdown.ts`: `markdownToDoc(md: string)` / `docToMarkdown(doc)` thin wrappers used by tests (node env: use `@tiptap/core` `getSchema` + the markdown manager without a DOM; if the markdown package needs a DOM, run those tests with `// @vitest-environment jsdom` and add `jsdom` as a devDependency).
- Raw block: any Markdown token the extensions don't handle (HTML blocks, front matter, footnotes, unknown fences) becomes `rawMarkdown` (atom node, `attrs.source`) rendered as a grey monospace block and serialised back verbatim.
- Extensions (this task): StarterKit (headings 1–6, bold, italic, strike, code, blockquote, lists, hr, link), TaskList/TaskItem (nested), Table (+Row/Header/Cell, resizable off), Placeholder ("Write…"), Markdown input rules from StarterKit.
- Toolbar: Bold, Italic, Strike, H1–H3 menu, bullet/numbered/checkbox list, quote, code block, table (insert 3×3; when inside a table: add/remove row/column, delete table), link, picture (Task 4 wires it), diagram (Task 5), **Markdown** toggle. On phones (< 768 px) the toolbar is a horizontally scrollable bar fixed above the keyboard using `visualViewport` offset.

- [ ] **Step 1: failing tests** `noteMarkdown.test.ts` on a fixture set (`fixtures/notes/*.md`: headings, nested lists, task lists, tables with alignment, code fences with language, blockquote, callout, html block, front matter, wiki links, tags, hr, links, images): `round trip preserves content` (parse→serialise→parse equals first parse); `unknown syntax kept verbatim in raw blocks`; `unedited note is not re-serialised` (component-level: mounting with markdown and unmounting calls `onChange` 0 times).
- [ ] **Step 2–4:** implement; existing Notes tests updated for the new editor; `npm run lint && npm test`; controller checks bundle split in `npm run build`.
- [ ] **Step 5: commit** `feat: rich text editor for Notes, Markdown underneath`

### Task 4: Pictures in the editor

**Files:** Modify `editorExtensions.ts`, `RichNoteEditor.tsx`, `EditorToolbar.tsx`; Create `src/components/notes/pictureNode.tsx`

**Interfaces:**
- Image node view resolves `daymark-asset:` src via `getAssetUrl(id)`; while missing shows a placeholder "Picture not synced yet" (and retries when `noteAssets` emits an `assets-changed` event); `https:` src renders directly with `loading="lazy"` and `referrerpolicy="no-referrer"`; other schemes are dropped by the sanitiser.
- Inputs: paste of image files / clipboard images (`handlePaste` with `clipboardData.files`), drag-and-drop files, toolbar "Picture" → file picker (`accept="image/*"`) or "From link" prompt dialog (`Dialog`, not `prompt()`). Each saved picture: `encodeNotePicture` → `putAsset` → insert `![alt] (daymark-asset:<id>.<ext>)` with alt = file name without extension.

- [ ] Tests: `pasted image becomes an asset reference` (mock clipboard file → markdown contains `daymark-asset:`), `https image stays a link`, `missing asset shows placeholder`. Implement; lint/test; commit `feat: paste, drop and link pictures in notes`.

### Task 5: Code highlighting, callouts and Mermaid

**Files:** Create `src/components/notes/calloutNode.ts`, `src/components/notes/mermaidNode.tsx`; Modify `editorExtensions.ts`, `src/components/MarkdownPreview.tsx` (render mermaid in previews too, lazily)

**Interfaces:**
- CodeBlockLowlight with common languages (ts/js/json/bash/python/css/html/sql/markdown/yaml), language label + picker.
- Callout node: Markdown `> [!TYPE] Title\n> body` ↔ node with `type`, `title`, content; types note/tip/info/warning/danger/success/question/quote; same colours as `MarkdownPreview` callouts.
- Mermaid: fenced ```` ```mermaid ```` ↔ `mermaid` node (attrs.source). Node view renders SVG with `mermaid.render` (dynamic import, `securityLevel: 'strict'`, theme follows app light/dark); click/Enter toggles an inline code editor (textarea) for the source; render errors show the message and the source, never blank.

- [ ] Tests: `callout round trip`, `mermaid fence round trip`, `mermaid render error shows message` (mocked mermaid). Implement; lint/test; commit `feat: code highlighting, callouts and Mermaid diagrams in notes`.

### Task 6: Styled paste and copy

**Files:** Create `src/components/notes/clipboard.ts` (+ `.test.ts`, fixtures `src/components/notes/fixtures/paste/{chatgpt,claude,gemini,article}.html` captured from real copies — create realistic samples by hand if real captures aren't available, covering h2/h3, bold/italic, ul/ol/nested, table with thead, pre>code with language class, blockquote, links, an `<img src="https://…">`, inline styles/classes/spans, script/style tags, and a `data:` image)

**Interfaces:**
- `cleanPastedHtml(html: string): string` — DOMPurify with an allow-list (headings, p, br, strong/b, em/i, s/del, code, pre, blockquote, ul/ol/li, input[type=checkbox], table/thead/tbody/tr/th/td, a[href], img[src,alt], hr), drop all `style`/`class` except `language-*` on code, unwrap spans/divs, remove `data:`/`blob:` imgs (they are handled as files, returned separately).
- `extractEmbeddedImages(html): Blob[]` for `data:` images → saved via the Task 4 path.
- Editor `handlePaste`: HTML → `cleanPastedHtml` → `insertContent` (TipTap parses HTML); plain text that looks like Markdown (heading/list/fence/table markers) → parse as Markdown; Ctrl/⌘+Shift+V → plain text.
- Copy: `clipboardTextSerializer` writes the selection as Markdown (`text/plain`); HTML stays TipTap's default (`text/html`).

- [ ] Tests: per fixture, `paste → markdown` contains the expected structures (e.g. `| --- |` table, ```` ```python ````, `## `, `- [ ]`), no `style=`, no `<script`; `markdown plain text paste parses`; `copy puts markdown in text/plain`. Implement; lint/test; commit `feat: paste from AI chats and web pages keeps structure`.

### Task 7: `[[link]]` autocomplete

**Files:** Create `src/components/notes/wikiLink.ts` (node/mark + suggestion), `src/components/notes/WikiSuggest.tsx`; Modify `editorExtensions.ts`, `StandaloneNotesView.tsx` (provide `notes`, `onCreateNote`)

**Interfaces:**
- Inline `wikiLink` node: Markdown `[[Title]]` / `[[Title|alias]]` ↔ node (attrs `title`, `alias?`); renders as a link-styled chip; click/Enter opens the note via `onOpenLink(title)`.
- Suggestion triggered by `[[` (via `@tiptap/suggestion`): popover list (uses `placeMenu` from Task 1) of notes whose titles contain the query (case-insensitive, max 8, most recently updated first), arrow keys/tap select, Enter or Tab inserts `[[Title]]`, Esc closes; last item `Create note "<query>"` when no exact title match → `onCreateNote(query)` then insert.

- [ ] Tests: `wiki link round trip with alias`, `suggestion filters and orders`, `create option only when no exact match`. Implement; lint/test; commit `feat: [[link]] autocomplete with create-note`.

### Task 8: Pictures in backups and Settings › Storage

**Files:** Modify `src/utils/vaultArchive.ts`, `src/utils/vaultStore.ts` (JSON export/import), `src/components/SettingsModal.tsx` (Storage tab section), `src/App.tsx` (wipe → clear assets; restore → import assets)

**Interfaces:**
- ZIP export: every referenced asset written to `Daymark/Notes/_assets/<id>.<ext>`; each note's Markdown file has `daymark-asset:<id>.<ext>` rewritten to a relative path to that file (`../_assets/<id>.<ext>` depth-correct); `vault.json` keeps the original `daymark-asset:` content plus `assets: NoteAssetMeta[]`. Import restores assets from `_assets/` (verifying hash) and keeps refs. JSON backup includes `assets: [{ meta, data: base64 }]`.
- Settings › Storage: "Pictures: N · X MB" (local), button **Remove unused pictures** → confirm dialog → after a successful sync (or local-only when sync is off), deletes assets referenced by no note locally and via `DELETE /api/assets/:id` on the server; toast with count.
- Wipe/sign-out deletes `noteAsset*` keys (database deletion already covers it — verify).

- [ ] Tests: `zip export rewrites refs and includes files`, `import restores assets`, `remove unused keeps referenced`. Implement; lint/test; commit `feat: pictures in backups and a storage cleanup`.

### Task 9: Browser coverage

**Files:** Modify `scripts/e2e-qa-regressions.mjs` (scenarios F1–F8), `scripts/e2e-sync.mjs`, `scripts/ux-suite.mjs` (update Notes selectors), `scripts/capture-screenshots.mjs` (`cycle-9` set)

- [ ] F1 rich editor renders a seeded note's headings/table/task list; F2 typing `## ` makes a heading and the saved Markdown has `## `; F3 paste the ChatGPT fixture via a synthetic `ClipboardEvent` with `text/html` → table + code fence in saved Markdown; F4 paste an image file → `daymark-asset:` ref, picture visible after reload; F5 Mermaid fence renders an `<svg>`; F6 Markdown toggle round trip; F7 `[[` autocomplete inserts a link and Create note works; F8 opening and leaving an unusual note pushes no sync change. Sync e2e: picture pasted on device A appears on device B. UX suite Notes selectors updated. Screenshots: notes-rich, notes-table, notes-mermaid, paste-result, menu-sheet-phone, menu-flip-desktop.
- [ ] Controller runs `npm run build && npm run test:qa && node scripts/ux-suite.mjs && npm run test:sync && npm run test:e2e`; commit `test: cycle 9 browser coverage`.

### Task 10: Docs and release notes

**Files:** `README.md` (Notes features), `.ai-configs/project/codebase-map.md` (Cycle 9 Modules), `.ai-configs/project/specification.md` (asset refs, endpoints, editor fidelity rules), `.ai-configs/project/api-and-sync.md` (`/api/assets`), `docs/releases/cycle-9/README.md` + images, `site/` (add a rich-notes screenshot and feature card)

- [ ] Plain user language, no process words; `npm run validate:ai` passes; commit `docs: cycle 9 release notes`.
