import { describe, expect, it } from 'vitest';
import type { StandaloneNote } from '../types/daymark';
import { buildNoteIndex, pairKey } from './noteRelated';
import { buildGraph, defaultGraphScope, type GraphOptions } from './graphData';

const note = (id: string, patch: Partial<StandaloneNote> = {}): StandaloneNote => ({ id, title: id, content: '', folder: '', tags: [], createdAt: '', updatedAt: '', ...patch });
const notes = [note('a', { folder: 'Tech', content: '[[b]]' }), note('b', { folder: 'Tech/Java', content: '[[c]]' }), note('c', { folder: 'Other' }), note('orphan')];
const opts: GraphOptions = { folderPaths: null, showTags: false, showSuggestions: false, showOrphans: true };
const graph = (options: Partial<GraphOptions> = {}, source = notes, dismissed = new Set<string>()) => buildGraph(source, buildNoteIndex(source), dismissed, { ...opts, ...options });
describe('graph projection never edits notes', () => {
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
