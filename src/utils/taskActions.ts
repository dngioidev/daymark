import { DailyDocument, TaskItem } from '../types/daymark';

/**
 * Toggles a task between done and in-progress inside one daily document.
 * Returns the updated copy plus the task, or null when the task is not in the document.
 * Shared by the UI checkbox and by actions queued from the Android widget.
 */
export function toggleTaskDoneInDocument(
  doc: DailyDocument,
  taskId: string,
  date: string
): { doc: DailyDocument; task: TaskItem; nowDone: boolean } | null {
  const copy: DailyDocument = JSON.parse(JSON.stringify(doc));
  for (const heading of copy.headings) {
    const task = heading.items.find((t) => t.id === taskId);
    if (task) {
      const wasDone = task.status === 'done';
      task.status = wasDone ? 'in-progress' : 'done';
      task.completedDate = wasDone ? undefined : date;
      copy.updatedAt = new Date().toISOString();
      return { doc: copy, task, nowDone: !wasDone };
    }
  }
  return null;
}
