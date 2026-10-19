import { AgingThresholds, DailyDocument, StatusDefinition, TaskHistoryItem, TaskItem } from '../types/daymark';

/**
 * Calculates calendar day difference between two YYYY-MM-DD strings.
 */
export function getCalendarDaysDifference(earlierDateStr: string, laterDateStr: string): number {
  if (!earlierDateStr || !laterDateStr) return 0;
  const d1 = new Date(earlierDateStr + 'T00:00:00');
  const d2 = new Date(laterDateStr + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Computes the carry-forward age of a task relative to the current active date.
 * Derived from the task's tracking/original creation date and calendar days elapsed.
 */
export function calculateTaskAge(task: TaskItem, currentDateStr: string): number {
  const originDate = task.createdDate || task.originalNoteDate;
  if (!originDate) return 0;
  return getCalendarDaysDifference(originDate, currentDateStr);
}

/**
 * Evaluates warning severity for a task.
 */
export function getAgingSeverity(
  task: TaskItem,
  currentDateStr: string,
  thresholds: AgingThresholds,
  statuses: StatusDefinition[]
): 'normal' | 'attention' | 'critical' {
  if (!thresholds.enabled) return 'normal';
  if (task.status === 'done' || task.status === 'archived') return 'normal';

  // Check if status definition participates in aging
  const statusDef = statuses.find((s) => s.id === task.status);
  const participates = statusDef ? statusDef.participatesInAging : thresholds.statuses.includes(task.status);
  if (!participates) return 'normal';

  const age = calculateTaskAge(task, currentDateStr);
  if (age >= thresholds.criticalDays) return 'critical';
  if (age >= thresholds.attentionDays) return 'attention';
  return 'normal';
}

/**
 * Checks if task carry-forward warning has been snoozed/dismissed for a given date.
 */
export function isAlertDismissedForDate(task: TaskItem, dateStr: string): boolean {
  return task.dismissedAlertDate === dateStr;
}

/**
 * Reconciles eligible tasks from past daily notes into targetDate.
 * Safe and idempotent: will never produce duplicate tasks.
 */
export function performDailyRollover(
  targetDate: string,
  dailyDocs: DailyDocument[],
  statuses: StatusDefinition[],
  defaultHeadings: string[] = ['Work', 'Meetings', 'Ideas', 'Attention']
): { updatedDocs: DailyDocument[]; carriedCount: number } {
  // Map of status id -> lifecycle action
  const statusActionMap = new Map<string, string>();
  for (const s of statuses) {
    statusActionMap.set(s.id, s.action);
  }

  // Find or create target document
  const otherDocs = dailyDocs.filter((d: DailyDocument) => d.date !== targetDate);
  const found = dailyDocs.find((d: DailyDocument) => d.date === targetDate);
  const activeTargetDoc: DailyDocument = found
    ? JSON.parse(JSON.stringify(found))
    : {
        date: targetDate,
        type: 'daily',
        headings: defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })),
        updatedAt: new Date().toISOString(),
      };

  // Set of task IDs already active in target document
  const existingTaskIds = new Set<string>();
  for (const h of activeTargetDoc.headings) {
    for (const item of h.items) {
      existingTaskIds.add(item.id);
    }
  }

  // Get all previous daily documents sorted ascending by date
  const pastDocs = otherDocs
    .filter((d) => d.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  let carriedCount = 0;

  // Process from oldest to newest so the most recent state takes precedence
  for (const pastDoc of pastDocs) {
    for (const heading of pastDoc.headings) {
      for (const task of heading.items) {
        const action = statusActionMap.get(task.status) || 'keep';

        // Check if task is eligible to carry forward
        const isEligible =
          action === 'carry-forward' &&
          task.status !== 'done' &&
          task.status !== 'archived' &&
          !task.completedDate &&
          !existingTaskIds.has(task.id);

        if (isEligible) {
          // Find or create target heading
          let targetHeading = activeTargetDoc.headings.find((h) => h.name.toLowerCase() === heading.name.toLowerCase());
          if (!targetHeading) {
            targetHeading = {
              name: heading.name,
              items: [],
              notesContent: '',
            };
            activeTargetDoc.headings.push(targetHeading);
          }

          // Create carried forward task copy
          const historyEntry: TaskHistoryItem = {
            id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            date: targetDate,
            action: 'carried_forward',
            details: `Carried forward from ${pastDoc.date}`,
          };

          const carriedTask: TaskItem = {
            ...task,
            carriedFromDate: pastDoc.date,
            heading: targetHeading.name,
            order: targetHeading.items.length + 1,
            historyLog: [...(task.historyLog || []), historyEntry],
          };

          targetHeading.items.push(carriedTask);
          existingTaskIds.add(task.id);
          carriedCount++;
        }
      }
    }
  }

  activeTargetDoc.updatedAt = new Date().toISOString();
  const allDocs: DailyDocument[] = [...otherDocs, activeTargetDoc].sort((a, b) => a.date.localeCompare(b.date));

  return {
    updatedDocs: allDocs,
    carriedCount,
  };
}

/**
 * Historical Completion Correction:
 * When a user marks a carried-forward task completed on a previous day (e.g. Done on Oct 15):
 * 1. Sets effective completion date to effectiveCompletedDate
 * 2. Marks canonical task as done
 * 3. Removes task from currentDate and future active daily notes
 * 4. Updates or records completion in effectiveCompletedDate note
 * 5. Logs audit event
 */
export function correctHistoricalCompletion(
  taskId: string,
  effectiveCompletedDate: string,
  currentDate: string,
  dailyDocs: DailyDocument[],
  note?: string
): { updatedDocs: DailyDocument[]; updatedTask: TaskItem | null } {
  let matchedTask: TaskItem | null = null;

  // Clone all docs deeply
  const newDocs: DailyDocument[] = JSON.parse(JSON.stringify(dailyDocs));

  // 1. Locate the task to get its original metadata
  for (const doc of newDocs) {
    for (const h of doc.headings) {
      const found = h.items.find((t) => t.id === taskId);
      if (found) {
        matchedTask = { ...found };
        break;
      }
    }
    if (matchedTask) break;
  }

  if (!matchedTask) {
    return { updatedDocs: dailyDocs, updatedTask: null };
  }

  const completionHistoryEntry: TaskHistoryItem = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    date: effectiveCompletedDate,
    action: 'historical_completion',
    details: `Historical completion: marked Done on ${effectiveCompletedDate} from ${currentDate} note${
      note ? ` (${note})` : ''
    }`,
  };

  const updatedCanonicalTask: TaskItem = {
    ...matchedTask,
    status: 'done',
    completedDate: effectiveCompletedDate,
    historyLog: [...(matchedTask.historyLog || []), completionHistoryEntry],
  };

  // 2. Remove the task from all documents with date > effectiveCompletedDate (including currentDate)
  for (const doc of newDocs) {
    if (doc.date > effectiveCompletedDate) {
      for (const h of doc.headings) {
        h.items = h.items.filter((t) => t.id !== taskId);
      }
      doc.updatedAt = new Date().toISOString();
    }
  }

  // 3. Update or ensure the task is marked completed in effectiveCompletedDate document
  let effectiveDoc = newDocs.find((d) => d.date === effectiveCompletedDate);
  if (!effectiveDoc) {
    effectiveDoc = {
      date: effectiveCompletedDate,
      type: 'daily',
      headings: [
        {
          name: updatedCanonicalTask.heading || 'Work',
          items: [updatedCanonicalTask],
          notesContent: '',
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    newDocs.push(effectiveDoc);
  } else {
    // Check if task exists in effectiveDoc
    let foundInEffective = false;
    for (const h of effectiveDoc.headings) {
      const idx = h.items.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        h.items[idx] = updatedCanonicalTask;
        foundInEffective = true;
        break;
      }
    }
    if (!foundInEffective) {
      // Add to matching heading or first heading
      let targetHeading = effectiveDoc.headings.find(
        (h) => h.name.toLowerCase() === (updatedCanonicalTask.heading || 'work').toLowerCase()
      );
      if (!targetHeading) {
        targetHeading = effectiveDoc.headings[0] || { name: 'Work', items: [], notesContent: '' };
        if (!effectiveDoc.headings.includes(targetHeading)) {
          effectiveDoc.headings.push(targetHeading);
        }
      }
      targetHeading.items.push(updatedCanonicalTask);
    }
    effectiveDoc.updatedAt = new Date().toISOString();
  }

  newDocs.sort((a, b) => a.date.localeCompare(b.date));

  return {
    updatedDocs: newDocs,
    updatedTask: updatedCanonicalTask,
  };
}

/**
 * Reopens a completed task, clearing completion date and returning it to active state.
 */
export function reopenTask(
  taskId: string,
  targetDate: string,
  dailyDocs: DailyDocument[]
): { updatedDocs: DailyDocument[]; updatedTask: TaskItem | null } {
  const newDocs: DailyDocument[] = JSON.parse(JSON.stringify(dailyDocs));
  let targetTask: TaskItem | null = null;

  for (const doc of newDocs) {
    for (const h of doc.headings) {
      const found = h.items.find((t) => t.id === taskId);
      if (found) {
        targetTask = found;
        found.status = 'in-progress';
        found.completedDate = undefined;
        found.historyLog = found.historyLog || [];
        found.historyLog.push({
          id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          date: targetDate,
          action: 'reopened',
          details: `Reopened on ${targetDate}`,
        });
        doc.updatedAt = new Date().toISOString();
        break;
      }
    }
    if (targetTask) break;
  }

  // Ensure it is in targetDate document
  let targetDoc = newDocs.find((d) => d.date === targetDate);
  if (targetDoc && targetTask) {
    let existsInTarget = false;
    for (const h of targetDoc.headings) {
      if (h.items.some((t) => t.id === taskId)) {
        existsInTarget = true;
        break;
      }
    }
    if (!existsInTarget) {
      const heading = targetDoc.headings.find((h) => h.name.toLowerCase() === (targetTask?.heading || 'work').toLowerCase()) || targetDoc.headings[0];
      if (heading) {
        heading.items.push(targetTask);
      }
    }
  }

  return {
    updatedDocs: newDocs,
    updatedTask: targetTask,
  };
}

/**
 * Helper to get previous date string (YYYY-MM-DD).
 */
export function getPreviousDate(dateStr: string, daysAgo = 1): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - daysAgo);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Helper to get next date string (YYYY-MM-DD).
 */
export function getNextDate(dateStr: string, daysAhead = 1): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Friendly relative label (e.g. "Today", "Yesterday", "Oct 15", etc.)
 */
export function getRelativeDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  const diff = getCalendarDaysDifference(dateStr, todayStr);
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';

  // Format short date (e.g. "Oct 15")
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
    return `${month} ${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}

/**
 * Full human formatted date e.g. "Wednesday, October 16, 2026"
 */
export function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
