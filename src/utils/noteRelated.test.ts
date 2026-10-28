import { describe, expect, it } from 'vitest';
import type { StandaloneNote } from '../types/daymark';
import { relatedNotes, relatedPairs, unrelatedGroups } from './fixtures/relatedNotes';
import { addRelatedLink, buildNoteIndex, extractWikiTargets, linksOf, pairKey, suggestRelated, tokenize } from './noteRelated';

const note = (id: string, title: string, content: string, tags: string[] = []): StandaloneNote => ({
  id, title, content, tags, folder: '', createdAt: '', updatedAt: '',
});

describe('extractWikiTargets and tokenize', () => {
  it('extracts titles, aliases and heading targets outside code', () => {
    expect(extractWikiTargets('[[ Title ]] [[Other|label]] [[Third#heading]] [[Fourth#part|alias]]\n`[[inline]]`\n```md\n[[fenced]]\n```\n~~~\n[[tilde]]\n~~~\n[[Last]]')).toEqual(['Title', 'Other', 'Third', 'Fourth', 'Last']);
    expect(extractWikiTargets('```\n[[unclosed]]')).toEqual([]);
  });

  it('normalizes Vietnamese including đ and keeps Unicode letters/digits', () => {
    expect(tokenize('Lập trình Java ĐƯỜNG đường 日本語 abc123')).toEqual(['lap', 'trinh', 'java', 'duong', 'duong', '日本語', 'abc123']);
    expect(tokenize('the and with for this that is to an a 12 2026 xy')).toEqual([]);
  });

  it('ignores code and URL destinations while retaining link text', () => {
    expect(tokenize('[Useful label](https://example.com/secret) https://host.test/hidden `inlinecode`\n~~~js\nfencedcode\n~~~\n[[Java|Streams]]')).toEqual(['useful', 'label', 'java', 'streams']);
  });

  it('ignores indented code blocks too', () => {
    const markdown = 'Visible\n\n    [[Hidden]] secretcode\n\t[[HiddenToo]] morecode\n\n[[Shown]]';
    expect(extractWikiTargets(markdown)).toEqual(['Shown']);
    expect(tokenize(markdown)).toEqual(['visible', 'shown']);
  });
});

describe('index and suggestions', () => {
  it('resolves trimmed case-insensitive titles, deduplicates links and exposes backlinks', () => {
    const index = buildNoteIndex([note('a', 'Alpha', '[[ BETA|alias]] [[Beta#part]] [[Missing]]'), note('b', ' Beta ', 'body'), note('c', 'Beta', 'duplicate')]);
    expect(linksOf(index, 'a')).toEqual({ outgoing: ['b'], incoming: [] });
    expect(linksOf(index, 'b')).toEqual({ outgoing: [], incoming: ['a'] });
    expect(linksOf(index, 'missing')).toEqual({ outgoing: [], incoming: [] });
  });

  it('ranks all labelled related pairs mutually in the top five with meaningful explanations', () => {
    const index = buildNoteIndex(relatedNotes);
    for (const { a, b, terms } of relatedPairs) for (const [source, target] of [[a, b], [b, a]]) {
      const suggestion = suggestRelated(index, source).find(item => item.noteId === target);
      expect(suggestion, `${source} -> ${target}`).toBeDefined();
      expect(suggestion!.sharedTerms).toEqual(expect.arrayContaining(terms));
      expect(suggestion!.score).toBeGreaterThan(0);
    }
  });

  it('never suggests labelled unrelated pairs, including Vietnamese cooking versus programming', () => {
    const index = buildNoteIndex(relatedNotes);
    for (let i = 0; i < unrelatedGroups.length; i++) for (let j = i + 1; j < unrelatedGroups.length; j++) {
      for (const a of unrelatedGroups[i]) for (const b of unrelatedGroups[j]) {
        expect(suggestRelated(index, a, { limit: 100 }).map(item => item.noteId), `${a} -> ${b}`).not.toContain(b);
        expect(suggestRelated(index, b, { limit: 100 }).map(item => item.noteId), `${b} -> ${a}`).not.toContain(a);
      }
    }
  });

  it('excludes self, empty bodies, links in either direction and symmetrically dismissed pairs', () => {
    const index = buildNoteIndex(relatedNotes);
    expect(suggestRelated(index, 'empty')).toEqual([]);
    expect(suggestRelated(index, 'unknown')).toEqual([]);
    expect(suggestRelated(index, 'java').map(item => item.noteId)).not.toEqual(expect.arrayContaining(['java']));
    expect(suggestRelated(index, 'java', { limit: 100 }).map(item => item.noteId)).not.toContain('linked');
    expect(suggestRelated(index, 'linked', { limit: 100 }).map(item => item.noteId)).not.toContain('java');
    const dismissed = new Set([pairKey('java21', 'java')]);
    expect(pairKey('java', 'java21')).toBe('java|java21');
    expect(suggestRelated(index, 'java', { dismissed }).map(item => item.noteId)).not.toContain('java21');
    expect(suggestRelated(index, 'java21', { dismissed }).map(item => item.noteId)).not.toContain('java');
    expect(suggestRelated(index, 'java', { limit: 0 })).toEqual([]);
    expect(suggestRelated(index, 'java', { limit: 1 })).toHaveLength(1);
  });

  it('requires two shared terms or a shared title term and removes vault-common terms', () => {
    const index = buildNoteIndex([
      note('a', 'Alpha', 'common incidental apple'), note('b', 'Beta', 'common incidental pear'),
      note('c', 'Gamma', 'common banana'), note('d', 'Delta', 'common orange'),
    ]);
    expect(suggestRelated(index, 'a')).toEqual([]);
    const titleIndex = buildNoteIndex([note('a', 'Orchard', 'apple'), note('b', 'Trees', 'orchard pear')]);
    expect(suggestRelated(titleIndex, 'a').map(item => item.noteId)).toEqual(['b']);
  });

  it('is deterministic, breaks score ties by title and leaves input notes untouched', () => {
    const notes = [note('a', 'Source', 'apple pear apple pear'), note('c', 'Zebra', 'apple pear apple pear'), note('b', 'Birch', 'apple pear apple pear')];
    const snapshot = JSON.stringify(notes);
    const index = buildNoteIndex(notes);
    const first = suggestRelated(index, 'a');
    expect(first.map(item => item.noteId)).toEqual(['b', 'c']);
    expect(suggestRelated(index, 'a')).toEqual(first);
    expect(JSON.stringify(notes)).toBe(snapshot);
    const links = linksOf(index, 'a'); links.outgoing.push('bad');
    expect(linksOf(index, 'a').outgoing).toEqual([]);
  });

  it('uses exact title/tag/body field weights and downweights frequent terms with IDF', () => {
    const index = buildNoteIndex([note('a', 'Apple', 'apple pear', ['apple']), note('b', 'Orange', 'pear')]);
    expect(index.notes.get('a')!.weights.get('apple')! / index.idf.get('apple')!).toBe(6);
    expect(index.notes.get('a')!.weights.get('pear')! / index.idf.get('pear')!).toBe(1);
    expect(index.idf.get('apple')).toBeGreaterThan(index.idf.get('pear')!);
    const common = buildNoteIndex(['a', 'b', 'c', 'd'].map(id => note(id, id, 'ubiquitous universal')));
    expect(suggestRelated(common, 'a')).toEqual([]);
    expect(common.idf.has('ubiquitous')).toBe(false);
  });

  it('boosts shared tags and common resolved link targets only after the term gate', () => {
    const base = [note('a', 'Root', 'apple pear apple pear'), note('b', 'Branch', 'apple pear apple pear'), note('c', 'x', 'banana')];
    const score = (notes: StandaloneNote[]) => suggestRelated(buildNoteIndex(notes), 'a').find(item => item.noteId === 'b')!.score;
    const baseline = score(base);
    expect(score(base.map(n => n.id === 'c' ? n : { ...n, tags: ['x'] }))).toBeCloseTo(baseline + 0.08);
    expect(score(base.map(n => n.id === 'c' ? n : { ...n, content: n.content + ' [[x]]' }))).toBeCloseTo(baseline + 0.06);
    expect(suggestRelated(buildNoteIndex([note('a', 'Alpha', 'apple [[x]]', ['tag']), note('b', 'Beta', 'pear [[x]]', ['tag']), note('c', 'x', 'banana')]), 'a')).toEqual([]);
  });

  it('boosts an unlinked full-title mention, retaining word order', () => {
    const score = (title: string) => suggestRelated(buildNoteIndex([
      note('a', 'Root', 'apple pear'), note('b', title, 'orange'),
    ]), 'a')[0].score;
    expect(score('apple pear')).toBeCloseTo(score('pear apple') + 0.12);
    expect(score('apple and pear')).toBeCloseTo(score('pear and apple'));
  });

  it('builds an index for 1,000 notes in under one second', () => {
    const notes = Array.from({ length: 1000 }, (_, i) => note(`${i}`, `Note ${i}`, `${relatedNotes[i % relatedNotes.length].content} [[Note ${(i + 1) % 1000}]]`, ['sample']));
    const start = performance.now();
    const index = buildNoteIndex(notes);
    const elapsed = performance.now() - start;
    console.info(`buildNoteIndex(1000): ${elapsed.toFixed(2)} ms`);
    expect(linksOf(index, '0').outgoing).toContain('1');
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('addRelatedLink', () => {
  it.each([
    ['', '## Related\n- [[Other]]\n'],
    ['Body', 'Body\n\n## Related\n- [[Other]]\n'],
    ['Body\n', 'Body\n\n## Related\n- [[Other]]\n'],
    ['## Related\n- [[First]]\n', '## Related\n- [[First]]\n- [[Other]]\n'],
    ['## Related\n- [[other|alias]]', '## Related\n- [[other|alias]]\n'],
    ['## Related\n- [[Other#part]]\n\n', '## Related\n- [[Other#part]]\n'],
    ['## Related\n- [[First]]\n\n## Later\nKeep  bytes', '## Related\n- [[First]]\n\n- [[Other]]\n## Later\nKeep  bytes\n'],
    ['## Related\nold\n## Related\nnew', '## Related\nold\n## Related\nnew\n- [[Other]]\n'],
    ['Body\r\n\r\n## Related\r\n- [[First]]', 'Body\r\n\r\n## Related\r\n- [[First]]\r\n- [[Other]]\r\n'],
    ['---\nkey: value\n---\n<!-- daymark: task_id=x status=done created=2026-10-28 -->', '---\nkey: value\n---\n<!-- daymark: task_id=x status=done created=2026-10-28 -->\n\n## Related\n- [[Other]]\n'],
    ['```\n## Related\n```\n', '```\n## Related\n```\n\n## Related\n- [[Other]]\n'],
  ])('preserves content and adds only in the last Related section: %j', (input, expected) => {
    expect(addRelatedLink(input, 'Other')).toBe(expected);
    expect(addRelatedLink(expected, 'Other')).toBe(expected);
  });
});
