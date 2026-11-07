import { describe, expect, it } from 'vitest';
import { GUIDE_TOPICS } from './guideData';
import { searchGuide } from './guideSearch';

const slugs = (query: string) => searchGuide(GUIDE_TOPICS, query).map(topic => topic.slug);

describe('searchGuide', () => {
  it('finds tags first for "tags" and "#tag"', () => {
    expect(slugs('tags')[0]).toBe('tags');
    expect(slugs('tag')[0]).toBe('tags');
  });
  it('finds linking notes for "link notes"', () => {
    expect(slugs('link notes').slice(0, 2)).toContain('linking-notes');
  });
  it('finds handwriting for "eraser"', () => {
    expect(slugs('eraser')).toContain('handwriting');
  });
  it('finds sync first for "sync"', () => {
    expect(slugs('sync')[0]).toBe('sync');
  });
  it('needs every word to match and returns nothing for nonsense', () => {
    expect(slugs('zzzz')).toEqual([]);
    expect(slugs('sync zzzz')).toEqual([]);
  });
  it('returns every topic in guide order for an empty query', () => {
    expect(slugs('  ')).toEqual(GUIDE_TOPICS.map(topic => topic.slug));
  });
});

it('keeps the typed Show me targets equal to the guide format list', async () => {
  const { SHOW_ME } = await import('./guideData');
  const expected: Record<import('./guideData').ShowMeTarget, true> = { today: true, 'quick-capture': true, calendar: true, backlog: true, notes: true, 'notes-tags': true,
    'notes-graph': true, search: true, 'settings-appearance': true, 'settings-sync': true, 'settings-storage': true, 'settings-widget': true };
  expect([...SHOW_ME].sort()).toEqual(Object.keys(expected).sort());
});
