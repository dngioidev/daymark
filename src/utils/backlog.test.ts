import { describe, expect, it } from 'vitest';
import type { BacklogData, BacklogItem, DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { performDailyRollover } from './lifecycleEngine';
import { isClosedCopy } from './taskActions';
import { addBacklogItem, editBacklogItem, EMPTY_BACKLOG, moveTaskToBacklog, pickBacklogItem, reconcileBacklog, removeBacklogItem, reorderBacklogItem, restoreBacklogItem, sectionForCategory, visibleBacklog } from './backlog';

const now = '2026-10-26T08:00:00.000Z';
const later = '2026-10-26T09:00:00.000Z';
const item = (id = 'a', extra: Partial<BacklogItem> = {}): BacklogItem => ({ id, title: id, order: 1, createdAt: now, updatedAt: now, ...extra });
const task = (extra: Partial<TaskItem> = {}): TaskItem => ({ id: 'a', title: 'Task', status: 'in-progress', createdDate: '2026-10-23', originalNoteDate: '2026-10-23', heading: 'Work', order: 1, historyLog: [], ...extra });
const day = (date: string, items: TaskItem[] = []): DailyDocument => ({ date, type: 'daily', headings: [{ name: 'Work', items, notesContent: 'Keep notes' }], updatedAt: now });

describe('backlog', () => {
  it.each([' work ', 'WORK'])('reuses existing section spelling for %s', (category) => {
    expect(sectionForCategory(['Work'], category, 'General')).toEqual({ name: 'Work', isNew: false });
  });
  it('uses fallback for blank labels and preserves new and long names', () => {
    expect(sectionForCategory(['Work'], '', 'Work')).toEqual({ name: 'Work', isNew: false });
    expect(sectionForCategory([], undefined, 'General')).toEqual({ name: 'General', isNew: true });
    for (const name of ['Personal', 'x'.repeat(200)]) expect(sectionForCategory(['Work'], ` ${name} `, 'Work')).toEqual({ name, isNew: true });
  });
  it('adds, edits, deletes and undoes without mutating inputs or losing tombstones', () => {
    const added = addBacklogItem(EMPTY_BACKLOG, { title: 'Task', category: 'Work' }, now, 'a');
    const edited = editBacklogItem(added, 'a', { description: 'Details' }, later);
    expect(added.items[0].description).toBeUndefined();
    expect(edited.items[0]).toMatchObject({ description: 'Details', updatedAt: later });
    const removed = removeBacklogItem(edited, 'a', later);
    expect(visibleBacklog(removed)).toEqual([]);
    expect(removed.items[0].deletedAt).toBe(later);
    expect(visibleBacklog(restoreBacklogItem(removed, 'a', now))).toHaveLength(1);
    expect(EMPTY_BACKLOG.items).toEqual([]);
  });
  it('groups labels case insensitively, puts unlabelled last, and swaps only within a group', () => {
    const data = { items: [item('z'), item('b', { category: 'Work', order: 2 }), item('c', { category: 'Home' }), item('a', { category: ' work ', order: 1 }), item('hidden', { pickedOn: '2026-10-26' })] };
    expect(visibleBacklog(data).map((i) => i.id)).toEqual(['c', 'a', 'b', 'z']);
    const reordered = reorderBacklogItem(data, 'b', 'up', later);
    expect(visibleBacklog(reordered).map((i) => i.id)).toEqual(['c', 'b', 'a', 'z']);
    expect(reorderBacklogItem(data, 'a', 'up', later)).toEqual(data);
    expect(reorderBacklogItem(data, 'b', 'down', later)).toEqual(data);
    expect(reordered.items.find((i) => i.id === 'a')?.updatedAt).toBe(later);
  });
  it('appends category edits after the destination group maximum without changing other items', () => {
    const data = { items: [item('a', { category: 'Home' }), item('b', { category: 'Work', order: 1 }), item('c', { category: ' work ', order: 4 })] };
    const edited = editBacklogItem(data, 'a', { category: 'WORK' }, later);
    expect(edited.items[0]).toMatchObject({ category: 'WORK', order: 5, updatedAt: later });
    expect(edited.items.slice(1)).toEqual(data.items.slice(1));
    expect(editBacklogItem(edited, 'a', { category: ' work ' }, now).items[0].order).toBe(5);
    const unlabelled = { items: [...data.items, item('d', { order: 3 })] };
    expect(editBacklogItem(unlabelled, 'a', { category: undefined }, later).items[0].order).toBe(4);
  });
  it('revives a picked item after the destination group maximum instead of reusing its occupied order', () => {
    const data = { items: [item('a', { category: 'Work', order: 1, pickedOn: '2026-10-25' }), item('b', { category: 'Work', order: 1 }), item('c', { category: ' work ', order: 4 })] };
    const moved = moveTaskToBacklog([day('2026-10-25', [task()])], data, 'a', '2026-10-25', later)!;
    expect(moved.data.items[0]).toMatchObject({ id: 'a', category: 'Work', order: 5, updatedAt: later });
    expect(moved.data.items[0].pickedOn).toBeUndefined();
    expect(moved.data.items.slice(1)).toEqual(data.items.slice(1));
  });
  it.each(['Work', 'Personal'])('picks into reused or new section %s with fresh age and all content', (category) => {
    const historyLog: TaskItem['historyLog'] = [{ id: 'h', timestamp: now, date: '2026-10-23', action: 'created', details: 'Created' }];
    const source = item('a', { category: ` ${category.toUpperCase()} `, status: 'blocked', description: 'Details', checklist: [{ id: 'c', text: 'Check', done: true }], tags: ['tag'], historyLog });
    const docs = [day('2026-10-26')];
    const result = pickBacklogItem(docs, { items: [source] }, 'a', '2026-10-26', ['Work'], now)!;
    const heading = result.docs[0].headings.find((h) => h.items.length)!;
    const picked = heading.items[0];
    expect(heading.name).toBe(category === 'Work' ? 'Work' : 'PERSONAL');
    expect(result.docs[0].headings.filter((h) => h.name === 'Work')).toHaveLength(1);
    expect(picked).toMatchObject({ id: 'a', createdDate: '2026-10-26', originalNoteDate: '2026-10-26', status: 'blocked', description: source.description, checklist: source.checklist, tags: source.tags });
    expect(picked.carriedFromDate).toBeUndefined();
    expect(picked.historyLog[0]).toEqual(historyLog[0]);
    expect(picked.historyLog.at(-1)?.details).toBe('Picked from backlog');
    expect(result.data.items[0].pickedOn).toBe('2026-10-26');
    expect(docs[0].headings[0].items).toEqual([]);
    expect(pickBacklogItem(result.docs, result.data, 'a', '2026-10-27', ['Work'], now)).toBeNull();
  });
  it('creates a missing day, clears its removal marker, and resets finished statuses', () => {
    for (const status of ['done', 'archived']) {
      const result = pickBacklogItem([], { items: [item('a', { status })] }, 'a', '2026-10-26', ['Work'], now)!;
      expect(result.docs[0].headings[0].items[0].status).toBe('not-started');
    }
    const doc = { ...day('2026-10-26'), removedTaskIds: ['a', 'other'] };
    const result = pickBacklogItem([doc], { items: [item()] }, 'a', doc.date, ['Work'], now)!;
    expect(result.docs[0].removedTaskIds).toEqual(['other']);
  });
  it('rejects hidden, unknown and non-closed ids on any day', () => {
    for (const extra of [{ pickedOn: '2026-10-26' }, { deletedAt: now }]) expect(pickBacklogItem([], { items: [item('a', extra)] }, 'a', '2026-10-26', [], now)).toBeNull();
    expect(pickBacklogItem([], EMPTY_BACKLOG, 'missing', '2026-10-26', [], now)).toBeNull();
    expect(pickBacklogItem([day('2026-10-23', [task()])], { items: [item()] }, 'a', '2026-10-26', [], now)).toBeNull();
  });
  it('rejects a non-closed done copy on another day', () => {
    expect(pickBacklogItem([day('2026-10-23', [task({ status: 'done' })])], { items: [item()] }, 'a', '2026-10-28', ['Work'], now)).toBeNull();
  });
  it.each([{ status: 'done', doneLaterDate: '2026-10-25' }, { status: 'done', movedToBacklogDate: '2026-10-25' }])('allows closed history elsewhere but rejects a closed destination copy: %j', (extra) => {
    const docs = [day('2026-10-23', [task(extra)])];
    const data = { items: [item()] };
    expect(pickBacklogItem(docs, data, 'a', '2026-10-26', ['Work'], now)).not.toBeNull();
    expect(pickBacklogItem(docs, data, 'a', '2026-10-23', ['Work'], now)).toBeNull();
  });
  it('moves a three-day carried task, closes earlier copies and prevents rollover', () => {
    const docs = ['2026-10-23', '2026-10-24', '2026-10-25'].map((date) => day(date, [task()]));
    const result = moveTaskToBacklog(docs, EMPTY_BACKLOG, 'a', '2026-10-25', now)!;
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]).toMatchObject({ id: 'a', category: 'Work', status: 'in-progress' });
    expect(result.docs[2].headings[0].items).toEqual([]);
    expect(result.docs[2].removedTaskIds).toEqual(['a']);
    for (const doc of result.docs.slice(0, 2)) {
      expect(doc.headings[0].items[0].movedToBacklogDate).toBe('2026-10-25');
      expect(doc.headings[0].items[0].historyLog.at(-1)?.details).toContain('Moved to backlog');
    }
    expect(performDailyRollover('2026-10-26', result.docs, DEFAULT_SETTINGS.statuses).carriedCount).toBe(0);
    expect(docs[0].headings[0].items[0].movedToBacklogDate).toBeUndefined();
  });
  it('picks a three-day carried task after moving to backlog, retaining closed history and rejecting a second pick', () => {
    const docs = ['2026-10-23', '2026-10-24', '2026-10-25'].map((date, index, dates) => day(date, [task({ carriedFromDate: index ? dates[index - 1] : undefined })]));
    const moved = moveTaskToBacklog(docs, EMPTY_BACKLOG, 'a', '2026-10-25', now)!;
    for (const doc of moved.docs.slice(0, 2)) expect(doc.headings[0].items[0].movedToBacklogDate).toBe('2026-10-25');
    const picked = pickBacklogItem(moved.docs, moved.data, 'a', '2026-10-28', ['Work'], later);
    expect(picked).not.toBeNull();
    if (!picked) throw new Error('Closed history must not prevent picking');
    const targetItems = picked.docs.find((doc) => doc.date === '2026-10-28')!.headings.flatMap((heading) => heading.items);
    expect(targetItems).toHaveLength(1);
    expect(targetItems[0]).toMatchObject({ id: 'a', status: 'in-progress', createdDate: '2026-10-28', originalNoteDate: '2026-10-28' });
    expect(targetItems[0].carriedFromDate).toBeUndefined();
    expect(targetItems[0].movedToBacklogDate).toBeUndefined();
    expect(picked.docs.flatMap((doc) => doc.headings.flatMap((heading) => heading.items)).filter((t) => t.id === 'a' && !isClosedCopy(t))).toHaveLength(1);
    expect(picked.docs.slice(0, 3)).toEqual(moved.docs);
    expect(picked.data.items).toHaveLength(1);
    expect(picked.data.items[0]).toMatchObject({ id: 'a', pickedOn: '2026-10-28', updatedAt: later });
    expect(pickBacklogItem(picked.docs, picked.data, 'a', '2026-10-29', ['Work'], later)).toBeNull();
    expect(pickBacklogItem(picked.docs, moved.data, 'a', '2026-10-29', ['Work'], later)).toBeNull();
  });
  it.each([{ status: 'done' }, { status: 'archived' }, { movedToBacklogDate: '2026-10-25' }])('rejects done, archived and closed moves: %j', (extra) => {
    expect(moveTaskToBacklog([day('2026-10-25', [task(extra)])], EMPTY_BACKLOG, 'a', '2026-10-25', now)).toBeNull();
  });
  it('revives the same backlog record after day to backlog to day to backlog', () => {
    const first = moveTaskToBacklog([day('2026-10-25', [task()])], EMPTY_BACKLOG, 'a', '2026-10-25', now)!;
    const picked = pickBacklogItem(first.docs, first.data, 'a', '2026-10-26', ['Work'], later)!;
    const second = moveTaskToBacklog(picked.docs, picked.data, 'a', '2026-10-26', later)!;
    expect(second.data.items).toHaveLength(1);
    expect(second.data.items[0]).toMatchObject({ id: 'a', createdAt: now });
    expect(visibleBacklog(second.data)).toHaveLength(1);
  });
  it('reconciles to the earliest open day, ignoring closed, done and archived copies', () => {
    const data: BacklogData = { items: [item()] };
    const closed = day('2026-10-22', [task({ movedToBacklogDate: '2026-10-25' })]);
    const docs = [day('2026-10-26', [task()]), closed, day('2026-10-24', [task()]), day('2026-10-23', [task({ status: 'done' })])];
    expect(reconcileBacklog(data, docs, later).items[0]).toMatchObject({ pickedOn: '2026-10-24', updatedAt: later });
    expect(reconcileBacklog(data, [closed, day('2026-10-23', [task({ status: 'archived' })])], later)).toEqual(data);
    expect(reconcileBacklog({ items: [item('a', { deletedAt: now })] }, docs, later).items[0].pickedOn).toBeUndefined();
  });
});
