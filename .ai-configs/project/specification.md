# Daymark Functional Specification & PRD

Concise, high-density specification of data models, lifecycle algorithms, and Markdown format.

---

## 1. Core Principles
- **Markdown as Database**: Notes are standard Markdown files (`YYYY-MM-DD.md`) with YAML frontmatter. Human-readable and 100% Obsidian/VS Code-compatible.
- **Temporal Integrity**: Daily notes are historical logs. Completed tasks remain on the day completed; incomplete tasks carry forward.
- **Pure Idempotency**: Rollover operations never duplicate tasks.

### Rich standalone Notes and pictures

- Notes navigation (cycle 12) is one column: search, New note / New folder / List | Graph switch, then a folder tree with each note listed by title inside its folder (Pinned group on top, unfiled notes after the top-level folders; no "All notes" or "Notes (top level)" rows). Search filters in place and the open note stays listed, dimmed when it does not match. The current folder is where New note and New folder land. Wide windows show the column, editor and Related; the column minimises to a strip; 768-1099px opens it as a drawer; phones show the column, then the editor with Back. The design is `docs/superpowers/specs/2026-10-29-cycle-12-notes-one-column-navigation-design.md`.
- The rich editor is used only by `StandaloneNotesView`; Today's section notes are unchanged. `StandaloneNote.content: string` remains Markdown. TipTap, syntax highlighting and Mermaid load dynamically from Notes.
- **Fidelity:** an unedited note remains byte-identical to its original Markdown. Unsupported syntax, frontmatter and raw HTML are preserved verbatim in raw-Markdown blocks. After a real edit, supported blocks may normalise their Markdown formatting, while content and untouched raw blocks are preserved. The Markdown button provides direct source editing.
- Supported rich content includes headings, inline marks and links, lists and checkboxes, quotes, callouts, code blocks, tables, pictures, Mermaid diagrams and `[[links]]` with note autocomplete. Pasted/converted HTML is sanitised with DOMPurify before parsing; Mermaid uses `securityLevel: 'strict'`.
- Saved pictures use the Markdown image destination `daymark-asset:<sha256>.<ext>`, where `<sha256>` is the lowercase, 64-character SHA-256 digest of the encoded bytes. Generated extensions are `webp`, `jpg` or `png`; readers also accept `jpeg`.
- Picture encoding limits the longest side to **1600 px**, uses quality **0.8**, and prefers WebP with JPEG fallback when WebP encoding is unavailable. The target is **400 KB** or less (`400 * 1024` bytes); an oversize result is retried at quality 0.65. This target is not a hard guarantee. GIFs become still images. Storage and upload reject empty pictures and pictures over **1.5 MB** (`1.5 * 1024 * 1024` bytes). Allowed stored MIME types are `image/webp`, `image/jpeg` and `image/png`.
- Online `https://` images remain links, are not downloaded into saved assets, and can stop displaying when their links expire. Pictures added offline stay local and upload later; a missing picture shows a placeholder until it arrives. No automatic picture cleanup occurs; unused-picture removal is an explicit Settings action checked against all synced notes when connected.
- Pictures use authenticated `GET /api/assets` and `GET`/`PUT`/`DELETE /api/assets/:id`, separately from note-text sync. Picture bytes never go through `/api/sync`; see [API and sync](./api-and-sync.md#picture-assets) for payloads, authentication and validation.
- ZIP backups place saved pictures in `Notes/_assets/<sha256>.<ext>` and rewrite note references to relative links (`_assets/...` at the Notes root, `../_assets/...` for a note one folder deep). The full snapshot retains original Markdown references; imports restore picture bytes and Daymark references. JSON backups include pictures as well.

---

## 2. Core Schemas (`src/types/daymark.ts`)

### `TaskItem`
```typescript
export interface TaskItem {
  id: string;                    // "task-<timestamp>-<rand>"
  title: string;                 // Task headline
  description?: string;          // Optional multiline notes
  status: string;                // 'not-started' | 'in-progress' | 'blocked' | 'waiting' | 'done' | 'archived'
  createdDate: string;           // YYYY-MM-DD: creation date
  originalNoteDate: string;      // YYYY-MM-DD: initial daily note date
  carriedFromDate?: string;      // YYYY-MM-DD: prior note rolled from
  completedDate?: string;        // YYYY-MM-DD: effective completion date
  heading: string;               // Section name (e.g. 'Work', 'Personal')
  order: number;                 // Sort order within section
  checklist?: ChecklistItem[];   // Subtasks: { id, text, completed }
  tags?: string[];               // e.g. ['#dev', '#urgent']
  historyLog: TaskHistoryItem[]; // Audit trail of mutations
}
```

### `DailyDocument`
```typescript
export interface DailyDocument {
  date: string;               // YYYY-MM-DD
  frontmatter: Record<string, any>; // mood, energy, tags
  headings: HeadingSection[]; // Sections containing tasks & raw notes
  unmatchedContent?: string;  // Plain text outside defined sections
  lastModified: string;       // ISO 8601 timestamp
}
```

---

## 3. Canonical Markdown Format

Machine metadata is stored in non-rendered HTML comments immediately after task items:

```markdown
---
date: 2026-10-19
mood: productive
tags: [dev, sprint]
---

## Work
- [ ] Implement sync endpoint <!-- daymark: task_id=task-1729330000-abc status=in-progress created=2026-10-17 carried_from=2026-10-18 -->
  > Section notes or context block
- [x] Review pull request <!-- daymark: task_id=task-1729320000-def status=done created=2026-10-19 completed=2026-10-19 -->
```

---

## 4. Core Lifecycle Algorithms (`src/utils/lifecycleEngine.ts`)

### 4.1 Daily Rollover (`performDailyRollover`)
- **Trigger**: Automatically when the effective "today" changes (app start, local midnight, or waking the device on a new day) and after loading sample data or importing a vault; or explicitly via "Refresh today's list" (desktop Today "…" menu). "Today" is the real local date unless `settings.simulatedToday` holds a developer override (empty = real date).
- **Selection**: Scans past daily notes from **newest to oldest**. Source-day `removedTaskIds` count as seen before that day's tasks, so older deleted or moved copies cannot return. The first (most recent) live version of each unseen task id decides its fate; older copies of the same id are ignored. A task is carried only if that newest version has an action of `carry-forward`, is not `done`/`archived`, and has no `completedDate`. This prevents resurrecting a task that was completed later, and carries the latest edits rather than a stale copy. Future documents are never rollover sources.
- **Deduplication**: Gathers all task IDs existing in the target note and its `removedTaskIds` (`Set<string>`). Only unseen IDs are added, so repeated runs are idempotent. Tasks planned on the target date keep their position; carried tasks are appended.
- **Attributes**: In the new note, `carriedFromDate` is set to the date of the note holding the newest version; `originalNoteDate` is preserved.
- **Finishing a carried task** (`followDoneChanges` / `closeEarlierCopies` in `src/utils/taskActions.ts`): when a task becomes `done` on day D, its still-open copies on earlier days become `done` with `completedDate = doneLaterDate = D` (`statusBeforeDone` kept, history "Done later on D"). They show "Done later", cannot be ticked, reopened or moved, and day counts (Calendar, Recent days, week trend, day at a glance) leave them out (`isDoneLater`). Unticking on D, or reopening that copy from the Calendar, restores them; archiving keeps them closed. Markdown stores the mark as `done_later=YYYY-MM-DD` in the task comment.

### 4.2 Aging Math & Severity (`getAgingSeverity`)
- $\text{Age} = \text{CalendarDays}( \text{currentDate}, \text{task.createdDate} )$.
- Severity thresholds:
  - $\text{Age} < 3\text{ days}$: `normal` (no badge).
  - $3 \le \text{Age} < 7\text{ days}$: `attention` (amber warning badge).
  - $\text{Age} \ge 7\text{ days}$: `critical` (red alert badge).

### 4.3 Historical Completion Correction (`correctHistoricalCompletion`)
- Allows marking a task finished on the date work actually occurred (e.g., Tuesday) even if carried forward to Thursday.
- **Actions**:
  1. Updates the historical note on that effective date: sets `status = 'done'`, `completedDate = effectiveDate`.
  2. Cleans up intermediate carried-forward task instances on subsequent dates up to the current date.
  3. Records audit event in `historyLog`.

### 4.4 Moving a task (`src/utils/taskActions.ts`)
- `moveTaskToDate` removes the source copy, records its id in the source day's `removedTaskIds`, and places the same task id on the target day with a move history entry. Earlier dates are rejected by the UI.
- Undo restores the source and removes the moved target copy while preserving unrelated edits.
- Moving to a future date does not carry that task into intervening days. Once the target date arrives, normal unfinished-task rollover applies on later mornings.
- Merely opening an empty future day does not save a daily document; adding content does.

## 5. Daily Habits

### Model and lifetime

- Canonical types are in `src/types/daymark.ts`: `Habit` has `id`, `name`, `order`, `warnAfterDays`, `addedOn`, optional `removedOn` and `updatedAt`. `HabitData` contains `habits` and date-sorted `days`; each `HabitDay` has `date` and `ticks: Record<string, HabitTick>`. A tick stores `{ done, at }`, retaining explicit unticks for sync.
- Names are trimmed, 1–80 characters; duplicates are allowed. New habits use the app’s resolved today as `addedOn`. Warning days default to **3**, minimum **1**, maximum **365**.
- Lifetime is `addedOn <= date < removedOn` (or no removal). Past ticks remain visible by habit name after removal, including a tick outside the lifetime received through sync/import. New ticking is allowed only within the lifetime and through today. Re-adding a name creates a new id; renaming preserves the existing id and history.
- Removing sets `removedOn` and `updatedAt`, keeping the definition and past ticks. It hides the habit from today onward; removal wins over a concurrent definition edit.
- Habits live separately in the vault’s `habits` data, persisted under IndexedDB `kv` key `habits`. JSON backups and the full snapshot inside ZIP backups include them. Import restores/merges them, and vault wipe removes them. They never enter `DailyDocument`, daily Markdown, rollover, aging, task search, task counts, the progress sidebar or “Last 7 days”.

### Daily behavior and Calendar

- Today comes from `App.tsx` via `resolveToday`, including the developer date override. Every day starts unticked. The Habits bar is closed by default and remembers open/closed state per device.
- Streak counts consecutive ticked days back from today; if today is unticked, it starts at yesterday instead. Missed days count consecutive unticked days before today, no earlier than `addedOn` (the added day counts). Warn at the threshold unless today is ticked. Past-day corrections recompute both.
- Calendar week is Sunday-first, with seven full-width rows and every task shown. Task titles use two columns on desktop and one on narrow screens. Past/today rows show habit dots and counts; future rows show no habit dots. Selected-day details allow habit ticking for past/today only. Month cells are unchanged.

### Sync compatibility and deletion

- `habits` carries `{ habits: Habit[] }`; `habitday:<date>` carries `{ date, ticks }`, with the value date required to match the key. Requests advertise `features: ['habits']`. The server filters habit entities from responses to clients without that feature, so older apps neither see nor change habits through normal sync.
- Definitions merge per habit; ticks merge per habit/day by latest `at`, preserving independent changes and explicit `done: false` records. Definition conflicts keep removal when either side removed the habit, otherwise the incoming definition wins (the current merge does not compare `updatedAt`).
- Sync entity deletion uses `null` tombstones. Normal habit removal uses `removedOn`, not deletion of the `habits` entity or its day records. In three-way merges, an entity deletion beats an unchanged base copy; a concurrent edited value survives the deletion.
- Habits sync only between devices on **1.4.0 or later**. Older apps are unaffected and cannot see or change habits. The server must be updated together with the clients; unsupported older servers cannot sync habit entities.

### Android widget snapshot and actions

- The separate launcher widget is **Daymark Habits**. `buildHabitWidgetSnapshot` receives resolved today and sends a compact snapshot of up to 30 active habits: `date`, `updatedAt`, and each habit’s id, name, `doneToday`, `streakBefore`, `lastDoneBefore`, `addedOn`, and `warnAfterDays`. This summary lets Kotlin recalculate streaks/warnings after midnight without full tick history.
- Widget checkboxes queue explicit habit actions with habit id, date, desired done value and timestamp. Changes show immediately in the widget and apply when the app opens/resumes; older or equal timestamps cannot overwrite a newer tick. Actions retain the day they were made on and are replay-safe.
- A stale snapshot does not reuse yesterday’s ticks as today’s. Date/time/timezone broadcasts refresh the widgets. Tapping the header opens Today with Habits expanded; an empty widget invites adding habits in the app. Widget style is per instance, with a Show streaks option and task-only controls hidden.
