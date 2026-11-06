# Cycle 16: Markdown fixes implementation record

Spec: [Cycle 16 design](../specs/2026-11-06-cycle-16-markdown-fixes-design.md). Work happened on branch `cycle-15-markdown-audit` after the Cycle 15 audit commit.

- [x] Cherry-pick candidate `7c808d0` (D1–D3); rerun the three audit suites (32+6+1 failures fell to 8+1+1).
- [x] D4: tighten `src/utils/frontmatter.ts`; stop trimming before recognition in `src/components/MarkdownPreview.tsx`; tests in `src/utils/frontmatter.test.ts`.
- [x] D5: park code in `src/utils/markdownHtml.ts`; tests in `src/utils/markdownHtml.test.ts`.
- [x] D6: `plain` attribute on the highlight mark in `src/components/notes/editorExtensions.ts`; test in `src/utils/noteMarkdown.test.ts`.
- [x] D7: reclassify; audit test now asserts the pasted text stays visible.
- [x] Mark `frontmatter-prose-line` fixture `semantic` (documented trade-off).
- [x] Rerun audits, full browser matrix, lint, tests, build, `validate:ai`; write `docs/releases/cycle-16/README.md`; update index and roadmap.
