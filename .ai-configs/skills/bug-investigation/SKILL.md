---
name: bug-investigation
description: Investigate, reproduce, and identify root causes for bugs, unexpected behavior, or regressions in the Daymark codebase before applying a fix.
---

# Bug Investigation Skill

## Purpose & Scope
This skill guides the investigation of reported issues, test failures, or unexpected behaviors in the Daymark application. It focuses on systematic triage, isolated reproduction, root-cause identification, and formulating a safe fix plan without jumping to premature code changes.

## When to Use
- A bug or unexpected behavior is reported in the notebook UI, rollover logic, markdown parsing, or sync endpoints.
- A regression is detected in task aging, historical completion correction, or export/import.
- An automated test or build check unexpectedly fails.

## Prerequisites & Inputs
- **Inputs**:
  - Issue description or reproduction steps.
  - Relevant dates, document states, or markdown snippets.
  - Error logs, browser console output, or terminal output.
- **Tools**:
  - Shell command runner (`node`, `npm run lint`).
  - File viewer and code search.

## Repeatable Procedure

### Step 1: Understand the Symptom & Scope
1. Review the reported symptom and identify the affected domain:
   - Lifecycle / Rollover / Aging math (`src/utils/lifecycleEngine.ts`)
   - Markdown serialization / parsing (`src/utils/markdownEngine.ts`)
   - UI views & state (`src/components/`, `src/App.tsx`)
   - Backend sync & auth (`server.ts`)
   - Storage & export (`src/utils/vaultStore.ts`)
2. Check existing documentation in `docs/` or `.ai-configs/project/` to confirm intended system behavior and invariants.

### Step 2: Reproduce the Defect
1. Formulate a minimal reproducible example (e.g. sample markdown input or specific date sequence).
2. For algorithmic or parsing issues, write or inspect a targeted test or reproduction script.
3. Observe and document the difference between expected and actual behavior.

### Step 3: Trace the Execution Path
1. Inspect the call path from user action or input to the point of failure.
2. Check data transformations and state transitions. Pay special attention to:
   - Date calculations (`getCalendarDaysDifference`, timezone/simulated date mismatches).
   - Regular expressions parsing `<!-- daymark: ... -->` comments.
   - Idempotency checks (`activeTargetDoc.headings` task ID deduplication).

### Step 4: Isolate Root Cause & Assess Blast Radius
1. Pinpoint the exact line(s) and logic flaw causing the defect.
2. Assess whether similar patterns exist elsewhere in the codebase.
3. Formulate a targeted fix that respects universal rules in `.ai-configs/rules/`.

## Expected Outputs
- Detailed root-cause analysis documenting:
  - Exact failing condition.
  - Why the failure occurs.
  - Proposed minimal fix adhering to engineering standards.
  - Verification strategy to confirm the fix and prevent regressions.

## Validation & Quality Checks
- Verify that the proposed fix does not alter canonical markdown comment formats.
- Verify that no unintended side-effects are introduced to the state store or sync payload.
- Reference workflow: [`.ai-configs/workflows/bug-fix.md`](../../workflows/bug-fix.md).
