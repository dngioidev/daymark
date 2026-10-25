# Cycle 9: menus that always fit, and a rich editor for Notes (design)

Date: 2026-10-25 · Status: draft for approval · Scope: desktop/web, phone-sized web and the Android app.

## Why

1. **Task menus get cut off.** On a phone, opening the "…" menu of a task near the bottom of the screen runs the menu under the bottom tab bar and off the screen (user screenshot: "Move to tomorrow / Move to date… / Rename / Details & history", with the rest hidden behind the tab bar). On desktop a menu near the window bottom can also run off. Cycle 8 fixed menus being hidden behind later sections only. The user wants the menu UX fixed completely, not patched again.
2. **Notes are plain text.** The user writes in Notes and pastes a lot from ChatGPT, Claude, Gemini and web pages. Today's Notes editor is a Markdown textarea with Edit/Split/Preview; pasted answers lose their structure, there are no pictures, tables are awkward and diagrams don't render. The user wants a real rich-text editor (they picked "pure rich text, like Notion or Google Docs" over Obsidian-style live preview and over split view), with Obsidian as the reference for keeping Markdown as the file format.

Success: on a 390 px phone any task's menu opens fully usable wherever the task is; in Notes the user pastes an AI answer and gets the same headings, lists, tables and code blocks, pastes a screenshot and sees it on their phone after sync, and draws a Mermaid diagram that renders in place, while the note is still a clean Markdown file in exports.

## Goals

- **A. Menus that always fit** (all popup menus, task menu first).
- **B. Rich editor in Notes** with pictures, tables, Mermaid diagrams and styled copy/paste, Markdown as the stored format.
- **C. Pictures stored small and synced** across devices and included in backups.

## Non-goals

- Today's day notes (section notes in the daily editor) stay as they are: simple, Markdown, no rich editor.
- No video, audio, PDF or other attachments; pictures only.
- No real-time collaboration, comments or version history.
- No drawing/whiteboard canvas, no embedded web pages.
- No change to how tasks are stored or rolled over.

## Anti-goals

- **Markdown damage.** Opening and saving a note must not rewrite Markdown the user didn't touch beyond trivial normalisation. Anything the editor can't represent (raw HTML, unusual syntax, front matter) is kept exactly and shown as a small grey "raw Markdown" block, never dropped.
- **Storage or sync bloat.** Full-size photos, unbounded picture storage, or pictures making sync slow or failing for notes.
- **Paste junk.** Fonts, colours, ads, layout tables or tracking images from web pages ending up in notes.
- **A menu that still clips,** jumps around, or is unreachable by keyboard.
- **A slower app.** Mermaid and the editor must not slow app start or the Today screen (load them only when Notes needs them).

## A. Menus that always fit

Decided with the user:

- **Phones** (narrow screens / touch): the task "…" menu, the task status menu and other row menus open as a **bottom sheet** that slides up above the bottom tab bar, with the task title as its heading, large touch targets, a dimmed backdrop, swipe-down / tap-outside / Back to close. It is never cut off, wherever the task sits.
- **Desktop:** menus open as a popover attached to their button that **flips above** when there isn't room below, shifts sideways to stay inside the window, and scrolls inside itself if taller than the space available. Menus render on top of everything (not inside the card), so no section, photo-mode card or sticky bar can cover them; the cycle-8 z-index workaround becomes unnecessary.
- Applies to every menu built on the shared `Menu` component (`src/components/ui/Menu.tsx`): task "…" and status menus, the Today page "…" menu, Calendar/notes menus.
- Keyboard and screen-reader behaviour stays: focus moves into the menu, arrow keys move, Esc closes and returns focus to the button, Back closes the sheet on Android.

## B. Rich editor in Notes

Decided with the user:

- **Where:** the Notes tab editor only (desktop, phone web, Android app). Replaces the textarea and the Edit/Split/Preview switch with one rich editor. A **Markdown** button switches the note to raw Markdown editing (the current textarea), and back.
- **Feel:** like Notion/Google Docs: no Markdown symbols visible; a toolbar (on phones it sits above the keyboard) plus keyboard shortcuts. Typing Markdown shortcuts converts instantly (`## `, `- `, `1. `, `[] `, `> `, `**bold**`, `` `code` ``, ```` ``` ````, `---`).
- **Content:** headings; bold, italic, strikethrough, inline code, links; bullet, numbered and checkbox lists (ticking works in the editor); quotes; Obsidian callouts (`> [!TIP] Title`); dividers; code blocks with syntax colouring and a language label; **tables** (insert, add/remove rows and columns, header row); **pictures**; **Mermaid diagrams** (a ```` ```mermaid ```` block renders as a diagram; clicking it opens its code for editing; a diagram with an error shows the error and the code, never a blank); `[[wiki links]]` to other notes as today; `#tags` as today.
- **Saved format:** Markdown, as today (`StandaloneNote.content`). Exports, sync, search, note previews, templates and the Markdown view keep working unchanged on that Markdown.
- **Paste in:** content copied from ChatGPT, Claude, Gemini or a web page keeps headings, bold/italic, lists, tables, code blocks (with language), links, quotes and pictures-as-links; fonts, colours, styles, scripts, ads and layout are dropped. Ctrl/⌘+Shift+V pastes plain text. Markdown pasted as plain text (e.g. from an AI "copy" button that gives Markdown) is parsed as Markdown.
- **Copy out (my call, the user didn't object):** copying from the editor puts both formatted text (HTML) and Markdown on the clipboard, so Gmail/Word/chat boxes get formatting and plain text fields or Obsidian get Markdown.

## C. Pictures

Decided with the user:

- **Three sources:** paste a screenshot/image, pick or drag a file, or paste/insert a link to an online image.
- **Saved pictures** (paste/file) are shrunk before saving to save storage (my call on values: longest side at most **1600 px**, WebP or JPEG at quality ~**0.8**, aim ≤ **400 KB**; animated GIFs are converted to a still image). In Markdown they appear as `![alt](daymark-asset:<id>)`-style references the builder chooses, readable by Daymark and exported as real files in the ZIP (`Notes/_assets/…`) with the note's links rewritten to those files so the export opens in Obsidian.
- **Online images** stay as normal Markdown image links (`![](https://…)`) and are shown from the web; nothing is downloaded.
- **Sync:** saved pictures **sync to the user's other devices** through their server, like notes, and are included in ZIP/JSON backups and restored. Pictures are never deleted automatically (my call): Settings › Storage shows how much space pictures use and offers **Remove unused pictures**, which deletes pictures no note references (checked against the whole synced vault after a sync).
- **Not synced yet:** a note that references a picture this device hasn't received shows a quiet "Picture not synced yet" placeholder and fills in after the next sync.
- **Wipe/sign-out** removes local pictures with the rest of the data.

## Constraints

- Stack and invariants from `CLAUDE.md`: React 19/TS/Vite/Tailwind v4 stone palette only, `max-w-[1800px]`, types in `src/types/daymark.ts`, daily Markdown comment format untouched, rollover idempotent.
- Sync is entity-based JSON over the existing server (`server/app.ts`, 25 MB JSON body limit, `MAX_CHANGES_PER_SYNC`); new entity kinds need server validation and must not be sent to clients that don't understand them (follow the cycle-7 `features` gating pattern) so a 1.5.0 device can never delete pictures.
- Existing sanitisation (DOMPurify in `MarkdownPreview`) must still protect against script injection from pasted HTML, Markdown and Mermaid (Mermaid in strict security mode).
- Heavy libraries (editor, Mermaid, syntax highlighting) load lazily when Notes opens; the main bundle stays roughly its current size.
- Works offline; pictures added offline sync later.
- Light/dark and background-photo modes stay readable (WCAG 4.5:1 text), touch targets ≥ 44 px.
- Ships as **1.6.0**.

## Verification expectations

- Unit tests: Markdown round trip for every supported block (open → save unchanged), raw-block preservation, paste conversion fixtures (saved HTML from ChatGPT, Claude, Gemini and a typical article), picture shrinking limits, asset reference/export rewriting, sync merge and gating for pictures, menu placement maths.
- Browser e2e: task menu fully visible for the last task on a 390×844 phone and at the bottom of a 1440×900 window; sheet closes with Esc/backdrop; paste fixtures produce the expected blocks; a pasted image shows after reload and on a second synced device; a Mermaid block renders; the Markdown toggle round-trips.
- Android build + manual check of the sheet and the toolbar above the keyboard.

## Left to the builder

- Editor library (e.g. a ProseMirror-based editor with a Markdown serializer) and Mermaid/highlighting libraries, subject to the anti-goals and constraints.
- The picture storage/sync entity shape and asset reference syntax.
- Exact toolbar layout, icons and sheet animation.

## Calls I made (not discussed with the user)

- Copy out puts both HTML and Markdown on the clipboard.
- Picture limits: 1600 px, ~0.8 quality, ≤ 400 KB target; GIFs become stills. No automatic deletion; a manual "Remove unused pictures" in Settings › Storage. No storage quota; Settings shows usage.
- Pictures travel as their own sync entities in the existing JSON sync, base64, one picture per entity; a sync round is split so a request stays well under the server's 25 MB body limit.
- Pasted HTML with embedded (`data:`/blob) images or an image file on the clipboard → saved picture; `https://` images in pasted HTML → links (an expiring link from an AI chat may stop showing; accepted).
- A device still on 1.5.0 sees picture references as plain text/broken images and keeps them when editing the note's text; accepted (only 1.6.0+ shows pictures).
- Markdown fidelity: the editor keeps the note's original Markdown string until the user actually edits; after an edit the note is saved in a consistent style (bullet marker, table padding, escaping may normalise) while content and raw blocks are preserved. Round-trip tests check content equivalence on a fixture set, and byte-exactness for unedited notes.
- Bottom sheets below 768 px viewport width (the app's phone layout); popovers from 768 px up. Sheet heading: the task title for task menus, otherwise the menu's own heading or its button label.
- `[[wiki links]]` are typed as today and render as links; no autocomplete this cycle. Tags and templates work on the Markdown as today.
- Existing browser scenarios that type into the Notes textarea may be rewritten for the new editor.
- Pictures from pasted web content stay as links (consistent with "online images stay links").
- The Markdown button keeps the current textarea as the raw editor.
- Release version 1.6.0.
