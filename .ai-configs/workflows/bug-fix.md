# Bug Fix Workflow

This workflow guides the end-to-end process of addressing a bug or defect in Daymark, from initial report to verified resolution.

## Workflow Diagram

```
[1. Report & Scope] ──> [2. Reproduce & Root Cause] ──> [3. Minimal Fix] ──> [4. Verify & Lint] ──> [5. Report]
```

## Step-by-Step Procedure

### 1. Scoping & Intake
- Read the issue description carefully.
- Identify the affected sub-system:
  - Task lifecycle math (`src/utils/lifecycleEngine.ts`)
  - Markdown serialization/deserialization (`src/utils/markdownEngine.ts`)
  - State store or import/export (`src/utils/vaultStore.ts`)
  - Frontend components (`src/components/`, `src/App.tsx`)
  - Server endpoints (`server.ts`)
- Consult [`.ai-configs/skills/bug-investigation/SKILL.md`](../skills/bug-investigation/SKILL.md).

### 2. Reproduction & Root Cause Analysis
- Reproduce the problem using minimal test inputs (e.g., sample markdown string or date delta).
- Pinpoint the exact line and logic flaw.
- Check if similar issues exist in related modules (e.g. Kotlin / Swift mobile models in `mobile/`).

### 3. Implement Minimal Fix
- Follow the universal rules: make the smallest correct change.
- Never weaken validation or loosen compiler checks.
- Adhere to Daymark invariants:
  - Preserve `<!-- daymark: ... -->` comments.
  - Preserve deduplication logic in rollovers.
  - Maintain type consistency in `src/types/daymark.ts`.

### 4. Verification & Regression Testing
- Run TypeScript type checks: `npm run lint` (`tsc --noEmit`).
- Run production build: `npm run build` (`vite build`).
- Verify the specific fix scenario and ensure adjacent features still function correctly.

### 5. Task Summary & Report
- Formulate a 4-part completion report following [`.ai-configs/rules/completion-report.md`](../rules/completion-report.md):
  1. What changed.
  2. Important implementation decisions.
  3. Verification and checks executed.
  4. Known limitations or follow-up work.
