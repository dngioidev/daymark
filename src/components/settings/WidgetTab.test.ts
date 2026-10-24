import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { WidgetTab } from './WidgetTab';
import { parseWidgetStyle } from '../../utils/widgetStyle';

const { states } = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => states.length ? [states.shift(), vi.fn()] : actual.useState(initial) };
});
afterEach(() => { states.length = 0; });

it.each(['tasks', 'habits'] as const)('shows kind-specific controls for a %s widget', (kind) => {
  const style = parseWidgetStyle({});
  // Supply the state normally loaded asynchronously from the native plugin.
  states.push({ widgets: [{ id: 42, kind, style }], defaultStyle: style }, 42, style, null, '');
  const html = renderToStaticMarkup(React.createElement(WidgetTab, { app: null, initialWidgetId: 42 }));
  expect(html).toContain(kind === 'habits' ? 'Habits widget 1' : 'Tasks widget 1');
  expect(html).toContain('Add tasks widget');
  expect(html).toContain('Add habits widget');
  if (kind === 'habits') {
    expect(html).toContain('Show streaks');
    for (const label of ['Done tasks', 'Age badges', 'Quick add', 'Section names']) expect(html).not.toContain(label);
  } else {
    expect(html).toContain('Done tasks');
    expect(html).not.toContain('Show streaks');
  }
});
