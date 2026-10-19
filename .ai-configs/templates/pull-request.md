# Pull Request Template

## Description
<!-- Provide a concise summary of the change, motivation, and context. -->

## Changes Made
- <!-- List modified, created, or deleted files with brief rationale -->

## Daymark Invariant Checklist
- [ ] **Data Safety**: No destructive alterations to user notes; frontmatter and markdown preserved.
- [ ] **Metadata Format**: HTML comments (`<!-- daymark: ... -->`) format strictly maintained.
- [ ] **Rollover Idempotency**: Deduplication verified in task rollover logic.
- [ ] **Tailwind Discipline**: Only standard stone color tokens used (no invented classes).
- [ ] **Layout Discipline**: Desktop view (`>=768px`) maintains full-width container (`max-w-[1800px]`).
- [ ] **TypeScript Adherence**: All types align with `src/types/daymark.ts` without `any` casts.

## Verification & Testing
- **Type Check**: `npm run lint` (`tsc --noEmit`) - [PASS / FAIL / NOT RUN]
- **Production Build**: `npm run build` (`vite build`) - [PASS / FAIL / NOT RUN]
- **Config Validation**: `node .ai-configs/scripts/validate-configs.mjs` - [PASS / FAIL / NOT RUN]
- **Manual Walkthrough**:
  - <!-- List scenarios tested and observed outcomes -->

## Screenshots / Evidence (if applicable)
<!-- Attach screenshots, console logs, or output snippets -->

## Related Issues & Documentation
<!-- Link to related tickets, docs/ references, or PRD sections -->
