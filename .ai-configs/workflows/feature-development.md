# Feature Development Workflow

This workflow guides the implementation of new features, views, and enhancements for Daymark.

## Workflow Overview
1. **Requirements & Invariants Check**: Review PRD/feature scope against Daymark architectural rules.
2. **Schema & Type Design**: Define interfaces in `src/types/daymark.ts`.
3. **Core Utility Implementation**: Implement algorithmic logic in `src/utils/`.
4. **UI Presentation & Integration**: Build or update components in `src/components/` and wire into `src/App.tsx`.
5. **Backend Endpoints (if needed)**: Expose Express REST endpoints in `server.ts`.
6. **Verification & Review**: Run type checks, builds, and invariant audits.

## Key Checkpoints

### Invariants Verification
Before writing code, verify:
- [ ] Are data structures Obsidian-compatible Markdown?
- [ ] Are new UI styles using standard Tailwind stone tokens?
- [ ] Does desktop mode maintain `max-w-[1800px]` width?
- [ ] Are state changes handled via unidirectional flow from `App.tsx`?

### Verification Suite
- `npm run lint` (`tsc --noEmit`)
- `npm run build` (`vite build`)
- Visual verification in both Desktop and Mobile views.

### Documentation Update
- If new endpoints or components were added, update `.ai-configs/project/codebase-map.md`.

Refer to [`.ai-configs/skills/feature-implementation/SKILL.md`](../skills/feature-implementation/SKILL.md) for detailed implementation techniques.
