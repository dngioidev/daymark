---
name: test-planning
description: Plan, structure, and execute manual and automated verification matrices for Daymark core features, edge cases, and regression risks.
---

# Test Planning Skill

## Purpose & Scope
This skill guides the creation and execution of structured test plans for Daymark. It covers type checking, build verification, manual user interaction walkthroughs, and edge case validation for daily note management and synchronization.

## When to Use
- Validating major feature additions or refactors.
- Preparing for a release or pull request submission.
- Formulating a verification strategy for subtle date math, rollover, or sync behaviors.

## Prerequisites & Inputs
- **Inputs**:
  - Specification or PRD requirements (`.ai-configs/project/specification.md`).
  - Modified code areas (e.g. `src/utils/lifecycleEngine.ts`, `server.ts`).
- **Tools**:
  - Node.js runtime and npm scripts (`npm run lint`, `npm run build`, `npm run dev`).

## Repeatable Procedure

### Step 1: Identify Risk Areas & Core Invariants
Identify the critical paths impacted by the changes:
- Task rollover idempotency across consecutive dates.
- Historical completion correction and multi-day ledger consistency.
- Markdown frontmatter and comment serialization integrity.
- Tri-mode layout responsiveness (Desktop, Mobile, Server Admin).
- API authentication and multi-device sync handshake.

### Step 2: Define the Verification Matrix
Construct a test matrix containing:
1. **Automated Static Checks**:
   - `npm run lint` (`tsc --noEmit`) to verify zero type regressions.
   - `npm run build` (`vite build`) to verify bundle and asset compilation.
   - Agent config validation (`node .ai-configs/scripts/validate-configs.mjs`).
2. **Core Feature Scenarios**:
   - New task creation, status transitions, aging badge updates.
   - Rollover execution (`performDailyRollover`) across missing dates (gaps).
   - Retroactive completion (`correctHistoricalCompletion`) removing intermediate carry-overs.
3. **Boundary & Edge Cases**:
   - Leap years, month-boundary rollouts (e.g. Feb 28 to Mar 1).
   - Empty documents, malformed markdown comments, non-ASCII characters in notes.
   - Corrupt or missing localStorage items.

### Step 3: Execute & Record Results
1. Execute automated checks and capture output.
2. Walk through manual verification scenarios using the running app or scripted tests.
3. Record exact observations, distinguishing passed checks from unexecuted scenarios.

## Expected Outputs
- Completed test plan document using [`.ai-configs/templates/test-plan.md`](../../templates/test-plan.md).
- Verification summary with pass/fail status and evidence logs.

## Validation & Quality Checks
- Check that all critical paths have at least one verification step.
- Reference workflow: [`.ai-configs/workflows/regression-testing.md`](../../workflows/regression-testing.md).
