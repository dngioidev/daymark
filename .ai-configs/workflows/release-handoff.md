# Release and QA Handoff Workflow

This workflow guides the preparation and verification required prior to tagging a release, deploying to self-hosted instances, or handing off to QA.

## Release Readiness Checklist

### 1. Build & Compiler Verification
- [ ] TypeScript typecheck clean: `npm run lint` (`tsc --noEmit`).
- [ ] Vite production build completes cleanly: `npm run build` (`vite build`).
- [ ] AI Agent configuration validation passes: `node .ai-configs/scripts/validate-configs.mjs`.

### 2. Functional & Invariant Audit
- [ ] Local-first data integrity: vault export as Obsidian ZIP functions and unpacks cleanly.
- [ ] Invariant check: standard markdown comments (`<!-- daymark: ... -->`) format strictly maintained.
- [ ] Rollover idempotency: no task duplication on consecutive rollover triggers.
- [ ] Mobile & Desktop mode responsiveness verified.

### 3. Server & Deployment Checklist
- [ ] Express endpoints functional: `/api/health`, `/api/auth/login`, `/api/devices`, `/api/sync`.
- [ ] Environment variables documented in `.env.example`.
- [ ] Port configuration (`PORT=3000`) tested.

### 4. Handoff Package & Documentation
- Document any schema changes or migration requirements in release notes.
- Ensure `docs/` and `.ai-configs/` are up-to-date with recent changes.
- Provide a summary report following [`.ai-configs/rules/completion-report.md`](../rules/completion-report.md).
