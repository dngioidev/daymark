# Cycle 17 — Pen Writing and Full Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make handwritten notes good for long brainstorming sessions:
- true full screen with a tool side rail;
- the S Pen button erases while held;
- lasso select;
- text boxes;
- draw-and-hold shape snapping;
- pen or mouse drawing on any device;
- a clean full screen for typed notes.

**Architecture:**
- **Pure ink logic** (pointer policy, selection transforms, shape recognition, text boxes) lives in `src/ink/*.ts` with unit tests. The React layer (`src/components/ink/*`, `StandaloneNotesView.tsx`) only wires it up.
- **Text boxes** are stored as **single-point strokes carrying a `text` field** inside the existing `InkPage.strokes`. This means:
  - a Daymark 1.11 device validates them (`isInkPage` ignores unknown fields);
  - 1.11 merges them (`mergeInkPage` keeps whole stroke objects);
  - 1.11 never deletes them by itself. It renders them as a tiny dot, and area erase of a one-point stroke yields no pieces.

  No new sync entity key: 1.11 throws `Unknown sync entity` on new keys (`src/sync/merge.ts:502`).
- **Moves, resizes, recolors and shape snaps** tombstone the originals and add new strokes, so merges stay a union.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom), Capacitor 8 Android shell (`mobile/android`), Playwright-core e2e scripts in `scripts/`.

**Spec:** `docs/superpowers/specs/2026-11-06-cycle-17-pen-writing-fullscreen-design.md`

## Global Constraints

- Tailwind stone palette only (`stone-50`..`stone-950`); desktop width stays `max-w-[1800px]`.
- Types from `src/types/daymark.ts`; do not touch the daily `<!-- daymark: task_id=... -->` format or rollover.
- **Never lose ink or text:** across sync with a 1.11 device, backups (ZIP/JSON), undo/redo.
- Finger touch never draws; palms are ignored (`classifyPointer` rules for `touch` unchanged).
- A quick stroke (not held) always stays freehand.
- The side button must never leave the eraser on after release, and hover with the button held does nothing.
- Commit author `dngioidev`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (orchestrator commits) or the executing agent's own line.
- Before each commit, run `npm run lint` and `npm test`. Both must pass.

## Review Focus

1. **Text box survives a 1.11 device:** a page with a text box is merged by the 1.11 `mergeInkPage` and validated by the 1.11 `isInkPage`, and the text box is still there. Owned by Task 2.
2. **Side button released mid-stroke:** the eraser stroke ends and the next stroke uses the previous tool. The button pressed only while hovering does nothing. Owned by Task 1.
3. **Selecting a text box and moving it, then undo:** the box returns with the same text, and no duplicate text box remains visible. Owned by Task 3.
4. **A slow but moving stroke** (pen moving < hold threshold for under 500 ms) **does not snap.** A hold on a scribble that is not a shape stays freehand. Owned by Task 4.
5. **Laptop without pen opens a handwritten note:** Text tool works, mouse can draw after picking Pen, and finger touch still only scrolls. Owned by Task 6.

---

### Task 1: Pointer policy — side-button eraser and mouse drawing

**Files:**
- Modify: `src/ink/pointerPolicy.ts`
- Test: `src/ink/pointerPolicy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PointerState { penActive: boolean; allowMouse?: boolean }
  export type PointerAction = 'draw' | 'erase' | 'scroll' | 'ignore';
  export function classifyPointer(state: PointerState, e: { pointerType: string; width: number; height: number; isPrimary: boolean; buttons?: number; button?: number }): { action: PointerAction; state: PointerState };
  export function isPenEraserButton(e: { pointerType: string; buttons?: number; button?: number }): boolean;
  ```
- `classifyPointer` returns `'erase'` for a pen whose `buttons & 2` (barrel) or `buttons & 32` (eraser end), or whose `button === 5`. Everything else is unchanged.

- [ ] **Step 1: Write failing tests** in `pointerPolicy.test.ts`:
  - `pen with barrel button (buttons=3) erases`: `classifyPointer({penActive:false}, {pointerType:'pen',width:1,height:1,isPrimary:true,buttons:3}).action === 'erase'`.
  - `pen eraser end (buttons=32) erases`; `pen button===5 erases`.
  - `pen without button draws` (`buttons:1` → `'draw'`).
  - `mouse draws only with allowMouse` (existing behaviour kept).
  - `touch never draws or erases` with `buttons:3`.
- [ ] **Step 2:** Run `npx vitest run src/ink/pointerPolicy.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement as in Interfaces.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): classify the pen side button and eraser end as erase`.

### Task 2: Text boxes in the ink model (1.11-compatible)

**Files:**
- Modify: `src/types/daymark.ts` (`InkStroke`), `src/ink/inkModel.ts`, `src/ink/inkRender.ts`, `src/utils/vaultValidation.ts`
- Create: `src/ink/inkText.ts`, `src/ink/inkText.test.ts`, `src/ink/fixtures/legacyInk111.ts`

**Interfaces:**
- `InkStroke` gains `text?: string`. A stroke with `text !== undefined` is a **text box**:
  - `tool: 'pen'`;
  - `width: 1`;
  - `points` = `encodePoints([{x, y, p: 0.5}])`, the box's top-left anchor in page units;
  - `color` = the text color.
- Produces, in `inkText.ts`:
  ```ts
  export const TEXT_BOX_MAX = 5000; // characters
  export function isTextBox(s: InkStroke): boolean;
  export function textBoxAnchor(s: InkStroke): { x: number; y: number };
  export function createTextBox(text: string, at: { x: number; y: number }, color: string, id: string, now: string): InkStroke;
  export function replaceTextBox(page: InkPage, id: string, next: { text?: string; at?: { x: number; y: number }; color?: string }, newId: string, now: string): InkPage; // tombstone old + add new; empty text => tombstone only
  export function visibleTextBoxes(page: InkPage): InkStroke[];
  ```
- `visibleStrokes` and `drawPage` exclude text boxes, which the React overlay renders instead. `eraseArea` and whole-stroke erase treat a text box as **not erasable** by the eraser; boxes are deleted only via Select or emptying the text.
- `isInkPage` accepts an optional `text` string of length ≤ `TEXT_BOX_MAX` and rejects other types.

- [ ] **Step 1: Write the fixture.** In `legacyInk111.ts`, copy `mergeInkPage` and `isInkPage` **verbatim from git `2c84344`** (`git show 2c84344:src/ink/inkModel.ts`, `git show 2c84344:src/utils/vaultValidation.ts`), exported as `legacyMergeInkPage` and `legacyIsInkPage`.
- [ ] **Step 2: Write failing tests** in `inkText.test.ts`:
  - `a text box survives a 1.11 merge`: `legacyMergeInkPage(base, withBox, otherDeviceStrokes)` contains a stroke with the same `id` and `text`.
  - `a 1.11 device accepts a page with a text box`: `legacyIsInkPage(pageWithBox) === true`.
  - `1.11 area erase never duplicates a text box`: run `eraseArea` from the 2c84344 copy on the anchor. The result has no new stroke carrying `text`.
  - `replaceTextBox tombstones the old id and adds one new box`.
  - `empty text deletes the box`.
  - `eraseArea and whole-stroke erase leave text boxes alone` (current code).
  - `isInkPage rejects text: 5` and `text longer than TEXT_BOX_MAX`.
  - `drawPage does not draw text boxes` (spy on the `ctx` path calls).

  To get 1.11's `eraseArea`, also copy it into the fixture.
- [ ] **Step 3:** Run `npx vitest run src/ink/inkText.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement per Interfaces.
- [ ] **Step 5:** Run the Step 3 command, then `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(ink): text boxes stored as single-point text strokes that 1.11 keeps`.

### Task 3: Lasso selection and transforms

**Files:**
- Create: `src/ink/inkSelection.ts`, `src/ink/inkSelection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Loop = { x: number; y: number }[];
  export const LASSO_INSIDE_RATIO = 0.6; // share of a stroke's points inside the loop
  export function lassoSelect(page: InkPage, loop: Loop): string[];         // visible stroke ids incl. text boxes (anchor inside)
  export function selectionBounds(page: InkPage, ids: string[]): { minX: number; minY: number; maxX: number; maxY: number } | null;
  export type Transform = { dx: number; dy: number; scale: number; originX: number; originY: number };
  export function transformStrokes(page: InkPage, ids: string[], t: Transform, newId: () => string, now: string): { page: InkPage; ids: string[] }; // returns new ids
  export function recolorStrokes(page: InkPage, ids: string[], color: string, newId: () => string, now: string): { page: InkPage; ids: string[] };
  export function deleteStrokes(page: InkPage, ids: string[], now: string): InkPage;
  export function copyStrokes(page: InkPage, ids: string[]): InkStroke[];   // detached copies for the device clipboard
  export function pasteStrokes(page: InkPage, clip: InkStroke[], offset: { dx: number; dy: number }, newId: () => string, now: string): { page: InkPage; ids: string[] };
  ```
- Transformed strokes keep `tool`, `color`, `width`×`scale` (text boxes keep `width: 1`), `text`, and **original `createdAt`** (draw order is stable). Results are clamped to the page (0..`PAGE_WIDTH`, 0..`PAGE_HEIGHT`).

- [ ] **Step 1: Write failing tests:**
  - `lasso picks a stroke with ≥60% points inside and not one with 40%`;
  - `lasso picks a text box whose anchor is inside`;
  - `transform tombstones originals and adds the same count of new strokes`;
  - `scale 2 around origin doubles distances from origin`;
  - `transform keeps text and createdAt`;
  - `recolor changes color only`;
  - `paste adds new ids and leaves the clip untouched`;
  - `two devices moving the same strokes merge to both results (mergeInkPage), nothing lost`;
  - `transform clamps to the page`.
- [ ] **Step 2:** Run `npx vitest run src/ink/inkSelection.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use point-in-polygon (even–odd) on decoded points; reuse `cacheStrokeGeometry`.
- [ ] **Step 4:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): lasso selection with move, resize, recolor, delete, copy and paste`.

### Task 4: Shape recognition for draw-and-hold

**Files:**
- Create: `src/ink/shapeRecognition.ts`, `src/ink/shapeRecognition.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShapeKind = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'circle' | 'triangle';
  export const HOLD_MS = 500;          // pen still this long at stroke end
  export const HOLD_RADIUS = 6;        // page units the pen may drift while "still"
  export function isHeld(points: { x: number; y: number; t: number }[], now: number): boolean;
  export function recognizeShape(points: { x: number; y: number; p: number }[]): { kind: ShapeKind; points: { x: number; y: number; p: number }[] } | null;
  ```
- Output points are a clean polyline in page units: a line is 2 points; a rectangle has 5 points (closed); an ellipse or circle has 64 points; a triangle has 4 points (closed); an arrow is the shaft plus two head segments drawn as one polyline, with the head at the **last** point. Pressure is the stroke's median.

- [ ] **Step 1: Write failing tests** with generated noisy inputs (seeded jitter ±3 units):
  - a straight line → `line`;
  - a line ending in a hook "^" → `arrow`;
  - an axis-aligned box → `rectangle` (5 points, first===last);
  - a round loop → `circle`;
  - a wide loop → `ellipse`;
  - a 3-corner loop → `triangle`;
  - a zig-zag scribble → `null`;
  - a handwritten word sample → `null`;
  - `isHeld` true when the last 500 ms stays within 6 units;
  - `isHeld` false for a slow continuous move.
- [ ] **Step 2:** Run `npx vitest run src/ink/shapeRecognition.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Simplify with Ramer–Douglas–Peucker, then classify by closedness, corner count and fit error. The thresholds are the implementer's choice, within the tests.
- [ ] **Step 4:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): recognise lines, arrows, rectangles, ellipses and triangles`.

### Task 5: InkCanvas — select, text, side-button eraser, hold-to-snap

**Files:**
- Modify: `src/components/ink/InkCanvas.tsx`
- Create: `src/components/ink/InkSelectionLayer.tsx` (dashed bounds, corner handles, action bar), `src/components/ink/InkTextLayer.tsx` (positioned `<textarea>`/text boxes)
- Test: `src/components/ink/InkCanvas.test.ts` (extend, or create alongside existing ink tests)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  ```ts
  export type InkCanvasTool = InkTool | 'eraser' | 'select' | 'text';
  // InkCanvasProps.tool: InkCanvasTool; new optional props:
  textColor?: string;
  onSelectionChange?: (ids: string[]) => void;
  // InkCanvasHandle gains:
  deleteSelection(): void; recolorSelection(color: string): void; copySelection(): void; cutSelection(): void; paste(): void; duplicateSelection(): void;
  ```
- **Device clipboard:** a module-level `let inkClipboard: InkStroke[]` in `InkCanvas.tsx`, so it is shared across pages and notes on this device.
- **Undo:** each move or resize, recolor, delete, paste, snap and text edit pushes **one** `Change` onto the existing undo stack.
- **Side button:** while `classifyPointer(...).action === 'erase'`, the live stroke is an eraser stroke using the current `eraserMode`. The tool prop is not changed, so release restores it automatically.
- **Hold-to-snap:** while drawing with Pen or Highlighter, a timer checks `isHeld` every 100 ms. On hold, it replaces the live stroke with `recognizeShape` output, if any. Undo returns the freehand stroke.
- **Text:** a tap with the Text tool (pen, mouse or touch tap without movement) creates an editing box at that point. Blur with empty text cancels. Tapping an existing box with the Text tool edits it. Edits commit through `replaceTextBox`.

- [ ] **Step 1: Write failing tests** (jsdom; synthesize `PointerEvent`s as the existing ink tests do):
  - `pen with buttons=3 erases a stroke under it and the next plain stroke draws`;
  - `select tool loop then drag moves the strokes; one undo restores`;
  - `text tool tap, type "hello", blur → page has one text box "hello"`;
  - `held stroke shaped like a box becomes a 5-point rectangle; undo restores freehand`;
  - `quick box stroke without hold stays freehand`;
  - `finger touch with select or text tool does not select or create`.

  The `touch` tap must not create a text box; the Text tool works with a pen or mouse tap only.
- [ ] **Step 2:** Run `npx vitest run src/components/ink`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** Run the Step 2 command, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): select, text boxes, side-button erasing and draw-and-hold shapes in the canvas`.

### Task 6: Writing on any device (pen, mouse, keyboard)

**Files:**
- Modify: `src/components/ink/HandwrittenNoteView.tsx`, `src/ink/handwrittenNotes.ts`
- Test: `src/components/ink/HandwrittenNoteView.test.ts` (create if missing)

**Interfaces:**
- **No pen seen** (`canWrite() === false`): the view shows a writing toolbar or rail with **Text** and page controls always. Picking Pen, Highlighter, Eraser or Select passes `allowMouse` to `InkCanvas`.
- **Pen seen:** `allowMouse` is false, as today.
- Remove the read-only `InkPageView` branch for the writable path. `InkPageView` remains for previews.

- [ ] **Step 1: Write failing tests:**
  - `without a pen, the Text tool is available and a mouse tap creates a text box`;
  - `without a pen, after choosing Pen, a mouse drag draws`;
  - `after a pen was seen, a mouse drag does not draw`;
  - `touch drag never draws`.
- [ ] **Step 2:** Run `npx vitest run src/components/ink/HandwrittenNoteView.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): handwritten pages take text boxes and mouse drawing on devices without a pen`.

### Task 7: Side rail and full-screen writing for handwritten notes

**Files:**
- Create: `src/components/ink/InkRail.tsx`, `src/utils/fullscreen.ts`
- Modify: `src/components/ink/HandwrittenNoteView.tsx`, `src/components/ink/InkToolbar.tsx` (share tool list, color and width popovers)
- Test: `src/components/ink/InkRail.test.ts`, `src/utils/fullscreen.test.ts`

**Interfaces:**
- `HandwrittenNoteView` gains `fullScreen?: boolean; onExitFullScreen?: () => void`. When `fullScreen` is set, it renders `InkRail` instead of `InkToolbar`.
- `InkRail` props mirror `InkToolbar` plus `tool: InkCanvasTool`, `side: 'left' | 'right'`, `onExit()`, and selection actions (shown when `selectionCount > 0`).
- **Rail order, top to bottom:**
  - Pen, Highlighter, Eraser, Select, Text;
  - colors and width of the current tool;
  - Undo, Redo;
  - page controls (previous, "n / m", next, add page);
  - Exit, pinned at the bottom.
- The rail is dark (`bg-stone-900 text-stone-100`), with every button ≥44×44 and `aria-label`s matching the toolbar's.
- Rail side is a per-device setting: `localStorage['dm.ink.railSide']` (`'left'` default | `'right'`), changed from the rail's overflow (⋯) button.
- `fullscreen.ts`: `enterFullscreen(el: HTMLElement): Promise<void>` and `exitFullscreen(): Promise<void>`. Both are no-ops without the Fullscreen API, and errors are swallowed.

- [ ] **Step 1: Write failing tests:**
  - `rail lists Pen, Highlighter, Eraser, Select, Text, Undo, Redo, Exit in that order`;
  - `rail on the right when dm.ink.railSide=right`;
  - `Exit calls onExitFullScreen`;
  - `selection actions appear only with a selection`;
  - `fullscreen helpers are no-ops without document.fullscreenEnabled`.
- [ ] **Step 2:** Run `npx vitest run src/components/ink/InkRail.test.ts src/utils/fullscreen.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ink): full-screen side rail for handwritten notes`.

### Task 8: Full screen in Notes (typed and handwritten, all sizes)

**Files:**
- Modify: `src/components/StandaloneNotesView.tsx`, `src/components/notes/PhoneNotes.tsx`, `src/components/ShortcutHelp.tsx` (label "Full screen")
- Test: `src/components/StandaloneNotesView.test.ts`

**Interfaces:**
- Rename the user-facing "Focus mode" to **"Full screen"**: `aria-label="Full screen"`, title `Full screen (Ctrl/⌘ + .)`. Keep the `focusMode` state name internally.
- The button also shows on **phone**.
- When on, render **only**:
  - for handwritten notes, `HandwrittenNoteView` with `fullScreen` and `onExitFullScreen={() => setFocusMode(false)}`;
  - for typed notes, the editor (rich or Markdown, with its formatting toolbar) plus one Exit button (`aria-label="Exit full screen"`).
- Hidden while on: title input, pin, more menu, `FolderPicker`, Notes, Related, footer, navigation column, Related panels.
- Entering calls `enterFullscreen(root)`; leaving calls `exitFullscreen()`. Leaving also happens on `Esc` (existing handler), the Android back button (`@capacitor/app` `backButton` listener where it exists) and the browser `fullscreenchange` to not-fullscreen.

- [ ] **Step 1: Write failing tests:**
  - `full screen on a typed note hides title, Move to folder, Related and footer`;
  - `full screen on a handwritten note renders the rail`;
  - `Exit full screen restores the title row`;
  - `phone shows the Full screen button`;
  - `Escape leaves full screen`.

  Update the existing `Focus mode` assertions to the new label.
- [ ] **Step 2:** Run `npx vitest run src/components/StandaloneNotesView.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the Step 2 command, then `npm test` and `npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(notes): clean full screen for typed and handwritten notes on every screen size`.

### Task 9: S Pen button on the Android app (spike, then forward if needed)

**Files:**
- Modify (only if needed): `mobile/android/app/src/main/java/app/daymark/notes/MainActivity.*`
- Create: `docs/releases/cycle-17/spen-button.md` (findings)

- [ ] **Step 1:** Build the debug APK (`npm run android:build`) and add a temporary `?inkdebug=1` overlay that prints `pointerType`, `buttons` and `button` for pen events.
- [ ] **Step 2: Owner check on the S Pen tablet.** Ask the owner to:
  1. draw with the button held;
  2. hover with the button held;
  3. draw without the button.

  Record the reported values in `spen-button.md`.
- [ ] **Step 3:** If the WebView already reports `buttons & 2` or `& 32` while drawing, stop. Task 1 covers it. Otherwise, forward `MotionEvent.BUTTON_STYLUS_PRIMARY` from `MainActivity` (`dispatchTouchEvent`) to the page as a `CustomEvent('daymark-stylus-button', { detail: { pressed } })`. Have `InkCanvas` treat `pressed` as erase.
- [ ] **Step 4:** Remove the debug overlay. Run `npm run android:build -- --test`. Expected: build and Kotlin tests pass.
- [ ] **Step 5:** Commit `fix(android): S Pen side button reaches the ink canvas` (or `docs: S Pen button needs no forwarding`).

### Task 10: Guide, e2e, sync with 1.11, release docs

**Files:**
- Modify: `docs/guide/notes.md` (handwriting: full screen, rail, side button, Select, Text, shapes; typed full screen), `scripts/e2e-android-pwa.mjs` (new scenarios), `scripts/e2e-sync.mjs` (text box scenario)
- Create: `docs/releases/cycle-17/README.md`, `docs/releases/cycle-17/images/*`

- [ ] **Step 1:** Update `docs/guide/notes.md` Web and Mobile sections. Run `npm run test:helpers`. Expected: PASS (guide parser).
- [ ] **Step 2:** Add e2e scenarios to `e2e-android-pwa.mjs`:
  - full-screen entry and exit hides the title and folder rows (typed and handwritten);
  - select → move → undo with pen pointer events;
  - Text tool with the keyboard;
  - shape hold.

  Run `npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 3:** Add to `e2e-sync.mjs` a device A on this build that writes a text box, and a device B that merges using the Task 2 legacy functions through the real server. Assert the box survives both directions. Run `npm run test:sync`. Expected: pass.
- [ ] **Step 4:** Capture screenshots with `node scripts/capture-screenshots.mjs cycle-17` (tablet, light and dark: rail, selection, text box, snapped shapes; desktop typed full screen). Write `docs/releases/cycle-17/README.md` with what changed, the test results and the S Pen findings. Run `npm run validate:ai`. Expected: pass.
- [ ] **Step 5:** Commit `docs: Cycle 17 guide, e2e and release notes`.
