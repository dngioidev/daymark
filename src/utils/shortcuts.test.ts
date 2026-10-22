import { expect, it } from 'vitest';
import { shortcutFor } from './shortcuts';
const key = (key: string, modifiers = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers });
const body = { closest: () => null } as unknown as EventTarget;
const field = { closest: () => ({}) } as unknown as EventTarget;

it.each(['ctrlKey', 'metaKey'])('maps %s shortcuts, including the two typing exceptions', (modifier) => {
  expect(shortcutFor(key('k', { [modifier]: true }), false, body)).toBe('new-task');
  expect(shortcutFor(key('k', { [modifier]: true }), false, field)).toBe('new-task');
  expect(shortcutFor(key('F', { [modifier]: true, shiftKey: true }), false, body)).toBe('search');
  expect(shortcutFor(key('F', { [modifier]: true, shiftKey: true }), false, field)).toBeNull();
  expect(shortcutFor(key('.', { [modifier]: true }), false, field)).toBe('focus-notes');
});
it('maps plain keys and g sequences', () => {
  expect(shortcutFor(key('/'), false, body)).toBe('search');
  expect(shortcutFor(key('?', { shiftKey: true }), false, body)).toBe('help');
  expect(shortcutFor(key('g'), false, body)).toBe('g-prefix');
  for (const [letter, action] of [['t', 'go-today'], ['c', 'go-calendar'], ['n', 'go-notes']]) {
    expect(shortcutFor(key(letter), true, body)).toBe(action);
    expect(shortcutFor(key(letter), false, body)).toBeNull();
  }
});
it('ignores fields, unrelated keys and extra modifiers', () => {
  for (const letter of ['/', '?', 'g', 't', 'c', 'n']) expect(shortcutFor(key(letter), true, field)).toBeNull();
  expect(shortcutFor(key('x'), true, body)).toBeNull();
  expect(shortcutFor(key('/'), false, null)).toBe('search');
  expect(shortcutFor(key('g', { ctrlKey: true }), false, body)).toBeNull();
  expect(shortcutFor(key('k', { ctrlKey: true, altKey: true }), false, body)).toBeNull();
  expect(shortcutFor(key('.', { ctrlKey: true, shiftKey: true }), false, body)).toBeNull();
});
