# Engineering Standards

These standards establish coding conventions, architecture patterns, and repository-specific invariants across the Daymark codebase.

## 1. Code Style & Architecture
- **Follow existing conventions**: Match existing naming schemes, code formatting, module structures, and error-handling patterns.
- **Layer separation**:
  - Keep domain logic, algorithmic calculations, and date math in `src/utils/` (`lifecycleEngine.ts`, `markdownEngine.ts`, `vaultStore.ts`).
  - Keep UI components focused on presentation, layout, and user event handling in `src/components/`.
  - Keep backend REST endpoints, authentication, and sync routing in `server.ts`.
- **Do not duplicate logic**: Reuse established helper functions (e.g. `getCalendarDaysDifference`, `calculateTaskAge`, `parseDailyDocument`, `serializeDailyDocument`).

## 2. Type System Integrity
- **Strict type adherence**: All data models must adhere to `src/types/daymark.ts`.
- Do not introduce ad-hoc fields or bypass TypeScript types with `any` unless strictly necessary for third-party boundary shims.
- Ensure all TypeScript checks pass cleanly without lint or type errors (`tsc --noEmit`).

## 3. Daymark Invariants
- **HTML Machine Comment Preservation**:
  Task metadata comments format:
  ```html
  <!-- daymark: task_id=<id> status=<status> created=<YYYY-MM-DD> [carried_from=<YYYY-MM-DD>] [completed=<YYYY-MM-DD>] -->
  ```
  Parsers and serializers in `src/utils/markdownEngine.ts` must maintain backwards and forwards compatibility with this format.
- **Pure Idempotency in Rollover**:
  `performDailyRollover` in `src/utils/lifecycleEngine.ts` must never create duplicate task items. It checks active document headings against existing task IDs before rolling forward.
- **Tailwind CSS Palette Discipline**:
  Use standard Tailwind CSS stone colors: `stone-50`, `stone-100`, `stone-200`, `stone-300`, `stone-400`, `stone-500`, `stone-600`, `stone-700`, `stone-800`, `stone-900`, `stone-950`.
  **Never invent non-existent utility classes** such as `stone-850`, `stone-750`, or `amber-650`.
- **Desktop Full-Width Layout**:
  In desktop mode (`appMode === 'desktop'`), layout containers must use `w-full max-w-[1800px] mx-auto` or `max-w-[1920px]`. Never collapse the desktop experience into an artificial phone frame unless explicitly testing the mobile simulation view.

## 4. Quality & Maintainability
- Consider backward compatibility with existing user vaults and notes.
- Do not weaken validation, remove test assertions, or loosen compiler flags to force builds or type checks to pass.
