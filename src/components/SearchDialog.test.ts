import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DailyDocument, StandaloneNote } from '../types/daymark';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, effects: [] as (() => unknown)[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
  },
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
  useMemo: (fn: () => unknown) => fn(), useId: () => 'search-test', useRef: () => ({ current: null }),
}));
import { SearchDialog } from './SearchDialog';
const pick = vi.fn(); const close = vi.fn();
const notes: StandaloneNote[] = ['One', 'Two'].map((title) => ({ id: title, title, content: 'pipeline', folder: '', tags: [], createdAt: '', updatedAt: '' }));
type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function render(docs: DailyDocument[] = []) {
  hooks.index = 0; hooks.effects = [];
  return elements(SearchDialog({ isOpen: true, onClose: close, docs, notes, today: '2026-10-23', statuses: [{ id: 'archived', label: 'Filed', action: 'archive', color: '', icon: '', participatesInAging: false }], onPick: pick }) as React.ReactNode);
}
function invoke(el: Element, name: string, e: unknown) { (el.props[name] as (e: unknown) => void)(e); }
beforeEach(() => { hooks.values = []; vi.clearAllMocks(); vi.useFakeTimers(); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('debounces 120ms, then picks the second result with ArrowDown and Enter', () => {
  invoke(render().find((el) => el.type === 'input')!, 'onChange', { target: { value: 'pipeline' } });
  render(); hooks.effects.forEach((effect) => effect());
  vi.advanceTimersByTime(119);
  expect(render().filter((el) => el.props.role === 'option')).toHaveLength(0);
  vi.advanceTimersByTime(1);
  expect(render().filter((el) => el.props.role === 'option')).toHaveLength(2);
  invoke(render().find((el) => el.type === 'input')!, 'onKeyDown', { key: 'ArrowDown', preventDefault: vi.fn() });
  invoke(render().find((el) => el.type === 'input')!, 'onKeyDown', { key: 'Enter', preventDefault: vi.fn() });
  expect(pick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'note', noteId: 'Two' }));
  expect(close).toHaveBeenCalledOnce();
});
it('groups tasks and notes and exposes the task day, status and archived tag', () => {
  const docs: DailyDocument[] = [{ date: '2026-10-22', type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: [{ id: 't1', title: 'Pipeline', status: 'archived', createdDate: '2026-10-22', originalNoteDate: '2026-10-22', heading: 'Work', order: 0, historyLog: [] }] }] }];
  invoke(render(docs).find((el) => el.type === 'input')!, 'onChange', { target: { value: 'pipeline' } });
  render(docs); hooks.effects.forEach((effect) => effect()); vi.advanceTimersByTime(120);
  const tree = render(docs);
  for (const label of ['Tasks', 'Notes', 'Yesterday', 'Filed', 'Archived']) expect(tree.some((el) => el.props.children === label)).toBe(true);
  const result = tree.find((el) => el.props.role === 'option')!;
  invoke(result, 'onClick', {});
  expect(pick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', taskId: 't1', date: '2026-10-22' }));
});
