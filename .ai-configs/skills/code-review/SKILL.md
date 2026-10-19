---
name: code-review
description: Review code changes and pull requests against Daymark engineering standards, local-first data safety, TypeScript correctness, and visual design conventions.
---

# Code Review Skill

## Purpose & Scope
This skill provides a systematic rubric for reviewing proposed code changes in the Daymark repository. It ensures adherence to architecture boundaries, data sovereignty invariants, Tailwind styling rules, and error handling before code is merged.

## When to Use
- Reviewing pull requests or uncommitted git diffs.
- Performing pre-commit self-reviews on agent work.
- Auditing existing files for technical debt or convention violations.

## Prerequisites & Inputs
- **Inputs**:
  - Git diff, pull request description, or list of changed files.
  - Target branch and task requirements.
- **Authoritative Standards**:
  - [`.ai-configs/rules/engineering-standards.md`](../../rules/engineering-standards.md)
  - [`.ai-configs/rules/repository-safety.md`](../../rules/repository-safety.md)
  - [`.ai-configs/project/conventions.md`](../../project/conventions.md)

## Repeatable Procedure

### Step 1: Scope & Diff Inspection
1. Examine the diff to ensure changes are strictly relevant to the task objective.
2. Flag any unrelated refactorings, premature optimizations, or speculative code.
3. Check for unintended file modifications (lockfiles, build artifacts, environment files).

### Step 2: Daymark Invariant Checklist
Review each modified file against the core repository invariants:
- [ ] **Data Safety**: Does any code destructively overwrite user notes or strip YAML frontmatter?
- [ ] **Machine Tags**: Are `<!-- daymark: ... -->` comments preserved and correctly formatted?
- [ ] **Idempotent Rollover**: If rollover logic was touched, is deduplication strictly maintained?
- [ ] **Tailwind Discipline**: Are all CSS color classes valid standard Tailwind tokens (e.g., `stone-50`..`stone-950`, no `stone-850`)?
- [ ] **Desktop Full-Width**: Is desktop layout width unconstrained (`max-w-[1800px]` or `max-w-[1920px]`)?
- [ ] **Type Correctness**: Are all types derived from `src/types/daymark.ts` without arbitrary `any` casting?

### Step 3: Layering & Maintainability Audit
1. Verify that business logic resides in `src/utils/` rather than embedded inside React JSX.
2. Confirm error cases are handled gracefully (e.g. invalid date strings, corrupt local storage, network failures).
3. Check that no secrets, credentials, or personal tokens are leaked.

### Step 4: Verification Check
1. Ensure the change compiles cleanly with TypeScript (`npm run lint`).
2. Ensure production build succeeds (`npm run build`).

## Expected Outputs
- Structured review summary:
  - **Verdict**: Approve, Request Changes, or Comment.
  - **Findings**: Grouped by severity (Critical / High / Medium / Low).
  - **Daymark Invariant Checklist**: Pass/Fail breakdown.
  - **Actionable Suggestions**: Code snippets or concrete recommendations.

## Validation & Quality Checks
- Template reference: [`.ai-configs/templates/pull-request.md`](../../templates/pull-request.md).
- Reference workflow: [`.ai-configs/workflows/code-review.md`](../../workflows/code-review.md).
