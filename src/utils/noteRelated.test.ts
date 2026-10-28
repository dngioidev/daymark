import { describe, expect, it } from 'vitest';
import type { StandaloneNote } from '../types/daymark';
import { adversarialIds, relatedNotes, relatedPairs, unrelatedGroups } from './fixtures/relatedNotes';
import { addRelatedLink, buildNoteIndex, canLinkToTitle, extractWikiTargets, linksOf, pairKey, suggestRelated, tokenize } from './noteRelated';

const note = (id: string, title: string, content: string, tags: string[] = []): StandaloneNote => ({
  id, title, content, tags, folder: '', createdAt: '', updatedAt: '',
});

describe('extractWikiTargets and tokenize', () => {
  it('extracts titles, aliases and heading targets outside code', () => {
    expect(extractWikiTargets('[[ Title ]] [[Other|label]] [[Third#heading]] [[Fourth#part|alias]]\n`[[inline]]`\n```md\n[[fenced]]\n```\n~~~\n[[tilde]]\n~~~\n[[Last]]')).toEqual(['Title', 'Other|label', 'Third#heading', 'Fourth#part|alias', 'Last']);
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

  it('drops English and folded Vietnamese function words', () => {
    expect(tokenize('there what which when where just more some about other would could should their these those then than also into over only very have been were they them your from with this that will can not but are was')).toEqual([]);
    expect(tokenize('của các những không được một như này khi cho với trong cùng nhiều rất là và để đến ra vào sẽ đã đang nếu thì mà từ theo trên dưới người hơn')).toEqual([]);
  });
});

describe('index and suggestions', () => {
  it('resolves trimmed case-insensitive titles, deduplicates links and exposes backlinks', () => {
    const index = buildNoteIndex([note('a', 'Alpha', '[[ BETA|alias]] [[Beta#part]] [[Missing]]'), note('b', ' Beta ', 'body'), note('c', 'Beta', 'duplicate')]);
    expect(linksOf(index, 'a')).toEqual({ outgoing: ['b'], incoming: [] });
    expect(linksOf(index, 'b')).toEqual({ outgoing: [], incoming: ['a'] });
    expect(linksOf(index, 'missing')).toEqual({ outgoing: [], incoming: [] });
  });

  it('resolves full raw titles before alias/heading fallbacks', () => {
    const notes = [
      note('source', 'Source', '[[C# basics]] [[A#B]] [[A|B]] [[Java#Streams]] [[Java|the language]]'),
      note('c', 'C', 'body'), note('cs', ' C# BASICS ', 'body'), note('a', 'A', 'body'),
      note('hash', 'A#B', 'body'), note('pipe', 'A|B', 'body'), note('java', 'Java', 'body'),
    ];
    expect(linksOf(buildNoteIndex(notes), 'source').outgoing).toEqual(['cs', 'hash', 'java', 'pipe']);
    const full = [...notes, note('heading', 'Java#Streams', 'body'), note('alias', 'Java|the language', 'body')];
    expect(linksOf(buildNoteIndex(full), 'source').outgoing).toEqual(['alias', 'cs', 'hash', 'heading', 'pipe']);
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

  it('rejects all four adversarial negatives in both directions against every cluster', () => {
    const index = buildNoteIndex(relatedNotes);
    for (const id of adversarialIds) for (const clusterId of unrelatedGroups.flat()) {
      expect(suggestRelated(index, id, { limit: 100 }).map(s => s.noteId), `${id} -> ${clusterId}`).not.toContain(clusterId);
      expect(suggestRelated(index, clusterId, { limit: 100 }).map(s => s.noteId), `${clusterId} -> ${id}`).not.toContain(id);
    }
    const programming = tokenize(relatedNotes.find(n => n.id === 'viet-java')!.content);
    const cleaning = tokenize(relatedNotes.find(n => n.id === 'homograph')!.content);
    expect([...new Set(programming.filter(term => cleaning.includes(term)))]).toEqual(['sach']);
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
    const notes = [note('a', 'Source', 'apple pear apple pear apple pear'), note('c', 'Zebra', 'apple pear apple pear apple pear'), note('b', 'Birch', 'apple pear apple pear apple pear')];
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
    const base = [note('a', 'Root', 'apple pear apple pear apple pear'), note('b', 'Branch', 'apple pear apple pear apple pear'), note('c', 'x', 'banana')];
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

  it('indexes 1,000 varied notes under one second and suggests under 100 ms', () => {
    const vocabulary = ['java', 'database', 'broth', 'mountain', 'trinh', 'nuong', 'garden', 'optics', 'orbit', 'algebra', 'fabric', 'lighthouse'];
    const notes = Array.from({ length: 1000 }, (_, i) => {
      const body = Array.from({ length: 80 }, (_, j) => `${vocabulary[(i * 7 + j * 11) % vocabulary.length]}${(i * 37 + j * 13) % 997}`).join(' ');
      return note(`${i}`, `Note ${i}`, `${body} [[Note ${(i + 1) % 1000}]]`, [`topic${i % 37}`]);
    });
    const start = performance.now();
    const index = buildNoteIndex(notes);
    const elapsed = performance.now() - start;
    console.info(`buildNoteIndex(1000): ${elapsed.toFixed(2)} ms`);
    expect(linksOf(index, '0').outgoing).toContain('1');
    expect(elapsed).toBeLessThan(1000);
    const suggestStart = performance.now();
    const suggestions = suggestRelated(index, '0');
    const suggestElapsed = performance.now() - suggestStart;
    console.info(`suggestRelated(1000): ${suggestElapsed.toFixed(2)} ms; ${suggestions.length} suggestions`);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestElapsed).toBeLessThan(100);
  });
});

describe('addRelatedLink', () => {
  it.each([
    ['', '## Related\n- [[Other]]\n'],
    ['Body', 'Body\n\n## Related\n- [[Other]]\n'],
    ['Body\n', 'Body\n\n## Related\n- [[Other]]\n'],
    ['## Related\n- [[First]]\n', '## Related\n- [[First]]\n- [[Other]]\n'],
    ['## Related\n- [[other|alias]]', '## Related\n- [[other|alias]]'],
    ['## Related\n- [[Other#part]]\n\n', '## Related\n- [[Other#part]]\n\n'],
    ['## Related\n- [[First]]\n\n## Later\nKeep  bytes', '## Related\n- [[First]]\n- [[Other]]\n\n## Later\nKeep  bytes\n'],
    ['## Related\nold\n## Related\nnew', '## Related\nold\n## Related\nnew\n- [[Other]]\n'],
    ['Body\r\n\r\n## Related\r\n- [[First]]', 'Body\r\n\r\n## Related\r\n- [[First]]\r\n- [[Other]]\r\n'],
    ['---\nkey: value\n---\n<!-- daymark: task_id=x status=done created=2026-10-28 -->', '---\nkey: value\n---\n<!-- daymark: task_id=x status=done created=2026-10-28 -->\n\n## Related\n- [[Other]]\n'],
    ['```\n## Related\n```\n', '```\n## Related\n```\n\n## Related\n- [[Other]]\n'],
  ])('preserves content and adds only in the last Related section: %j', (input, expected) => {
    expect(addRelatedLink(input, 'Other')).toBe(expected);
    expect(addRelatedLink(expected, 'Other')).toBe(expected);
  });

  it.each(['', '   ', 'A|B', 'A]]B', 'A[[B', 'A\nB', 'A\rB', 'A\r\nB', 'A\u2028B', 'A\u2029B'])('rejects unsafe title %j without changing any Markdown bytes', title => {
    const markdown = '## Related\r\n- item  \r\n\r\n';
    expect(canLinkToTitle(title)).toBe(false);
    expect(addRelatedLink(markdown, title)).toBe(markdown);
  });

  it.each(['A#B', 'C# basics', 'Ordinary', 'A[B', 'A]B'])('round-trips safe title %j and stays idempotent', title => {
    expect(canLinkToTitle(title)).toBe(true);
    const linked = addRelatedLink('Body', title);
    expect(extractWikiTargets(linked)).toContain(title);
    expect(addRelatedLink(linked, title)).toBe(linked);
    const notes = [note('source', 'Source', linked), note('target', title, 'body'), note('short', title.split('#')[0], 'body')];
    expect(linksOf(buildNoteIndex(notes), 'source').outgoing).toEqual(['target']);
  });

  it('preserves every byte on the already-present path and keeps section separator whitespace', () => {
    const markdown = '## Related\r\n- [[C# basics]]  \r\n \t\r\n\r\n';
    expect(addRelatedLink(markdown, 'c# BASICS')).toBe(markdown);
    expect(addRelatedLink('## Related\r\n- first  \r\n \t\r\n\r\n## Later\r\nbody', 'Next')).toBe('## Related\r\n- first  \r\n- [[Next]]\r\n \t\r\n\r\n## Later\r\nbody\r\n');
  });
});
