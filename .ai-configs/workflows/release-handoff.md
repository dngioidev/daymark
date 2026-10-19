# Release and QA Handoff Workflow

This workflow guides the preparation and verification required prior to tagging a release, deploying to self-hosted instances, or handing off to QA.

## Release Readiness Checklist

### 1. Build & Compiler Verification
- [ ] TypeScript typecheck clean: `npm run lint` (`tsc --noEmit`).
- [ ] Vite production build completes cleanly: `npm run build` (`vite build`).
- [ ] Unit tests pass: `npm test`.
- [ ] AI Agent configuration validation passes: `npm run validate:ai`.

### 2. Functional & Invariant Audit
- [ ] Local-first data integrity: vault export as Obsidian ZIP functions and unpacks cleanly.
- [ ] Invariant check: standard markdown comments (`<!-- daymark: ... -->`) format strictly maintained.
- [ ] Rollover idempotency: no task duplication on consecutive rollover triggers.
- [ ] Mobile & Desktop mode responsiveness verified.

### 3. Server & Deployment Checklist
- [ ] Express endpoints functional: `/api/health`, `/api/auth/login`, `/api/devices`, `/api/sync`.
- [ ] Environment variables documented in `.env.example`.
- [ ] Port configuration (`PORT=3000`) tested.

### 4. Release Doc with Captured Screenshots (every cycle)
- [ ] Add the cycle's shots to `SHOTS` in `scripts/capture-screenshots.mjs` (desktop 1440x900 and Android 412x915) and run `node scripts/capture-screenshots.mjs <cycle>`.
- [ ] Look at every captured image; confirm the right screen and size, not just that a file exists.
- [ ] Write `docs/releases/<cycle>/README.md` from [`../templates/release-doc.md`](../templates/release-doc.md), embedding the images from `docs/releases/<cycle>/images/`.
- [ ] Record actual session/token usage and update the estimate table in `docs/ROADMAP.md`.
- [ ] `npm run validate:ai` must pass (it fails when a release doc has no README or screenshots).

### 5. Handoff Package & Documentation
- Document any schema changes or migration requirements in release notes.
- Ensure `docs/` and `.ai-configs/` are up-to-date with recent changes.
- Provide a summary report following [`.ai-configs/rules/completion-report.md`](../rules/completion-report.md).
