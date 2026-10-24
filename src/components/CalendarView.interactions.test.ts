import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: () => {}, useMemo: (fn: () => unknown) => fn(),
  useId: () => 'move-dialog', useRef: () => ({ current: null }),
}));
import { CalendarView } from './CalendarView';
import { WeekRows } from './WeekRows';
import { HabitChecklist } from './habits/HabitChecklist';
import { Menu } from './ui/Menu';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument } from '../types/daymark';

type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === WeekRows && React.isValidElement<React.ComponentProps<typeof WeekRows>>(node)) {
    return [node, ...elements(WeekRows(node.props) as React.ReactNode)];
  }
  if (node.type === HabitChecklist && React.isValidElement<React.ComponentProps<typeof HabitChecklist>>(node)) {
    return [node, ...elements(HabitChecklist(node.props) as React.ReactNode)];
  }
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function invoke(element: Element, handler: string, event?: unknown) {
  (element.props[handler] as (event: unknown) => void)(event);
}
const doc: DailyDocument = {
  date: '2026-10-25', type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: Array.from({ length: 8 }, (_, i) => ({
    id: `plan-${i}`, title: `Plan ${i + 1}`, status: 'in-progress', createdDate: '2026-10-21',
    originalNoteDate: '2026-10-25', heading: 'Work', order: i, historyLog: [],
  })) }],
};
const move = vi.fn(); const select = vi.fn(); const open = vi.fn();
let compact = false; let fine = true;
function render(overrides: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  hooks.index = 0;
  return elements(CalendarView({ dailyDocuments: [doc], selectedDate: doc.date, simulatedToday: '2026-10-21',
    statuses: DEFAULT_SETTINGS.statuses, onSelectDate: select, onReopenTask: vi.fn(),
    onMoveTask: move, onOpenDay: open, compact, habits: { habits: [], days: [] }, onHabitsChange: vi.fn(), ...overrides }) as React.ReactNode);
}
function cell(tree: Element[], date: string) {
  return tree.find((el) => el.type === 'button' && el.props['data-date'] === date)!;
}
beforeEach(() => {
  hooks.values = []; compact = false; fine = true; vi.clearAllMocks();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: fine }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('selects future days and opens the selected day in the editor', () => {
  const tree = render();
  invoke(cell(tree, '2026-10-26'), 'onClick');
  expect(select).toHaveBeenCalledWith('2026-10-26');
  invoke(tree.find((el) => el.type === 'button' && Array.isArray(el.props.children) && el.props.children.includes(' Open this day'))!, 'onClick');
  expect(open).toHaveBeenCalledWith('2026-10-25');
});

it('switches to seven week rows, shows every title, selects rows and navigates by weeks', () => {
  invoke(render().find((el) => el.type === 'button' && el.props.children === 'Week')!, 'onClick');
  let tree = render();
  expect(tree.filter((el) => el.type === 'button' && el.props['data-date'])).toHaveLength(7);
  const titles = elements(cell(tree, '2026-10-25'));
  expect(titles.some((el) => el.props.children === 'Plan 6')).toBe(true);
  expect(titles.some((el) => el.props.children === 'Plan 8')).toBe(true);
  expect(titles.some((el) => el.props.children === '+2 more')).toBe(false);
  invoke(cell(tree, '2026-10-26'), 'onClick');
  expect(select).toHaveBeenCalledWith('2026-10-26');
  invoke(tree.find((el) => el.props['aria-label'] === 'Next week')!, 'onClick');
  tree = render();
  expect(cell(tree, '2026-11-01')).toBeDefined();
});

it.each(['month', 'week'] as const)('moves only local Calendar drags onto today or later in %s mode', (view) => {
  const tree = render({ initialView: view, selectedDate: '2026-10-21', dailyDocuments: [{ ...doc, date: '2026-10-21' }] });
  const row = tree.find((el) => el.type === 'li' && el.props.draggable)!;
  expect(row).toBeDefined();
  const data = new Map<string, string>();
  const transfer = { setData: (key: string, value: string) => data.set(key, value), getData: (key: string) => data.get(key) ?? '' };
  invoke(row, 'onDragStart', { dataTransfer: transfer, preventDefault: vi.fn() });
  const event = { dataTransfer: transfer, preventDefault: vi.fn() };
  invoke(cell(tree, '2026-10-20'), 'onDrop', event);
  expect(move).not.toHaveBeenCalled();
  invoke(cell(tree, '2026-10-21'), 'onDrop', event);
  expect(move).not.toHaveBeenCalled();
  const target = cell(tree, '2026-10-22');
  const dragOver = { dataTransfer: { types: ['application/x-daymark-task'], dropEffect: '' }, preventDefault: vi.fn() };
  invoke(target, 'onDragOver', dragOver);
  expect(dragOver.preventDefault).toHaveBeenCalledOnce();
  expect(dragOver.dataTransfer.dropEffect).toBe('move');
  invoke(target, 'onDrop', event);
  expect(move).toHaveBeenCalledWith('plan-0', '2026-10-21', '2026-10-22');
  move.mockClear();
  invoke(target, 'onDrop', { ...event, dataTransfer: { getData: () => 'untrusted text' } });
  expect(move).not.toHaveBeenCalled();
});

it.each(['compact', 'coarse'] as const)('disables dragging for %s screens', (mode) => {
  compact = mode === 'compact'; fine = mode !== 'coarse';
  expect(render().filter((el) => el.type === 'li').some((el) => el.props.draggable)).toBe(false);
});

it('ticks and unticks a past habit with the resolved today and current ISO time, leaving tasks unchanged', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T12:34:56Z'));
  const habits = { habits: [{ id: 'water', name: 'Water', order: 0, warnAfterDays: 3, addedOn: '2026-10-18', updatedAt: '' }], days: [] };
  const change = vi.fn();
  const before = JSON.stringify(doc);
  const props = { selectedDate: '2026-10-20', habits, onHabitsChange: change };
  invoke(render(props).find((el) => el.type === 'input' && el.props.type === 'checkbox')!, 'onChange', { target: { checked: true } });
  const ticked = change.mock.calls[0][0];
  expect(ticked.days).toEqual([{ date: '2026-10-20', ticks: { water: { done: true, at: '2030-01-01T12:34:56.000Z' } } }]);
  invoke(render({ ...props, habits: ticked }).find((el) => el.type === 'input' && el.props.type === 'checkbox')!, 'onChange', { target: { checked: false } });
  expect(change.mock.calls[1][0].days[0].ticks.water.done).toBe(false);
  expect(habits.days).toEqual([]);
  expect(JSON.stringify(doc)).toBe(before);
});

it('offers keyboard move-to-date with validation and the selected source date', () => {
  const menu = render().find((el) => el.type === Menu)!;
  const item = (menu.props.items as { label: string; onSelect: () => void }[]).find((item) => item.label === 'Move to date…')!;
  item.onSelect();
  let tree = render();
  invoke(tree.find((el) => el.type === 'input' && el.props.type === 'date')!, 'onChange', { target: { value: '2026-10-20' } });
  tree = render();
  invoke(tree.find((el) => el.type === 'form')!, 'onSubmit', { preventDefault: vi.fn() });
  expect(move).not.toHaveBeenCalled();
  expect(render().some((el) => el.props.role === 'alert')).toBe(true);
  invoke(render().find((el) => el.type === 'input' && el.props.type === 'date')!, 'onChange', { target: { value: '2026-10-21' } });
  invoke(render().find((el) => el.type === 'form')!, 'onSubmit', { preventDefault: vi.fn() });
  expect(move).toHaveBeenCalledWith('plan-0', '2026-10-25', '2026-10-21');
});
