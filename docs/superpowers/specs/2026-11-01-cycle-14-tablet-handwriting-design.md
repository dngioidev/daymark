# Cycle 14: tablet layout fix, handwritten notes and pen highlighting

## Intent and why

The owner writes by hand on a Samsung tablet almost every working day, mostly for study, using Samsung Notes with the S Pen. The writing experience in Samsung Notes is great, but its sync does not work for the owner. The goal is to write those pages in Daymark instead, so they live next to tasks and typed notes and sync through the owner's own server like everything else. The owner also wants to use the pen on ordinary typed notes to highlight text.

Separately, on the tablet some top buttons sit behind the Android status bar.

## Part 1: tablet top inset (bug)

On the Android app on a tablet, controls at the top of the screen are hidden behind the status bar. The phone shell already pads its header with `env(safe-area-inset-top)` (`src/components/mobile/MobileAppShell.tsx`), but the tablet and desktop layout (side rail, Notes column, Notes strip and drawer, dialogs above the `sm` breakpoint, graph toolbar) does not. Fix it so no control is ever under the status bar (or a cutout) in any orientation, on phone and tablet widths, while the browser and desktop PWA look unchanged when the inset is zero.

Done when: on a tablet emulator in portrait and landscape, every top control is fully visible and tappable; screenshots show it; a test or check guards against regressions.

## Part 2: handwritten notes

### What it is (owner's decisions)

- A new kind of note, a **handwritten note**, that lives with typed notes: same folders, same notes column, same pin and title, same sync.
- **Separate fixed pages like a notebook**, not one endless canvas. A new page is added when needed.
- **Tools:** pens in several colours, a highlighter, an eraser.
- **Paper:** lined and grid (the owner named both; a blank option is the builder's call).
- **On phone and laptop: read only.** The owner only reads handwritten notes there. Writing happens on the tablet with the S Pen.
- **Writing feel is the top priority.** The owner compares it with Samsung Notes. If writing feels laggy or scratchy, the feature has failed even if everything else works.

### Behaviour (owner's decisions plus marked guesses)

- Strokes respond to pen pressure (guess: line width varies with pressure).
- A palm resting on the screen never draws. While writing with the pen, a finger scrolls or turns pages instead of drawing (guess).
- The highlighter draws under the ink, semi-transparent (guess, matching Samsung Notes).
- Undo and redo for strokes (guess; a builder may confirm against the owner's habits).
- A page is A4-shaped in portrait (guess, matching Samsung Notes).

### Non-goals

- Turning handwriting into searchable text (handwriting recognition).
- Shapes, rulers, lasso select, inserted pictures on handwritten pages.
- Writing or erasing on phone and laptop.
- Replacing Samsung Notes for anything other than what is listed here.

### Anti-goals

- Handwriting that syncs perfectly but feels worse to write than Samsung Notes.
- Losing ink: a stroke written on the tablet must never disappear because of sync, an older device, or a crash mid-write.
- Making typed notes slower or different for people who never use the pen.

## Part 3: pen highlighting on typed notes (owner's decisions)

- On an ordinary typed note, dragging the S Pen across words with the highlighter **snaps to the words crossed** and turns them into a real text highlight in the chosen colour.
- The highlight is part of the note text, so it **stays with those words** through later edits, syncs, and on phone and laptop.
- It must work with the S Pen on the tablet ("compatible to use with pen"). Finger and mouse behaviour on typed notes stays as it is today.
- Loose freehand marks (circles, arrows, margin scribbles) are **not** kept on typed notes.
- Guess: a pen stroke drawn under words (not with the highlighter) may become an underline the same way. Builder's call whether to include it; the highlighter is the requirement.

## Constraints

- Follow `CLAUDE.md` and the repository invariants: stone palette tokens only, types from `src/types/daymark.ts`, `max-w-[1800px]` desktop width, markdown comment format preserved.
- **Old versions keep syncing without data loss** (standing owner decision from cycle 13). A device on 1.10.0 or earlier that syncs a handwritten note must not erase or corrupt its ink, and must not break. Builder's call (marked): old devices show the handwritten note with a short plain message that it needs a newer Daymark to view, instead of raw data.
- Highlights on typed notes must survive old devices too: they must be stored in a form an old device keeps when it edits and syncs the note (for example standard Markdown or HTML the current editor already round-trips). If an old device would strip them, that is a bug to fix or a limit to state.
- Sync limits from cycle 13 apply: pushes are batched by count and an 8 MiB byte budget. A handwritten note of many pages must sync without hitting those limits and without re-sending the whole notebook for every stroke if that can be avoided.
- Backups (`.zip` and `.json`) must include handwritten notes and restore them exactly.
- Heavy test suites run one at a time (`--maxWorkers=2`).
- Commits are authored as `dngioidev`. Release, push and deploy only on the owner's request.

## Done when

- The owner can write a multi-page study note on the Samsung tablet with pens, highlighter and eraser on lined or grid paper, and it opens, read only, on phone and laptop after sync.
- Highlighting words on a typed note with the S Pen produces highlights that stay with the words on every device.
- Top controls are never under the status bar on tablet.
- Writing latency and palm rejection are checked on a real tablet or a tablet emulator with stylus input. The owner's own trial on the Samsung tablet is the final acceptance, since the APK has not yet been tried on a real device.

## Decisions after the builder check

Owner's answers ("do like Samsung Notes behaviour"):

- **Pen on typed notes works like Samsung Notes:** the owner taps a **highlighter tool** in the typed note's toolbar first; while it is on, an S Pen drag across words highlights them. With the tool off, the pen behaves as today (places the cursor, selects text, scrolls). Finger and mouse never highlight by dragging.
- **Eraser works like Samsung Notes:** both modes are offered, **erase by area** (removes only the part rubbed over) and **erase by stroke** (removes the whole line touched), switched in the eraser's options and remembered on the device. Default: erase by area (builder's call, matching what Samsung Notes users usually see; easy to change).

Builder's calls (the owner can reverse any of them):

- **Ink lives in its own sync entities, gated by a feature flag.** The note itself stays an ordinary note (title, folder, pin, a plain placeholder text such as "Handwritten note: open Daymark 1.11 or later on a tablet to view"), plus a field marking it as handwritten. Ink is stored separately (for example one entity per page) and the server only sends ink entities to clients that announce an `ink` feature in their sync request, the pattern already used for `habits`, `backlog` and `notemeta`. Old clients therefore never see, hold or push ink, so they cannot erase it. The builder must verify against the 1.10.0 client and server code that (a) an old client keeps the handwritten marker field when it edits or merges the note, or that losing it is harmless, and (b) an old client that never receives ink entities never sends deletions for them. If either fails, fix it on the server side or stop and report; refusing old clients is not acceptable.
- **Ink never loses a stroke in a sync conflict.** Strokes have stable ids; a page's ink merges as a union of strokes, and erasing writes a removal record (erase by area replaces a stroke with its surviving pieces as new strokes plus a removal record for the original). Two devices writing on the same page both keep their strokes.
- **Writing is allowed on any device that gives pen input** (pointer type "pen"), read only otherwise. The owner's tablet is the target; phone and laptop without a pen are read only, as the owner asked.
- **Size target:** a notebook of up to 50 pages with typical study density must open, write and sync smoothly; per-page entities keep a stroke from re-sending the whole notebook.
- **Writing feel target:** strokes appear under the pen tip with no visible gap during normal writing speed, measured on a tablet emulator with stylus input and judged finally by the owner on the Samsung tablet. The first approach is the WebView (canvas, pointer events, coalesced and predicted events). A native Android ink layer is out of scope for this cycle; if the WebView approach cannot reach the target, the builder stops and reports with measurements instead of shipping a laggy feature.
- **Other note features:** search matches the handwritten note's title; the notes column shows it with a pen icon and the page count; the graph treats it like any note (title only). The `.zip` backup stores ink as a sidecar file per handwritten note and restores it exactly; the Markdown export carries the placeholder text.
- **Typed-note highlights** use the editor's highlight mark in a form the current editor already round-trips (TipTap 3 with the highlight extension, stored as `<mark>` with a colour in the note's Markdown/HTML). The builder must confirm an old 1.10.0 client keeps it when editing the note; if not, state it as a known limit.

## Left to the builder

- How ink is stored and synced (stroke format, per-page storage, compression), within the constraints above.
- The rendering approach for low-latency writing in the Android WebView (for example canvas with pointer events, coalesced and predicted events).
- Exact tool bar layout, colours offered, pen sizes, page add and navigation controls.
- How a handwritten note is created (for example from the New note menu).
- How the read-only view scales pages on phone and laptop.
