# Cycle 6: personal look, Calendar and roomier screens (design)

Date: 2026-10-22 · Status: draft for approval · Scope: desktop and web first, phone-sized web and the Android app where noted.

## Why

Daymark works, but it looks the same for everyone and some screens waste space or cramp the user:

- On a wide monitor Today's List and Markdown views stop at about half the window.
- The Notes editor is a short box inside a long page, so there is little room to write.
- The Settings dialog changes size with every tab, which is jarring.
- History is a review screen only: you cannot look ahead and plan future days.
- Light/dark follows the browser, so the user cannot choose it in the app.
- The Android home-screen widget has one fixed look.

The user wants to make the app their own (a calm background photo, their colours, their theme), plan days ahead from a calendar, and get more room to write. They also asked for a review with further enhancements, and accepted all ten suggestions (section G).

Success: on a 1440 px and a 1920 px desktop the user can set a photo and colours, switch theme in the app, plan next week from the Calendar, write a long note without the page scrolling, and style each Android widget separately, with every screen still readable.

## Goals

- **A. Appearance:** in-app theme, background photos, colour settings, app text size.
- **B. Calendar:** History becomes Calendar, including future days.
- **C. Today:** full width, collapsible sections, "move to another day", a fuller sidebar.
- **D. Notes:** full-height editor, focus mode, templates.
- **E. Settings:** fixed size, saves instantly.
- **F. Widget:** per-widget styling.
- **G. Global search, shortcut help and mobile parity.**

## Non-goals

- No new sync data model. No server changes beyond what the existing settings sync carries.
- No theme marketplace, shared themes, or image library beyond the 5 local photos.
- No redesign of task rows, statuses, rollover rules or sign-in.
- No iOS widget.

## Anti-goals (failure even if it "works")

- Text that becomes hard to read on a photo or a custom colour. Readability beats decoration everywhere.
- Photos bloating sync, exports or backups, or making startup slow.
- Losing or corrupting data when planning on future days, or when moving a task between days.
- Breaking the existing invariants:
  - the markdown task comment format `<!-- daymark: task_id=… -->`;
  - rollover idempotency;
  - the stone palette;
  - `max-w-[1800px]` desktop width;
  - every dialog being a real dialog.
- A Settings dialog that still jumps in size.

## Constraints

- **Stack:** React 19, TypeScript, Vite and Tailwind v4.
  - Use only real Tailwind classes, from the stone palette.
  - Types live in `src/types/daymark.ts`.
- **Storage:**
  - Data lives in IndexedDB (`src/utils/vaultStore.ts`), with a localStorage fallback.
  - `AppSettings` syncs as the `settings` key.
  - Sign-out wipe (`wipeLocalVault`) must also remove anything new stored here, including the photos.
- **Dark mode today:**
  - Tailwind's default `dark:` variant follows `prefers-color-scheme`.
  - `src/index.css` has a `@media (prefers-color-scheme: dark)` block.
  - This must become class-driven: a `dark` class on `<html>`, via `@custom-variant dark`.
- **Android:**
  - The Capacitor app and its Glance widget (`DaymarkGlanceWidget.kt`, `WidgetStore.kt`, `WidgetModel.kt`) exist already.
  - The widget is already resizable on the home screen.
- **Verification:** all existing suites keep passing. Each new behaviour gets unit tests and an addition to the UX or QA browser suites. Release docs with screenshots go to `docs/releases/cycle-6/`.

---

## A. Appearance (Settings › Appearance)

**Theme**
- Light or Dark, chosen in the app. The browser and phone system settings are ignored.
- Default is Light for new installs.
- **My call:** existing installs default to whatever the system currently is, decided once on first run of this version and then saved, so nobody's screen flips unexpectedly on upgrade.
- Applied before first paint (inline script reading the saved choice) to avoid a flash.

**Background photo (whole window, calm)**
- The photo fills the window behind everything (mockup A).
- Cards become slightly see-through with a light blur so the photo shows faintly through them (`bg-white/80`-style plus backdrop blur).
- Controls:
  - **Dim**, default about 35%: a dark or light overlay that matches the theme;
  - **Blur**, default about 4 px.
- **Up to 5 saved photos** plus "None" (the default, which keeps today's plain look).
  - **Add** opens a file picker.
  - When 5 are saved, adding another asks which one to replace, showing the 5 thumbnails.
  - Each thumbnail has a remove (×) button.
- Photos are resized and re-encoded before saving: longest side at most 2560 px, WebP or JPEG at about 0.82 quality. Each also stores a thumbnail.
- **My call:**
  - Photos live only on the device: in IndexedDB, in their own store or key.
  - They are not synced, not in exports and not in backups.
  - The sign-out wipe removes them.
  - Only the *choice* ("photo 3" or "none") is part of appearance.

**Colours: many options, safe defaults**
- **Header colour:** swatches plus a custom colour picker, and an opacity slider.
- **Header text, page text, and accent** (the amber buttons and highlights): each is "Automatic" by default, or a custom colour.
- **Automatic** picks a readable colour: WCAG contrast at least 4.5:1 for text against the header colour, or against the dimmed photo or card underneath.
- **Custom colours:** a pair below 4.5:1 shows an inline warning. It isn't blocked.
- **Reset to defaults** per section.
- Colours are stored **separately for Light and Dark**, so switching theme never leaves dark text on a dark header.

**App text size:** S, M or L. It scales the root font size (for example 15, 16 and 17.5 px). Default M.

**Where appearance lives.** The user decided that appearance **syncs across devices**.
- Theme, the colours for Light and Dark, the dim and blur levels, and text size are stored in a new `appearance` field of `AppSettings`.
  - It travels with the existing `settings` sync key and is included in backups.
  - There is no server change.
- **Photos stay on each device** (too large to sync), and so does which photo slot is chosen. My call: the slot is stored per device in the `kv` key `ui:bgSlot`.
- **Merge:** settings already merge as one object, and the latest change wins. Changing a colour on one device and a status on another at the same moment keeps only one of the two changes; this limitation exists today and is accepted.
- **Older clients:** a 1.2.0 client must keep the `appearance` field when it saves settings. `normalizeSettings` and the settings editor spread the object, so this should hold. A test must prove a settings round-trip without the field present on the old code path doesn't drop it.
- `normalizeSettings` fills a missing or partial `appearance` with defaults.

**Live preview.** Changes apply immediately behind the Settings dialog (see E).

## B. Calendar (replaces History)

- The tab, the desktop header and the phone bottom bar say **Calendar**.
- **Month view, the main view:**
  - A larger grid.
  - Each date shows done/total for days with tasks, a dot when the day has section notes, and today highlighted.
  - The current status bar colours are kept: all done, some done, none done.
- **Week view:** a Month/Week switch. Week shows 7 columns with task titles listed per day.
- **Future days are clickable.**
- **Selecting a day** shows its tasks and section notes, as now. "Mark done on…" stays for past days.
- **Open this day** opens the date in the same editor as Today (List, Split, Markdown), with the date in the header and a "Today" button to return. It works for past, today and future dates.
- **Planning ahead:**
  - Opening or adding to a future date creates that day's document.
  - Tasks added there wait on that day.
  - When the date arrives, rollover adds unfinished earlier tasks to it as usual.
  - `performDailyRollover` already only reads `date < target`. Future documents must never be rollover *sources* for today, and never receive carried tasks before their date arrives.
- **Drag a task onto a day.** Desktop only. It uses the same move as C2.
- **Header summary:** "Last 7 days: …" stays.
- **Recent days** stays below the month grid.

## C. Today

1. **Full width.**
   - In List and Markdown modes the content spans the available width (inside `max-w-[1800px]`) instead of `max-w-4xl` / `56rem`.
   - The "Today at a glance" sidebar stays as a right column (about 18 rem) from the `xl` breakpoint.
   - Split mode is unchanged.
   - The attention bar and header use the same width as the content.
2. **Move a task to another day.**
   - The task's ⋯ menu gets **Move to tomorrow** and **Move to date…** (a date picker; past dates are not allowed).
   - The task is removed from the source day (its id goes into `removedTaskIds`) and added to the target day with the same id and a history entry "Moved from Wed 21 Oct".
   - This relies on the rollover tombstone fix in "Decisions after the builder check", item 1.
   - It must stay idempotent and survive sync on two devices.
   - Toast with **Undo**.
3. **Collapsible sections.** Each section header can collapse. The state is remembered per section name, on the device.
4. **Fuller sidebar** at `xl` and up:
   - a 7-day done-trend strip (one small bar per day);
   - "Next planned day" (the nearest future date with tasks, with a link).

## D. Notes

- **Fits the screen exactly.**
  - The page doesn't scroll.
  - The note list and the editor each fill the height under the header.
  - The note list scrolls on its own; the note text scrolls inside the editor.
- **Note list column, top to bottom:** search box, then **+ New note** and **+ Folder** (moved here from the page header), then folder chips, then the notes.
- **Editor:**
  - title, folder, pin and ⋯ menu, toolbar and Edit/Split/Read stay pinned at the top;
  - the text area takes all remaining height;
  - a thin footer shows the save state, word count and "edited 2 min ago".
- **Focus mode:**
  - a button and **Ctrl/⌘ + .** hide the note list, so the editor uses the full width;
  - in Read mode, line length is capped for comfort (about 75 characters);
  - Esc or the button exits.
- **Templates.** "New note" offers Blank, Meeting, Daily review and Decision record (ADR).
  - Templates are plain markdown bodies with a suggested folder.
  - **My call:** they are built in for this cycle. User-defined templates are a later idea.
- **Phone:** the same full-height editor. Focus mode is implicit, because the list and editor are separate screens.

## E. Settings dialog

- **One fixed size for every tab.**
  - Desktop: about 760 × 560 px, capped to the viewport.
  - Phone: full screen, as now.
  - The tab bar and the dialog's header and footer never move; tab content scrolls inside.
- **Tabs:** Appearance (new, first), Backup & restore, Sync, Statuses, Old-task warnings, Sections, Widget (Android app only), Advanced.
  - **My call:** they become a left-hand list on desktop (matching the mockup) and stay as a scrolling row of chips on phones.
- **Saves instantly.**
  - Save/Cancel goes away.
  - Each change is saved when made; text and number fields save on blur or Enter, after validation.
  - A small "Saved" confirmation shows.
  - Each tab has **Reset to defaults**, with Undo in a toast.
  - Invalid input (such as aging thresholds) shows inline and isn't saved until valid.

## F. Android widget styling (per widget)

- **Each placed widget has its own style.**
  - A **style screen** opens when a widget is added (Android widget configuration activity).
  - The same screen is reachable later via long-press → **Customize** (`widgetFeatures="reconfigurable"`) and from Settings › Widget.
- **Style options:**
  - **Style:** "Match app", which uses the app's current header and accent colours and theme, or "Custom".
  - **Background:** colour and opacity (0–100%).
  - **Text:** Automatic or custom. **Accent:** colour.
  - **Font:** Sans, Serif or Mono. **Text size:** S, M, L or XL.
  - **Corners:** Square, Round or Extra round.
  - **Density:** Compact or Comfy.
  - **Show:** done tasks, age badges, quick add, section names.
  - **Reset to default.**
- A live preview of the widget sits beside the options.
- **Settings › Widget** (Android app only):
  - sets the **default style** for newly added widgets;
  - lists the widgets currently placed, each with Edit.
- Android widgets cannot blur what is behind them; opacity only.
- Styles are stored per widget id on the native side (alongside `WidgetStore`). They are removed when the widget is deleted (`onDeleted`).
- Not synced.

## G. Further enhancements (all accepted)

1. **Move a task to another day.** See C2; dragging onto the calendar is in B.
2. **Global search, on its own shortcut.** Ctrl/⌘ K is unchanged (see decision 8).
   - One box searches tasks on every day and all notes.
   - Results are grouped by Tasks (with their date) and Notes; picking one opens it.
3. **Calendar week view and day dots.** See B.
4. **App text size.** See A.
5. **Settings save instantly.** See E.
6. **Collapsible sections.** See C3.
7. **Shortcut help.**
   - `?` opens a cheat sheet listing every shortcut.
   - `g t`, `g c` and `g n` go to Today, Calendar and Notes.
   - Shortcuts never fire while typing in a field.
8. **Fuller sidebar.** See C4.
9. **Mobile parity.**
   - Calendar replaces History in the phone bottom bar.
   - Background, colours, theme and text size apply in the Android app and on phone-sized web. The phone header uses the header colour.
   - The Android status bar matches the header colour.
   - Notes full-height editor on phones.
10. **Note templates.** See D.

## Decisions after the builder check

These answer the builder's questions. Unless marked otherwise, each is my call.

1. **Deleted and moved tasks must not come back (bug fix, in scope).**
   - **The bug today:** delete a task that was carried into today, and tomorrow's rollover brings it back from yesterday's copy. This was reproduced with a unit probe on 2026-10-22.
     - Cause: `removedTaskIds` is per day and is only checked on the *target* day.
   - **The fix:** in `performDailyRollover`, a tombstone on a *source* day counts as "seen". Older copies of that task are then ignored, the same way a newer live copy hides older ones.
   - Tombstones stay per day-document, with no change to the sync data model or the merge rules.
   - **Move works on top of this.** Move = tombstone on the source day + live copy (same id) on the target day.
   - Days between the source and the target therefore don't get the task, and the target keeps it.
   - **Tests:**
     - delete, then the next day's rollover;
     - move to tomorrow;
     - move 5 days ahead (no copies in between);
     - move then Undo;
     - two-device sync of a move.
2. **Storage of appearance and photos.**
   - Appearance itself is in `AppSettings` and syncs (see A).
- Device-only data uses new keys in the existing IndexedDB `kv` store, with no DB version bump: `bgPhoto:<slot>`, `bgThumb:<slot>`, `ui:bgSlot`, `ui:collapsedSections`.
   - `wipeLocalVault` already deletes the whole database, so they are wiped too. Add a test that proves it.
   - **In localStorage fallback mode:** appearance and collapsed sections are saved; photos are unavailable, and Settings explains why.
   - **Theme flash:** the theme and text size are also mirrored to the localStorage key `daymark_theme` on every change (including changes that arrive by sync), so the inline pre-paint script can read them synchronously. The wipe already removes `daymark*` keys.
3. **Theme on upgrade.**
   - If `appearance` is missing from settings and the vault already has data (any settings, docs or notes in IndexedDB or the legacy keys), save the current system theme once. It then syncs to other devices like any other setting.
   - If it is missing on a fresh install, save Light.
   - **Pre-paint:** a missing key means the system theme for that first paint only; the app then saves the decision. The same applies in the Android WebView.
4. **Future days.**
   - A future date's document is saved only when something is added to it (a task, a note or a new section). Merely opening it doesn't save anything.
   - Empty future documents are never created, so sync, export and "Recent days" are unaffected.
   - **When the date arrives,** rollover appends carried tasks into the existing document. Planned tasks keep their order, carried ones come after them, and the existing idempotency (task ids) applies.
5. **Opening a past or future day.**
   - It uses the same rules the Today editor already uses when you step to another day with ‹ ›.
   - The selected date is app state, as now.
   - The `g t` shortcut and the "Today" button return to today.
   - The browser Back button is not part of this cycle.
6. **Widgets.**
   - Widgets already placed take the default style.
   - "Match app" colours reach the native side via a new bridge call that pushes appearance colours whenever they change. Widgets then refresh.
7. **Search.**
   - A linear scan is fine; a vault holds a few thousand tasks at most. Results are debounced.
   - It covers live tasks (per task id, newest copy) and notes.
   - Archived tasks appear marked "Archived"; deleted tasks don't appear.
8. **Search has its own shortcut (the user decided).**
   - Ctrl/⌘ K stays exactly as it is: the new-task sheet.
   - Search opens with **Ctrl/⌘ Shift F**, with **/** when no field has focus, or with a search button in the desktop header and on the phone. My call on the keys.
   - The `?` cheat sheet lists them.
9. **Instant save in Settings.**
   - Instant save applies only to preferences: Appearance, Statuses, Old-task warnings, Sections, Widget and Advanced toggles.
   - Backup/restore, Sync sign-in and sign-out, and sample data stay explicit buttons with their existing confirms.
   - Reset to defaults exists only on preference tabs.
   - Reset on Appearance previews live like any other change and has Undo.
10. **Automatic text over a photo.**
    - When a photo is saved, its average luminance is measured (from the thumbnail).
    - "Automatic" text uses that luminance with the current dim to choose light or dark text and to compute contrast.
    - If 4.5:1 can't be reached, the dim is raised to the minimum that reaches it.
    - Cards are see-through but mostly opaque, so text on cards is checked against the card colour.

## Left to the builder

- Exact defaults for swatches, dim, blur and opacity, provided Automatic text stays at 4.5:1 or better.
- **Code structure:** an appearance hook or context plus CSS custom properties (for example `--dm-header-bg`, `--dm-header-fg`, `--dm-accent`, `--dm-text`) feeding Tailwind arbitrary values.
- Whether the widget style screen is a native Compose activity or the app's WebView opened on a config route through the bridge plugin. Either is fine if it opens on add, supports reconfigure, and previews live.
- The image resize method (canvas or `createImageBitmap`).
- Calendar drag-and-drop implementation (native HTML5 DnD is fine; desktop only).
- How to split the work into tasks and releases. A natural order: E and A theme first (they unblock the look of everything), then C, D, B, G2 and G7, A photos and colours, F, then mobile parity.

## Verification expectations

- Unit tests for:
  - contrast and "Automatic" colour picking;
  - photo slot limit and replace;
  - move-task (idempotent, survives a rollover of the target day, sync merge);
  - future-day rollover safety;
  - search ranking basics;
  - shortcut guard while typing;
  - settings auto-save validation;
  - the widget style model (Kotlin JVM tests).
- **Browser suites:**
  - theme toggle ignores the system setting;
  - a photo applies, and the 6th photo asks to replace;
  - Settings stays the same size across tabs (measure the dialog box per tab);
  - Today list width at 1440 and 1920;
  - Notes page doesn't scroll and the editor scrolls;
  - Calendar opens a future day and a task planned there appears on that day only;
  - move to tomorrow, then undo;
  - search finds a task on another day.
- Release doc `docs/releases/cycle-6/README.md` with light and dark screenshots at 1440 and on a phone, via `scripts/capture-screenshots.mjs`.
