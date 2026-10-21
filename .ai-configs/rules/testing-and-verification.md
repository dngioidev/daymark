# Testing and Verification Rules

These rules govern how changes must be tested, validated, and verified before concluding a task.

## 1. Verification Strategy
- **Identify relevant checks**: Examine `package.json`, build files, and documentation to determine the correct verification commands.
- **Run targeted checks first**:
  - Run type checks or linting (`npm run lint` or `tsc --noEmit`).
  - Run targeted unit or integration tests for modified functions (`npm test`, vitest; test files live beside sources as `*.test.ts`). Changes to `src/utils/lifecycleEngine.ts` or `src/utils/markdownEngine.ts` must add or update tests.
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
- **Unit Tests**: `npm test`
- **AI Agent Config Validation**: `npm run validate:ai`
- **PWA / Android E2E** (production build, emulated phone, offline): `npm run build && npm run test:e2e`
- **Android build + Kotlin unit tests**: `npm run android:build -- --test` (needs JDK 21 and the Android SDK)
- **Native Android E2E** (booted emulator/device, widget included): `node scripts/e2e-android-native.mjs [cycle]`
- **Sync E2E** (production build, two browser devices, server restart): `npm run build && npm run test:sync`
- **QA regression E2E** (production build, local Chrome/Edge): `npm run build && npm run test:qa [-- <idPrefix>]`
- **UI audit** (after UI changes): `npm run build && node scripts/ux-audit.mjs <cycle>`, then look at the phone and desktop shots in light and dark mode.
- **Release Screenshots**: `node scripts/capture-screenshots.mjs <cycle>` (needs local Chrome or Edge; see the release-handoff workflow)
