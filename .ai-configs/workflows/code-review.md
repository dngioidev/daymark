# Code Review Workflow

This workflow standardizes the code review process across human contributors and AI agents.

## Review Stages

### 1. Diff Inspection
- Run `git diff` or review the PR changes.
- Ensure the diff contains no accidental changes (temporary files, unneeded dependency additions, commented-out debug code).

### 2. Standards & Invariants Evaluation
Verify each item on the Daymark checklist:
1. **Data Sovereignty**: Notes are preserved, frontmatter intact, `<!-- daymark: ... -->` comments unmodified.
2. **Rollover Idempotency**: Deduplication ensures no duplicate tasks.
3. **Tailwind Discipline**: Only standard stone color tokens (`stone-50`..`stone-950`).
4. **Desktop Full-Width**: Desktop views are not constrained to mobile widths.
5. **Type Safety**: No arbitrary `any` casts or unverified schema extensions.

### 3. Build & Type Verification
- Execute `npm run lint` (`tsc --noEmit`).
- Execute `npm run build` (`vite build`).
- Execute config check: `node .ai-configs/scripts/validate-configs.mjs`.

### 4. Review Summary Delivery
Deliver a structured review using [`.ai-configs/templates/pull-request.md`](../templates/pull-request.md) or a targeted finding summary following [`.ai-configs/skills/code-review/SKILL.md`](../skills/code-review/SKILL.md).
