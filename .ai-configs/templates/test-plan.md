# Test Plan Template

## Scope & Objective
<!-- State feature, bug fix, or area under test -->

## Environments & Configurations Tested
- [ ] Desktop Mode (Chrome / Edge / Firefox at >= 768px width)
- [ ] Mobile Shell (Responsive viewport at < 768px width)
- [ ] Self-Hosted Express Server (`server.ts` on port 3000)

## Test Matrix

| ID | Test Scenario | Steps | Expected Result | Actual Result | Status (Pass/Fail) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Static Type Check | Run `npm run lint` | Zero TypeScript compiler errors | | |
| **TC-02** | Bundle Build | Run `npm run build` | Clean production build in `dist/` | | |
| **TC-03** | Config Validation | Run `node .ai-configs/scripts/validate-configs.mjs` | All checks pass with 0 errors | | |
| **TC-04** | Rollover Idempotency | Trigger `performDailyRollover` twice | Task IDs deduplicated, no duplicates | | |
| **TC-05** | Retroactive Completion | Mark completed on earlier date | Intermediate tasks removed, ledger intact | | |
| **TC-06** | Markdown Round-Trip | Parse and re-serialize test markdown | Comments and frontmatter preserved | | |

## Edge Cases & Negative Scenarios
- [ ] Empty note / missing headings
- [ ] Malformed or manual HTML comments
- [ ] Date roll-forward across leap years or month boundaries
- [ ] Disconnected server or network timeout during sync

## Findings & Discrepancies
<!-- List any anomalies, issues observed, or non-blocking issues -->
