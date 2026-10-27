import type { TaskHistoryItem } from '../types/daymark';

const key = (event: TaskHistoryItem) => JSON.stringify([event.id, event.timestamp, event.date, event.action, event.details]);
const compare = (a: TaskHistoryItem, b: TaskHistoryItem) =>
  ((Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0)) || key(a).localeCompare(key(b));

/** Union append-only histories, preserving each writer's causal order even with clock skew. */
export function mergeBacklogHistory(...histories: (TaskHistoryItem[] | undefined)[]): TaskHistoryItem[] | undefined {
  const events = new Map<string, TaskHistoryItem>();
  const edges = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const list of histories) for (const event of list ?? []) {
    const previous = events.get(event.id);
    if (!previous) events.set(event.id, event);
    if (!edges.has(event.id)) { edges.set(event.id, new Set()); indegree.set(event.id, 0); }
  }
  if (!events.size) return histories[0];
  for (const list of histories) for (let index = 1; index < (list?.length ?? 0); index++) {
    const from = list![index - 1].id, to = list![index].id;
    if (from !== to && !edges.get(from)!.has(to)) {
      edges.get(from)!.add(to);
      indegree.set(to, indegree.get(to)! + 1);
    }
  }
  const remaining = new Set(events.keys());
  const ready = [...remaining].filter(id => indegree.get(id) === 0);
  const result: TaskHistoryItem[] = [];
  while (remaining.size) {
    // Damaged cyclic histories still retain every event, in deterministic order.
    if (!ready.length) ready.push([...remaining].sort((a, b) => compare(events.get(a)!, events.get(b)!))[0]);
    ready.sort((a, b) => compare(events.get(a)!, events.get(b)!));
    const id = ready.shift()!;
    if (!remaining.delete(id)) continue;
    result.push(events.get(id)!);
    for (const next of edges.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0 && remaining.has(next)) ready.push(next);
    }
  }
  const first = histories[0];
  return first?.length === result.length && first.every((event, index) => key(event) === key(result[index])) ? first : result;
}
