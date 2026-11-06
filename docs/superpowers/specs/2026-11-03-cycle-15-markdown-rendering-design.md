# Cycle 15: Test all Markdown rendering and editing paths

**Status:** Revised draft for owner review. Testing-only scope; independent builder review completed with no important blockers. No test execution or product-fix approval is implied by writing this document.
**Owner request:** Test all useful Markdown features together using shared scenarios. Record passing behavior and reproducible failures first. Plan and implement confirmed fixes in a separate cycle; features that pass need no changes.
**Date:** 2026-11-03.

## Intent

A note must remain readable and retain its content after opening it, making an unrelated edit, saving, switching modes and reopening it. A passing parser test alone does not establish this. The user needs real browser evidence for the rendering and editing paths they use on desktop, phone and tablet.

Cycle 15 is testing only. Cycle 16 is the conditional fix cycle, scoped from Cycle 15 findings rather than feature categories. Cycle numbers follow the latest Cycle 14 spec; they are not a release commitment.

## Current evidence and worktree boundary

The initial investigation reproduced these failures:

1. Notes: two `---` dividers can be consumed as one raw frontmatter block.
2. Notes: `----` initially renders, but rich editing serializes it as `---`; reload can then trigger failure 1.
3. Daily preview: frontmatter extraction can hide text between opening dividers, including `----` because of prefix matching.
4. Daily parsing: an opening `---` can consume the rest of the document when no closing metadata delimiter exists.

An uncommitted candidate fix and tests already exist in the worktree. They are investigation output, not approved Cycle 15 implementation. They affect `MarkdownPreview.tsx`, `editorExtensions.ts`, `rawMarkdownNode.ts`, `markdownEngine.ts`, their tests, and the new `frontmatter.ts`. Preserve that patch without applying, revising, discarding or committing it during this testing cycle. Execute the audit in an isolated checkout of the recorded unmodified baseline revision with only audit tooling added. Do not test this dirty candidate as if it were the baseline. Candidate evaluation belongs to the fix cycle.

The candidate passed 2,031 tests with one skipped, TypeScript and an alternate-output build. Disposable Chromium checks covered desktop/phone and both themes; one phone check timed out, then a rerun passed. These results describe the candidate only. They are not evidence that all Markdown rendering is correct or that the clean baseline passes the new contract.

## Goals and non-goals

### Goals

- Publish an explicit compatibility matrix for every Markdown family below, with executed evidence and gaps.
- Test semantic rendering, visible content and saved source together on both rendering paths.
- Detect and document any destructive interpretation of dividers, metadata, task identities and unsupported Markdown without repairing product code in this cycle.
- Add repeatable browser coverage with isolated fixture vaults, no private notes, no external network dependency and no manual production-vault setup.
- Preserve the existing Markdown storage format and existing editing controls.

### Non-goals

- Fixing product defects, including the known divider bug, or normalizing passing features. Every confirmed defect goes into the next-cycle ledger.
- Replacing TipTap or marked, installing a new Markdown/YAML parser, changing dependencies or redesigning the editor.
- Adding every syntax feature in the wider Markdown ecosystem. Unsupported syntax must remain recoverable; feature additions need separate approval.
- Changing task rollover, sync conflict resolution, handwriting, app navigation or note schemas.
- Automatically rewriting existing vaults, releasing an APK, publishing, pushing or opening a PR as part of this planning request.

## Architecture and rendering surfaces

Keep the existing two rendering paths and test their intentional differences:

| Surface | Current implementation | Contract |
| --- | --- | --- |
| Notes rich editor | `RichNoteEditor.tsx`, `editorExtensions.ts`, `noteMarkdown.ts`, `noteTextSerialization.ts` and node extensions | Supported syntax is editable; unsupported syntax stays visible/preserved as source. Unrelated edits must not lose content. |
| Notes Markdown mode | `StandaloneNotesView.tsx` | Source edits survive switching back to rich mode, saving and reopening. |
| Today section notes | `TodayView.tsx` → `MarkdownPreview.tsx` → `markdownHtml.ts` | Readable safe HTML, appropriate interactive checkboxes and internal links. |
| Calendar section notes | `CalendarView.tsx` → shared preview | Same content semantics; historical/read-only interaction differences remain intentional. |
| Daily Markdown view and archive | `markdownEngine.ts`, `vaultArchive.ts` | Parse/serialize and export/import preserve section text, task identities and machine metadata. |

Do not force rich editing and preview to produce identical HTML. Compare supported semantic outcomes; explicitly assert the source fallback for unsupported syntax. Baseline feature classifications must come from running fixtures, not from assuming a dependency supports a feature.

## Markdown compatibility matrix

Every row requires Notes rich/source checks, Today and Calendar preview checks, and source preservation checks through the applicable daily/archive path. Apply the shared scenario sequence below to each fixture where the surface supports that operation. A feature may be classified as native, preserved source, or intentionally restricted; every classification needs an explicit expectation. No empty matrix cell counts as passing coverage. Passing features still execute their tests; they are skipped only for fix work, not for testing.

| Family | Required cases and expectations |
| --- | --- |
| Paragraphs and text | Multiple paragraphs, soft/hard line breaks, trailing newline, CRLF, Unicode/Vietnamese, emoji, entities, literal ampersands and `<` comparisons; preserve readable text and intended breaks. |
| Headings | ATX levels 1–6; Setext headings; daily section headings versus nested note headings. `Text\n---` is a level-two heading, not a failed divider. |
| Dividers | `---`, `----`, `***`, `___`, `- - -`; opening, middle and final positions; multiple consecutive/blank-separated rules; surrounding prose; inside quotes/lists and code. Render only where Markdown defines a divider, retain source spelling through unrelated rich edits. |
| Frontmatter | Closed mapping headers; ordinary opening dividers; incomplete headers; exact delimiters versus four dashes; LF/CRLF; `...` closing delimiter; comments, nested fields, quoted/space-containing/Unicode keys; header-like text later in the body. Ambiguous valid mapping-style content at the start is treated as metadata by convention and documented. |
| Inline formatting | Bold, italic, strike, inline code, combined/nested marks, escaped delimiters, intraword underscores, literal punctuation; test unrelated edits and undo/redo. |
| Lists | Bullets, numbered lists with non-one starts, nesting, continuation paragraphs, blank lines and mixed content; preserve order, nesting and text. |
| Checklists and daily tasks | Checked/unchecked and nested items, ordinary note checklists versus daily task metadata; checkbox actions affect the intended item only, and readonly Calendar behavior is respected. |
| Blockquotes | Multiple lines/paragraphs, nesting, lists and rules within quotes; verify whether rich support or source fallback applies. |
| Callouts | Every currently advertised callout type, custom/empty titles, multiline/nested content, end-of-file and literal callout syntax in code; preserve original source when untouched. |
| Links | HTTPS/mailto, relative links/anchors, titles, autolinks and escaped punctuation. Unsafe destinations must not execute. Test click outcomes without external navigation. |
| Wiki links | Ordinary/date/alias/escaped titles, missing targets and creation, punctuation, links inside formatting and code; literal code never becomes an active note link. |
| Images | Local Daymark asset references, safe remote-shaped fixture URLs, inline/block placement, alt/title, missing assets, cleanup and export/import; no unrelated edit removes a reference. Intercept remote-shaped URLs locally. |
| Tables | Header/body, alignment, escaped pipes, inline formatting/wiki links/images, narrow screens; preserve cell content and offer usable overflow. |
| Code | Inline code, fenced known/unknown languages, fence options, backticks/tildes, indentation, incomplete fences and embedded Markdown-looking strings; keep code literal and source recoverable. |
| Mermaid | Valid and invalid diagrams, source edit/reload, literal diagram fences, safe failure UI; malformed diagrams must not blank or break the surrounding note. |
| Highlights | Existing supported coloured mark HTML, nested marks, unrelated edit, undo/redo, save/reload, clipboard and preview; colour and text survive within the current capability. |
| Raw HTML and comments | Supported inline HTML, opaque HTML blocks, ordinary comments and Daymark machine comments. Preview sanitizes HTML; rich source fallbacks preserve unsupported input. Machine comments remain stored and hidden in preview. |
| Preserved extensions | Footnote references/definitions, tags, math-like text, embeds and unknown syntax. Verify existing source fallback, not invented support or silent loss. |
| Combined note | One deliberately mixed note with the above families; edit near the beginning/middle/end so interacting tokenizers and serializer boundaries are exercised. |
| Empty/partial input | Empty note, whitespace, unfinished constructs, malformed markup and repeated open/save cycles; no crashes, silent deletion, unwanted save or parser hang. |

### Frontmatter test expectations

The test contract expects complete, leading mapping-style metadata blocks with exact delimiter lines. An unmatched opening rule remains Markdown text. Metadata keys must not be restricted to ASCII identifiers. A body divider must not become a header simply because another divider follows it. A source snippet whose first lines form a supported metadata mapping is inherently ambiguous; document the leading-header convention. These are independent expected outcomes for the audit, not instructions to implement a recognizer in Cycle 15.

Test consistency on all three paths against these explicit expectations, logging mismatches without changing product code:

- The opening delimiter is the first line at character zero: exactly `---` with optional trailing spaces/tabs. Leading blank lines or indentation mean ordinary Markdown, not a header. Do not call `trimStart()` before recognition. A leading BOM is outside this supported header subset; preserve it and the source instead of discarding data.
- The closing delimiter is an exact `---` or `...` line with optional trailing spaces/tabs. Four dashes never qualify. Both LF and CRLF are supported.
- The contents include at least one top-level mapping entry. A top-level entry has a nonempty plain or quoted key followed by a colon and whitespace/end-of-line. Plain keys can contain spaces and Unicode. Colons inside quoted keys do not end the key.
- Every other nonblank line is a mapping entry, a comment, or an indented continuation of an already-started entry. A top-level bare prose line invalidates header recognition. Thus `---\ntitle: Example\nordinary prose\n---` stays Markdown and must not be stripped by preview or daily parsing.
- This is conservative structural recognition, not full YAML validation. Complex YAML outside that subset stays visible Markdown/source and must not be silently removed. Indented nested mappings, sequences and scalar continuations are preserved as opaque header content; this cycle does not interpret their values.

Retain the current rich raw-source presentation for frontmatter. Do not implement a full YAML editor or flatten nested metadata into the preview as a new feature. If fixtures expose unsupported header shapes, preserve them and record the limitation before deciding a fix.

### Archive and daily metadata boundary

Standalone-note content and daily section-body content retain the fidelity guarantees above. Document-level daily frontmatter is different: the current `DailyDocument` stores the canonical date/type, and its serializer regenerates those fields. Preserving arbitrary custom daily-file header fields would require a separately approved storage change and is not promised here. Test and report that existing limitation explicitly for Markdown-only ZIP import. Test the full-fidelity archive path separately, including its `.daymark/vault.json` snapshot and assets; do not treat the snapshot as proof that standalone Markdown-only import preserves unknown fields. No new custom-field loss is acceptable within the existing schema, but this cycle does not invent a field bag.

## Test design and acceptance criteria

### Independent fixture expectations

Create a shared corpus under `fixtures/notes/rendering/`, with one focused fixture per family and mixed/edge variants. A JSON fixture manifest shared by the TypeScript tests and browser runner defines stable IDs, source paths, classifications, required visible text, semantic assertions and fidelity expectations. Expected text, counts, destinations and source tokens are literal, hand-reviewed values; never derive expected output by running the same renderer under test. Avoid full generated-HTML snapshots as the only oracle.

For each case, record an executed result per applicable path: pass, fail or blocked. Record native/source-fallback/restricted capability separately; a correctly preserved fallback passes its stated expectation. An operation absent from a surface may be marked not-applicable only with a reviewed reason, never because its assertion failed. A pending case is not a pass. A timeout must not masquerade as unsupported syntax. Start transitions from isolated fixture state so one failure cannot prevent other scenarios from running.

Keep the diagnostic tests separate from the normal green regression suite using `vitest.markdown-audit.config.ts` and `src/markdown-audit/*.audit.ts`. Run them explicitly with `npm.cmd exec -- vitest run --config vitest.markdown-audit.config.ts`. This command must exit nonzero when the product violates an expectation and still save all results. Do not introduce expected-failure annotations, silent skips or weakened assertions to obtain green output. Test-harness self-tests and the unchanged normal suite run separately.

### State transitions

1. Open without editing: inspect semantic DOM and readable content; opening/focusing alone must not save or normalize source.
2. Make a real unrelated edit before and after the tested block; await the actual save operation, inspect persisted source, reopen and inspect rendered content again.
3. Switch rich → Markdown → rich; edit Markdown explicitly, save and reopen.
4. Undo/redo a real edit and verify content remains correct; normal formatting normalization is allowed only where explicitly listed, never deletion or changing code into active syntax.
5. Copy/paste representative lists, tables, inline marks, wiki links, code and pictures through the real editor clipboard event path. State separately if an OS clipboard permission prevents a native clipboard check.
6. Export/import representative typed and daily notes in a disposable vault; verify task IDs/status/provenance, metadata and asset references as well as visible text.

Byte preservation is required for opaque/raw syntax, machine comments, unchanged highlight markup, existing asset references and divider spelling. Other native rich nodes may use current canonical Markdown spelling if their semantics and user content are unchanged. Existing stronger guarantees in tests remain in force.

### Real browser matrix

- Use the existing Playwright Core and installed Chromium/Edge tooling. Run against a fresh production build on a disposable local server and temporary data directory, using `scripts/helpers/server-session.mjs` fixture seeding.
- One desktop viewport: 1440×900; one phone: 390×844; one tablet: 1024×1366. Test light and dark themes.
- Execute all fixture families and their applicable shared scenarios in Notes, Today and Calendar across all six viewport/theme combinations. Reuse the same parameterized scenarios; do not split feature families into different cycles or silently sample away required cases. Run focused fixtures independently, then the combined note to expose interactions.
- Assertions cover visible text, element semantics, safe actions, persisted Markdown, error UI and containment/overflow. Screenshots accompany assertions; screenshots alone do not establish correctness.
- Wait on save state/persisted data and loaded content, not fixed sleeps. Report browser/page errors. Stub external fonts, image responses and link navigation; never call personal servers or write the owner's notes.
- Capture focused screenshots for Notes, Today and Calendar on all six configurations. Inspect them; document browser emulation separately from physical Android/S Pen verification.

### Testing-cycle completion and product-release gates

Cycle 15 is complete when the required matrix and shared scenarios have executed evidence, the known divider scenarios have actual pass/fail evidence against the unmodified baseline, every failure is classified with a minimal repro/severity/evidence, and the reviewed testing release docs are present. If a previously reported failure no longer reproduces, record the baseline difference and outcome rather than forcing it to fail. Product failures are valid audit findings and do not require fixes to complete a testing-only cycle. Harness failures and unexplained timeouts are blockers until resolved or explicitly accepted as remaining coverage gaps; never call required blocked cases covered.

Testing-cycle completion does not mean the product is release-ready. Data-loss or script-execution findings block a product release and must be carried prominently into the next-cycle handoff. The audit command remains nonzero for actual failures. Report normal-suite, audit and browser results separately. Passing features require no product changes; they remain in regression coverage.

Cycle 16 can begin only after the owner approves the findings and a concrete defect-specific spec/plan. It handles confirmed defects, including the divider bug if reproduced, and reruns the exact failed scenarios plus the full audit/regression matrix. Evaluate the parked candidate there rather than assuming it correct. If no defects are confirmed, record that evidence and skip the fix cycle instead of manufacturing changes.

## Required release documentation for each executed cycle

Release documentation is part of cycle completion, even when no version is tagged or published. Follow `.ai-configs/workflows/release-handoff.md` and `.ai-configs/templates/release-doc.md`.

- Create `docs/releases/cycle-15/README.md` as a testing-cycle handoff: test tooling added, baseline revision, exact commands/outcomes, reviewed screenshots, full compatibility/results links, reproducible defect ledger, coverage gaps and proposed fix-cycle scope. State explicitly that no product fixes shipped and distinguish audit completion from product release readiness.
- Store reviewed screenshots in `docs/releases/cycle-15/images/` and machine-readable rendering results in `docs/releases/cycle-15/rendering-results.json`. Embed the screenshots in the README with descriptive captions. Include focused rendering evidence from the six viewport/theme configurations as well as the standard release captures.
- Add Cycle 15 captures to `scripts/capture-screenshots.mjs`, run `node scripts/capture-screenshots.mjs cycle-15`, and visually inspect every capture. Preserve the standard desktop 1440×900 and Android 412×915 release sizes; these supplement the rendering test viewports rather than replacing them.
- Update `docs/README.md` and `docs/ROADMAP.md` with the cycle outcome and links. Record actual session/token usage only when available; otherwise state that it was unavailable rather than inventing totals.
- Verify the handoff links, referenced evidence files and `npm run validate:ai`. Missing release documentation or unreviewed screenshots mean the cycle is incomplete.
- If Cycle 16 executes, produce the equivalent `docs/releases/cycle-16/` report, evidence and index/roadmap updates for its own changes. Do not pre-create a completed release report for work not yet performed.

## Delivery stages

| Stage | Deliverable | Gate |
| --- | --- | --- |
| Planning now | This spec, Cycle 15 implementation plan, independent builder review and documented assumptions | Owner reviews scope and execution method before product/test code changes. |
| Cycle 15: testing only | Baseline inventory, all-family shared fixtures/scenarios, isolated parser/component/browser audit, reviewed evidence and testing release docs | Required coverage accounted for; defects and gaps independently reviewed; no product fixes. |
| Cycle 16: fixes, conditional | Defect-specific reviewed spec/plan based on the ledger, approved corrections and rerun of failed scenarios plus full regression | Separate owner approval; passing features need no changes; no speculative fixes or implied publication. |

## Constraints

- No dependency, lockfile, note schema, deployment or infrastructure changes without separate approval.
- Never run tests against personal vault data; never destructively rewrite user notes.
- Preserve Daymark machine-comment format, task IDs/status/provenance and rollover idempotency.
- Keep desktop full-width and standard Tailwind stone palette; no layout redesign.
- Exercise current editor/preview components without changing product behavior; only fixtures, test tooling and evidence/documentation may change in Cycle 15.
- No implementation starts until the owner approves this spec and the implementation plan.

## Decisions proposed by the agent

- Use the existing renderer stack and a shared test corpus; a renderer unification or YAML-library migration would add risk outside the reported need.
- Use browser automation plus persisted-source assertions instead of relying on unit counts or screenshots alone.
- Split the all-feature testing cycle from the evidence-based fix cycle. All defects, including dividers, stay unfixed during Cycle 15; passing features need no fixes.
- Proposed default execution is task-by-task implementation with independent reviews. The owner may choose inline execution with an end review instead.

## Review record

The earlier combined testing/fixing draft received independent builder review. It clarified header recognition beyond the first key and daily document-level metadata versus body preservation. Those expectations remain explicit above. The owner subsequently chose testing first for all features, with fixes in a separate cycle; this revision removes product corrections from Cycle 15, isolates the audit from the dirty candidate, and separates genuine diagnostic failures from the normal regression suite. An independent review of the revised scope confirmed those boundaries, all-family/shared-scenario coverage, honest failure reporting and required release documentation, with no important blockers. Owner approval is still required before execution.
