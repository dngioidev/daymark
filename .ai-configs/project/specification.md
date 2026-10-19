# Daymark Functional Specification & PRD

Concise, high-density specification of data models, lifecycle algorithms, and Markdown format.

---

## 1. Core Principles
- **Markdown as Database**: Notes are standard Markdown files (`YYYY-MM-DD.md`) with YAML frontmatter. Human-readable and 100% Obsidian/VS Code-compatible.
- **Temporal Integrity**: Daily notes are historical logs. Completed tasks remain on the day completed; incomplete tasks carry forward.
- **Pure Idempotency**: Rollover operations never duplicate tasks.

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
- **Trigger**: When viewing a target date or explicitly clicking "Roll Forward".
- **Selection**: Scans past daily notes for tasks with status NOT IN `['done', 'archived']`.
- **Deduplication**: Gathers all task IDs existing in the target note (`Set<string>`). Only tasks whose IDs are not in the target note are added.
- **Attributes**: In the new note, `carriedFromDate` is set to the previous note date; `originalNoteDate` is preserved.

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
