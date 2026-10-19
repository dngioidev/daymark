# Repository Safety Rules

These rules protect repository integrity, security credentials, user files, and environment safety.

## 1. Secrets & Credentials Protection
- **Never expose, print, commit, or unnecessarily read** secrets, API keys, credentials, session tokens, or private keys.
- Reference secrets only through environment variables (e.g., `GEMINI_API_KEY`, `DAYMARK_PASSWORD`).
- Keep `.env*` files untracked according to `.gitignore` (only `.env.example` should be tracked).

## 2. Preserving User Data & Local-First Invariants
- **Never overwrite user changes** or discard unrelated uncommitted work.
- In Daymark, markdown files in the user vault (`YYYY-MM-DD.md`) and notes are sovereign user data:
  - Never destructively wipe or rewrite notes.
  - Preserve frontmatter, checklist items, and Daymark metadata HTML comments (`<!-- daymark: ... -->`).
- Always verify file state before and after editing.

## 3. Destructive Command Prevention
- **Do not run destructive shell commands** (e.g., `rm -rf`, `git reset --hard`, `git clean -fd`, database truncations) without explicit user authorization and a full understanding of their blast radius.
- If a cleanup or reset command is needed, propose it clearly with full rationale before executing.

## 4. Dependencies, Build & Infrastructure Stability
- **Do not modify dependencies**, lockfiles (`package.json`, `bun.lock`), deployment configurations, build pipelines, or infrastructure files unless the task explicitly requires it.
- If a dependency update is necessary, justify the addition, verify compatibility, and limit the change to what is strictly required.

## 5. Git & Branch Etiquette
- Respect the existing Git working tree, active branch, and staged/unstaged changes.
- Avoid forcing changes or amending public/shared history.
