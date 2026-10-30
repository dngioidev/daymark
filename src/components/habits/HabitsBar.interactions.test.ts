import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { HabitsBar } from './HabitsBar';
import { HabitEditor } from './HabitEditor';
import { EMPTY_HABITS } from '../../utils/habits';
import type { HabitData } from '../../types/daymark';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], index: 0, refIndex: 0, effects: [] as (() => unknown)[] }));
vi.mock('react', async (original) => ({ ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.states)) hooks.states[i] = initial;
    return [hooks.states[i], (value: unknown) => { hooks.states[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.refIndex++;
    return hooks.refs[i] ??= { current: initial };
  },
  useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(), useId: () => 'panel',
  useEffect: (fn: () => unknown) => hooks.effects.push(fn),
}));
vi.mock('../../utils/habitsOpen', () => ({ loadHabitsOpen: async () => false, saveHabitsOpen: async () => {} }));
vi.mock('../ui/Dialog', () => ({ Dialog: ({ children }: { children: React.ReactNode }) => children, buttonClass: {} }));
vi.mock('../ui/feedback', () => ({ showToast: vi.fn(), confirmDialog: vi.fn() }));
beforeEach(() => { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.index = 0; hooks.refIndex = 0; });
function bar(data: HabitData, date = '2026-10-24', openSignal = 3) {
  hooks.index = 0; hooks.refIndex = 0; hooks.effects = [];
  return HabitsBar({ countingDays: 'all', data, date, today: '2026-10-24', openSignal, onChange: vi.fn() }) as React.ReactElement;
}
function walk(node: React.ReactNode, predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children as React.ReactNode)) {
    const found = walk(child, predicate); if (found) return found;
  }
}
it('does not replay a pre-mount openSignal, but opens on a later signal', async () => {
  bar(EMPTY_HABITS);
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  let tree = bar(EMPTY_HABITS);
  expect(walk(tree, e => 'aria-expanded' in e.props)!.props['aria-expanded']).toBe(false);
  expect(walk(tree, e => e.type === HabitEditor)!.props.isOpen).toBe(false);
  bar(EMPTY_HABITS, '2026-10-24', 4);
  for (const effect of hooks.effects) effect();
  tree = bar(EMPTY_HABITS, '2026-10-24', 4);
  expect(walk(tree, e => 'aria-expanded' in e.props)!.props['aria-expanded']).toBe(true);
  expect(walk(tree, e => e.type === HabitEditor)!.props.isOpen).toBe(true);
});
it('shows streaks only beside today checkboxes', () => {
  const data: HabitData = { habits: [{ id: 'h', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-23', updatedAt: 'now' }], days: [{ date: '2026-10-23', ticks: { h: { done: true, at: 'now' } } }] };
  hooks.states[0] = true;
  expect(renderToStaticMarkup(bar(data, '2026-10-23'))).not.toContain('\u{1f525}');
  expect(renderToStaticMarkup(bar(data))).toContain('\u{1f525}');
});
it('warn-after blur changes the timestamp only when the clamped value changes', () => {
  const data: HabitData = { habits: [{ id: 'h', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-23', updatedAt: 'original' }], days: [] };
  const onChange = vi.fn();
  const tree = HabitEditor({ data, today: '2026-10-24', isOpen: true, onClose: vi.fn(), onChange }) as React.ReactElement;
  const input = walk(tree, e => e.props.type === 'number')!;
  const blur = input.props.onBlur as (event: { currentTarget: { valueAsNumber: number; value: string } }) => void;
  for (const valueAsNumber of [3, 2.6]) blur({ currentTarget: { valueAsNumber, value: String(valueAsNumber) } });
  expect(onChange).not.toHaveBeenCalled();
  blur({ currentTarget: { valueAsNumber: 7, value: '7' } });
  expect(onChange.mock.calls[0][0].habits[0]).toMatchObject({ warnAfterDays: 7 });
});
