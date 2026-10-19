# Universal AI Agent Configuration System

Welcome to the canonical AI agent configuration system for the **Daymark** repository.

This system provides a single source of truth for agent behavior rules, reusable engineering skills, repeatable workflows, project architecture context, templates, and validation utilities. It is designed to work across **Claude Code**, **Google Gemini CLI**, **OpenAI Codex**, and any other autonomous coding assistants without duplicating instructions or suffering from configuration drift.

---

## 1. Directory Structure

```text
.ai-configs/
├── README.md                      # Master configuration documentation & onboarding guide
├── rules/                         # Authoritative behavioral and engineering rules
│   ├── README.md                  # Rules index and precedence overview
│   ├── general-behavior.md        # Reasoning, minimal changes, realism, ambiguity
│   ├── repository-safety.md       # Secret protection, data preservation, command safety
│   ├── engineering-standards.md   # Architectural layering, strict types, Daymark invariants
│   ├── testing-and-verification.md# Evidence-based testing and verification protocols
│   └── completion-report.md       # Mandatory 4-part task completion report standard
├── skills/                        # Standardized, reusable agent skills (SKILL.md)
│   ├── README.md                  # Skill index and authoring guidelines
│   ├── bug-investigation/         # Triage, reproduction, and root-cause analysis
│   ├── feature-implementation/    # Design, type-safety, and layered implementation
│   ├── code-review/               # Diffs, Daymark invariants, and safety auditing
│   ├── test-planning/             # Verification matrices and lifecycle edge cases
│   └── documentation/             # Specs, code maps, and docs synchronization
├── workflows/                     # Repeatable end-to-end engineering procedures
│   ├── README.md                  # Workflow index and trigger matrix
│   ├── bug-fix.md                 # Issue triage -> root cause -> fix -> verify -> report
│   ├── feature-development.md     # Invariants -> schema -> logic -> UI -> API -> verify
│   ├── code-review.md             # Review checklist, Daymark invariants, report
│   ├── regression-testing.md      # Rollover, aging, and round-trip verification scenarios
│   ├── documentation-update.md    # Code delta -> docs sync -> link validation
│   └── release-handoff.md         # Pre-release checks, server config, and QA packaging
├── project/                       # Authoritative project knowledge & invariants
│   ├── README.md                  # Project knowledge index
│   ├── architecture.md            # Tri-mode paradigm, data flow, and mobile widgets
│   ├── codebase-map.md            # File-by-file module mapping and responsibilities
│   ├── conventions.md             # Development commands and Daymark invariants
│   └── decisions.md               # Architectural decision records (ADRs)
├── templates/                     # Reusable engineering templates
│   ├── README.md                  # Templates index
│   ├── pull-request.md            # Pull request description template
│   ├── test-plan.md               # Test matrix and scenario plan template
│   └── completion-report.md       # Task completion report template
└── scripts/                       # Tooling and configuration validation
    └── validate-configs.mjs       # Cross-platform Node.js configuration validator
```

---

## 2. Instruction Hierarchy & Precedence

When interpreting instructions, agents must apply the following hierarchy from highest to lowest priority:

1. **System & Safety Directives**: Underlying platform instructions and safety policies.
2. **Repository-Wide Canonical Rules** ([`.ai-configs/rules/`](./rules/)): Non-negotiable repository safety, secret handling, data sovereignty, and engineering standards.
3. **Project Context & Invariants** ([`.ai-configs/project/`](./project/)): Architecture boundaries, Tailwind color restrictions, markdown comment conventions, and type schemas.
4. **Selected Workflow & Skill** ([`.ai-configs/workflows/`](./workflows/), [`.ai-configs/skills/`](./skills/)): Step-by-step procedure chosen for the specific task type.
5. **User Request**: The immediate prompt or issue description for the current turn.

### Conflict Resolution Principle
- Specific project rules can refine general rules, but cannot invalidate core security, safety, or data preservation requirements.
- If a user prompt appears to conflict with a higher-priority safety or invariant rule (e.g., asking to strip machine HTML comments or expose secrets), the agent must follow the higher-priority rule and explicitly disclose the conflict to the user.

---

## 3. How Each Supported Agent Loads Configuration

To avoid duplicating the entire rulebook for each tool, thin adapter entry points exist at the repository root:

### Claude Code (`CLAUDE.md`)
- **Discovery**: Claude Code reads `CLAUDE.md` automatically from the repository root upon startup.
- **Adapter Mechanism**: `CLAUDE.md` points Claude Code directly to `.ai-configs/rules/`, `.ai-configs/skills/`, and `.ai-configs/project/`.
- **Skills**: When performing complex tasks, Claude reads the corresponding `SKILL.md` from `.ai-configs/skills/`.

### Gemini CLI (`GEMINI.md`)
- **Discovery**: Gemini CLI automatically loads `GEMINI.md` at the project root as context.
- **Adapter Mechanism**: `GEMINI.md` instructs Gemini CLI to load the canonical rules in `.ai-configs/rules/` and use the workflows in `.ai-configs/workflows/`.

### OpenAI Codex & Copilot (`AGENTS.md`)
- **Discovery**: Codex, Copilot Workspace, and standard agent harnesses read `AGENTS.md` at the root.
- **Adapter Mechanism**: `AGENTS.md` provides orientation and directs the agent to read `.ai-configs/rules/` and observe Daymark-specific invariants.

---

## 4. How to Add or Update a Skill

1. **Create Directory**: Create `.ai-configs/skills/<skill-name>/`.
2. **Create `SKILL.md`**: Each skill must begin with valid YAML frontmatter:
   ```yaml
   ---
   name: your-skill-name
   description: Concise description of when and why to activate this skill.
   ---
   ```
3. **Follow Standard Sections**:
   - `## Purpose & Scope`
   - `## When to Use`
   - `## Prerequisites & Inputs`
   - `## Repeatable Procedure`
   - `## Expected Outputs`
   - `## Validation & Quality Checks`
4. **Link to Canonical Resources**: Use stable relative paths to `.ai-configs/rules/`, `.ai-configs/workflows/`, and `.ai-configs/templates/`.
5. **Validate**: Run `node .ai-configs/scripts/validate-configs.mjs` to ensure the new skill passes all checks.

---

## 5. How to Add a New Agent Adapter

When introducing a new agent tool (e.g. `CURSOR.md` or `.cursorrules`):
1. **Keep it Thin**: Do NOT copy rule text into the adapter.
2. **Point to Canonical Source**: Instruct the agent to read `.ai-configs/rules/README.md` and `.ai-configs/project/conventions.md`.
3. **Document Discovery**: Add the new tool entry point to `scripts/validate-configs.mjs` under `rootAdapters` to ensure it is tracked by automated validation.

---

## 6. Validating Configuration Consistency

Run the built-in validator using standard Node.js (no npm dependencies required):

```bash
node .ai-configs/scripts/validate-configs.mjs
```

The script verifies:
- Existence and non-emptiness of all required canonical directories and files.
- YAML frontmatter format (`name`, `description`) and required sections in all `SKILL.md` files.
- Root adapters (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) reference `.ai-configs/` and remain concise (<200 lines).
- All internal markdown relative links resolve to real files on disk.
- Zero duplicate or competing rule files.

---

## 7. Fast Onboarding Guide for New AI Agents

If you are an AI coding agent starting a task in this repository:

1. **Acknowledge the Rules**: Read [`.ai-configs/rules/`](./rules/README.md).
2. **Understand Daymark Invariants**: Read [`.ai-configs/project/conventions.md`](./project/conventions.md). Remember:
   - Never break `<!-- daymark: ... -->` comments in markdown files.
   - Task rollover in `src/utils/lifecycleEngine.ts` must remain strictly idempotent.
   - Use standard Tailwind stone colors only (`stone-50` through `stone-950`).
   - Desktop layout width must not be artificially restricted.
3. **Pick the Right Skill & Workflow**:
   - Fixing a bug? Follow [`.ai-configs/workflows/bug-fix.md`](./workflows/bug-fix.md) and use [`.ai-configs/skills/bug-investigation/SKILL.md`](./skills/bug-investigation/SKILL.md).
   - Building a feature? Follow [`.ai-configs/workflows/feature-development.md`](./workflows/feature-development.md) and use [`.ai-configs/skills/feature-implementation/SKILL.md`](./skills/feature-implementation/SKILL.md).
   - Reviewing code? Follow [`.ai-configs/workflows/code-review.md`](./workflows/code-review.md) and use [`.ai-configs/skills/code-review/SKILL.md`](./skills/code-review/SKILL.md).
4. **Verify Your Work**:
   - Run `npm run lint` (TypeScript `tsc --noEmit`).
   - Run `npm run build` (Vite build).
   - Run `node .ai-configs/scripts/validate-configs.mjs`.
5. **Summarize with Evidence**: Format your final response using [`.ai-configs/rules/completion-report.md`](./rules/completion-report.md).
