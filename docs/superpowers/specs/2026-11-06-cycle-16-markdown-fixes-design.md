# Cycle 16: Fix the confirmed Markdown defects

**Status:** executed in the same session as Cycle 15 on the owner's instruction ("run cycle 15 audit then cycle 16"). Scope comes only from the confirmed Cycle 15 ledger ([defects D1–D7](../../testing/markdown-rendering.md)); passing features are untouched.

## Scope
| ID | Fix |
| :--- | :--- |
| D1, D2, D3 | Adopt the previously parked candidate (commit `7c808d0`): one `matchFrontmatter` recogniser shared by the Daily parser, preview and the Notes raw-source tokenizer; horizontal rules keep their source spelling. |
| D4 | Tighten `matchFrontmatter` to the spec: header starts at character zero (preview no longer calls `trimStart` first), has a top-level `key:` entry, and holds only entries, comments, `- ` items and indented continuations. A bare prose line, four-dash closer or leading blank line leaves the block as ordinary Markdown. |
| D5 | `renderMarkdownHtml` parks fenced and inline code before callout and wiki-link rewriting, then restores it, so literal code stays literal. |
| D6 | The highlight mark remembers markup written without `data-color` (`plain`) and renders it back the same way. New marks still write `data-color`. |
| D7 | Reclassified, not changed: pasted plain `[[Note]]` stays visible as literal text; turning it into a link would be a new feature needing separate approval. |

## Known trade-off
`---\ntitle: Example\nordinary prose\n---` was previously preserved as an opaque raw block in Notes. It is now ordinary Markdown (a divider plus a setext heading), so editing normalises it (`## title: Example` then the prose line). No text is lost. The `frontmatter-prose-line` fixture is `semantic`, not `verbatim`, for that reason.

## Acceptance
- The failed Cycle 15 scenarios pass in the audit suites and the six-configuration browser matrix; every other scenario still passes.
- `npm run lint`, `npm test`, `npm run build`, `npm run validate:ai` pass.
- Regression tests added to the normal suite for each fix.

## Not in scope
Anything not in the ledger; archive schema (unknown daily header fields stay unsupported); publishing or tagging.
