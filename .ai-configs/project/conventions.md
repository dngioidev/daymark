# Development Conventions & Invariants

This document outlines key technical conventions, commands, and invariants specific to the Daymark project.

## Development & Build Commands

```bash
# Install dependencies
npm install

# Start full-stack development server (Express + Vite on port 3000)
npm run dev

# Run TypeScript compiler check (no emit)
npm run lint

# Build production bundle to dist/
npm run build

# Start production server
npm start

# Validate AI configuration system
node .ai-configs/scripts/validate-configs.mjs
```

## Critical Engineering Invariants

1. **HTML Metadata Comments Format**:
   Machine attributes inside markdown notes must match:
   ```html
   <!-- daymark: task_id=<id> status=<status> created=<YYYY-MM-DD> [carried_from=<YYYY-MM-DD>] [completed=<YYYY-MM-DD>] -->
   ```
   Do not modify regex patterns or serialize without this structure.

2. **Rollover Idempotency**:
   `performDailyRollover()` in `src/utils/lifecycleEngine.ts` checks existing tasks in the target document before copying to prevent duplicates.

3. **Tailwind CSS Stone Color Palette**:
   Use standard Tailwind v4 stone colors (`stone-50` through `stone-950`).
   **Never use invented classes** like `stone-850` or `stone-750`.

4. **Desktop Layout Width**:
   Use `w-full max-w-[1800px] mx-auto` or `max-w-[1920px]` in desktop mode. Do not artificially narrow the view.

5. **Type Safety**:
   Import types exclusively from `src/types/daymark.ts`. Do not use `any` when schemas exist.
