import { DailyDocument, HeadingSection, TaskItem } from '../types/daymark';

/**
 * Serializes a DailyDocument into canonical, human-readable standard Markdown.
 * Includes YAML frontmatter and HTML comment tags for machine metadata.
 */
export function serializeDailyDocument(doc: DailyDocument): string {
  const lines: string[] = [];

  // YAML Frontmatter
  lines.push('---');
  lines.push(`date: ${doc.date}`);
  lines.push('type: daily');
  lines.push('---');
  lines.push('');

  for (const section of doc.headings) {
    lines.push(`# ${section.name}`);
    lines.push('');

    // Render tasks
    for (const task of section.items) {
      const isChecked = task.status === 'done';
      lines.push(`- [${isChecked ? 'x' : ' '}] ${task.title}`);

      // Metadata comment tag
      const metaParts = [`task_id=${task.id}`, `status=${task.status}`, `created=${task.createdDate}`];
      if (task.carriedFromDate) {
        metaParts.push(`carried_from=${task.carriedFromDate}`);
      }
      if (task.completedDate) {
        metaParts.push(`completed=${task.completedDate}`);
      }
      lines.push(`  <!-- daymark: ${metaParts.join(' ')} -->`);

      if (task.description) {
        // Indent description
        const descLines = task.description.split('\n');
        for (const dl of descLines) {
          lines.push(`  ${dl}`);
        }
      }

      // Checklist items if any
      if (task.checklist && task.checklist.length > 0) {
        for (const item of task.checklist) {
          lines.push(`  - [${item.done ? 'x' : ' '}] ${item.text}`);
        }
      }

      lines.push('');
    }

    // Render free-form notes if any
    if (section.notesContent && section.notesContent.trim()) {
      lines.push(section.notesContent.trim());
      lines.push('');
    }
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Parses a raw Markdown string into a structured DailyDocument.
 * Handles both Daymark-formatted notes with metadata comments and
 * ordinary Markdown checklists.
 */
export function parseDailyDocument(markdown: string, date: string, defaultHeadings: string[] = ['Work', 'Meetings', 'Ideas', 'Attention']): DailyDocument {
  const lines = markdown.split(/\r?\n/);
  const sections: HeadingSection[] = [];
  let currentSection: HeadingSection = {
    name: 'General',
    items: [],
    notesContent: '',
  };
  // Sections introduced by an explicit "# Heading" line are kept even when empty
  let currentSectionExplicit = false;

  let inFrontmatter = false;
  let lineIdx = 0;

  // Check frontmatter
  if (lines[0]?.trim() === '---') {
    inFrontmatter = true;
    lineIdx = 1;
    while (lineIdx < lines.length) {
      if (lines[lineIdx].trim() === '---') {
        inFrontmatter = false;
        lineIdx++;
        break;
      }
      lineIdx++;
    }
  }

  const freeNotesBuffer: string[] = [];
  let currentTask: Partial<TaskItem> | null = null;
  let taskOrder = 1;

  function finalizeCurrentTask() {
    if (currentTask && currentTask.title) {
      const fullTask: TaskItem = {
        id: currentTask.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: currentTask.title,
        description: currentTask.description?.trim() || undefined,
        status: currentTask.status || (currentTask.completedDate ? 'done' : 'not-started'),
        createdDate: currentTask.createdDate || date,
        originalNoteDate: currentTask.originalNoteDate || date,
        carriedFromDate: currentTask.carriedFromDate,
        completedDate: currentTask.completedDate,
        heading: currentSection.name,
        order: taskOrder++,
        checklist: currentTask.checklist,
        historyLog: currentTask.historyLog || [
          {
            id: `hist-${Date.now()}`,
            timestamp: new Date().toISOString(),
            date,
            action: 'created',
            details: 'Parsed from markdown note',
          },
        ],
      };
      currentSection.items.push(fullTask);
    }
    currentTask = null;
  }

  function finalizeSection() {
    finalizeCurrentTask();
    if (freeNotesBuffer.length > 0) {
      currentSection.notesContent = freeNotesBuffer.join('\n').trim();
      freeNotesBuffer.length = 0;
    }
    if (
      currentSectionExplicit ||
      currentSection.items.length > 0 ||
      currentSection.notesContent ||
      defaultHeadings.includes(currentSection.name)
    ) {
      sections.push(currentSection);
    }
  }

  for (; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    // Section Heading (# Heading)
    if (trimmed.startsWith('#')) {
      finalizeSection();
      const match = trimmed.match(/^#+\s*(.+)$/);
      const headingTitle = match ? match[1].trim() : 'Section';
      currentSection = {
        name: headingTitle,
        items: [],
        notesContent: '',
      };
      currentSectionExplicit = true;
      taskOrder = 1;
      continue;
    }

    // Indented checklist line under a task is a sub-item, not a new task
    const isIndented = /^(\s{2,}|\t)/.test(rawLine);
    const subCheckMatch = isIndented && currentTask ? trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/) : null;
    if (currentTask && subCheckMatch) {
      currentTask.checklist = currentTask.checklist || [];
      currentTask.checklist.push({
        id: `chk-${Date.now()}-${currentTask.checklist.length}`,
        done: subCheckMatch[1].toLowerCase() === 'x',
        text: subCheckMatch[2].trim(),
      });
      continue;
    }

    // Task Checklist item: - [ ] or - [x]
    const taskMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (taskMatch) {
      finalizeCurrentTask();
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const title = taskMatch[2].trim();

      currentTask = {
        title,
        status: isChecked ? 'done' : 'in-progress',
        completedDate: isChecked ? date : undefined,
        createdDate: date,
        originalNoteDate: date,
        description: '',
        checklist: [],
      };
      continue;
    }

    // Check for Daymark metadata comment: <!-- daymark: key=value ... -->
    if (currentTask && trimmed.includes('<!-- daymark:')) {
      const metaContent = trimmed.match(/<!--\s*daymark:\s*(.*?)\s*-->/);
      if (metaContent && metaContent[1]) {
        const parts = metaContent[1].split(/\s+/);
        for (const p of parts) {
          const [key, val] = p.split('=');
          if (key === 'task_id' && val) currentTask.id = val;
          if (key === 'status' && val) currentTask.status = val;
          if (key === 'created' && val) {
            currentTask.createdDate = val;
            currentTask.originalNoteDate = val;
          }
          if (key === 'carried_from' && val) currentTask.carriedFromDate = val;
          if (key === 'completed' && val) currentTask.completedDate = val;
        }
      }
      continue;
    }

    // Indented description line for current task
    if (currentTask && (rawLine.startsWith('  ') || rawLine.startsWith('\t')) && trimmed.length > 0) {
      currentTask.description = (currentTask.description ? currentTask.description + '\n' : '') + trimmed;
      continue;
    }

    // A non-indented, non-empty line after a task ends that task and starts section notes
    if (currentTask && trimmed.length > 0) {
      finalizeCurrentTask();
    }

    // Free notes line (blank lines are kept inside notes so paragraphs survive)
    if (!currentTask && (trimmed.length > 0 || freeNotesBuffer.length > 0)) {
      freeNotesBuffer.push(rawLine);
    }
  }

  finalizeSection();

  // If no sections were parsed, populate default headings
  if (sections.length === 0) {
    for (const h of defaultHeadings) {
      sections.push({ name: h, items: [], notesContent: '' });
    }
  }

  return {
    date,
    type: 'daily',
    headings: sections,
    updatedAt: new Date().toISOString(),
  };
}

const TASK_LINE = /^-\s*\[([ xX])\]\s*(.+)$/;
const TAG_LINE = /^\s*<!--\s*daymark:.*-->\s*$/;

/**
 * For the Markdown view: removes the `<!-- daymark: … -->` lines (task identity, status,
 * carry-forward dates) so people edit plain Markdown and cannot break them by accident.
 * Tags are remembered per task title and put back by restoreTaskTags.
 */
export function hideTaskTags(markdown: string): { text: string; tags: Map<string, string[]> } {
  const tags = new Map<string, string[]>();
  const out: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const prev = out[out.length - 1]?.match(TASK_LINE);
    if (prev && TAG_LINE.test(line)) {
      const key = prev[2].trim();
      tags.set(key, [...(tags.get(key) ?? []), line]);
      continue;
    }
    out.push(line);
  }
  return { text: out.join('\n'), tags };
}

/**
 * Puts hidden tags back under the task lines whose title is unchanged, and makes the tag agree
 * with the checkbox (ticking "[x]" marks the task done on `date`; unticking reopens it).
 * A renamed task line gets no tag and is treated as a new task.
 */
export function restoreTaskTags(text: string, tags: Map<string, string[]>, date: string): string {
  const pending = new Map([...tags].map(([k, v]) => [k, [...v]]));
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    out.push(line);
    const m = line.match(TASK_LINE);
    const tag = m ? pending.get(m[2].trim())?.shift() : undefined;
    if (!m || !tag) continue;
    const checked = m[1].toLowerCase() === 'x';
    const isDone = /\bstatus=done\b/.test(tag);
    let next = tag;
    if (checked && !isDone) {
      next = next.replace(/\bstatus=\S+/, 'status=done').replace(/\s*\bcompleted=\S+/, '').replace(/\s*-->/, ` completed=${date} -->`);
    } else if (!checked && isDone) {
      next = next.replace(/\bstatus=done\b/, 'status=in-progress').replace(/\s*\bcompleted=\S+/, '');
    }
    out.push(next);
  }
  return out.join('\n');
}
