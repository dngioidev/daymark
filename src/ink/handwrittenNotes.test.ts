import { expect, it } from 'vitest';
import { pageCountLabel } from './handwrittenNotes';

it('labels page counts in singular and plural, never below one page', () => {
  expect(pageCountLabel(0)).toBe('1 page');
  expect(pageCountLabel(1)).toBe('1 page');
  expect(pageCountLabel(2)).toBe('2 pages');
});
