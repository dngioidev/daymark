import { describe, expect, it, vi } from 'vitest';
import type { InkPage, StandaloneNote } from '../types/daymark';
import { createTextBox } from '../ink/inkText';
import { knowledgeNotes } from './knowledgeNotes';
import { scheduleGraphSuggestions } from './graphSuggestions';
import { buildNoteIndex, pairKey, suggestRelated } from './noteRelated';
import { buildGraph, defaultGraphScope, linkEndpoints, ROOT_FOLDER, type GraphEdge, type GraphOptions } from './graphData';

const note = (id: string, patch: Partial<StandaloneNote> = {}): StandaloneNote => ({ id, title: id, content: '', folder: '', tags: [], createdAt: '', updatedAt: '', ...patch });
const notes = [note('a', { folder: 'Tech', content: '[[b]]' }), note('b', { folder: 'Tech/Java', content: '[[c]]' }), note('c', { folder: 'Other' }), note('orphan')];
const opts: GraphOptions = { folderPaths: null, showTags: false, showSuggestions: false, showOrphans: true };
const graph = (options: Partial<GraphOptions> = {}, source = notes, dismissed = new Set<string>()) => {
  const index = buildNoteIndex(source);
  const suggestions = source.flatMap(note => suggestRelated(index, note.id, { dismissed }).map(s => ({ a: note.id, b: s.noteId, kind: 'suggested' as const, terms: s.sharedTerms })));
  return buildGraph(source, index, dismissed, { ...opts, ...options }, suggestions);
};
it('matches own-folder sentinels exactly with canonical case and spelling', () => {
  const source = [note('tech', { folder: ' TECH ' }), note('java', { folder: 'Tech/Java' }), note('streams', { folder: 'Tech/Java/Streams' }), note('python', { folder: 'Tech/Python' })];
  expect(graph({ folderPaths: ['\0own:Tech', 'Tech/Python'] }, source).nodes.map(n => n.id)).toEqual(['tech', 'python']);
  expect(graph({ folderPaths: ['\0own:Tech', '\0own: tech / java ', 'Tech/Python'] }, source).nodes.map(n => n.id)).toEqual(['tech', 'java', 'python']);
  expect(graph({ folderPaths: [] }, source).nodes).toEqual([]);
});
describe('graph projection never edits notes', () => {
  it('selects exact root independently and defaults a selected root correctly above 300', () => {
    expect(graph({ folderPaths: [ROOT_FOLDER] }).nodes.map(n => n.id)).toEqual(['orphan']);
    expect(graph({ folderPaths: [ROOT_FOLDER, 'Tech'] }).nodes.map(n => n.id)).toEqual(['a', 'b', 'orphan']);
    expect(defaultGraphScope(301, '')).toEqual({ folderPaths: [ROOT_FOLDER], showOrphans: false });
    expect(graph({ folderPaths: defaultGraphScope(301, 'Tech').folderPaths }).nodes.map(n => n.id)).toEqual(['a', 'b']);
  });
  it('includes descendants and drops edges to hidden notes', () => {
    const before = JSON.stringify(notes);
    const result = graph({ folderPaths: ['Tech'] });
    expect(result.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(result.edges).toEqual([{ a: 'a', b: 'b', kind: 'link' }]);
    expect(JSON.stringify(notes)).toBe(before);
  });
  it('toggles orphans and handles empty filters', () => {
    expect(graph({ showOrphans: false }).nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
    expect(graph({ folderPaths: [] }).nodes).toEqual([]);
  });
  it('caps tag edges to a spanning hub per tag and supports tag filtering', () => {
    const tagged = Array.from({ length: 100 }, (_, i) => note(String(i), { tags: ['java'] }));
    expect(graph({ showTags: true }, tagged).edges).toHaveLength(99);
    expect(graph({}, tagged).edges).toEqual([]);
    expect(graph({ tag: 'missing' }, tagged).nodes).toEqual([]);
  });
  it('deduplicates suggestions and excludes dismissed pairs and explicit links', () => {
    const source = ['x', 'y'].map(id => note(id, { title: `Java ${id}`, content: 'Java streams collectors pipeline' }));
    expect(graph({ showSuggestions: true }, source).edges).toHaveLength(1);
    expect(graph({ showSuggestions: true }, source, new Set([pairKey('x', 'y')])).edges).toEqual([]);
    expect(graph({}, source).edges).toEqual([]);
    source[0].content += '\n[[Java y]]';
    expect(graph({ showSuggestions: true }, source).edges.map(e => e.kind)).toEqual(['link']);
  });
  it('keeps local neighbours at depth one and two', () => {
    expect(graph({ local: { noteId: 'a', depth: 1 } }).nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(graph({ local: { noteId: 'a', depth: 2 } }).nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });
  it('highlights search without hiding the rest', () => {
    const result = graph({ query: 'JAVA' });
    expect([...result.matches]).toEqual(['b']); expect(result.nodes).toHaveLength(4);
  });
  it('defaults at 300 / 301 and preserves the all-folder selection', () => {
    expect(defaultGraphScope(300, 'Tech')).toEqual({ folderPaths: null, showOrphans: true });
    expect(defaultGraphScope(301, 'Tech')).toEqual({ folderPaths: ['Tech'], showOrphans: false });
    expect(defaultGraphScope(301, 'all')).toEqual({ folderPaths: null, showOrphans: false });
  });
});

describe('graph tag view', () => {
  const tagGraph = (source: StandaloneNote[], options: Partial<GraphOptions> = {}, pages: (id: string) => InkPage[] = () => []) => {
    const known = knowledgeNotes(source, pages);
    return buildGraph(known, buildNoteIndex(known), new Set(), { ...opts, showTags: true, ...options });
  };
  const tagEdges = (result: ReturnType<typeof buildGraph>) => result.edges.filter(edge => edge.kind === 'tag').map(edge => pairKey(edge.a, edge.b)).sort();

  it('joins notes whose text holds the same tag in any case with one tag line', () => {
    const result = tagGraph([note('a', { content: 'fix #sync' }), note('b', { content: 'more #Sync' }), note('c', { content: 'none' })]);
    expect(tagEdges(result)).toEqual([pairKey('a', 'b')]);
  });

  it('uses a spanning hub: three notes sharing a tag get two lines, all inside the filter', () => {
    const source = [note('a', { content: '#sync' }), note('b', { content: '#sync' }), note('c', { content: '#sync' }), note('d', { folder: 'Hidden', content: '#sync' })];
    expect(tagEdges(tagGraph(source))).toHaveLength(3);
    const filtered = tagGraph(source, { folderPaths: [ROOT_FOLDER] });
    expect(tagEdges(filtered)).toHaveLength(2);
    expect(filtered.edges.every(edge => edge.a !== 'd' && edge.b !== 'd')).toBe(true);
  });

  it('lets a link outrank a tag line for the same pair', () => {
    const result = tagGraph([note('a', { content: '#sync [[b]]' }), note('b', { content: '#sync' })]);
    expect(result.edges).toEqual([{ a: 'a', b: 'b', kind: 'link' }]);
  });

  it('treats a parent and a nested tag as different tags for lines', () => {
    expect(tagEdges(tagGraph([note('a', { content: '#project' }), note('b', { content: '#project/daymark' })]))).toEqual([]);
  });

  it('joins a handwritten text-box tag to a typed note', () => {
    const ink = note('ink', { kind: 'handwritten', content: 'placeholder' });
    const box = createTextBox('#sync ideas', { x: 10, y: 10 }, '#292524', 'box', '');
    const pages = (id: string): InkPage[] => id === 'ink' ? [{ noteId: 'ink', page: 0, strokes: [box], removed: [], updatedAt: '' }] : [];
    expect(tagEdges(tagGraph([ink, note('typed', { content: '#sync' })], {}, pages))).toEqual([pairKey('ink', 'typed')]);
  });

  it('drops the line once the tag leaves the text', () => {
    const a = note('a', { content: '#sync' }), b = note('b', { content: '#sync' });
    expect(tagEdges(tagGraph([a, b]))).toHaveLength(1);
    expect(tagEdges(tagGraph([a, { ...b, content: 'no tag now' }]))).toEqual([]);
  });

  it('filters by a tag and its nested tags, and node search matches derived tags', () => {
    const source = [note('p', { content: '#project' }), note('pd', { content: '#project/daymark' }), note('ps', { content: '#projects' })];
    expect(tagGraph(source, { tag: 'project' }).nodes.map(n => n.id)).toEqual(['p', 'pd']);
    expect([...tagGraph(source, { query: 'daymark' }).matches]).toEqual(['pd']);
  });

  it('keeps tag-sharing pairs as tag lines, never dashed suggestions', async () => {
    vi.useFakeTimers();
    try {
      const known = knowledgeNotes([note('a', { content: 'Galaxies telescope nebula orbit #java' }), note('b', { content: 'Java classes objects methods runtime #java' })], () => []);
      const index = buildNoteIndex(known);
      let edges: GraphEdge[] = [];
      scheduleGraphSuggestions(known, index, new Set(), progress => { edges = progress.edges; });
      await vi.runAllTimersAsync();
      expect(edges).toEqual([]);
      const result = buildGraph(known, index, new Set(), { ...opts, showTags: true, showSuggestions: true }, edges);
      expect(result.edges.map(edge => edge.kind)).toEqual(['tag']);
    } finally { vi.useRealTimers(); }
  });
});

describe('linkEndpoints (review fix)', () => {
  const byId = new Map([note('typed', { updatedAt: '2026-01-01' }), note('ink', { kind: 'handwritten', updatedAt: '2026-12-01' }), note('ink2', { kind: 'handwritten' }), note('other', { updatedAt: '2026-06-01' })].map(n => [n.id, n]));
  it('writes the link into the typed note even when the handwritten one is selected or newer', () => {
    expect(linkEndpoints('typed', 'ink', byId, 'ink')).toEqual({ from: 'typed', to: 'ink' });
    expect(linkEndpoints('ink', 'typed', byId)).toEqual({ from: 'typed', to: 'ink' });
  });
  it('keeps the selected, then the most recently updated, typed note as the source', () => {
    expect(linkEndpoints('typed', 'other', byId, 'typed')).toEqual({ from: 'typed', to: 'other' });
    expect(linkEndpoints('typed', 'other', byId)).toEqual({ from: 'other', to: 'typed' });
  });
  it('offers no link between two handwritten notes', () => {
    expect(linkEndpoints('ink', 'ink2', byId)).toBeNull();
  });
});
