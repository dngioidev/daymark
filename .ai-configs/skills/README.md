# Reusable Agent Skills

This directory contains standardized, self-contained skills for AI coding agents working on the Daymark repository.

## Skill Standard
Each skill follows the standard `SKILL.md` format with YAML frontmatter:
- **`name`**: Lowercase, kebab-case identifier matching the directory name.
- **`description`**: Concise explanation of the skill's purpose and trigger conditions.
- Structured sections for **Purpose & Scope**, **When to Use**, **Prerequisites & Inputs**, **Repeatable Procedure**, **Expected Outputs**, and **Validation & Quality Checks**.

## Available Skills

| Skill | Directory | Description |
| :--- | :--- | :--- |
| **Bug Investigation** | [`bug-investigation/`](./bug-investigation/SKILL.md) | Triage, reproduce, and identify root causes for bugs before applying fixes. |
| **Feature Implementation** | [`feature-implementation/`](./feature-implementation/SKILL.md) | Design and implement features adhering to layers, strict types, and Daymark invariants. |
| **Code Review** | [`code-review/`](./code-review/SKILL.md) | Audit diffs against safety rules, data invariants, Tailwind discipline, and types. |
| **Test Planning** | [`test-planning/`](./test-planning/SKILL.md) | Structure manual and automated verification matrices for core features and edge cases. |
| **Documentation** | [`documentation/`](./documentation/SKILL.md) | Create and synchronize technical specs, code maps, and agent guides. |

## Adding a New Skill
1. Create a dedicated directory under `.ai-configs/skills/<skill-name>/`.
2. Add a `SKILL.md` file with valid YAML frontmatter (`name`, `description`).
3. Follow the standardized procedure, input/output, and quality check sections.
4. Keep skills focused and avoid duplicating the universal rules in `.ai-configs/rules/`.
5. Run `node .ai-configs/scripts/validate-configs.mjs` to ensure valid formatting and linking.
