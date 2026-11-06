# Cycle 17 — Pen writing and full-screen notes (design)

Status: draft for owner review · 2026-11-06 · follows Cycle 16 (Markdown fixes, merged to `main` at `04fb840`)

## Why

The owner brainstorms projects on a Samsung tablet with the S Pen in handwritten notes. In a real session (2026-11-05) three things got in the way:

1. **Switching to the eraser is slow.** Every correction means tapping the toolbar, erasing, tapping back to the pen.
2. **There is no way to select.** Moving or resizing a sketch means erasing it and redrawing it.
3. **Full screen is not full screen.** Focus mode hides the notes list but still shows the title row, the folder picker ("Move to folder") and the Related button, which have no place while writing.

The owner also writes on a laptop and a phone. Without a pen, handwritten pages are read-only today, so they want a **text box** to type onto the page, and they want a pen on a phone or laptop to work as it does on the tablet. For brainstorming, rough boxes and arrows should **snap into clean shapes** when they draw and hold, like Samsung Notes.

Success: a long brainstorming session on the tablet never needs the toolbar to correct, rearrange or tidy a sketch. The same note can then be read and added to from a laptop or phone.

## Goals

- A true full-screen mode for **handwritten** notes, with a tool **side rail** (owner's choice over a floating top bar).
- A true full-screen mode for **typed** notes: only the text and the formatting bar.
- **S Pen side button = eraser while held.**
- **Lasso select** of strokes, with move, resize, delete, recolor, and copy/paste.
- **Text boxes** on handwritten pages, which can be placed, edited and moved, and which sync.
- **Draw-and-hold shape snapping** for line, arrow, rectangle, ellipse/circle and triangle.
- **Pens on any device** draw. On a device with no pen, the mouse can draw.

## Non-goals (this cycle)

- Handwriting-to-text recognition, and handwriting search beyond titles.
- Tags, Related suggestions and Help. These are **Cycle 18** (`2026-11-06-cycle-18-tags-suggestions-help-design.md`).
- Named connections between notes. These are deferred, to be decided after the owner has used working tags.
- Layers, images on ink pages, shape fill, and rich formatting inside text boxes (bold, lists).
- A floating, draggable toolbar.

## Anti-goals (a failure even if it "works")

- **Losing ink or text.** No path may drop strokes or text boxes. This includes sync with a device still on 1.11, backups, Markdown export/import, and undo/redo.
- **Slowing the pen.** Writing latency and the current palm and finger rules must not get worse. A finger still scrolls; palms never draw.
- **Accidental erasing.** The side button must never leave the eraser stuck on after it is released, and it must never erase while only hovering.
- **Shapes snapping by surprise.** A quick stroke always stays freehand.

## Current state (what exists, as of `main` `04fb840`)

- `src/components/ink/HandwrittenNoteView.tsx`: a horizontal `InkToolbar` with Pen, Highlighter, Eraser (area or whole-stroke), colors, widths, Undo/Redo and page controls (previous, next, add). One `InkCanvas` per page.
- `src/ink/pointerPolicy.ts`: `pen` draws, a small primary `touch` scrolls, and large or secondary touches are ignored. `mouse` draws only with `allowMouse`, which is used today only by `InkBench`.
- `src/ink/handwrittenNotes.ts` `canWrite` / `rememberPen`: a page is writable only after a pen has been seen on that device. Otherwise it is read-only.
- Ink data (`src/types/daymark.ts`, `src/ink/inkModel.ts`):
  - An `InkPage` holds immutable `strokes` (id, tool, color, width, encoded points, createdAt) plus a `removed` tombstone list.
  - `mergeInkPage` is a union of strokes plus a union of tombstones.
  - Erasing adds tombstones, and area erase also adds new piece strokes.
  - The page is 1000 × 1414 units.
- `src/components/StandaloneNotesView.tsx`: **Focus mode** (`Ctrl/⌘ + .`, Maximize button, tablet and desktop only) hides the navigation column. The title row (title, pin, more menu), the `FolderPicker` row and the Related button remain.

## Design

### 1. Full-screen writing — handwritten notes

- Entered from the existing Focus mode button and `Ctrl/⌘ + .` while a handwritten note is open. Phones get the button too (it is hidden on phones today). Exit uses the rail's Exit button, `Esc` (keyboard), or Android Back.
- **Shown:** only the page or pages and a **dark side rail on the left edge**. No title, pin, more menu, folder picker, Related, footer or app navigation. Where the platform allows it, the browser or app also goes truly full screen: the Fullscreen API on web, immersive mode in the Android shell.
- **Rail contents, top to bottom:**
  - Pen, Highlighter, Eraser, Select, Text.
  - The current tool's colors and width.
  - Undo, Redo.
  - Page controls (previous, "n / m", next, add page).
  - **Exit** pinned at the bottom.
- Tapping the active tool again opens its options (eraser mode, width), as it does today.
- The rail can be moved to the right edge for left-handed writers. This is a per-device setting stored like `dm.ink.eraserMode`.
- The current toolbar stays as it is outside full screen. Full screen replaces it with the rail.

### 2. Full screen — typed notes

- The same entry points. **Shown:** the editor and its formatting toolbar, plus a small Exit control. No title row, folder row, Related or footer.
- The title is still editable outside full screen. Nothing about a note's data changes.

### 3. S Pen button → eraser while held

- While the pen's side button is held (a pen pointer reporting the barrel button: `buttons & 2`, or the eraser end: `buttons & 32` / `button === 5`), any stroke is an **eraser** stroke. It uses the eraser mode last chosen, area or whole-stroke.
- On release the previous tool is back. Nothing is shown as a mode change except a brief cursor or rail highlight.
- The button only acts while the pen is touching the page. Hover with the button held does nothing.
- An eraser end (on pens that have one) behaves the same way.
- The **builder must confirm on the owner's Samsung tablet** what the Android WebView reports for the S Pen button. If the WebView does not pass the button through, the Android shell must forward it. Treat this as a required spike at the start of the cycle.

### 4. Lasso select

- **Select tool:** draw a free loop. Every stroke whose points are mostly inside it (owner-facing rule: "if it's mostly inside, it's picked") becomes selected, and so do text boxes inside it. The selection shows a dashed bounding box with corner handles and a small action bar.
- **Actions:**
  - Move (drag inside the box).
  - Resize (corner handles; the aspect ratio stays locked).
  - Delete.
  - Recolor (the pen colors).
  - Copy, Cut, Paste. Paste works on the same page and on another page of any handwritten note on this device.
  - Duplicate.
- Tapping outside the selection clears it. The pen, and the mouse where allowed, can move a selection. A finger cannot.
- Data: a strokes change is a tombstone for the originals plus new strokes with transformed points. This keeps strokes immutable and merges cleanly. One move or resize is one undo step.

### 5. Text boxes

- **Text tool:** tap the page to place a box, then type. The box grows with its text up to the page width. Plain text with line breaks only. One size and one font.
- A text box can be moved, deleted and edited later. Its color follows the pen colors.
- It works **on any device, with or without a pen**. Placing and typing text boxes is the way to add to a handwritten page from a laptop or phone keyboard. A page is no longer read-only for text when no pen has been seen: the Text tool and page controls are always available, and drawing tools follow the device rules in section 7.
- Text boxes are included in Select, undo/redo, sync, ZIP/JSON backups, and the Markdown export placeholder. *Builder's call:* the export may list the text so it is not lost.
- Cycle 18 will read text-box text for tags (`#tag`), search and Related. This cycle only has to store it as plain text that can be read.

### 6. Draw-and-hold shape snapping

- Drawing a stroke and then keeping the pen still at the end, for about 500 ms (*builder's call* on exact timing; match Samsung Notes' feel), replaces the stroke with a clean shape if it is recognised as one:
  - line;
  - arrow (a line with a head at the end where the hold happened);
  - rectangle (axis-aligned unless clearly rotated);
  - ellipse, or a circle when nearly round;
  - triangle.
- The clean shape keeps the stroke's tool, color and width, and stays an ordinary stroke (points). Select, erase and sync then need no changes.
- If nothing is recognised, the stroke stays freehand. A stroke that is not held always stays freehand. One snap is one undo step, and Undo returns the freehand stroke.

### 7. Pens and the mouse on any device

- A `pen` pointer draws on every device: tablet, phone with stylus, touchscreen laptop.
- **Mouse:** when a handwritten note is open and no pen has been seen on this device, picking Pen, Highlighter, Eraser or Select lets the mouse use it. When a pen has been seen, the mouse does not draw, which keeps today's protection. *Builder's call:* a per-device "Mouse can draw" setting may override this.
- **Finger:** unchanged. It scrolls and never draws.

## Data and compatibility constraints

- **Strokes:** select, move, resize, recolor and shapes all produce ordinary strokes plus tombstones. The `InkPage` format for strokes does not change.
- **Text boxes are new data.**
  - **Risk:** a device still on Daymark 1.11 merges ink pages with `mergeInkPage`, which rebuilds the page from `strokes` and `removed` only. If text boxes live inside `InkPage`, an old device could silently drop them.
  - The builder must choose a storage design where **an older device can never delete text boxes**. Examples: a separate entity key per page for text boxes, or a page field that older merges keep. Prove it with a two-device sync test that pairs a 1.11 client with a 1.12 client.
  - This is a hard requirement, not a builder's preference.
- **Concurrent edits (designer's call):**
  - Text boxes are immutable like strokes. Editing, moving or recoloring one tombstones the old box and adds a new one.
  - If two devices edit or move the same box or the same strokes at once, **both results survive** and the user sees both and deletes one. This matches how area erase already merges, and it never loses text.
  - A delete on one device and an edit on another leave the edited copy.
- Server, sync, backups (ZIP/JSON) and vault validation must accept and round-trip the new text-box data. Markdown-only import may not restore ink, as today, and that is acceptable.
- Rollover idempotency, the `<!-- daymark: ... -->` comment format, the Tailwind stone palette and the desktop `max-w-[1800px]` are untouched.

## Verification the owner expects

- Unit tests for:
  - pointer classification (button held, eraser end, mouse rules);
  - lasso hit-testing;
  - transform tombstoning;
  - shape recognition (positive and negative cases, including "quick stroke stays freehand");
  - text-box merge.
- Browser e2e on the existing Android PWA harness for:
  - full-screen entry and exit, and what is hidden, on typed and handwritten notes, phone, tablet and desktop;
  - select → move → undo;
  - placing a text box with the keyboard on desktop;
  - shape snap.
- A two-device sync e2e that includes a 1.11 client and text boxes.
- **A real-device check on the owner's S Pen tablet** for the side button and shape hold. Emulated pointer events alone are not enough for sign-off.
- Release screenshots under `docs/releases/cycle-17/`.

## Left to the builder

- Exact hold timing and recognition thresholds for shapes. The lasso "mostly inside" ratio.
- Rail icon order beyond the list above, rail width, and how options pop out from the rail.
- Text-box storage design, within the compatibility constraint above.
- Whether full screen uses the browser Fullscreen API when the user has not installed the app.
