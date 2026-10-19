# Documentation Update Workflow

This workflow ensures documentation throughout the repository stays synchronized with actual implementation details.

## Update Triggers & Affected Documents

| Change Type | Primary Doc | Secondary Doc |
| :--- | :--- | :--- |
| **New UI Component or Utility** | `.ai-configs/project/codebase-map.md` | `.ai-configs/project/conventions.md` |
| **Data Schema or Type Modification** | `.ai-configs/project/specification.md` | `src/types/daymark.ts` |
| **REST API / Auth / Sync Change** | `.ai-configs/project/api-and-sync.md` | `server.ts` |
| **System Architecture / Operational Mode** | `.ai-configs/project/architecture.md` | `README.md` |
| **Agent Rule / Skill / Workflow Update** | `.ai-configs/rules/`, `.ai-configs/skills/` | `.ai-configs/README.md`, Root Adapters (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) |

## Step-by-Step Procedure
1. **Identify Delta**: Review the exact code or architectural changes made.
2. **Update Authoritative Docs**: Edit relevant markdown documents in `docs/` or `.ai-configs/`.
3. **Verify Relative Markdown Links**: Ensure all cross-references between `docs/` and `.ai-configs/` remain valid.
4. **Run Configuration Validation**:
   ```bash
   node .ai-configs/scripts/validate-configs.mjs
   ```
5. **Review**: Ensure changes maintain documentation integrity and avoid introducing inaccurate speculative documentation.
