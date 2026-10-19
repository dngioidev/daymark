---
name: feature-implementation
description: Design, implement, and integrate new features or enhancements into Daymark following architectural layers, strict type safety, and local-first data invariants.
---

# Feature Implementation Skill

## Purpose & Scope
This skill provides a structured methodology for designing, implementing, and integrating new capabilities into the Daymark codebase while strictly preserving local-first invariants, type safety, and clean separation between UI and business logic.

## When to Use
- Adding new UI components, views, or modal dialogs to Daymark.
- Extending task lifecycle operations or markdown syntax handling.
- Adding or enhancing backend API endpoints in `server.ts`.
- Implementing settings options or export/import features.

## Prerequisites & Inputs
- **Inputs**:
  - Feature specification, user requirements, or acceptance criteria.
  - Target architecture layers affected (UI, utility engine, server, types).
- **Authoritative References**:
  - `docs/specification.md` and `docs/source-code-map.md`.
  - `.ai-configs/rules/engineering-standards.md`.
  - `.ai-configs/project/architecture.md`.

## Repeatable Procedure

### Step 1: Architectural Alignment & Type Definitions
1. Determine which layer the feature belongs to:
   - Schema / Interfaces: update `src/types/daymark.ts` first if data structures change.
   - Algorithms / Business Logic: place in `src/utils/` (`lifecycleEngine.ts`, `markdownEngine.ts`, etc.).
   - UI Presentation: create or update modular components in `src/components/`.
   - Global State: orchestrate in `src/App.tsx`.
   - API / Network: update `server.ts`.
2. Confirm compliance with Daymark invariants:
   - Does it respect `<!-- daymark: ... -->` comment formats?
   - Does it uphold rollover idempotency?
   - Does it use standard Tailwind stone colors (no custom or non-existent tokens)?
   - Does it support responsive desktop (`max-w-[1800px]`) and mobile layouts?

### Step 2: Implement Core Logic First
1. Implement any pure domain or helper functions before wiring into the UI.
2. Ensure pure functions handle edge cases (empty lists, unparseable markdown, invalid dates).
3. Keep business logic out of React component render trees.

### Step 3: Wire State & Components
1. Update component props and event handlers cleanly.
2. Maintain unidirectional data flow: pass handlers from `App.tsx` down to components.
3. Preserve keyboard shortcuts, accessibility, and loading/empty states.

### Step 4: Verify & Build
1. Run type checking: `npm run lint` (`tsc --noEmit`).
2. Run production build: `npm run build` (`vite build`).
3. Manually or programmatically verify key interactions.

## Expected Outputs
- Minimally invasive, typed code changes across affected files.
- Zero TypeScript compiler errors.
- Successful Vite production build.
- Updated documentation if user-facing behavior or schema changes.

## Validation & Quality Checks
- Check that no new dependencies were added unless strictly required.
- Check that desktop layouts do not artificially constrain width.
- Reference workflow: [`.ai-configs/workflows/feature-development.md`](../../workflows/feature-development.md).
