# Testing and Verification Rules

These rules govern how changes must be tested, validated, and verified before concluding a task.

## 1. Verification Strategy
- **Identify relevant checks**: Examine `package.json`, build files, and documentation to determine the correct verification commands.
- **Run targeted checks first**:
  - Run type checks or linting (`npm run lint` or `tsc --noEmit`).
  - Run targeted unit or integration tests for modified functions.
  - Run build checks (`npm run build` or `vite build`) when modifying components or build assets.
- **Run broader checks**: If targeted checks pass and scope warrants, execute full suite checks.

## 2. Evidence-Based Reporting
- **Execute, don't assume**: Never claim that a test, build, lint, or type check passed without actually running it and observing successful completion.
- **Distinguish executed from unexecuted checks**:
  - Explicitly document checks that ran and their exact output or exit status.
  - Disclose checks that could not be run (e.g. missing external service, dependency environment limitations, lack of test runner).

## 3. Failure Investigation & Triage
- If a test or check fails:
  - Determine whether the failure was introduced by the current changes, an environmental issue, missing configuration, or pre-existing code.
  - Do not suppress or bypass checks to hide failures.
  - Fix the root cause or clearly isolate and document existing issues.

## 4. Local Build & Run Verification Commands
- **Lint / Type Check**: `npm run lint` (`tsc --noEmit`)
- **Production Build**: `npm run build` (`vite build`)
- **Development Server**: `npm run dev` (`tsx server.ts` on port 3000)
- **AI Agent Config Validation**: `node .ai-configs/scripts/validate-configs.mjs`
