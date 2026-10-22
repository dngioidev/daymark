import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const { effects, draft, ref } = vi.hoisted(() => ({ effects: [] as (() => unknown)[], draft: vi.fn(), ref: { current: null as unknown } }));
vi.mock('react', async (original) => ({ ...await original<typeof React>(), useState: (value: unknown) => [value, draft], useRef: () => ref, useEffect: (effect: () => unknown) => { effects.push(effect); } }));
import { PreviewInput } from './PreviewInput';
beforeEach(() => { effects.length = 0; draft.mockClear(); });
it.each([
  ['range', '35', '40', '45'],
  ['color', '#111111', '#222222', '#333333'],
])('previews %s input ticks locally but commits only on native change', (type, initial, first, last) => {
  const change = vi.fn(); const preview = vi.fn();
  const listeners = new Map<string, () => void>();
  ref.current = { value: initial, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: () => {} };
  const element = PreviewInput({ type, value: initial, onPreview: preview, onCommit: change });
  effects.forEach((effect) => effect());
  element.props.onInput({ currentTarget: { value: first } });
  element.props.onInput({ currentTarget: { value: last } });
  expect(draft).toHaveBeenCalledWith(last);
  expect(preview.mock.calls).toEqual([[first], [last]]);
  expect(change).not.toHaveBeenCalled();
  // Parent's draft now matches the final input; that must not suppress the commit.
  effects.length = 0;
  PreviewInput({ type, value: last, onPreview: preview, onCommit: change });
  effects.forEach((effect) => effect());
  (ref.current as { value: string }).value = last;
  listeners.get('change')!();
  expect(change.mock.calls).toEqual([[last]]);
});
