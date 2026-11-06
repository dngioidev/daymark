# Cycle 15: All-Feature Markdown Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Revised draft for owner review. Testing-only cycle; all steps remain unchecked. Writing this plan does not start execution or authorize product fixes.

**Goal:** Run shared scenarios across all useful Markdown features in Notes and Daily Notes, record passes and reproducible issues, and hand confirmed defects to a separate fix cycle without changing product behavior.

**Architecture:** Exercise unchanged TipTap/marked product paths using one shared fixture corpus and parameterized scenarios. Keep diagnostic audit tests outside the normal regression suite, preserve their genuine failures, and record semantic DOM, persisted Markdown and browser evidence. Run on an isolated baseline checkout; park the earlier candidate patch for the fix cycle.

**Tech Stack:** Existing TypeScript/React, TipTap, marked, DOMPurify, Vitest/jsdom, Playwright Core, installed Chrome/Edge and current archive helpers. No new dependencies.

**Spec:** [Cycle 15 testing design and Cycle 16 boundary](../specs/2026-11-03-cycle-15-markdown-rendering-design.md).

## Global Constraints

- No dependency, lockfile, note schema, deployment or infrastructure changes without separate approval.
- Never run tests against personal vault data; never destructively rewrite user notes.
- Preserve Daymark machine-comment format, task IDs/status/provenance and rollover idempotency.
- Keep desktop full-width and standard Tailwind stone palette; no layout redesign.
- Exercise current editor/preview components without changing product behavior; only fixtures, test tooling and evidence/documentation may change in Cycle 15.
- No implementation starts until the owner approves this spec and the implementation plan.

## Review Focus

1. Metadata-looking body text, malformed later header lines, indentation and Unicode/space-containing keys must not cause text loss. Task 2 owns these tests; Task 5 classifies findings.
2. Markdown-looking content inside code or escaped text must not become active links, callouts or diagrams. Tasks 2 and 4 own these tests.
3. Real unrelated edits followed by persistence/reload must retain opaque syntax, dividers, highlights and assets. Tasks 3 and 4 own these tests.
4. Daily metadata/task identity and full-fidelity versus Markdown-only archives have different explicit guarantees. Tasks 2 and 3 own these tests.
5. Phone/tablet overflow, asynchronous save, missing assets and invalid diagrams need usable visible outcomes. Task 4 owns these tests.

## File map and interfaces

| File | Responsibility |
| --- | --- |
| `fixtures/notes/rendering/cases.json` and focused `.md` files | Independent source fixtures and literal expectations shared by unit and browser checks. |
| `src/test/markdownRenderingFixtures.ts` and `.test.ts` | Test-only typed manifest validation and file loading. |
| `vitest.markdown-audit.config.ts` | Explicit diagnostic suite selection; leaves normal `vitest.config.ts` and regression tests unchanged. |
| `src/markdown-audit/renderers.audit.ts` | Real rich, daily and preview rendering/serialization checks. |
| `src/markdown-audit/editor.audit.ts` | Actual editor callbacks, unrelated edits, no-op saves, mode transitions and undo/redo. |
| `src/markdown-audit/clipboard-archive.audit.ts` | Real clipboard event path and full versus Markdown-only archive fidelity. |
| `scripts/e2e-markdown-rendering.mjs` | Disposable production-app browser assertions, persisted-source checks, screenshots and results. |
| `docs/testing/markdown-rendering.md` | Compatibility table, run instructions, findings and conditional next-cycle scope. |
| `docs/releases/cycle-15/README.md`, `rendering-results.json`, `images/` | Executed evidence and reviewed screenshots, created during execution only. |

Use a JSON manifest so Vitest and Node share inputs. Proposed test-only interfaces:

```ts
type RenderingExpectation = {
  mode: 'native' | 'preserved-source' | 'restricted';
  visibleText: string[];
  elements: { selector: string; count: number }[];
  sourceTokens: string[];
};
type MarkdownRenderingCase = {
  id: string;
  family: string;
  sourceFile: string;
  notes: RenderingExpectation;
  preview: RenderingExpectation;
  daily: { sourceTokens: string[]; taskIds: string[] };
  fidelity: 'verbatim' | 'semantic';
};
```

`loadMarkdownRenderingCases(): Array<MarkdownRenderingCase & { source: string }>` validates/loads manifest and sources. Expectations are hand-reviewed literals, not renderer output. Element selectors are scoped to the rendered body/editor. Fixture-specific interaction and safety assertions stay in tests, not executable JSON callbacks. `daily.sourceTokens` covers body content and canonical metadata, not unknown document-level fields. Keep capability (`native`, `preserved-source`, `restricted`) separate from an executed result (`pass`, `fail`, `blocked`, `not-applicable`); the last requires a reviewed surface/operation reason.

Create `vitest.markdown-audit.config.ts` using the existing Vitest tooling with `include: ['src/markdown-audit/*.audit.ts']` and jsdom where needed. The normal config does not select these files. Run audit cases explicitly; an actual defect produces a nonzero audit exit plus saved results, never an expected-failure annotation. Use fresh fixture state per transition so failures do not cancel unrelated scenarios. Shared browser scenarios are reused for every fixture and all applicable surfaces; passing features still run and receive no fix tasks.

## Task 1: Establish baseline evidence and a complete corpus

**Files:** Create manifest, fixtures, test-only loader/tests and `docs/testing/markdown-rendering.md`. Inspect/reuse existing `fixtures/notes/rich-core.md` and `unsupported.md` where appropriate.

**Interfaces:** Consumes a recorded unmodified HEAD baseline revision; preserves the current candidate separately. Produces the loader above and a ledger mapping every spec family and edge case to fixture IDs.

- [ ] Confirm spec/plan approval and execution method. Read repository rules, preserve the existing diff plus untracked investigation files in an execution evidence directory, and inventory unrelated changes. Never reset or discard the worktree.
- [ ] Use an isolated baseline checkout through the app worktree mechanism and applicable worktree skill. Record its revision and confirm product source matches that baseline; add only audit tooling there. Preserve the dirty candidate in the current checkout, without applying, revising or discarding it. Do not use the candidate's earlier passing results as audit evidence.
- [ ] Write loader tests for duplicate IDs, missing source files, missing surface expectations and invalid modes. Run `npm.cmd test -- src/test/markdownRenderingFixtures.test.ts`; observe the missing-loader/validation failures, then implement the loader and obtain passing results.
- [ ] Add focused fixtures covering every family and listed edge case from the spec, plus a mixed note. Define literal visible-text, semantic and source expectations. Record intended behavior and observed baseline behavior in separate ledger columns.
- [ ] Review the corpus against the spec matrix. Every family maps to fixtures; every edge case maps to a named fixture or parameterized variant. Do not modify product code or claim coverage from assertion count alone.

## Task 2: Pin rendering and parser behavior on both paths

**Files:** Create `vitest.markdown-audit.config.ts` and `src/markdown-audit/renderers.audit.ts`. Read existing parser/preview tests for conventions; do not change product source or weaken the normal suite.

**Interfaces:** Consumes Task 1 corpus and existing `markdownToDoc`, `docToMarkdown`, `renderMarkdownHtml`, `parseDailyDocument`, `serializeDailyDocument` and `MarkdownPreview`. Produces semantic/source evidence and minimal reproductions.

- [ ] Add real-renderer tests: `---\n\nFirst section\n\n---\n\nLast section` produces two rules and both paragraphs in rich and preview DOM. Repeat for `----`, `***`, `___`, `- - -`, positions and nesting. `Title\n---` produces a heading instead.
- [ ] Add explicit header cases for complete mapping blocks, incomplete blocks, malformed top-level prose after a key, exact versus four-dash delimiters, leading whitespace/BOM, later body text, LF/CRLF and both closing delimiters. Assert the precise recognition/preservation behavior from the spec, including quoted, nested, space-containing and Vietnamese keys.
- [ ] Exercise every corpus family through real parsers/renderers. Assert literal required text, structural counts and destinations. Unsupported features assert their source fallback; never invent support or generate the oracle from the renderer.
- [ ] Assert wiki/callout/HTML/checkbox/diagram-looking content inside code stays literal and inactive. Exercise sanitizer cases with deterministic local content and no external navigation.
- [ ] Add daily tasks with fixed literal IDs, status and provenance. Ordinary section checklists remain note content; machine comments remain stored and hidden in preview. Keep unknown document-level daily fields separate from guaranteed body preservation.
- [ ] Run `npm.cmd exec -- vitest run --config vitest.markdown-audit.config.ts src/markdown-audit/renderers.audit.ts`. Save all case results even when the command exits nonzero. Record the actual outcome of known divider scenarios and any new failures with minimal input; if an earlier issue no longer reproduces, record the exact baseline difference rather than forcing a failure. Do not weaken expectations, skip bugs or fix product code.

## Task 3: Verify editing, source modes, clipboard and archives

**Files:** Create `src/markdown-audit/editor.audit.ts` and `src/markdown-audit/clipboard-archive.audit.ts`; reuse test patterns from existing rich editor, standalone view, clipboard and archive tests without modifying their expectations.

**Interfaces:** Consumes corpus and existing real editor/clipboard/archive APIs. Use current typed `RichNoteEditor` callbacks, TipTap transactions, `buildVaultZip` and `importVaultFromZip` signatures; retain domain types from `src/types/daymark.ts`. Produces reproducible transition tests and ledger entries.

- [ ] Assert opening/focusing emits no save and leaves original source unchanged. Make real edits before and after each tested block, undo/redo and replace source through the incoming-prop path; inspect callback/persisted source and reparsed semantics.
- [ ] Assert unchanged `----` spelling survives a real unrelated edit and reload with the correct rule count. Assert literal tokens for raw syntax, highlights and asset references; use semantic equivalence only for the native-node normalization explicitly allowed by the spec.
- [ ] Exercise rich → Markdown → rich state and an actual source edit using existing view handlers. Keep state tests focused; full browser mode-switch/save/reopen behavior belongs to Task 4.
- [ ] Paste representative lists, tables, inline marks, code, wiki links and images through real editor clipboard events. Assert sanitized output and saved source; do not substitute a mocked serializer.
- [ ] Export/import mixed standalone and daily fixtures in a disposable vault. Assert text, comments, task identity/status/provenance and asset references. Test full-fidelity archives separately from Markdown-only ZIPs; explicitly characterize the existing lack of arbitrary daily-header-field storage without adding a new schema.
- [ ] Run `npm.cmd exec -- vitest run --config vitest.markdown-audit.config.ts src/markdown-audit/editor.audit.ts src/markdown-audit/clipboard-archive.audit.ts`. Add every failure to the ledger with fixture, transition, expected/actual outcome, severity and user impact. Defer all product corrections to Cycle 16.

## Task 4: Add real production-browser coverage

**Files:** Create `scripts/e2e-markdown-rendering.mjs`; update `docs/testing/markdown-rendering.md`. Reuse `scripts/helpers/server-session.mjs` and repository polling conventions.

**Interfaces:** Consumes the manifest, sources and a fresh production build. CLI: `node scripts/e2e-markdown-rendering.mjs [--case=<fixture-id>] [--viewport=desktop|phone|tablet] [--scheme=light|dark]`. No filters runs the specified matrix. Outputs `{ caseId, surface, viewport, scheme, transition, status, detail, screenshot? }` records; nonzero exit for failures, timeouts or required unexecuted cases.

- [ ] Create a disposable production server using a temporary data directory, suite-only password, unused local port and fresh browser contexts. Seed fixtures with existing helpers. Poll readiness and close only owned processes in `finally`; never inspect private credentials or production vaults.
- [ ] Execute every fixture and the combined note in Notes, Today and historical Calendar previews across all six configurations: desktop 1440×900, phone 390×844, tablet 1024×1366, each light/dark. Reuse the same scenarios for opening/rendering, real unrelated edits, applicable mode switches, save/reopen, undo/redo and appropriate feature actions. Seed Today from the browser's local date and historical dates explicitly.
- [ ] Scope DOM assertions to the feature body and preserve section-heading context. Record unsupported operations such as rich mode within a read-only preview as not-applicable with a reviewed reason. All applicable cases execute; do not silently sample away families on phone/tablet or equate a passing feature with a skipped test.
- [ ] Use actual mode controls and typing. Await persisted source/save completion, reload/reopen and assert source spelling, visible text and semantics. Test undo/redo. Fixed sleeps or a screenshot of an editor shell do not prove a save completed.
- [ ] Assert internal-link and checkbox actions, narrow-screen overflow, missing assets and invalid-diagram fallback. Intercept remote-shaped fonts/images/links deterministically. Fail unexpected page errors; an intentional invalid diagram must produce the specified visible fallback.
- [ ] Capture focused Notes, Today and Calendar screenshots for all six configurations and inspect them. Document synthetic clipboard versus OS clipboard checks and viewport emulation versus physical-device testing separately.
- [ ] Run the runner and record all failures with source and evidence. Retain failures on reruns; never retry-until-green. Classify any timeout as fixture error, product error or unresolved intermittency with evidence.

## Task 5: Review findings and prepare the fix-cycle scope

**Files:** Update `docs/testing/markdown-rendering.md`; prepare evidence for the release results. Product files and the parked candidate remain unchanged.

**Interfaces:** Consumes all executed audit records and baseline revision. Produces a deduplicated defect ledger and proposed Cycle 16 scope; no product APIs or fixes are produced.

- [ ] Reproduce each failure independently from fresh fixture state. Separate confirmed product defects from harness bugs, reviewed intended restrictions, existing limitations and unresolved blockers; fixing audit tooling is allowed, fixing the product is not.
- [ ] Deduplicate symptoms that share evidence of the same cause. For each defect, record affected fixture/surface/scenario/configuration, baseline revision, minimal input and steps, literal expected/actual outcomes, severity, source/DOM evidence and screenshot links.
- [ ] Include the known divider issues only if reproduced on the recorded baseline; link earlier investigation as context, not proof that a candidate correction is accepted. Keep source-fidelity, header/nesting and literal-code findings distinct until evidence links them.
- [ ] Request independent review of test expectations, baseline isolation, coverage completeness and findings. Correct harness/fixture errors and rerun their affected scenarios while retaining initial results; never relabel an actual product failure as passing to finish the audit.
- [ ] Produce proposed Cycle 16 scope containing only confirmed issues and their failed scenario IDs. Passing features need no product edits and remain in the full regression corpus. Do not write a speculative correction implementation or evaluate/apply the parked candidate in this cycle.

## Task 6: Complete evidence and the conditional next-cycle handoff

**Files:** Update `docs/testing/markdown-rendering.md`; assemble executed results and reviewed screenshots for Task 7. A defect-specific Cycle 16 spec/plan is created only after that scope is approved.

**Interfaces:** Consumes check outputs, fixture results and reviews. Produces the compatibility table, findings ledger and explicit release-readiness decision.

- [ ] Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` and `npm.cmd run validate:ai` against the isolated baseline plus audit tooling. Separately run `npm.cmd exec -- vitest run --config vitest.markdown-audit.config.ts`, the full browser matrix and relevant existing clipboard/archive/QA scenarios. Record actual commands, revision, exit status and failing case names; distinguish normal-suite failures from diagnostic product findings.
- [ ] If `dist` is locked, document the blocker; a fresh explicit output folder can verify compilation, but a production server serving `dist` does not prove that alternate build was exercised. Resolve the server/output configuration explicitly before claiming a production-browser pass.
- [ ] After a successful normal production build, run `node scripts/ux-audit.mjs cycle-15` and inspect phone/desktop light/dark shots as required by repository rules; supplement with Task 4 tablet shots. Report stale selectors or environment blockers honestly.
- [ ] Audit every family, transition and required configuration for executed evidence. Keep failures and unexecuted required cases visible; source-fallback classifications are reviewed expected behavior, not excuses for skipped failures.
- [ ] Check audit completion separately from release readiness. Product failures may remain in the completed testing-cycle report; missing required evidence or unresolved harness failures remain coverage blockers. Content loss and unsafe execution block product release and require prominent fix-cycle handoff, not immediate repair during Cycle 15.
- [ ] If defects remain, propose concrete Cycle 16 scope from evidence, then write/review its spec and executable plan after approval. If none remain, record that no Cycle 16 correction work is needed. Do not fabricate bugs or imply release approval.
- [ ] Review the final diff and report using the repository's four completion sections. State physical-device checks not performed, unresolved intermittency and remaining limitations. Publishing/release actions remain separate.

## Task 7: Write and verify the release documentation

**Files:** Create `docs/releases/cycle-15/README.md` from `.ai-configs/templates/release-doc.md`, plus `docs/releases/cycle-15/rendering-results.json` and `images/`; modify `scripts/capture-screenshots.mjs`, `docs/README.md` and `docs/ROADMAP.md`.

**Interfaces:** Consumes the executed test results, reviewed findings and screenshots from Tasks 1–6. Produces the required cycle handoff, separate from any version tag, deployment or publication.

- [ ] Add Cycle 15 entries to the existing `SHOTS` configuration and run `node scripts/capture-screenshots.mjs cycle-15` after the production build. Capture standard desktop 1440×900 and Android 412×915 release shots as well as Task 4's focused desktop/phone/tablet rendering evidence.
- [ ] Inspect every captured image for the intended screen, readable content, dimensions and theme. Place reviewed evidence in `docs/releases/cycle-15/images/`; do not copy an image merely because a screenshot file exists.
- [ ] Write the release README as a testing-cycle handoff using the repository template: baseline revision, audit tooling changes, separate normal-suite/audit/browser results, captioned screenshots, compatibility and defect ledger links, coverage gaps, product release readiness and proposed fix-cycle scope. State explicitly that no product fixes shipped. Do not claim Cycle 16 fixes, physical-device verification or publication.
- [ ] Save the final machine-readable results as `docs/releases/cycle-15/rendering-results.json`. Link the actual report from `docs/README.md` and update `docs/ROADMAP.md` with cycle status and available usage evidence; explicitly mark unavailable usage totals.
- [ ] Verify every relative link and embedded evidence path, then run `npm.cmd run validate:ai` and `git diff --check`. Missing reports, images, broken links or unreviewed screenshots block cycle completion.
- [ ] If a separately approved Cycle 16 executes, require its own equivalent release-documentation task in that cycle's detailed plan. Do not create a completed Cycle 16 release report during Cycle 15 planning.

## Planning self-review

- All spec families map to Tasks 1–2; state, clipboard and archive transitions map to Task 3; all-family browser/platform coverage maps to Task 4; independent findings review maps to Task 5; evidence and conditional fix-cycle handoff map to Task 6; required release docs, capture workflow and index/roadmap updates map to Task 7.
- All five Review Focus items have named test owners. Expectations are independent of production output. Shared types/CLI/result fields are defined above.
- The header/archive test expectations remain explicit. All product corrections have been removed from Cycle 15. Diagnostic failures remain genuine failures in a separately selected audit suite; a finished audit is not a claim that the product is fixed. Independent revised-scope review found no important blockers; owner approval remains pending.
- This requested draft spec and plan may be reviewed together. No implementation checklist item is marked complete.
