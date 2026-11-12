import type { BacklogData, DailyDocument, HabitData, StandaloneNote, TaskItem } from '../../../src/types/daymark';
import { habitsForDay, streak } from '../../../src/utils/habits';
import { calculateTaskAge, getAgingSeverity } from '../../../src/utils/lifecycleEngine';
import { isClosedCopy } from '../../../src/utils/taskActions';
import type { readSettings } from '../vaultView';

type Settings = ReturnType<typeof readSettings>;
export interface DaySummary {
  date: string;
  sections: { heading: string; open: { id: string; title: string; status: string; ageDays: number; aging: 'attention' | 'critical' | null }[]; done: { id: string; title: string }[] }[];
  counts: { open: number; done: number; blocked: number; aging: number };
  habits: { id: string; name: string; done: boolean }[] | null;
  backlogPicked: { id: string; title: string }[] | null;
  spoken: string;
}

const openTask = (task: TaskItem) => !['done', 'archived', 'note'].includes(task.status) && !isClosedCopy(task);
const doneTask = (task: TaskItem) => task.status === 'done' && !isClosedCopy(task);
const identity = ({ id, title }: TaskItem) => ({ id, title });
const severityOrder = { critical: 0, attention: 1, normal: 2 };

export function buildDaySummary(input: { doc: DailyDocument; date: string; settings: Settings; habits: HabitData | null; backlog: BacklogData | null }): DaySummary {
  const { doc, date, settings } = input;
  const severity = (task: TaskItem) => getAgingSeverity(task, date, settings.agingThresholds, settings.statuses);
  const sections = doc.headings.map(heading => ({
    heading: heading.name,
    open: heading.items.filter(openTask).sort((a, b) =>
      Number(b.status === 'blocked') - Number(a.status === 'blocked') || severityOrder[severity(a)] - severityOrder[severity(b)] || a.order - b.order,
    ).map(task => ({ ...identity(task), status: task.status, ageDays: calculateTaskAge(task, date), aging: severity(task) === 'normal' ? null : severity(task) as 'attention' | 'critical' })),
    done: heading.items.filter(task => doneTask(task) && (!task.completedDate || task.completedDate === date)).map(identity),
  }));
  const open = sections.flatMap(section => section.open);
  const counts = { open: open.length, done: sections.reduce((n, section) => n + section.done.length, 0), blocked: open.filter(task => task.status === 'blocked').length, aging: open.filter(task => task.aging !== null).length };
  const habits = input.habits === null ? null : habitsForDay(input.habits, date, date).map(({ habit, done }) => ({ id: habit.id, name: habit.name, done }));
  const backlogPicked = input.backlog === null ? null : input.backlog.items.filter(item => !item.deletedAt && item.pickedOn === date).map(({ id, title }) => ({ id, title }));
  const clauses = [counts.blocked ? `${counts.blocked} blocked` : '', counts.aging ? `${counts.aging} getting old` : ''].filter(Boolean);
  const spoken = (counts.open ? `${counts.open} open task${counts.open === 1 ? '' : 's'}${clauses.length ? `: ${clauses.join(', ')}` : ''}.` : 'No open tasks.') +
    (counts.done ? ` ${counts.done} done so far.` : ' Nothing done yet.') +
    (habits?.length ? ` Habits: ${habits.filter(habit => habit.done).length} of ${habits.length}.` : '');
  return { date, sections, counts, habits, backlogPicked, spoken };
}

export interface Review {
  from: string;
  to: string;
  done: number;
  created: number;
  carried: number;
  agingOpen: { id: string; title: string; ageDays: number }[];
  habitStreaks: { name: string; streak: number }[] | null;
  notesTouched: { id: string; title: string }[];
}

export function buildReview(input: { docs: DailyDocument[]; notes: StandaloneNote[]; from: string; to: string; habits: HabitData | null; settings: Settings }): Review {
  const { from, to, settings } = input;
  const inRange = (date: string) => date >= from && date <= to;
  const created = new Set<string>();
  const done = new Set<string>();
  const carried = new Set<string>();
  const latest = new Map<string, TaskItem>();
  for (const doc of [...input.docs].filter(doc => inRange(doc.date)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const id of doc.removedTaskIds ?? []) latest.delete(id);
    for (const heading of doc.headings) for (const task of heading.items) {
      if (task.status === 'note') continue;
      latest.set(task.id, task);
      if (inRange(task.createdDate)) created.add(task.id);
      if (doneTask(task) && inRange(task.completedDate ?? doc.date)) done.add(task.id);
      if (task.carriedFromDate) carried.add(task.id);
    }
  }
  const agingOpen = [...latest.values()].filter(task => openTask(task) && getAgingSeverity(task, to, settings.agingThresholds, settings.statuses) !== 'normal')
    .map(task => ({ ...identity(task), ageDays: calculateTaskAge(task, to) }));
  return {
    from, to, done: done.size, created: created.size, carried: carried.size, agingOpen,
    habitStreaks: input.habits === null ? null : habitsForDay(input.habits, to, to).map(({ habit }) => ({ name: habit.name, streak: streak(input.habits!, habit, to) })),
    notesTouched: input.notes.filter(note => inRange(note.updatedAt.slice(0, 10))).map(({ id, title }) => ({ id, title })),
  };
}
