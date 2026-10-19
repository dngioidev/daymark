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
  const lines = markdown.split('\n');
  const sections: HeadingSection[] = [];
  let currentSection: HeadingSection = {
    name: 'General',
    items: [],
    notesContent: '',
  };

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
    if (currentSection.items.length > 0 || currentSection.notesContent || defaultHeadings.includes(currentSection.name)) {
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
      taskOrder = 1;
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

    // Sub-item checklist inside task: "  - [ ] subitem"
    const subCheckMatch = rawLine.match(/^\s{2,4}-\s*\[([ xX])\]\s*(.+)$/);
    if (currentTask && subCheckMatch) {
      currentTask.checklist = currentTask.checklist || [];
      currentTask.checklist.push({
        id: `chk-${Date.now()}-${currentTask.checklist.length}`,
        done: subCheckMatch[1].toLowerCase() === 'x',
        text: subCheckMatch[2].trim(),
      });
      continue;
    }

    // Indented description line for current task
    if (currentTask && (rawLine.startsWith('  ') || rawLine.startsWith('\t')) && trimmed.length > 0) {
      currentTask.description = (currentTask.description ? currentTask.description + '\n' : '') + trimmed;
      continue;
    }

    // Free notes line
    if (trimmed.length > 0 && !currentTask) {
      freeNotesBuffer.push(rawLine);
    } else if (trimmed.length === 0 && currentTask) {
      // blank line might close task or separate
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
