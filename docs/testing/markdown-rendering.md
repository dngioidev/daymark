# Markdown rendering: compatibility table and defect ledger (Cycle 15)

Baseline revision: `2c84344` (release 1.11.1, before any Markdown fix). Testing only: no product code changed.
Evidence: [`docs/releases/cycle-15/`](../releases/cycle-15/README.md).

## How to run

```bash
npm exec -- vitest run --config vitest.markdown-audit.config.ts   # diagnostic audit; non-zero on real product failures
npm run build && node scripts/e2e-markdown-rendering.mjs          # browser matrix: 3 viewports x light/dark x Notes/Today/Calendar
```

Fixtures live in `fixtures/notes/rendering/` (`cases.json` holds hand-written literal expectations).

## Compatibility table (baseline)

| Family | Notes rich editor | Today / Calendar preview | Daily parse + archive |
| :--- | :--- | :--- | :--- |
| Paragraphs, headings, setext, line breaks, Unicode | pass | pass | pass |
| Inline marks, lists, nested lists, checklists, blockquotes, tables | pass | pass | pass |
| Links, unsafe `javascript:` links | pass | pass | pass |
| Images / missing asset | pass (visible "Picture unavailable") | pass | pass |
| Mermaid (valid and invalid) | pass, note not blanked | pass | pass |
| Raw HTML, comments, footnotes, embeds, math-like | pass (preserved source) | pass, scripts and handlers stripped | pass |
| Callouts | pass (preserved source) | pass | pass |
| Machine comments, task id/status/provenance | n/a | hidden in preview, pass | pass (full and Markdown-only) |
| Frontmatter, closed mapping header, Unicode and spaced keys, CRLF, `...` close | pass (raw block) | pass | pass |
| **Dividers** (`---` ×2, middle `---`) | **fail D2** | **fail D1** | **fail D1** |
| **Dividers** (`----`, `***`, `___`, `- - -`) spelling | **fail D3** | `----` fails D1; others pass | pass |
| **Malformed / unclosed headers** | text kept | **fail D4** | **fail D1** |
| **Code containing `[[..]]` or `> [!NOTE]`** | pass | **fail D5** | pass |
| Highlights | **fail D6** (low) | pass | pass |
| Paste of plain `[[Note]]` | **fail D7** (low) | n/a | n/a |

## Defect ledger

| ID | Severity | Defect | Minimal input | Evidence (fixture, surface) |
| :--- | :--- | :--- | :--- | :--- |
| D1 | High, content loss | Preview and the Daily parser treat an opening `---` block as frontmatter. Preview hides the text between two opening dividers; the Daily parser drops it, and the loss is saved. An unclosed `---` makes the parser drop the rest of the file. | `---\n\nFirst section\n\n---\n\nLast section` | divider-dash3, divider-dash4, frontmatter-unclosed: Today and Calendar, 6 configs; renderers.audit "known" daily cases |
| D2 | High | The Notes editor consumes two `---` dividers as one raw frontmatter block: no rules render and the text shows as raw source (text kept). Also `Intro\n\n---\n\nTime: noon\n\n---\n\nEnd`. | same as D1; divider-middle | divider-dash3, divider-middle: Notes, 6 configs, open, reopen, Markdown to rich |
| D3 | Medium | Rich editing rewrites `----`, `***`, `___`, `- - -` as `---` after an unrelated edit; reload then triggers D2. | `----\n\nA\n\n----\n\nB` plus an edit | divider-dash4, divider-star, divider-underscore, divider-spaced: Notes edit-save, 6 configs |
| D4 | Medium | Preview takes a malformed header as metadata and hides prose lines. Four-dash closers and a leading blank line also become metadata. | `---\ntitle: Example\nordinary prose\n---\n\nBody` | frontmatter-prose-line: Today and Calendar, 6 configs |
| D5 | Medium | Preview applies callout and `[[wiki]]` rewriting inside code, so literal code becomes active HTML or disappears. The screenshots show raw `<div class="daymark-callout…">` inside a code block. | fenced block containing `[[Not Link]]` and `> [!NOTE] x`; `` `[[Literal Code]]` `` | code and wikilinks: Today and Calendar, 6 configs; images `md-today-phone-dark.png`, `md-calendar-tablet-light.png` |
| D6 | Low | An unchanged coloured highlight gains `data-color` on round trip; the spec requires byte preservation. | `<mark style="background-color: #fde68a">x</mark>` | highlights: Notes edit-save, 6 configs |
| D7 | Low, possibly intended | Pasting plain text `[[Note]]` stores `\[\[Note\]\]`, so it is not a wiki link. | paste `See [[Another Note]]` | clipboard-archive.audit |

## Not defects (classified)

- Intended normalisation of native nodes: `~~~` fences become backtick fences; an unclosed fence is closed on save; a hard `<br>` appears for soft newlines in preview (`breaks: true`).
- Existing limitation, characterised by a passing audit test: unknown document-level daily header fields are not stored.
- Harness mistakes found and fixed during execution (initial results retained in `audit/*.initial.json` and `rendering-results.initial.json`): ProseMirror's internal separator `<img>`, machine comment layout, section heading counted in preview scope, task checkbox selector, phone navigation button, edit click placement.
- Reviewed not-applicable: empty notes have no preview block in Today and Calendar (12); the `partial` fixture end-of-note edit sentinel sits inside the unclosed fence (6).
- **Unresolved intermittency:** three Notes `edit-save` runs failed once each in the initial matrix (frontmatter-prose-line desktop/light, frontmatter-crlf desktop/light, raw-html desktop/dark; typed text landed near the start of the note) and did not recur in the six-configuration rerun. Cause not established.

## Coverage gaps

- Browser: clipboard is synthetic events only; no OS clipboard check. Viewport emulation only, no physical Android or S Pen.
- Undo/redo is checked for content survival, not exact history.
- Internal-link click navigation and wiki-link creation were not exercised in the browser; Today checkbox toggling was (checklist fixture, passes).
- Screenshots: 18 captured; 3 were opened and inspected individually. The others are covered by assertions, not visual review.
