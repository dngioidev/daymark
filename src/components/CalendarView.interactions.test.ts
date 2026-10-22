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
import { Menu } from './ui/Menu';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument } from '../types/daymark';

type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
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
function render() {
  hooks.index = 0;
  return elements(CalendarView({ dailyDocuments: [doc], selectedDate: doc.date, simulatedToday: '2026-10-21',
    statuses: DEFAULT_SETTINGS.statuses, onSelectDate: select, onReopenTask: vi.fn(),
    onMoveTask: move, onOpenDay: open, compact }) as React.ReactNode);
}
function cell(tree: Element[], date: string) {
  return tree.find((el) => el.type === 'button' && el.props['data-date'] === date)!;
}
beforeEach(() => {
  hooks.values = []; compact = false; fine = true; vi.clearAllMocks();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: fine }) });
});
afterEach(() => vi.unstubAllGlobals());

it('selects future days and opens the selected day in the editor', () => {
  const tree = render();
  invoke(cell(tree, '2026-10-26'), 'onClick');
  expect(select).toHaveBeenCalledWith('2026-10-26');
  invoke(tree.find((el) => el.type === 'button' && Array.isArray(el.props.children) && el.props.children.includes(' Open this day'))!, 'onClick');
  expect(open).toHaveBeenCalledWith('2026-10-25');
});

it('switches to seven week columns, limits titles to six and navigates by weeks', () => {
  invoke(render().find((el) => el.type === 'button' && el.props.children === 'Week')!, 'onClick');
  let tree = render();
  expect(tree.filter((el) => el.type === 'button' && el.props['data-date'])).toHaveLength(7);
  const titles = elements(cell(tree, '2026-10-25'));
  expect(titles.some((el) => el.props.children === 'Plan 6')).toBe(true);
  expect(titles.some((el) => el.props.children === 'Plan 7')).toBe(false);
  expect(titles.some((el) => el.props.children === '+2 more')).toBe(true);
  invoke(tree.find((el) => el.props['aria-label'] === 'Next week')!, 'onClick');
  tree = render();
  expect(cell(tree, '2026-11-01')).toBeDefined();
});

it('moves only local Calendar drags onto today or later using the selected source date', () => {
  const tree = render();
  const row = tree.find((el) => el.type === 'li' && el.props.draggable)!;
  expect(row).toBeDefined();
  const data = new Map<string, string>();
  const transfer = { setData: (key: string, value: string) => data.set(key, value), getData: (key: string) => data.get(key) ?? '' };
  invoke(row, 'onDragStart', { dataTransfer: transfer, preventDefault: vi.fn() });
  const event = { dataTransfer: transfer, preventDefault: vi.fn() };
  invoke(cell(tree, '2026-10-20'), 'onDrop', event);
  expect(move).not.toHaveBeenCalled();
  invoke(cell(tree, '2026-10-21'), 'onDrop', event);
  expect(move).toHaveBeenCalledWith('plan-0', '2026-10-25', '2026-10-21');
  move.mockClear();
  invoke(cell(tree, '2026-10-25'), 'onDrop', event);
  expect(move).not.toHaveBeenCalled();
  invoke(cell(tree, '2026-10-26'), 'onDrop', event);
  expect(move).toHaveBeenCalledWith('plan-0', '2026-10-25', '2026-10-26');
  move.mockClear();
  invoke(cell(tree, '2026-10-26'), 'onDrop', { ...event, dataTransfer: { getData: () => 'untrusted text' } });
  expect(move).not.toHaveBeenCalled();
});

it.each(['compact', 'coarse'] as const)('disables dragging for %s screens', (mode) => {
  compact = mode === 'compact'; fine = mode !== 'coarse';
  expect(render().filter((el) => el.type === 'li').some((el) => el.props.draggable)).toBe(false);
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
