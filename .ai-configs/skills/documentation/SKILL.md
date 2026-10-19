---
name: documentation
description: Author, maintain, and synchronize technical documentation, architecture specs, source code maps, and agent guides in Daymark.
---

# Documentation Skill

## Purpose & Scope
This skill provides standards and procedures for creating, updating, and auditing technical documentation across Daymark. It ensures documentation in `docs/` and `.ai-configs/` stays synchronized with actual codebase implementations.

## When to Use
- Adding or modifying architecture components, APIs, or data models.
- Updating developer guides, code maps, or AI agent rules.
- Documenting new features, release notes, or deployment instructions.

## Prerequisites & Inputs
- **Inputs**:
  - Source code changes or PR specifications.
  - Existing documentation in `.ai-configs/project/`.
- **Authoritative Files**:
  - `.ai-configs/project/codebase-map.md`: Master file list and component responsibilities.
  - `.ai-configs/project/api-and-sync.md`: Server endpoints and payloads.
  - `.ai-configs/project/architecture.md`: System topology and data flow.

## Repeatable Procedure

### Step 1: Identify Documentation Touchpoints
When a code change is made, determine affected docs:
- API endpoints changed? Update `.ai-configs/project/api-and-sync.md`.
- New component or utility file added? Update `.ai-configs/project/codebase-map.md`.
- Core algorithm altered? Update `.ai-configs/project/specification.md`.
- Configuration or agent rule updated? Update `.ai-configs/rules/` or `.ai-configs/README.md`.

### Step 2: Draft Clear, Truthful Documentation
1. Follow existing Markdown style: GitHub-flavored Markdown, clear headings, table formats.
2. Use precise file references (e.g. `src/utils/lifecycleEngine.ts`).
3. Include working code examples, request/response snippets, or diagrams where appropriate.
4. Keep documentation factual: do not document planned features as already implemented without clear disclaimers.

### Step 3: Audit Cross-References & Links
1. Ensure all internal relative markdown links resolve to existing files.
2. Verify table of contents and documentation indexes (e.g. in `docs/README.md` and `.ai-configs/README.md`).

## Expected Outputs
- Updated or newly created documentation files.
- Accurate cross-links and updated master indices.
- Zero broken relative file paths.

## Validation & Quality Checks
- Run config validation: `node .ai-configs/scripts/validate-configs.mjs`.
- Reference workflow: [`.ai-configs/workflows/documentation-update.md`](../../workflows/documentation-update.md).
