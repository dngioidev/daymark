# Daymark - AI Agent Guidelines (AGENTS.md)

Welcome! This repository uses a centralized, universal AI configuration system located in [`.ai-configs/`](./.ai-configs/).

## 1. Authoritative Rules
Before modifying or creating any code, you must read and adhere to the canonical rules:
- **General Agent Behavior**: [`.ai-configs/rules/general-behavior.md`](./.ai-configs/rules/general-behavior.md)
- **Repository Safety & Secrets**: [`.ai-configs/rules/repository-safety.md`](./.ai-configs/rules/repository-safety.md)
- **Engineering Standards**: [`.ai-configs/rules/engineering-standards.md`](./.ai-configs/rules/engineering-standards.md)
- **Testing & Verification**: [`.ai-configs/rules/testing-and-verification.md`](./.ai-configs/rules/testing-and-verification.md)
- **Completion Report Standard**: [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md)

## 2. Non-Negotiable Daymark Invariants
- **Data Sovereignty**: User notes are stored in Markdown (`YYYY-MM-DD.md`) with frontmatter. Never alter notes destructively.
- **Machine HTML Comments**: Format must remain `<!-- daymark: task_id=<id> status=<status> created=<YYYY-MM-DD> ... -->`.
- **Rollover Idempotency**: `performDailyRollover()` must never create duplicate tasks.
- **Tailwind Palette Discipline**: Use only standard stone color classes (`stone-50` through `stone-950`). Never invent classes like `stone-850`.
- **Desktop Full-Width**: Desktop view must maintain full width (`max-w-[1800px]`), never collapsed into a phone mockup.

## 3. Skills & Workflows
- **Skills**: Reusable skills (`bug-investigation`, `feature-implementation`, `code-review`, `test-planning`, `documentation`) are in [`.ai-configs/skills/`](./.ai-configs/skills/).
- **Workflows**: Standard procedures are in [`.ai-configs/workflows/`](./.ai-configs/workflows/).
- **Project Knowledge**: Architecture and codebase details are in [`.ai-configs/project/`](./.ai-configs/project/).

## 4. Verification Commands
- **Lint / Type Check**: `npm run lint` (`tsc --noEmit`)
- **Build**: `npm run build` (`vite build`)
- **Validate Configs**: `node .ai-configs/scripts/validate-configs.mjs`

## 5. Completion Summary
Structure your final response using the 4 sections from [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md):
1. What Changed
2. Important Implementation Decisions
3. Verification & Checks Executed
4. Known Limitations & Follow-Up Work
