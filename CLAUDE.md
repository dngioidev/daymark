# Claude Code Instructions - Daymark

This repository uses a canonical, universal AI agent configuration system under [`.ai-configs/`](./.ai-configs/).

## 1. Canonical Rules
Always read and adhere to the shared rules before modifying code:
- **General Rules**: [`.ai-configs/rules/general-behavior.md`](./.ai-configs/rules/general-behavior.md)
- **Safety & Data Preservation**: [`.ai-configs/rules/repository-safety.md`](./.ai-configs/rules/repository-safety.md)
- **Engineering Standards**: [`.ai-configs/rules/engineering-standards.md`](./.ai-configs/rules/engineering-standards.md)
- **Verification Protocols**: [`.ai-configs/rules/testing-and-verification.md`](./.ai-configs/rules/testing-and-verification.md)
- **Completion Standard**: [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md)

## 2. Core Repository Invariants
- **Markdown Comment Format**: Preserve `<!-- daymark: task_id=<id> status=<status> created=<date> ... -->`.
- **Rollover Idempotency**: Deduplicate tasks in `src/utils/lifecycleEngine.ts`.
- **Tailwind Tokens**: Use standard stone palette (`stone-50`..`stone-950`). Non-existent classes fail in Tailwind v4.
- **Strict Types**: Use types from `src/types/daymark.ts`.
- **Desktop Layout**: Maintain `max-w-[1800px]` width in desktop mode.

## 3. Skills & Workflows
- **Skills**: Reusable `SKILL.md` definitions are located in [`.ai-configs/skills/`](./.ai-configs/skills/):
  - Bug Investigation: [`.ai-configs/skills/bug-investigation/SKILL.md`](./.ai-configs/skills/bug-investigation/SKILL.md)
  - Feature Implementation: [`.ai-configs/skills/feature-implementation/SKILL.md`](./.ai-configs/skills/feature-implementation/SKILL.md)
  - Code Review: [`.ai-configs/skills/code-review/SKILL.md`](./.ai-configs/skills/code-review/SKILL.md)
  - Test Planning: [`.ai-configs/skills/test-planning/SKILL.md`](./.ai-configs/skills/test-planning/SKILL.md)
  - Documentation: [`.ai-configs/skills/documentation/SKILL.md`](./.ai-configs/skills/documentation/SKILL.md)
- **Workflows**: Multi-step procedures are in [`.ai-configs/workflows/`](./.ai-configs/workflows/).
- **Project Knowledge**: Module maps and architecture are in [`.ai-configs/project/`](./.ai-configs/project/).

## 4. Build & Verification Commands
```bash
npm run lint         # TypeScript check (tsc --noEmit)
npm test             # Unit tests (vitest)
npm run test:helpers # Screenshot and server-session helper tests (node:test)
npm run build        # Production bundle (vite build)
npm run dev          # Express + Vite on port 3000
npm run test:e2e      # Android PWA e2e (needs a prior build and local Chrome/Edge)
npm run test:sync     # two-device sync e2e against a fresh production server (needs a prior build)
npm run test:qa       # QA regression e2e (needs a prior build); `-- <idPrefix>` runs one scenario
npm run android:build   # debug APK (JDK 21 + Android SDK); add -- --test for Kotlin unit tests
npm run validate:ai  # AI config check (structure, scripts, invariants, links)
node scripts/capture-screenshots.mjs <cycle>  # Release-doc screenshots -> docs/releases/<cycle>/images
```

## 5. Output Summary
Always summarize your work according to the 4-part completion report standard in [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md).
