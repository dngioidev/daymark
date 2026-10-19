# Regression Testing Workflow

This workflow guides systematic regression verification for Daymark to ensure core workflows remain intact across releases and refactors.

## Core Regression Verification Areas

### 1. Task Lifecycle & Rollover
- **Scenario A: Single-Day Rollover**: Create tasks on Day 1, trigger rollover to Day 2. Verify incomplete tasks roll over with provenance tags (`← from YYYY-MM-DD`) and completed tasks stay on Day 1.
- **Scenario B: Multi-Day Gap Rollover**: Create tasks on Monday, roll forward to Friday. Verify task age calculates as 4 days and proper aging badges appear.
- **Scenario C: Idempotency**: Run rollover twice on the same target date. Verify no duplicate tasks are generated.

### 2. Historical Completion Correction
- Mark a task carried over from Day 1 to Day 3 as completed retroactively on Day 2.
- Verify intermediate carry-over on Day 3 is removed.
- Verify task is preserved on Day 1 with completed timestamp and note.

### 3. Markdown Round-Trip Parsing
- Parse sample markdown note with frontmatter, headings, tasks with comments, and custom markdown notes.
- Serialize back to markdown.
- Verify exact preservation of content, frontmatter, and `<!-- daymark: ... -->` comments.

### 4. Tri-Mode UI Responsive Layout
- Verify Desktop Mode (`>= 768px`) displays full 3-column or split-pane workspace.
- Verify Mobile Mode (`< 768px`) activates `MobileAppShell` with bottom navigation.
- Verify Server Admin modal opens and displays device pairing tokens.

### 5. Automated Build Verification
```bash
# Typecheck
npm run lint

# Production bundle
npm run build

# AI config validation
node .ai-configs/scripts/validate-configs.mjs
```

Use the template in [`.ai-configs/templates/test-plan.md`](../templates/test-plan.md) to record execution outcomes.
