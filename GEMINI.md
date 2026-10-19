# Gemini CLI Instructions - Daymark

This repository uses a canonical, universal AI agent configuration system under [`.ai-configs/`](./.ai-configs/).

## 1. Canonical Rules
Gemini CLI instances must consult and respect the shared rule set:
- **General Rules**: [`.ai-configs/rules/general-behavior.md`](./.ai-configs/rules/general-behavior.md)
- **Safety & Data Preservation**: [`.ai-configs/rules/repository-safety.md`](./.ai-configs/rules/repository-safety.md)
- **Engineering Standards**: [`.ai-configs/rules/engineering-standards.md`](./.ai-configs/rules/engineering-standards.md)
- **Verification Protocols**: [`.ai-configs/rules/testing-and-verification.md`](./.ai-configs/rules/testing-and-verification.md)
- **Completion Standard**: [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md)

## 2. Daymark Invariants
- **Markdown Preservation**: Preserve YAML frontmatter, headers, and `<!-- daymark: task_id=<id> status=<status> ... -->` comments.
- **Rollover Idempotency**: Never create duplicate tasks during rollover.
- **Tailwind Palette**: Only standard stone tokens (`stone-50` through `stone-950`).
- **Desktop Layout**: Keep layout container full-width (`max-w-[1800px]`) in desktop mode.
- **Strict Types**: Derive types from `src/types/daymark.ts`.

## 3. Skills & Workflows
- **Skills**: Canonical `SKILL.md` documents are in [`.ai-configs/skills/`](./.ai-configs/skills/).
- **Workflows**: Common procedures (bug fix, feature development, code review, regression testing) are in [`.ai-configs/workflows/`](./.ai-configs/workflows/).
- **Project Context**: Architecture, codebase map, and conventions are in [`.ai-configs/project/`](./.ai-configs/project/).

## 4. Verification Commands
- `npm run lint` (`tsc --noEmit`)
- `npm run build` (`vite build`)
- `node .ai-configs/scripts/validate-configs.mjs`

## 5. Output Format
Conclude every response with the 4-part summary defined in [`.ai-configs/rules/completion-report.md`](./.ai-configs/rules/completion-report.md).
